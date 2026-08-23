// Morning and evening adhkar.
//
// Anchored to PRAYER TIMES rather than clock times, which is the whole
// point: adhkar as-sabah belong to the period after Fajr and adhkar
// al-masa to the period after Asr or Maghrib, and those move through the
// year. A fixed "07:00" reminder would drift out of the window it is
// supposed to sit in.
//
// The selection half is pure and testable; the loading half needs Electron
// only to resolve a path.

import electron from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prayerTimes } from './prayer/times.js';

const { app } = electron;

/** Which prayer each session may anchor to. */
export const MORNING_ANCHORS = Object.freeze([
  { id: 'fajr', label: 'After Fajr' },
  { id: 'sunrise', label: 'After sunrise' }
]);

export const EVENING_ANCHORS = Object.freeze([
  { id: 'asr', label: 'After Asr' },
  { id: 'maghrib', label: 'After Maghrib' }
]);

export const DEFAULT_AZKAR = Object.freeze({
  // On by default. The app asks for a location on first run, so these can
  // be useful immediately instead of waiting to be discovered; the provider
  // is still location-gated, so nothing fires before one is set.
  morning: { enabled: true, anchor: 'fajr', offsetMinutes: 30 },
  evening: { enabled: true, anchor: 'asr', offsetMinutes: 30 },
  // Sequential position through each set, mirroring how verse reminders
  // remember their place. One dhikr per session, advancing each day.
  position: { morning: 0, evening: 0 },
  // Bundled adhkar the user has switched off, by their `order` number.
  // Stored as an opt-OUT list rather than an opt-in one so that adhkar
  // added to the dataset in a future release appear automatically instead
  // of being silently excluded from everyone's existing config.
  disabled: [],
  // The user's own additions. Same shape as a bundled entry plus a string
  // id, so everything downstream can treat the two identically.
  custom: []
});

/** Custom entries get string ids; bundled ones are numbered by `order`. */
export const entryId = (entry) => (entry.custom ? entry.id : entry.order);

/**
 * The adhkar actually in play: the bundled set minus anything switched off,
 * plus the user's own.
 *
 * Kept separate from sessionEntries() so the "which exist" and "which
 * belong to this session" questions stay independently testable.
 */
export function effectiveEntries(bundled, azkarConfig) {
  const disabled = new Set(azkarConfig?.disabled ?? []);
  const kept = (bundled ?? []).filter((e) => !disabled.has(e.order));
  const custom = (azkarConfig?.custom ?? []).map((c) => ({ ...c, custom: true }));
  return [...kept, ...custom];
}

/**
 * The adhkar that belong to a session.
 * Entries marked 'both' appear in each; 'morning'/'evening' only in theirs.
 */
export function sessionEntries(entries, session) {
  const other = session === 'morning' ? 'evening' : 'morning';
  return entries.filter((e) => e.when !== other);
}

/**
 * Pick one dhikr and report the position to store next.
 *
 * Wraps around rather than stopping, so the set cycles indefinitely — and
 * a position left over from a larger set (or a corrupt one) is folded back
 * into range instead of returning undefined.
 *
 * @returns {{entry: object, index: number, nextPosition: number, total: number}|null}
 */
export function selectDhikr(entries, session, position) {
  const set = sessionEntries(entries, session);
  if (set.length === 0) return null;
  const index = Number.isInteger(position) && position >= 0 ? position % set.length : 0;
  return {
    entry: set[index],
    index,
    nextPosition: (index + 1) % set.length,
    total: set.length
  };
}

const MINUTE = 60_000;

/**
 * The next azkar reminder strictly after `after`.
 *
 * Both sessions are computed for today and tomorrow, and the earliest that
 * has not yet passed wins. Two days is enough: the anchors are daily.
 *
 * @param {Date} after
 * @param {{latitude:number, longitude:number, timezone:string}} location
 * @param {object} prayerConfig
 * @param {object} azkarConfig
 * @returns {{at: Date, session: 'morning'|'evening'}|null}
 */
export function nextAzkarFire(after, location, prayerConfig, azkarConfig) {
  if (!(after instanceof Date) || Number.isNaN(after.getTime())) {
    throw new TypeError('nextAzkarFire requires a valid Date');
  }

  const candidates = [];
  for (const dayOffset of [0, 1]) {
    const day = new Date(after.getTime() + dayOffset * 24 * 60 * MINUTE);
    const times = prayerTimes(location, day, prayerConfig);

    for (const session of ['morning', 'evening']) {
      const settings = azkarConfig?.[session];
      if (!settings?.enabled) continue;

      const anchorTime = times[settings.anchor];
      // null happens at polar latitudes when the anchor prayer has no
      // defined time that day. Skipping is right: there is no meaningful
      // "after Fajr" on a day with no Fajr.
      if (!anchorTime) continue;

      const offset = Number(settings.offsetMinutes) || 0;
      candidates.push({ at: new Date(anchorTime.getTime() + offset * MINUTE), session });
    }
  }

  let best = null;
  for (const candidate of candidates) {
    if (candidate.at.getTime() <= after.getTime()) continue;
    if (!best || candidate.at.getTime() < best.at.getTime()) best = candidate;
  }
  return best;
}

// --- Electron-dependent loading ---------------------------------------

let cache = null;

/**
 * 41 KB, unlike the ~1.8 MB Quran dataset and the ~2.3 MB city database, so
 * this one stays INSIDE app.asar rather than shipping via extraResources —
 * small enough that there is nothing to gain from keeping it out.
 */
function azkarPath() {
  return join(app.getAppPath(), 'resources/azkar.json');
}

export function loadAzkar() {
  if (!cache) cache = JSON.parse(readFileSync(azkarPath(), 'utf8'));
  return cache;
}

/** All adhkar, loaded lazily on first use. */
export function allEntries() {
  return loadAzkar().entries;
}
