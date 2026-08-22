import Store from 'electron-store';
import path from 'node:path';
import fs from 'node:fs';
import electron from 'electron';
import { validateSchedule, validateQuietHours, validateNotification } from './validate.js';

// Default (non-named) import: under a real Electron main process this is the
// Electron API object; under plain Node (e.g. this file loaded by Vitest)
// the 'electron' package resolves to a plain string (the path to the
// Electron binary), so destructuring it just yields `undefined` rather than
// throwing. A named `import { app } from 'electron'` would instead fail to
// even load outside Electron, which is why we avoid it here.
const { app } = electron;

export const TOTAL_AYAHS = 6236;

/**
 * @typedef {{mode:'interval', everyMinutes:number}
 *          |{mode:'minuteOfHour', minutes:number[]}
 *          |{mode:'dailyTimes', times:string[]}} Schedule
 * @typedef {{enabled:boolean, from:string, to:string}} QuietHours
 */

export const DEFAULT_CONFIG = {
  version: 1,
  schedule: { mode: 'interval', everyMinutes: 90 },
  // Off by default (2026-08-23 decision). A new user who installs a verse
  // reminder and gets silence between 23:00 and 07:00 has no way to tell
  // that from the app not working — the feature is opt-in for people who
  // are actually bothered overnight, not something to impose up front. The
  // from/to bounds are still seeded so enabling the toggle needs no
  // further setup.
  quietHours: { enabled: false, from: '23:00', to: '07:00' },
  verseOrder: 'random',
  sequencePosition: 0,
  translation: { id: null, downloadedAt: null },
  sound: { enabled: true, volume: 0.5 },
  notification: { durationMs: 15000, position: 'bottom-right' },
  // On by default for new installs (2026-08-21 decision, reverses the
  // original v1 design intent of asking on first run — see the spec's
  // "Decision reversal" note). This is only the schema default; making it
  // *actually* take effect on first launch — registering the OS login item,
  // not just this config value — is handled by decideAutostartAction below,
  // together with index.js's app.whenReady() handler.
  startWithWindows: true,
  // Distinguishes "this install has never gone through the autostart
  // first-run decision" (false) from "it has, and the OS is now the
  // ongoing source of truth" (true). Without this marker, flipping
  // startWithWindows's default to true would do nothing on a fresh
  // install: app.whenReady() reads the OS (no login item registered yet),
  // finds it disagrees with config, and reconciles config right back to
  // false before the user ever sees it. See decideAutostartAction.
  autostartInitialised: false,
  lastFiredAt: null
};

export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_CONFIG);
  const merged = {
    ...DEFAULT_CONFIG,
    ...raw,
    schedule: raw.schedule,
    quietHours: { ...DEFAULT_CONFIG.quietHours, ...(raw.quietHours ?? {}) },
    translation: { ...DEFAULT_CONFIG.translation, ...(raw.translation ?? {}) },
    sound: { ...DEFAULT_CONFIG.sound, ...(raw.sound ?? {}) },
    notification: { ...DEFAULT_CONFIG.notification, ...(raw.notification ?? {}) }
  };
  const pos = merged.sequencePosition;
  if (!Number.isInteger(pos) || pos < 0 || pos >= TOTAL_AYAHS) merged.sequencePosition = 0;
  if (merged.verseOrder !== 'sequential') merged.verseOrder = 'random';

  // The disk-read path must be guarded by the same validators as the settings
  // form. An unvalidated schedule or quiet-hours payload reaching the
  // scheduler makes the app silently stop reminding forever (no throw, no
  // log) — see Task 9 brief Part B.
  const scheduleResult = validateSchedule(merged.schedule);
  merged.schedule = scheduleResult.ok ? scheduleResult.value : structuredClone(DEFAULT_CONFIG.schedule);

  const quietHoursResult = validateQuietHours(merged.quietHours);
  merged.quietHours = quietHoursResult.ok ? quietHoursResult.value : structuredClone(DEFAULT_CONFIG.quietHours);

  // notification.durationMs was the only config field not covered by a
  // validator: a hand-edited non-numeric value makes setTimeout(close, NaN)
  // fire immediately, so the card flashes and vanishes. Same guard pattern
  // as schedule/quietHours above.
  const notificationResult = validateNotification(merged.notification);
  merged.notification = notificationResult.ok ? notificationResult.value : structuredClone(DEFAULT_CONFIG.notification);

  // A corrupt, non-null lastFiredAt (e.g. 'garbage') is truthy but parses to
  // an Invalid Date. shouldFire() would then compare NaN against `now` on
  // every tick, which is always false — the app stops reminding forever with
  // no error. null is the correct fallback (not "now"): it tells the
  // scheduler nothing has fired yet, so it fires on the next tick.
  // Must also reject non-string values (e.g. a stray number): `new
  // Date(12345)` parses to a *valid* date (ms since epoch), so a bare NaN
  // check alone would let a wrong-typed value slip through as "valid".
  if (merged.lastFiredAt !== null) {
    if (typeof merged.lastFiredAt !== 'string') {
      merged.lastFiredAt = null;
    } else {
      const t = new Date(merged.lastFiredAt);
      if (Number.isNaN(t.getTime())) merged.lastFiredAt = null;
    }
  }

  // autostartInitialised must be re-derived from the *original* raw input,
  // not from `merged` — the spread above already backfilled a missing key
  // with DEFAULT_CONFIG's `false`, which would make "never had this field"
  // indistinguishable from "genuinely never initialised".
  //
  // Three cases:
  //  - A valid boolean was present: keep it as-is.
  //  - The key is absent/wrong-typed AND raw has no other content (empty
  //    input, e.g. `{}`): this is a genuinely fresh config -> false.
  //  - The key is absent/wrong-typed BUT raw has other fields: this is a
  //    config that predates this field (an upgrade from before this
  //    change), not a fresh install. Treat it as already initialised
  //    (true) so upgrading users never get autostart force-enabled out
  //    from under them by the one-time first-run registration — that would
  //    be worse than the "silently overridden" bug this design already
  //    avoids for the OS-reconcile path.
  if (typeof raw?.autostartInitialised === 'boolean') {
    merged.autostartInitialised = raw.autostartInitialised;
  } else if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
    merged.autostartInitialised = true;
  } else {
    merged.autostartInitialised = false;
  }

  merged.version = 1;
  return merged;
}

// Pure decision for the startup autostart choice — deliberately has no
// Electron API calls in it (no app.setLoginItemSettings /
// getLoginItemSettings) so it can be unit tested directly with plain
// booleans, rather than only indirectly through a mocked `app`. index.js
// calls this once in app.whenReady() and carries out whichever action it
// returns.
//
//  - Never initialised (autostartInitialised === false): this is the
//    first run that has ever decided autostart for this install. Register
//    it with the OS and turn the config on — this is what makes the
//    "on by default" change in DEFAULT_CONFIG actually take effect, instead
//    of being immediately overwritten by the very next reconcile.
//  - Already initialised: unchanged from the prior design — the OS is the
//    ongoing source of truth, so config is made to match whatever the OS
//    reports (which may be true or false, e.g. the user turned it off via
//    Task Manager's Startup tab). This never calls setLoginItemSettings;
//    reality wins over whatever was last written to config.
//
// @param {boolean} autostartInitialised
// @param {boolean} osAutostart - app.getLoginItemSettings({ args: AUTOSTART_ARGS }).openAtLogin
// @returns {{action: 'register'|'reconcile', startWithWindows: boolean}}
export function decideAutostartAction(autostartInitialised, osAutostart) {
  if (!autostartInitialised) {
    return { action: 'register', startWithWindows: true };
  }
  return { action: 'reconcile', startWithWindows: osAutostart };
}

// Resolves the on-disk path electron-store will use, without constructing a
// Store first. electron-store defaults `cwd` to `app.getPath('userData')`
// and combines it with configName 'config' + fileExtension 'json' (see
// conf's `#resolvePath`: `path.resolve(cwd, `${configName}.${fileExtension}`)`).
// We don't pass a custom `name` or `cwd` to `new Store()` below, so this
// mirrors that default exactly. Only resolvable inside a running Electron
// app — `app` is undefined under plain Node (e.g. Vitest), in which case we
// return null and skip the backup step entirely.
function resolveConfigPath() {
  if (!app || typeof app.getPath !== 'function') return null;
  try {
    return path.join(app.getPath('userData'), 'config.json');
  } catch {
    return null;
  }
}

// Spec §12 requires preserving a corrupt config file rather than letting
// `clearInvalidConfig` silently discard its contents. If the file exists and
// fails to parse as JSON, rename it aside before the Store is constructed so
// the user (or a future support request) can recover the original content.
// Any other failure (file missing, unreadable, etc.) is left for the Store
// itself to handle and is not treated as "corrupt".
function backupIfCorrupt() {
  const configPath = resolveConfigPath();
  if (!configPath) return;

  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch {
    return;
  }

  try {
    JSON.parse(raw);
    return;
  } catch {
    // fall through — malformed JSON, back it up below
  }

  const backupPath = path.join(path.dirname(configPath), `config.corrupt-${Date.now()}.json`);
  try {
    fs.renameSync(configPath, backupPath);
  } catch (err) {
    console.error('muslim-app: failed to back up corrupt config.json', err);
  }
}

let store;

function getStore() {
  if (!store) {
    backupIfCorrupt();
    // clearInvalidConfig: without this, `conf` (which electron-store wraps)
    // lets the constructor's own initial read throw a raw SyntaxError for a
    // malformed config.json, before migrate()'s validation guards ever run.
    // With it, `conf` swallows the SyntaxError and starts from an empty
    // store, which then picks up DEFAULT_CONFIG via `defaults` below. Note
    // this only covers parse failures — a non-syntax read failure (e.g.
    // EACCES on a locked/unreadable file) still propagates, which is why
    // getConfig() below also has its own fallback.
    store = new Store({ defaults: { config: DEFAULT_CONFIG }, clearInvalidConfig: true });
  }
  return store;
}

export function getConfig() {
  try {
    return migrate(getStore().get('config'));
  } catch (err) {
    console.error('muslim-app: failed to read config, using defaults', err);
    return structuredClone(DEFAULT_CONFIG);
  }
}

export function setConfig(patch) {
  getStore().set('config', { ...getConfig(), ...patch });
}
