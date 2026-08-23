// The single seam between this project and the `adhan` library.
//
// Pure: coordinates + date + config in, six times out. No Electron, no I/O,
// no module state — so it runs under Vitest and can be validated directly
// against the captured reference fixtures, which is the whole point.

import * as adhan from 'adhan';
import { paramsFor } from './methods.js';

/** The six times, in the order they occur during a day. */
export const PRAYER_KEYS = Object.freeze(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']);

/** Display names. Sunrise is included because it bounds Fajr's window, but it is not a prayer. */
export const PRAYER_LABELS = Object.freeze({
  fajr: { en: 'Fajr', ar: 'الفجر' },
  sunrise: { en: 'Sunrise', ar: 'الشروق' },
  dhuhr: { en: 'Dhuhr', ar: 'الظهر' },
  asr: { en: 'Asr', ar: 'العصر' },
  maghrib: { en: 'Maghrib', ar: 'المغرب' },
  isha: { en: 'Isha', ar: 'العشاء' }
});

/** @typedef {{fajr:Date|null, sunrise:Date|null, dhuhr:Date|null, asr:Date|null, maghrib:Date|null, isha:Date|null}} PrayerTimeSet */

/**
 * Prayer times for one calendar day at one location.
 *
 * Returns `null` for any prayer the calculation cannot define, rather than
 * an Invalid Date. Inside the polar circles this genuinely happens — the sun
 * does not rise or set at all for part of the year — and callers must be
 * able to tell "no such time today" from "something went wrong". A silent
 * Invalid Date propagates into a scheduled fire time and becomes a
 * notification at NaN, which is how you get four notifications in the same
 * minute (see the Tromso analysis in the design doc).
 *
 * With the default polarCircleResolution of AqrabBalad, nulls should not
 * occur at all; the null path exists for users who deliberately choose
 * 'Unresolved'.
 *
 * @param {{latitude:number, longitude:number}} coordinates
 * @param {Date} date - any instant during the target local day
 * @param {object} prayerConfig - config.prayer
 * @returns {PrayerTimeSet}
 */
export function prayerTimes(coordinates, date, prayerConfig) {
  if (!coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) {
    throw new TypeError('prayerTimes requires numeric latitude and longitude');
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new TypeError('prayerTimes requires a valid Date');
  }

  const coords = new adhan.Coordinates(coordinates.latitude, coordinates.longitude);
  const params = paramsFor(prayerConfig, coordinates);
  const times = new adhan.PrayerTimes(coords, date, params);

  /** @type {PrayerTimeSet} */
  const out = {};
  for (const key of PRAYER_KEYS) {
    const value = times[key];
    out[key] = value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
  }
  return out;
}

/**
 * Format a prayer time as local wall-clock HH:MM in a given IANA zone.
 *
 * Wall clock, never UTC — the project's standing rule, and the bug the
 * original Lambda shipped. Everything the user sees, and everything
 * scheduling compares, is local time in the user's own location.
 *
 * @param {Date|null} date
 * @param {string} timeZone
 * @returns {string|null}
 */
export function formatPrayerTime(date, timeZone) {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone
  }).format(date);
}
