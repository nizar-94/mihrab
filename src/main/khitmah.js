// Progress through a khitmah — one complete reading of the Quran.
//
// Only meaningful in sequential order: in random order there is no
// "progress", just a position the app deliberately leaves untouched.
//
// Pure. No Electron, no config store.

import { TOTAL_AYAHS } from './config.js';

/**
 * Progress after reading the ayah at `index` (0-based).
 *
 * Counts the ayah just shown as read, so the very first verse reports
 * 1 / 6236 rather than 0 — a progress bar that stays empty after you have
 * actually read something is simply wrong.
 *
 * @param {number} index - 0-based ayah index
 * @returns {{read:number, total:number, percent:number, remaining:number}}
 */
export function khitmahProgress(index) {
  const total = TOTAL_AYAHS;
  const safe = Number.isInteger(index) && index >= 0 ? index % total : 0;
  const read = safe + 1;
  return {
    read,
    total,
    // One decimal place: 6236 ayat means a single verse moves the figure by
    // 0.016%, and a whole-number percentage would sit unchanged for sixty
    // readings at a time.
    percent: Math.round((read / total) * 1000) / 10,
    remaining: total - read
  };
}

/**
 * The same, from a stored `sequencePosition`, which points at the NEXT
 * ayah to show rather than the last one shown.
 *
 * A position of 0 is ambiguous — it is both "nothing read yet" and "just
 * wrapped past the end" — and it is reported as nothing read, because that
 * is the state a new install is in and the far commoner case.
 */
export function progressFromPosition(position) {
  const total = TOTAL_AYAHS;
  const safe = Number.isInteger(position) && position >= 0 ? position % total : 0;
  return {
    read: safe,
    total,
    percent: Math.round((safe / total) * 1000) / 10,
    remaining: total - safe
  };
}
