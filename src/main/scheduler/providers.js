// Additional sources of fire times.
//
// The roadmap's constraint for every phase after the first: prayer times,
// azkar and fasting reminders are extra *sources of fire times*, not new
// scheduling machinery. This module is that seam.
//
// SchedulerEngine is deliberately NOT modified. It keeps owning the verse
// schedule, its tick loop, its failure counting and its resume handling.
// This module answers a narrower question — "given the last time we
// checked and the time now, which providers are due?" — and index.js calls
// it from the engine's existing onTick hook. The engine therefore drives
// everything on one timer, with no second interval and no change to code
// that already works.
//
// Pure: no Electron, no timers, no config store.

/**
 * @typedef {object} Provider
 * @property {string} id
 * @property {(after: Date) => ({at: Date, payload: any}|null)} nextFire
 * @property {boolean} [respectsQuietHours]
 */

/**
 * Which providers have a fire time in the window (since, now].
 *
 * At most ONE fire per provider per call, matching the engine's existing
 * "one decision regardless of how many slots elapsed: never a backlog
 * burst" rule. A laptop resuming from three days of sleep must produce one
 * Fajr notification, not two hundred.
 *
 * A provider that throws is skipped and reported, never allowed to stop the
 * others: a bad prayer calculation must not be able to take down verse
 * reminders.
 *
 * @param {Provider[]} providers
 * @param {Date} since
 * @param {Date} now
 * @param {{onError?: (id: string, err: Error) => void}} [options]
 * @returns {Array<{provider: Provider, at: Date, payload: any}>} due fires, earliest first
 */
export function dueFires(providers, since, now, options = {}) {
  const { onError } = options;
  const due = [];

  for (const provider of providers ?? []) {
    try {
      const fire = provider.nextFire(since);
      if (!fire || !(fire.at instanceof Date) || Number.isNaN(fire.at.getTime())) continue;
      // Strictly after `since`, at or before `now`.
      if (fire.at.getTime() <= since.getTime()) continue;
      if (fire.at.getTime() > now.getTime()) continue;
      due.push({ provider, at: fire.at, payload: fire.payload });
    } catch (err) {
      onError?.(provider?.id ?? 'unknown', err);
    }
  }

  // Earliest first, ties broken by registration order so the result is
  // deterministic rather than depending on object iteration accidents.
  return due.sort((a, b) => {
    const delta = a.at.getTime() - b.at.getTime();
    if (delta !== 0) return delta;
    return providers.indexOf(a.provider) - providers.indexOf(b.provider);
  });
}

/**
 * The single earliest upcoming fire across all providers, ignoring whether
 * it is due yet. Used for display ("next prayer at ...") rather than
 * dispatch.
 *
 * @param {Provider[]} providers
 * @param {Date} after
 * @param {{onError?: (id: string, err: Error) => void}} [options]
 * @returns {{provider: Provider, at: Date, payload: any}|null}
 */
export function earliestFire(providers, after, options = {}) {
  const { onError } = options;
  let best = null;

  for (const provider of providers ?? []) {
    try {
      const fire = provider.nextFire(after);
      if (!fire || !(fire.at instanceof Date) || Number.isNaN(fire.at.getTime())) continue;
      if (fire.at.getTime() <= after.getTime()) continue;
      if (!best || fire.at.getTime() < best.at.getTime()) {
        best = { provider, at: fire.at, payload: fire.payload };
      }
    } catch (err) {
      onError?.(provider?.id ?? 'unknown', err);
    }
  }

  return best;
}

/**
 * Whether a due fire should be suppressed by quiet hours.
 *
 * Prayer notifications deliberately IGNORE quiet hours. A user in a typical
 * 23:00-07:00 window who enabled it to stop verse reminders waking them
 * would otherwise silently lose Fajr and Isha — the two prayers most likely
 * to fall inside that window, and the two they are most likely to want a
 * reminder for. Quiet hours exist to mute ambient reminders, not to hide
 * the thing the app is fundamentally for.
 *
 * Providers opt in by setting respectsQuietHours: true.
 *
 * @param {Provider} provider
 * @param {boolean} inQuietHours
 */
export function suppressedByQuietHours(provider, inQuietHours) {
  return Boolean(inQuietHours && provider?.respectsQuietHours);
}
