import { describe, it, expect } from 'vitest';
import { validateSchedule, validateQuietHours, validateSound, validateNotification } from '../src/main/validate.js';

describe('validateSchedule interval', () => {
  it('accepts a sane interval', () => {
    expect(validateSchedule({ mode: 'interval', everyMinutes: 90 }))
      .toEqual({ ok: true, value: { mode: 'interval', everyMinutes: 90 } });
  });

  it('rejects zero, negative, and non-integer intervals', () => {
    expect(validateSchedule({ mode: 'interval', everyMinutes: 0 }).ok).toBe(false);
    expect(validateSchedule({ mode: 'interval', everyMinutes: -5 }).ok).toBe(false);
    expect(validateSchedule({ mode: 'interval', everyMinutes: 1.5 }).ok).toBe(false);
    expect(validateSchedule({ mode: 'interval', everyMinutes: 'abc' }).ok).toBe(false);
    expect(validateSchedule({ mode: 'interval', everyMinutes: NaN }).ok).toBe(false);
  });

  it('rejects an interval longer than a day', () => {
    expect(validateSchedule({ mode: 'interval', everyMinutes: 1441 }).ok).toBe(false);
  });
});

describe('validateSchedule minuteOfHour', () => {
  it('accepts and sorts valid minutes', () => {
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [55, 25] }).value.minutes).toEqual([25, 55]);
  });

  it('rejects an empty list', () => {
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [] }).ok).toBe(false);
  });

  it('rejects out-of-range minutes', () => {
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [60] }).ok).toBe(false);
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [-1] }).ok).toBe(false);
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [NaN] }).ok).toBe(false);
  });

  it('de-duplicates', () => {
    expect(validateSchedule({ mode: 'minuteOfHour', minutes: [25, 25] }).value.minutes).toEqual([25]);
  });
});

describe('validateSchedule dailyTimes', () => {
  it('accepts and sorts valid times', () => {
    expect(validateSchedule({ mode: 'dailyTimes', times: ['20:00', '09:00'] }).value.times)
      .toEqual(['09:00', '20:00']);
  });

  it('rejects malformed times', () => {
    expect(validateSchedule({ mode: 'dailyTimes', times: ['9am'] }).ok).toBe(false);
    expect(validateSchedule({ mode: 'dailyTimes', times: ['25:00'] }).ok).toBe(false);
    expect(validateSchedule({ mode: 'dailyTimes', times: ['09:70'] }).ok).toBe(false);
  });

  it('rejects an empty list', () => {
    expect(validateSchedule({ mode: 'dailyTimes', times: [] }).ok).toBe(false);
  });
});

describe('validateSchedule mode', () => {
  it('rejects an unknown mode', () => {
    expect(validateSchedule({ mode: 'whenever' }).ok).toBe(false);
    expect(validateSchedule(null).ok).toBe(false);
    expect(validateSchedule('nope').ok).toBe(false);
  });
});

describe('validateQuietHours', () => {
  it('accepts a wrapping window', () => {
    expect(validateQuietHours({ enabled: true, from: '23:00', to: '07:00' }).ok).toBe(true);
  });

  it('rejects malformed times', () => {
    expect(validateQuietHours({ enabled: true, from: 'x', to: '07:00' }).ok).toBe(false);
  });

  it('rejects null or missing bounds', () => {
    expect(validateQuietHours({ enabled: true, from: null, to: '07:00' }).ok).toBe(false);
    expect(validateQuietHours({ enabled: true, to: '07:00' }).ok).toBe(false);
  });

  it('rejects an identical from and to, which would suppress everything', () => {
    expect(validateQuietHours({ enabled: true, from: '07:00', to: '07:00' }).ok).toBe(false);
  });
});

describe('validateSound', () => {
  it('accepts a valid volume', () => {
    expect(validateSound({ enabled: true, volume: 0.5 }).ok).toBe(true);
  });

  it('rejects an out-of-range volume', () => {
    expect(validateSound({ enabled: true, volume: 1.5 }).ok).toBe(false);
    expect(validateSound({ enabled: true, volume: -0.1 }).ok).toBe(false);
    expect(validateSound({ enabled: true, volume: 'loud' }).ok).toBe(false);
  });
});

describe('validateNotification', () => {
  it('accepts a sane duration and the only supported position', () => {
    expect(validateNotification({ durationMs: 15000, position: 'bottom-right' }))
      .toEqual({ ok: true, value: { durationMs: 15000, position: 'bottom-right' } });
  });

  it('rejects zero, negative, non-integer, non-numeric, and NaN durations', () => {
    expect(validateNotification({ durationMs: 0, position: 'bottom-right' }).ok).toBe(false);
    expect(validateNotification({ durationMs: -1000, position: 'bottom-right' }).ok).toBe(false);
    expect(validateNotification({ durationMs: 1500.5, position: 'bottom-right' }).ok).toBe(false);
    expect(validateNotification({ durationMs: 'soon', position: 'bottom-right' }).ok).toBe(false);
    expect(validateNotification({ durationMs: NaN, position: 'bottom-right' }).ok).toBe(false);
  });

  it('rejects a duration below the 1000ms floor or above the 300000ms ceiling', () => {
    expect(validateNotification({ durationMs: 999, position: 'bottom-right' }).ok).toBe(false);
    expect(validateNotification({ durationMs: 300001, position: 'bottom-right' }).ok).toBe(false);
  });

  it('accepts the boundary values', () => {
    expect(validateNotification({ durationMs: 1000, position: 'bottom-right' }).ok).toBe(true);
    expect(validateNotification({ durationMs: 300000, position: 'bottom-right' }).ok).toBe(true);
  });

  it('rejects an unknown position', () => {
    expect(validateNotification({ durationMs: 15000, position: 'top-left' }).ok).toBe(false);
    expect(validateNotification({ durationMs: 15000, position: null }).ok).toBe(false);
  });

  it('rejects missing or non-object input', () => {
    expect(validateNotification(null).ok).toBe(false);
    expect(validateNotification('nope').ok).toBe(false);
  });
});
