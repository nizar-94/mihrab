// Offline city lookup, backed by resources/cities.json (GeoNames, CC-BY 4.0).
//
// Split deliberately into a pure search over rows and an Electron-dependent
// loader, so the ranking logic — the part with actual behaviour worth
// testing — runs under Vitest without an Electron process or a 2.3 MB file.

import electron from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Default import + destructure, matching config.js/updater.js/tray.js:
// under plain Node the 'electron' package resolves to a string, so this
// yields undefined rather than failing to load the module at all.
const { app } = electron;

/** Column order in the packed rows — must match tools/make-cities.mjs. */
const NAME = 0, ASCII = 1, COUNTRY = 2, ADMIN1 = 3, LAT = 4, LON = 5, TZ = 6, POP = 7;

/**
 * @typedef {{name:string, country:string, countryName:string, admin1:string,
 *            latitude:number, longitude:number, timezone:string,
 *            population:number, label:string}} City
 */

/**
 * Fold case and strip diacritics, so "Nabulus" finds "Nābulus" and
 * "zurich" finds "Zürich". Without this, any user typing on a plain
 * keyboard cannot find their own city, which is most of the point.
 */
export function normalise(text) {
  return String(text)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function hydrate(row, countries) {
  const country = row[COUNTRY];
  const countryName = countries?.[country] ?? country;
  return {
    name: row[NAME],
    country,
    countryName,
    admin1: row[ADMIN1],
    latitude: row[LAT],
    longitude: row[LON],
    timezone: row[TZ],
    population: row[POP],
    // What Settings shows. Country is included always: there are 30-odd
    // places called Springfield, and a bare city name would be a coin flip.
    label: `${row[NAME]}, ${countryName}`
  };
}

/**
 * Search the packed rows.
 *
 * Prefix matches rank above substring matches, and within each group the
 * rows' existing population order is preserved — tools/make-cities.mjs
 * sorts descending, so scanning in order gives biggest-first for free.
 * That is why "lon" surfaces London before Longview, and "york" surfaces
 * New York before Yorketown.
 *
 * @param {Array<Array>} rows
 * @param {string} query
 * @param {{limit?:number, countries?:Record<string,string>}} [options]
 * @returns {City[]}
 */
export function searchCities(rows, query, options = {}) {
  const { limit = 20, countries } = options;
  const q = normalise(query);
  // One character matches thousands of cities and is never a real search;
  // returning nothing is better than returning the 20 largest cities that
  // happen to contain an "a".
  if (q.length < 2) return [];

  const prefix = [];
  const substring = [];

  for (const row of rows) {
    const name = normalise(row[NAME]);
    const ascii = row[ASCII] ? normalise(row[ASCII]) : '';

    if (name.startsWith(q) || (ascii && ascii.startsWith(q))) {
      prefix.push(row);
      // Stop early only once prefix matches alone can fill the page —
      // substring matches can never outrank them.
      if (prefix.length >= limit) break;
    } else if (substring.length < limit && (name.includes(q) || (ascii && ascii.includes(q)))) {
      substring.push(row);
    }
  }

  return [...prefix, ...substring].slice(0, limit).map((row) => hydrate(row, countries));
}

// --- Electron-dependent loading ---------------------------------------

let cache = null;

// Same dev/packaged split as quran.js, and for the same reason: cities.json
// ships via extraResources rather than inside app.asar, so it lands beside
// the app when packaged and in the repo during development.
function citiesPath() {
  return app.isPackaged
    ? join(process.resourcesPath, 'cities.json')
    : join(app.getAppPath(), 'resources/cities.json');
}

/**
 * Load and cache the database. Called lazily on first search rather than at
 * import: 2.3 MB of JSON is not something to parse during startup, when the
 * user is waiting for a tray icon and most sessions never search at all.
 */
export function loadCities() {
  if (!cache) cache = JSON.parse(readFileSync(citiesPath(), 'utf8'));
  return cache;
}

/**
 * Search the bundled database.
 * @param {string} query
 * @param {number} [limit]
 * @returns {City[]}
 */
export function findCities(query, limit = 20) {
  const db = loadCities();
  return searchCities(db.rows, query, { limit, countries: db.countries });
}

/**
 * Build a location record from manually entered coordinates — the escape
 * hatch for anywhere too small to be in cities15000.
 *
 * The timezone is resolved by the caller (Settings passes the system zone),
 * because deriving a zone from coordinates would need another dataset an
 * order of magnitude larger than the city list itself.
 *
 * @returns {{name:string, latitude:number, longitude:number, timezone:string}|null}
 */
export function manualLocation(latitude, longitude, timezone, label) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) return null;
  if (typeof timezone !== 'string' || !timezone) return null;
  return {
    name: label?.trim() || `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    latitude: lat,
    longitude: lon,
    timezone
  };
}
