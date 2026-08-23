import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prayerTimes, formatPrayerTime, PRAYER_KEYS } from '../src/main/prayer/times.js';

// THE VALIDATION GATE.
//
// The roadmap gates prayer times on validation against a trusted reference
// before anyone relies on them, on the grounds that wrong prayer times rank
// with wrong Quran text as this project's worst possible defect. This file
// is that gate.
//
// Fixtures are committed, never fetched. tools/capture-prayer-fixtures.mjs
// produced them; the Railway API it captured is an unused free-tier service
// that may vanish, and a gate that depends on a live third party is not a
// gate.
//
// WHAT THIS CAN AND CANNOT PROVE
//
// adhan and aladhan are independent implementations of solar position. They
// do not agree to the minute and never will. Measured across the whole
// fixture at latitudes below 48 degrees, with matched parameters:
//
//   fajr, sunrise, maghrib, isha   mean |delta| 0.0-0.1 min
//   dhuhr                          mean |delta| 1.0 min
//   asr                            mean |delta| 0.9-1.5 min
//
// So this gate is built to catch the failures that actually matter — an
// hour out, the wrong day, the wrong method, undefined or duplicated times
// — and NOT to prove two libraries share an algorithm. It does that with
// per-prayer mean-error budgets (which catch systematic drift that a
// blanket tolerance would hide) plus a hard cap on any single day.

const FIXTURES = join(import.meta.dirname, 'fixtures', 'prayer-times');
const aladhan = JSON.parse(readFileSync(join(FIXTURES, 'aladhan.json'), 'utf8'));
const railway = JSON.parse(readFileSync(join(FIXTURES, 'railway.json'), 'utf8'));

// aladhan.json was captured with method=3 (Muslim World League), school=0
// (Standard) and latitudeAdjustmentMethod ANGLE_BASED. The high-latitude
// rule must be matched explicitly: adhan's `recommended` picks
// SeventhOfTheNight for London, which disagrees with ANGLE_BASED by up to
// 84 minutes on Fajr. That is a difference of convention, not correctness,
// and comparing across it would be meaningless. The app still DEFAULTS to
// `recommended` — that is a product choice, tested elsewhere.
const REFERENCE_CONFIG = {
  method: 'MuslimWorldLeague',
  school: 'standard',
  highLatitudeRule: 'twilightangle',
  polarCircleResolution: 'AqrabBalad',
  offsets: {}
};

const PALESTINE = { ...REFERENCE_CONFIG, method: 'PalestineLegacy', highLatitudeRule: 'recommended' };

// Mean absolute error budget per prayer, in minutes. Tighter than the hard
// cap on purpose: a systematic one-minute drift across every day would slip
// past a 5-minute cap unnoticed, but not past these.
const MEAN_ERROR_BUDGET = {
  fajr: 0.5,
  sunrise: 0.5,
  dhuhr: 1.5,
  asr: 2.5,
  maghrib: 0.5,
  isha: 0.5
};

// No single day may exceed this against the reference. Catches gross errors
// — wrong timezone, wrong day, wrong method — without failing on the known
// per-library divergence above.
const HARD_CAP_MINUTES = 5;

const TIMEZONES = {
  Jerusalem: 'Asia/Jerusalem',
  Makkah: 'Asia/Riyadh',
  Cairo: 'Africa/Cairo',
  Istanbul: 'Europe/Istanbul',
  London: 'Europe/London',
  'New York': 'America/New_York',
  Jakarta: 'Asia/Jakarta',
  'Cape Town': 'Africa/Johannesburg',
  Tromso: 'Europe/Oslo'
};

const CITY_COORDS = {
  Jerusalem: { latitude: 31.7683, longitude: 35.2137 },
  Gaza: { latitude: 31.5017, longitude: 34.4668 },
  Hebron: { latitude: 31.5326, longitude: 35.0998 }
};

// The two days where the retired API and the astronomical reference
// disagree by an hour: the Asia/Jerusalem DST transition dates. The sources
// agree on the rule and disagree on which day the clocks move.
const DST_DISAGREEMENT_DAYS = ['2026-10-24', '2027-03-26'];

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// Midnight-wrap aware: 00:05 and 23:58 are seven minutes apart, not 1433.
function minutesApart(a, b) {
  const diff = Math.abs(toMinutes(a) - toMinutes(b));
  return Math.min(diff, 1440 - diff);
}

const isoFromAladhan = (d) => `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}`;

// Midday in the target zone, so the Date unambiguously identifies the
// intended local day whatever timezone the test host is in.
function middayAt(iso, timeZone) {
  const guess = new Date(`${iso}T12:00:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() + (utc.getTime() - local.getTime()));
}

// aladhan collapses all four twilight prayers to one value inside the polar
// circle rather than reporting them undefined. Such a day cannot arbitrate
// anything, so it is excluded from comparison — and counted, so an
// exclusion that quietly grows is visible.
const referenceDegenerate = (day) => day.Fajr === day.Isha || day.Fajr === day.Maghrib;

/** Compare one location for a full year, returning per-prayer error stats. */
function compareLocation(loc, timeZone, config) {
  const errors = Object.fromEntries(PRAYER_KEYS.map((k) => [k, []]));
  const breaches = [];
  let skipped = 0;

  for (const [fixtureDate, expected] of Object.entries(loc.days)) {
    if (referenceDegenerate(expected)) { skipped++; continue; }
    const iso = isoFromAladhan(fixtureDate);
    const computed = prayerTimes(loc, middayAt(iso, timeZone), config);

    for (const key of PRAYER_KEYS) {
      const want = expected[key[0].toUpperCase() + key.slice(1)];
      const got = formatPrayerTime(computed[key], timeZone);
      if (!want || !got) { skipped++; continue; }
      const delta = minutesApart(want, got);
      errors[key].push(delta);
      if (delta > HARD_CAP_MINUTES) breaches.push(`${iso} ${key}: reference ${want}, computed ${got} (${delta} min)`);
    }
  }

  const mean = Object.fromEntries(
    PRAYER_KEYS.map((k) => [k, errors[k].length ? errors[k].reduce((s, x) => s + x, 0) / errors[k].length : null])
  );
  const compared = Object.values(errors).reduce((s, a) => s + a.length, 0);
  return { mean, breaches, compared, skipped };
}

describe('validation gate: worldwide reference (aladhan, MWL, angle-based)', () => {
  for (const [name, loc] of Object.entries(aladhan.locations)) {
    // Tromso is excluded from cross-comparison entirely: inside the polar
    // circle the two implementations resolve undefined times by different
    // strategies (AqrabBalad vs collapsing to a single value), so a delta
    // there measures a convention gap, not an error. It gets its own
    // invariant tests below instead.
    if (name === 'Tromso') continue;

    it(`${name}: a full year within budget`, () => {
      const { mean, breaches, compared, skipped } = compareLocation(loc, TIMEZONES[name], REFERENCE_CONFIG);

      // A silent skip would let this pass while testing nothing.
      expect(compared, `${name}: nothing was compared`).toBeGreaterThan(2000);
      if (skipped > 0) console.log(`  ${name}: ${compared} compared, ${skipped} skipped`);

      expect(breaches.slice(0, 5), `${name}: days exceeding ${HARD_CAP_MINUTES} min`).toEqual([]);

      for (const key of PRAYER_KEYS) {
        expect(mean[key], `${name} ${key} mean error`).toBeLessThanOrEqual(MEAN_ERROR_BUDGET[key]);
      }
    });
  }
});

describe('validation gate: Palestine (legacy) reproduces the retired API', () => {
  // Ramallah, Nablus and Bethlehem are byte-identical to Jerusalem across
  // all 365 days — the old API had three distinct locations, not six.
  // Testing the duplicates would inflate the pass count without testing
  // anything new.
  for (const city of ['Jerusalem', 'Gaza', 'Hebron']) {
    it(`${city}: a full year within ${HARD_CAP_MINUTES} minutes`, () => {
      const timeZone = 'Asia/Jerusalem';
      const errors = Object.fromEntries(PRAYER_KEYS.map((k) => [k, []]));
      const breaches = [];
      let compared = 0;

      for (const [iso, expected] of Object.entries(railway.cities[city])) {
        if (DST_DISAGREEMENT_DAYS.includes(iso)) continue;
        const computed = prayerTimes(CITY_COORDS[city], middayAt(iso, timeZone), PALESTINE);

        for (const key of PRAYER_KEYS) {
          const want = expected[key];
          const got = formatPrayerTime(computed[key], timeZone);
          if (!want || !got) continue;
          compared++;
          const delta = minutesApart(want, got);
          errors[key].push(delta);
          if (delta > HARD_CAP_MINUTES) breaches.push(`${iso} ${key}: api ${want}, computed ${got} (${delta} min)`);
        }
      }

      expect(compared, `${city}: nothing was compared`).toBeGreaterThan(2000);
      expect(breaches.slice(0, 5)).toEqual([]);

      // Jerusalem is where the preset was derived, so it must be tight.
      // Gaza and Hebron get more room: the API ignores coordinates and
      // serves a fixed table, so the exact positions it used are unknown
      // and these are real-world coordinates rather than its own.
      const budget = city === 'Jerusalem' ? 1.0 : 2.5;
      for (const key of PRAYER_KEYS) {
        const m = errors[key].reduce((s, x) => s + x, 0) / errors[key].length;
        expect(m, `${city} ${key} mean error`).toBeLessThanOrEqual(budget);
      }
    });
  }

  it('documents the two DST transition days as a known discrepancy', () => {
    // Not a defect in this project. Pinned so a future change that
    // accidentally alters it fails loudly and gets reviewed on purpose,
    // rather than silently shifting everyone's times by an hour.
    for (const iso of DST_DISAGREEMENT_DAYS) {
      const api = railway.cities.Jerusalem[iso];
      expect(api, `fixture missing ${iso}`).toBeTruthy();
      const computed = prayerTimes(CITY_COORDS.Jerusalem, middayAt(iso, 'Asia/Jerusalem'), PALESTINE);
      // Dhuhr is solar noon — no angle, method or school affects it — so a
      // ~60 minute gap is unambiguously a clock disagreement.
      const delta = minutesApart(api.dhuhr, formatPrayerTime(computed.dhuhr, 'Asia/Jerusalem'));
      expect(delta).toBeGreaterThan(50);
      expect(delta).toBeLessThan(70);
    }
  });
});

describe('validation gate: polar latitudes stay usable', () => {
  const tromso = aladhan.locations.Tromso;
  const timeZone = 'Europe/Oslo';

  it('defines every prayer on every day of the year', () => {
    let nulls = 0;
    for (const fixtureDate of Object.keys(tromso.days)) {
      const t = prayerTimes(tromso, middayAt(isoFromAladhan(fixtureDate), timeZone), REFERENCE_CONFIG);
      if (PRAYER_KEYS.some((k) => t[k] === null)) nulls++;
    }
    expect(nulls).toBe(0);
  });

  it('never collapses the day into a single repeated time', () => {
    // The failure this exists to prevent: four notifications in the same
    // minute, which is what the naive calculation produces for 65 days a
    // year at this latitude.
    let degenerate = 0;
    for (const fixtureDate of Object.keys(tromso.days)) {
      const t = prayerTimes(tromso, middayAt(isoFromAladhan(fixtureDate), timeZone), REFERENCE_CONFIG);
      const distinct = new Set(PRAYER_KEYS.map((k) => formatPrayerTime(t[k], timeZone)));
      if (distinct.size < 4) degenerate++;
    }
    expect(degenerate).toBe(0);
  });

  it('proves the previous test is not vacuous — the reference really does collapse', () => {
    const collapsed = Object.values(tromso.days).filter((d) => d.Fajr === d.Isha).length;
    expect(collapsed).toBeGreaterThan(50);
  });
});
