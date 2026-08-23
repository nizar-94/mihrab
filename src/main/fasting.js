// Fasting reminders.
//
// Pure calendar arithmetic on the Hijri date from hijri.js — no new data,
// no network, no licensing question. Like prayer times, this is an
// additional source of fire times for the existing scheduler.
//
// Reminders fire the DAY BEFORE, because a reminder on the morning of a
// fast is useless: the decision to fast is made the night before, and
// suhoor is eaten before dawn.

import { hijriDate } from './hijri.js';
import { localDateString, zonedTime, addDays } from './zoned.js';

/**
 * @typedef {object} FastingConfig
 * @property {boolean} whiteDays
 * @property {boolean} mondayThursday
 * @property {boolean} ashura
 * @property {boolean} arafah
 * @property {boolean} sixOfShawwal
 * @property {string} remindAt - HH:MM local
 */

// All on by default. These are the recommended fasts most people who want
// the feature at all want reminding of, and a screen of unticked boxes
// makes the user do setup work to reach the obvious configuration. Anyone
// who wants fewer unticks the ones they do not keep — which is a smaller
// job than ticking five.
//
// Note the reminders still only fire once a LOCATION is set, so enabling
// these by default cannot surprise a brand-new user with notifications.
export const DEFAULT_FASTING = Object.freeze({
  whiteDays: true,
  mondayThursday: true,
  ashura: true,
  arafah: true,
  sixOfShawwal: true,
  // Mid-afternoon the day before: late enough that the day is nearly done,
  // early enough to still shop, cook or tell the household.
  remindAt: '16:30'
});

// Hijri month numbers used below, named so the rules read as their own
// documentation rather than as magic numbers.
const MUHARRAM = 1;
const SHAWWAL = 10;
const DHUL_HIJJAH = 12;

/**
 * Every reason the given local date is a recommended fast day.
 *
 * Returns an array because reasons genuinely overlap — 13 Muharram can be a
 * white day AND a Monday — and a reminder that names both is more useful
 * than one that silently picks a winner.
 *
 * @param {string} iso - local date, YYYY-MM-DD
 * @param {string} timeZone
 * @param {FastingConfig} config
 * @returns {Array<{id: string, label: string}>}
 */
export function fastingReasons(iso, timeZone, config) {
  // Midday avoids any ambiguity about which local day this instant belongs
  // to, including on DST changeover days.
  const noon = zonedTime(iso, '12:00', timeZone);
  const h = hijriDate(noon, timeZone);
  // Weekday in the USER's zone, not the host's: someone in Auckland and
  // someone in Los Angeles are on different weekdays for most of the day.
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(noon);

  const reasons = [];

  // Ramadan is deliberately excluded everywhere in this module: nobody
  // needs an app to tell them it is Ramadan, and its daily rhythm is
  // already covered by Fajr and Maghrib in the prayer reminders. Firing
  // "you may wish to fast tomorrow" for thirty consecutive days would be
  // noise that trains people to ignore the feature.
  const inRamadan = h.month === 9;
  if (inRamadan) return reasons;

  if (config.whiteDays && (h.day === 13 || h.day === 14 || h.day === 15)) {
    reasons.push({ id: 'whiteDays', label: `White day — ${h.day} of the month` });
  }

  if (config.mondayThursday && (weekday === 'Monday' || weekday === 'Thursday')) {
    reasons.push({ id: 'mondayThursday', label: `${weekday} fast` });
  }

  if (config.ashura && h.month === MUHARRAM && h.day === 9) {
    reasons.push({ id: 'ashura', label: "Tasu'a — 9 Muharram" });
  }
  if (config.ashura && h.month === MUHARRAM && h.day === 10) {
    reasons.push({ id: 'ashura', label: 'Ashura — 10 Muharram' });
  }

  if (config.arafah && h.month === DHUL_HIJJAH && h.day === 9) {
    reasons.push({ id: 'arafah', label: 'Day of Arafah' });
  }

  // Shawwal 1 is Eid al-Fitr, on which fasting is not permitted, so the
  // six days start on the 2nd. Offered as a window rather than six separate
  // reminders — they need not be consecutive.
  if (config.sixOfShawwal && h.month === SHAWWAL && h.day >= 2 && h.day <= 7) {
    reasons.push({ id: 'sixOfShawwal', label: 'Six days of Shawwal' });
  }

  return reasons;
}

/**
 * The next fasting reminder strictly after `after`.
 *
 * Scans forward day by day. The horizon is 400 days so that a reminder set
 * for a single annual event — Arafah, Ashura — is still found from any
 * starting point in the year, including the day after it has just passed.
 *
 * @param {Date} after
 * @param {string} timeZone
 * @param {FastingConfig} config
 * @returns {{at: Date, reasons: Array<{id:string,label:string}>, fastDate: string}|null}
 */
export function nextFastingFire(after, timeZone, config) {
  if (!(after instanceof Date) || Number.isNaN(after.getTime())) {
    throw new TypeError('nextFastingFire requires a valid Date');
  }
  if (!config || !Object.values(config).some((v) => v === true)) return null;

  const remindAt = /^\d{2}:\d{2}$/.test(config.remindAt) ? config.remindAt : DEFAULT_FASTING.remindAt;

  // Start from today's local date: today's reminder (for tomorrow's fast)
  // may still be ahead of `after`.
  let cursor = localDateString(after, timeZone);

  for (let i = 0; i < 400; i++) {
    // The reminder on `cursor` is about the fast on the FOLLOWING day.
    const fastDate = addDays(cursor, 1);
    const reasons = fastingReasons(fastDate, timeZone, config);

    if (reasons.length > 0) {
      const at = zonedTime(cursor, remindAt, timeZone);
      if (at.getTime() > after.getTime()) {
        return { at, reasons, fastDate };
      }
    }
    cursor = addDays(cursor, 1);
  }

  return null;
}
