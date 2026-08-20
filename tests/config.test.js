import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { migrate, DEFAULT_CONFIG, TOTAL_AYAHS } from '../src/main/config.js';

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
