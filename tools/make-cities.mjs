// Builds resources/cities.json from GeoNames.
//
// Prayer times need coordinates, and the app is offline by design — there is
// no geocoding service to call. So a city list ships with the app and the
// user picks from it, with manual coordinate entry as the escape hatch for
// anywhere too small to be listed.
//
// Source: https://download.geonames.org/export/dump/cities15000.zip
//   Every city with population > 15,000 — about 26,000 entries worldwide.
//   Licensed CC-BY 4.0; the attribution lives in NOTICE alongside Tanzil
//   and Amiri. cities5000 and cities1000 exist and are far larger; 15000 is
//   the smallest set that still covers everywhere most people live, and
//   manual coordinates cover the rest.
//
// Output is a compact columnar array rather than an array of objects,
// because the field names would otherwise repeat 26,000 times and roughly
// double the file. src/main/location/cities.js is the only reader and
// hydrates it back into objects.
//
// Usage: node tools/make-cities.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'resources', 'cities.json');
const CITIES_URL = 'https://download.geonames.org/export/dump/cities15000.zip';
const COUNTRIES_URL = 'https://download.geonames.org/export/dump/countryInfo.txt';

// --- Minimal ZIP reader -----------------------------------------------
// GeoNames only publishes .zip, Node has no built-in unzip, and pulling a
// dependency into a build tool for one archive is not worth it. This reads
// the central directory (rather than trusting local headers, whose size
// fields may be zero when the archive was written as a stream) and inflates
// the single entry.

function findEndOfCentralDirectory(buf) {
  // The EOCD record is at the end, after a comment of unknown length, so
  // scan backwards for its signature. 22 bytes is its minimum size.
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error('not a zip file: no end-of-central-directory record');
}

function unzipSingleEntry(buf) {
  const eocd = findEndOfCentralDirectory(buf);
  const centralOffset = buf.readUInt32LE(eocd + 16);

  if (buf.readUInt32LE(centralOffset) !== 0x02014b50) {
    throw new Error('corrupt zip: bad central directory signature');
  }
  const method = buf.readUInt16LE(centralOffset + 10);
  const compressedSize = buf.readUInt32LE(centralOffset + 20);
  const nameLen = buf.readUInt16LE(centralOffset + 28);
  const name = buf.toString('utf8', centralOffset + 46, centralOffset + 46 + nameLen);
  const localOffset = buf.readUInt32LE(centralOffset + 42);

  // The local header repeats the name and extra-field lengths, and they can
  // differ from the central directory's, so the data offset must be
  // computed from the local header itself.
  if (buf.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error('corrupt zip: bad local header signature');
  }
  const localNameLen = buf.readUInt16LE(localOffset + 26);
  const localExtraLen = buf.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLen + localExtraLen;
  const data = buf.subarray(dataStart, dataStart + compressedSize);

  // 0 = stored, 8 = deflate. GeoNames uses deflate.
  const content = method === 0 ? data : inflateRawSync(data);
  return { name, content };
}

async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// --- Country codes ----------------------------------------------------

async function fetchCountryNames() {
  const text = (await fetchBuffer(COUNTRIES_URL)).toString('utf8');
  const names = {};
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const cols = line.split('\t');
    // ISO code, then a few identifier columns, then the country name.
    if (cols[0] && cols[4]) names[cols[0]] = cols[4];
  }
  return names;
}

// --- Build ------------------------------------------------------------

console.log('downloading cities15000...');
const zip = await fetchBuffer(CITIES_URL);
const { name: entryName, content } = unzipSingleEntry(zip);
console.log(`  extracted ${entryName} (${(content.length / 1e6).toFixed(1)} MB)`);

console.log('downloading country names...');
const countryNames = await fetchCountryNames();
console.log(`  ${Object.keys(countryNames).length} countries`);

// GeoNames cities table columns, tab separated:
//   0 geonameid   1 name   2 asciiname   3 alternatenames
//   4 latitude    5 longitude            8 country code
//   10 admin1 code                       14 population
//   17 timezone
const NAME = 1, ASCII = 2, LAT = 4, LON = 5, COUNTRY = 8, ADMIN1 = 10, POP = 14, TZ = 17;

const rows = [];
for (const line of content.toString('utf8').split('\n')) {
  if (!line.trim()) continue;
  const c = line.split('\t');
  const latitude = Number(c[LAT]);
  const longitude = Number(c[LON]);
  const population = Number(c[POP]) || 0;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
  if (!c[TZ]) continue; // no timezone means we cannot schedule against it

  // asciiname is kept only when it differs from name, so that searching for
  // "Nablus" finds "Nābulus". Storing it unconditionally would inflate the
  // file for the majority of entries where the two are identical.
  const name = c[NAME];
  const ascii = c[ASCII] && c[ASCII] !== name ? c[ASCII] : '';

  rows.push([
    name,
    ascii,
    c[COUNTRY] || '',
    c[ADMIN1] || '',
    Math.round(latitude * 10000) / 10000,
    Math.round(longitude * 10000) / 10000,
    c[TZ].trim(),
    population
  ]);
}

// Descending population, so a prefix search can return the biggest matches
// first by simply scanning in order and stopping early.
rows.sort((a, b) => b[7] - a[7]);

const payload = {
  source: CITIES_URL,
  license: 'CC-BY-4.0 (GeoNames) — see NOTICE',
  fields: ['name', 'ascii', 'country', 'admin1', 'latitude', 'longitude', 'timezone', 'population'],
  countries: countryNames,
  rows
};

await mkdir(join(import.meta.dirname, '..', 'resources'), { recursive: true });
await writeFile(OUT, JSON.stringify(payload));
console.log(`wrote resources/cities.json — ${rows.length} cities`);
