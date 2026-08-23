import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { migrate, DEFAULT_CONFIG, TOTAL_AYAHS, decideAutostartAction } from '../src/main/config.js';

describe('migrate', () => {
  it('returns defaults for empty input', () => {
    expect(migrate({})).toEqual(DEFAULT_CONFIG);
  });

  it('returns defaults for corrupt input', () => {
    expect(migrate(null)).toEqual(DEFAULT_CONFIG);
    expect(migrate('garbage')).toEqual(DEFAULT_CONFIG);
  });

  it('preserves known values', () => {
    const r = migrate({ version: 1, verseOrder: 'sequential', sequencePosition: 42 });
    expect(r.verseOrder).toBe('sequential');
    expect(r.sequencePosition).toBe(42);
  });

  it('fills missing keys without discarding present ones', () => {
    const r = migrate({ version: 1, sequencePosition: 7 });
    expect(r.sequencePosition).toBe(7);
    expect(r.schedule).toEqual(DEFAULT_CONFIG.schedule);
  });

  it('clamps an out-of-range sequencePosition', () => {
    expect(migrate({ sequencePosition: 99999 }).sequencePosition).toBe(0);
    expect(migrate({ sequencePosition: -5 }).sequencePosition).toBe(0);
    expect(migrate({ sequencePosition: 1.5 }).sequencePosition).toBe(0);
  });

  it('rejects an unknown verseOrder', () => {
    expect(migrate({ verseOrder: 'sideways' }).verseOrder).toBe('random');
  });

  it('deep-merges nested objects', () => {
    const r = migrate({ sound: { volume: 0.9 } });
    expect(r.sound.volume).toBe(0.9);
    expect(r.sound.enabled).toBe(true);
  });

  it('replaces a schedule with an unknown mode', () => {
    expect(migrate({ schedule: { mode: 'garbage' } }).schedule).toEqual(DEFAULT_CONFIG.schedule);
  });

  it('replaces a missing or malformed schedule', () => {
    expect(migrate({ schedule: null }).schedule).toEqual(DEFAULT_CONFIG.schedule);
    expect(migrate({ schedule: 'nope' }).schedule).toEqual(DEFAULT_CONFIG.schedule);
  });

  it('preserves a valid non-default schedule mode', () => {
    const s = { mode: 'dailyTimes', times: ['09:00'] };
    expect(migrate({ schedule: s }).schedule).toEqual(s);
  });

  it('does not return the shared DEFAULT_CONFIG.schedule reference', () => {
    expect(migrate({}).schedule).not.toBe(DEFAULT_CONFIG.schedule);
  });

  it('replaces a schedule whose payload is invalid', () => {
    expect(migrate({ schedule: { mode: 'interval', everyMinutes: 'abc' } }).schedule)
      .toEqual(DEFAULT_CONFIG.schedule);
    expect(migrate({ schedule: { mode: 'interval', everyMinutes: -90 } }).schedule)
      .toEqual(DEFAULT_CONFIG.schedule);
    expect(migrate({ schedule: { mode: 'interval', everyMinutes: 0 } }).schedule)
      .toEqual(DEFAULT_CONFIG.schedule);
  });

  it('replaces quiet hours with null or malformed bounds', () => {
    expect(migrate({ quietHours: { enabled: true, from: null, to: '07:00' } }).quietHours)
      .toEqual(DEFAULT_CONFIG.quietHours);
    expect(migrate({ quietHours: { enabled: true, from: 'x', to: '07:00' } }).quietHours)
      .toEqual(DEFAULT_CONFIG.quietHours);
  });

  it('normalises a valid schedule through the validator', () => {
    expect(migrate({ schedule: { mode: 'minuteOfHour', minutes: [55, 25, 25] } }).schedule.minutes)
      .toEqual([25, 55]);
  });

  it('clears an unparseable lastFiredAt so the scheduler can recover', () => {
    expect(migrate({ lastFiredAt: 'garbage' }).lastFiredAt).toBe(null);
    expect(migrate({ lastFiredAt: '' }).lastFiredAt).toBe(null);
    expect(migrate({ lastFiredAt: 12345 }).lastFiredAt).toBe(null);
  });

  it('preserves a valid ISO lastFiredAt', () => {
    const iso = '2026-08-20T10:00:00.000Z';
    expect(migrate({ lastFiredAt: iso }).lastFiredAt).toBe(iso);
  });

  it('replaces a corrupt notification object with the default', () => {
    expect(migrate({ notification: { durationMs: NaN, position: 'bottom-right' } }).notification)
      .toEqual(DEFAULT_CONFIG.notification);
    expect(migrate({ notification: { durationMs: 15000, position: 'top-left' } }).notification)
      .toEqual(DEFAULT_CONFIG.notification);
    expect(migrate({ notification: null }).notification).toEqual(DEFAULT_CONFIG.notification);
  });

  it('preserves a valid non-default notification, backfilling the verse size', () => {
    // A v1 config has no verseFontSize; migration gives it the default
    // rather than dropping the section or failing validation.
    const n = { durationMs: 30000, position: 'bottom-right' };
    expect(migrate({ notification: n }).notification)
      .toEqual({ ...n, verseFontSize: 22 });
  });

  it('keeps a verse size the user already chose', () => {
    const n = { durationMs: 15000, position: 'bottom-right', verseFontSize: 30 };
    expect(migrate({ notification: n }).notification.verseFontSize).toBe(30);
  });

  it('defaults startWithWindows to true and autostartInitialised to false', () => {
    expect(DEFAULT_CONFIG.startWithWindows).toBe(true);
    expect(DEFAULT_CONFIG.autostartInitialised).toBe(false);
  });
});

describe('migrate: autostartInitialised marker', () => {
  it('defaults a genuinely empty/corrupt input to false (fresh install)', () => {
    expect(migrate({}).autostartInitialised).toBe(false);
    expect(migrate(null).autostartInitialised).toBe(false);
    expect(migrate('garbage').autostartInitialised).toBe(false);
  });

  it('treats a missing marker on an otherwise non-empty config as already initialised', () => {
    // Simulates a config saved before this field existed: the key is
    // absent, but other fields prove a real prior install, not a fresh one.
    // Must default to true, or an upgrading user would have autostart
    // force-enabled by the one-time first-run registration.
    expect(migrate({ version: 1, sequencePosition: 42 }).autostartInitialised).toBe(true);
  });

  it('treats a wrong-typed marker the same way: already initialised, not fresh', () => {
    expect(migrate({ version: 1, autostartInitialised: 'yes' }).autostartInitialised).toBe(true);
    expect(migrate({ version: 1, autostartInitialised: 1 }).autostartInitialised).toBe(true);
    expect(migrate({ version: 1, autostartInitialised: null }).autostartInitialised).toBe(true);
  });

  it('preserves a valid marker of either value', () => {
    expect(migrate({ autostartInitialised: true }).autostartInitialised).toBe(true);
    expect(migrate({ autostartInitialised: false }).autostartInitialised).toBe(false);
  });
});

describe('decideAutostartAction (pure)', () => {
  it('registers autostart and turns config on when never initialised, regardless of current OS state', () => {
    expect(decideAutostartAction(false, false)).toEqual({ action: 'register', startWithWindows: true });
    // Even if the OS somehow already has an entry, an uninitialised install
    // still takes the register path — it's idempotent from the OS's
    // perspective and keeps the decision function's contract simple: the
    // marker alone gates first-run vs reconcile.
    expect(decideAutostartAction(false, true)).toEqual({ action: 'register', startWithWindows: true });
  });

  it('reconciles to whatever the OS reports when already initialised', () => {
    expect(decideAutostartAction(true, true)).toEqual({ action: 'reconcile', startWithWindows: true });
    expect(decideAutostartAction(true, false)).toEqual({ action: 'reconcile', startWithWindows: false });
  });
});

// A malformed config.json makes `conf` throw a raw SyntaxError out of the
// `Store` constructor itself (verified against node_modules/conf's `store`
// getter, which only swallows SyntaxError/schema/decrypt failures when
// `clearInvalidConfig` is set, and only inside a try/catch the constructor
// path runs through). getConfig() must not let that — or any other store
// construction failure — propagate to callers such as the scheduler tick,
// the tray click handler, or the settings:load IPC handler; it must fall
// back to defaults instead. These tests simulate that by mocking
// `electron-store` so `new Store()` throws, then re-importing config.js
// fresh so the mock takes effect before the module's lazily-created
// singleton `store` is ever built.
describe('getConfig (store construction failure)', () => {
  const originalConsoleError = console.error;

  beforeEach(() => {
    vi.resetModules();
    console.error = vi.fn();
  });

  afterEach(() => {
    vi.doUnmock('electron-store');
    console.error = originalConsoleError;
  });

  it('returns defaults instead of throwing when the Store constructor throws', async () => {
    vi.doMock('electron-store', () => ({
      default: class {
        constructor() {
          throw new SyntaxError('simulated malformed config.json');
        }
      }
    }));

    const fresh = await import('../src/main/config.js');
    expect(() => fresh.getConfig()).not.toThrow();
    expect(fresh.getConfig()).toEqual(fresh.DEFAULT_CONFIG);
  });

  it('returns defaults instead of throwing when the Store constructor fails for a non-syntax reason (e.g. EACCES)', async () => {
    vi.doMock('electron-store', () => ({
      default: class {
        constructor() {
          const err = new Error('EACCES: permission denied, open \'config.json\'');
          err.code = 'EACCES';
          throw err;
        }
      }
    }));

    const fresh = await import('../src/main/config.js');
    expect(() => fresh.getConfig()).not.toThrow();
    expect(fresh.getConfig()).toEqual(fresh.DEFAULT_CONFIG);
  });

  it('does not mutate the shared DEFAULT_CONFIG reference when falling back', async () => {
    vi.doMock('electron-store', () => ({
      default: class {
        constructor() {
          throw new SyntaxError('simulated malformed config.json');
        }
      }
    }));

    const fresh = await import('../src/main/config.js');
    const result = fresh.getConfig();
    expect(result).not.toBe(fresh.DEFAULT_CONFIG);
  });
});

// These two defaults are deliberate product decisions rather than
// incidental values, and every other test in this file refers to
// DEFAULT_CONFIG symbolically — so nothing else would fail if one of them
// were flipped by accident. Pinned literally here on purpose.
describe('DEFAULT_CONFIG — deliberate defaults', () => {
  it('ships with quiet hours OFF, with the bounds still seeded', () => {
    expect(DEFAULT_CONFIG.quietHours.enabled).toBe(false);
    expect(DEFAULT_CONFIG.quietHours.from).toBe('23:00');
    expect(DEFAULT_CONFIG.quietHours.to).toBe('07:00');
  });

  it('ships with start-with-Windows ON for a never-initialised install', () => {
    expect(DEFAULT_CONFIG.startWithWindows).toBe(true);
    expect(DEFAULT_CONFIG.autostartInitialised).toBe(false);
    // The default alone is not enough — it only takes effect because a
    // never-initialised install registers rather than reconciles.
    expect(decideAutostartAction(false, false))
      .toEqual({ action: 'register', startWithWindows: true });
  });
});
