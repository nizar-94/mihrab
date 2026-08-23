// Turns prayer times into notification fire times.
//
// Pure: no Electron, no config store, no timers. Given "what time is it
// now" and the user's settings, answer "when is the next prayer
// notification, and which one". The scheduler owns everything else.

import { prayerTimes, PRAYER_KEYS } from './times.js';

/** Sunrise is offered but is not a prayer — see DEFAULT_PER_PRAYER below. */
export const NOTIFIABLE_KEYS = Object.freeze(PRAYER_KEYS);

/**
 * Per-prayer defaults. The five obligatory prayers are on; sunrise is off,
 * because it is not a prayer — it is useful only as the end of Fajr's
 * window, and a notification for it would be noise for most users.
 */
export const DEFAULT_PER_PRAYER = Object.freeze({
  fajr: { enabled: true, remindAt: true, remindBefore: 0 },
  sunrise: { enabled: false, remindAt: true, remindBefore: 0 },
  dhuhr: { enabled: true, remindAt: true, remindBefore: 0 },
  asr: { enabled: true, remindAt: true, remindBefore: 0 },
  maghrib: { enabled: true, remindAt: true, remindBefore: 0 },
  isha: { enabled: true, remindAt: true, remindBefore: 0 }
});

const MINUTE = 60_000;

/**
 * Every fire time for one local day, unsorted.
 *
 * "Remind before" and "remind at" are independent, so a prayer can produce
 * two entries: a warning N minutes ahead AND the prayer itself. That is
 * deliberate — wanting a fifteen-minute warning does not mean not wanting
 * the athan.
 *
 * @param {{latitude:number, longitude:number}} coordinates
 * @param {Date} day - any instant during the target local day
 * @param {object} prayerConfig
 * @returns {Array<{at: Date, prayer: string, kind: 'before'|'at'}>}
 */
export function fireTimesForDay(coordinates, day, prayerConfig) {
  const times = prayerTimes(coordinates, day, prayerConfig);
  const perPrayer = prayerConfig?.perPrayer ?? DEFAULT_PER_PRAYER;
  const out = [];

  for (const prayer of NOTIFIABLE_KEYS) {
    const at = times[prayer];
    // null means the prayer has no defined time today — real inside the
    // polar circles when the user has chosen not to resolve them. Skipping
    // is correct; throwing would take down the whole schedule for one day.
    if (!at) continue;

    const settings = perPrayer[prayer] ?? DEFAULT_PER_PRAYER[prayer];
    if (!settings?.enabled) continue;

    if (settings.remindAt !== false) {
      out.push({ at, prayer, kind: 'at' });
    }

    const before = Number(settings.remindBefore) || 0;
    if (before > 0) {
      out.push({ at: new Date(at.getTime() - before * MINUTE), prayer, kind: 'before' });
    }
  }

  return out;
}

/**
 * The next prayer notification strictly after `after`.
 *
 * Looks at today and tomorrow, because the next fire after 23:50 is
 * tomorrow's Fajr. Two days is always enough: no prayer is more than 24
 * hours from the next, even at the poles once resolution is applied.
 *
 * Returns null when nothing is enabled at all, which the scheduler treats
 * as "this provider has nothing to contribute" rather than an error.
 *
 * @param {Date} after
 * @param {{latitude:number, longitude:number}} coordinates
 * @param {object} prayerConfig
 * @returns {{at: Date, prayer: string, kind: 'before'|'at'}|null}
 */
export function nextPrayerFire(after, coordinates, prayerConfig) {
  if (!(after instanceof Date) || Number.isNaN(after.getTime())) {
    throw new TypeError('nextPrayerFire requires a valid Date');
  }

  const tomorrow = new Date(after.getTime() + 24 * 60 * MINUTE);
  const candidates = [
    ...fireTimesForDay(coordinates, after, prayerConfig),
    ...fireTimesForDay(coordinates, tomorrow, prayerConfig)
  ];

  let best = null;
  for (const candidate of candidates) {
    // Strictly after: a fire time exactly equal to `after` has already been
    // handled by whoever passed that instant in, and returning it again
    // would re-fire the same notification forever.
    if (candidate.at.getTime() <= after.getTime()) continue;
    if (!best || candidate.at.getTime() < best.at.getTime()) best = candidate;
  }
  return best;
}
