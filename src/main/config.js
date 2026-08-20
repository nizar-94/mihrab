import Store from 'electron-store';
import path from 'node:path';
import fs from 'node:fs';
import electron from 'electron';
import { validateSchedule, validateQuietHours } from './validate.js';

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
  quietHours: { enabled: true, from: '23:00', to: '07:00' },
  verseOrder: 'random',
  sequencePosition: 0,
  translation: { id: null, downloadedAt: null },
  sound: { enabled: true, volume: 0.5 },
  notification: { durationMs: 15000, position: 'bottom-right' },
  startWithWindows: false,
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

  merged.version = 1;
  return merged;
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
