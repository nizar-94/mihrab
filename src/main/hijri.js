// Hijri (Islamic) calendar helpers.
//
// No dependency and no API call: Intl.DateTimeFormat ships an
// islamic-umalqura calendar in Node and Chromium, and the Umm al-Qura
// calendar is the civil calendar of Saudi Arabia and the one prayer-time
// services generally report.
//
// The calendar choice is NOT interchangeable. Verified against the captured
// aladhan response for 2026-08-23 in Asia/Jerusalem:
//
//   islamic-umalqura -> 10 Rabi al-awwal 1448   (matches aladhan)
//   islamic-civil    ->  9 Rabi al-awwal 1448   (off by one day)
//
// A one-day error is invisible day to day and silently wrong for every
// date-anchored reminder — white days, Ashura, Arafah — which is exactly
// the class of bug nobody notices until the day itself has passed. The
// choice is pinned by tests/hijri.test.js.
//
// This module is pure: no Electron, no I/O, no module-level state.

/** @typedef {{day:number, month:number, year:number}} HijriDate */

// Umm al-Qura month names, transliterated. Index 0 is Muharram, matching
// month numbers 1..12 offset by one.
export const HIJRI_MONTHS = Object.freeze([
  'Muharram',
  'Safar',
  'Rabi al-awwal',
  'Rabi al-thani',
  'Jumada al-ula',
  'Jumada al-akhirah',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah'
]);

// One formatter per timezone. Constructing an Intl.DateTimeFormat is
// expensive relative to using one, and the scheduler asks for Hijri dates
// on every tick.
const formatters = new Map();

function formatterFor(timeZone) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      timeZone
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

/**
 * The Hijri date at `date`, as observed in `timeZone`.
 *
 * The timezone argument is required rather than defaulting to the system
 * zone: a Hijri day boundary is a local-midnight boundary, so the same
 * instant is a different Hijri day either side of the date line. Every
 * caller here knows the user's location, so none of them has an excuse to
 * fall back to the host's zone.
 *
 * @param {Date} date
 * @param {string} timeZone - IANA zone, e.g. 'Asia/Jerusalem'
 * @returns {HijriDate}
 */
export function hijriDate(date, timeZone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('hijriDate requires a valid Date');
  }
  if (typeof timeZone !== 'string' || timeZone === '') {
    throw new TypeError('hijriDate requires an IANA timeZone');
  }

  // formatToParts rather than parsing the formatted string: the order of
  // day/month/year in the output is locale-dependent, and reading named
  // parts is immune to that. The 'en' locale happens to give M/D/Y today,
  // which is precisely the kind of thing that silently changes.
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type) => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Intl did not return a ${type} part`);
    // The year part can carry an era suffix ("1448 AH") depending on
    // options; parseInt stops at the first non-digit either way.
    return Number.parseInt(part.value, 10);
  };

  return { day: get('day'), month: get('month'), year: get('year') };
}

/**
 * The white days (ayyam al-beed) are the 13th, 14th and 15th of every Hijri
 * month — the days around the full moon.
 * @param {HijriDate} h
 */
export function isWhiteDay(h) {
  return h.day === 13 || h.day === 14 || h.day === 15;
}

/**
 * Display name for a Hijri month number (1-12).
 * @param {number} month
 */
export function hijriMonthName(month) {
  return HIJRI_MONTHS[month - 1] ?? `Month ${month}`;
}

/**
 * Formatted for display, e.g. "10 Rabi al-awwal 1448 AH".
 * @param {HijriDate} h
 */
export function formatHijri(h) {
  return `${h.day} ${hijriMonthName(h.month)} ${h.year} AH`;
}
