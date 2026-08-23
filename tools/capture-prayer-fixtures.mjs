// Captures prayer-time reference data into tests/fixtures/prayer-times/.
//
// Phase 2 is gated on validating locally-computed prayer times against a
// trusted reference before anyone relies on them. Two references are
// captured, because neither is sufficient alone:
//
//   railway.json - the retired-but-still-running API this project used
//     before. It covers SIX Palestinian cities only and ignores any
//     coordinates you pass it, so it cannot validate a worldwide app. What
//     it does encode is the local convention the first users will expect,
//     including a ~7 minute offset on Maghrib that no default sea-level
//     calculation reproduces. It is an unused free-tier service that could
//     be shut down at any time, which is the reason for snapshotting it.
//
//   aladhan.json - the public aladhan API across a spread of latitudes,
//     for worldwide validation. Uses the /calendar endpoint (one request
//     per location-month rather than per day) to stay light on a service
//     that is doing us a favour.
//
// Both are captured for a full year: prayer times are seasonal, and the
// interesting failures are at solstices, equinoxes, DST transitions and
// high latitudes - not on an arbitrary Tuesday in August.
//
// Usage:  node tools/capture-prayer-fixtures.mjs
// Re-running overwrites the fixtures. Existing files are left alone if the
// capture fails, so a half-finished run cannot corrupt a good fixture.

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT_DIR = join(import.meta.dirname, '..', 'tests', 'fixtures', 'prayer-times');

// One year starting from the first of next month, so the window is stable
// regardless of which day the capture is run.
const START = '2026-09-01';
const DAYS = 365;

const RAILWAY = 'https://prayer-times-api-production.up.railway.app/v1/prayer-times';
const RAILWAY_CITIES = ['Jerusalem', 'Ramallah', 'Gaza', 'Nablus', 'Hebron', 'Bethlehem'];

// Chosen to exercise the cases that actually break prayer-time maths:
// equatorial (little seasonal variation), mid-latitude northern and
// southern hemispheres (opposite seasons), and high latitude where Fajr and
// Isha stop existing for part of the year and every method needs a
// fallback rule.
const ALADHAN_LOCATIONS = [
  { name: 'Jerusalem', latitude: 31.7683, longitude: 35.2137 },
  { name: 'Makkah', latitude: 21.3891, longitude: 39.8579 },
  { name: 'Cairo', latitude: 30.0444, longitude: 31.2357 },
  { name: 'Istanbul', latitude: 41.0082, longitude: 28.9784 },
  { name: 'London', latitude: 51.5074, longitude: -0.1278 },
  { name: 'New York', latitude: 40.7128, longitude: -74.006 },
  { name: 'Jakarta', latitude: -6.2088, longitude: 106.8456 },
  { name: 'Cape Town', latitude: -33.9249, longitude: 18.4241 },
  // The hard one: above roughly 48 degrees, twilight never ends in summer
  // and angle-based Fajr/Isha are undefined. Every library needs a
  // high-latitude rule here, and this is where they disagree most.
  { name: 'Tromso', latitude: 69.6492, longitude: 18.9553 }
];

const METHOD = 3; // Muslim World League - matches the Railway API on Fajr/Dhuhr/Asr
const SCHOOL = 0; // Standard (Shafi/Maliki/Hanbali) Asr shadow factor

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Every request goes through here: a public service can rate-limit, hiccup,
// or cold-start (Railway free tier sleeps), and losing a 2000-request
// capture to one blip would be maddening.
async function getJson(url, { attempts = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (res.status === 404) return { notFound: true };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await sleep(500 * (i + 1)); // linear backoff
    }
  }
  throw new Error(`failed after ${attempts} attempts: ${url} (${lastErr?.message})`);
}

async function captureRailway() {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(START, i));
  const out = { source: RAILWAY, capturedFor: { start: START, days: DAYS }, cities: {} };

  for (const city of RAILWAY_CITIES) {
    const rows = {};
    for (const date of days) {
      const url = `${RAILWAY}?city=${encodeURIComponent(city)}&date=${date}`;
      const body = await getJson(url);
      if (body.notFound) break;
      rows[date] = body.prayerTimes;
      await sleep(120); // be a good citizen on someone else's free tier
    }
    out.cities[city] = rows;
    console.log(`railway: ${city} -> ${Object.keys(rows).length} days`);
  }
  return out;
}

async function captureAladhan() {
  const start = new Date(`${START}T12:00:00Z`);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    months.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }

  const out = {
    source: 'https://api.aladhan.com/v1/calendar',
    params: { method: METHOD, school: SCHOOL },
    locations: {}
  };

  for (const loc of ALADHAN_LOCATIONS) {
    const rows = {};
    for (const { year, month } of months) {
      const url = `https://api.aladhan.com/v1/calendar/${year}/${month}`
        + `?latitude=${loc.latitude}&longitude=${loc.longitude}&method=${METHOD}&school=${SCHOOL}`;
      const body = await getJson(url);
      for (const day of body.data ?? []) {
        // "04:42 (EEST)" -> "04:42"; the offset label is noise for comparison.
        const t = day.timings;
        rows[day.date.gregorian.date] = Object.fromEntries(
          Object.entries(t).map(([k, v]) => [k, v.split(' ')[0]])
        );
      }
      await sleep(250);
    }
    out.locations[loc.name] = { ...loc, days: rows };
    console.log(`aladhan: ${loc.name} -> ${Object.keys(rows).length} days`);
  }
  return out;
}

await mkdir(OUT_DIR, { recursive: true });

const railway = await captureRailway();
await writeFile(join(OUT_DIR, 'railway.json'), JSON.stringify(railway, null, 2) + '\n');
console.log('wrote railway.json');

const aladhan = await captureAladhan();
await writeFile(join(OUT_DIR, 'aladhan.json'), JSON.stringify(aladhan, null, 2) + '\n');
console.log('wrote aladhan.json');
