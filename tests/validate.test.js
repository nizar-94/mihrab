import { describe, it, expect } from 'vitest';
import { validateSchedule, validateQuietHours, validateSound, validateNotification, normaliseTime } from '../src/main/validate.js';

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
      .toEqual({ ok: true, value: { durationMs: 15000, position: 'bottom-right', verseFontSize: 22 } });
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

describe('normaliseTime — single-digit hours', () => {
  it('pads a one-digit hour', () => {
    expect(normaliseTime('1:31')).toBe('01:31');
    expect(normaliseTime('9:00')).toBe('09:00');
    expect(normaliseTime('0:05')).toBe('00:05');
  });

  it('leaves an already-padded time alone', () => {
    expect(normaliseTime('01:31')).toBe('01:31');
    expect(normaliseTime('23:59')).toBe('23:59');
  });

  it('tolerates surrounding whitespace, which comma-separated input produces', () => {
    expect(normaliseTime('  7:05  ')).toBe('07:05');
  });

  it('still rejects out-of-range and malformed values', () => {
    expect(normaliseTime('24:00')).toBe(null);
    expect(normaliseTime('99:00')).toBe(null);
    expect(normaliseTime('1:60')).toBe(null);
    expect(normaliseTime('1:5')).toBe(null); // a one-digit MINUTE stays ambiguous, so stays rejected
    expect(normaliseTime('9am')).toBe(null);
    expect(normaliseTime('')).toBe(null);
    expect(normaliseTime(null)).toBe(null);
    expect(normaliseTime(930)).toBe(null);
  });
});

describe('validateSchedule dailyTimes — single-digit hours', () => {
  it('accepts 1:31 and stores it padded', () => {
    const r = validateSchedule({ mode: 'dailyTimes', times: ['1:31'] });
    expect(r.ok).toBe(true);
    expect(r.value.times).toEqual(['01:31']);
  });

  it('sorts correctly after padding rather than lexically on the raw input', () => {
    // A naive sort of the raw strings would put '9:00' after '20:00'.
    const r = validateSchedule({ mode: 'dailyTimes', times: ['9:00', '20:00', '7:30'] });
    expect(r.value.times).toEqual(['07:30', '09:00', '20:00']);
  });

  it('collapses the same time written both ways into one fire time', () => {
    const r = validateSchedule({ mode: 'dailyTimes', times: ['9:00', '09:00'] });
    expect(r.value.times).toEqual(['09:00']);
  });
});

describe('validateQuietHours — single-digit hours', () => {
  it('accepts and normalises single-digit bounds', () => {
    const r = validateQuietHours({ enabled: true, from: '23:00', to: '7:00' });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({ enabled: true, from: '23:00', to: '07:00' });
  });

  it('treats 7:00 and 07:00 as the same bound when rejecting an empty window', () => {
    expect(validateQuietHours({ enabled: true, from: '7:00', to: '07:00' }).ok).toBe(false);
  });
});

describe('validateNotification — verse text size', () => {
  const base = { durationMs: 15000, position: 'bottom-right' };

  it('defaults to 22 when absent, so a v1 config needs no migration of its own', () => {
    expect(validateNotification(base).value.verseFontSize).toBe(22);
  });

  it('accepts a value inside the legible range', () => {
    expect(validateNotification({ ...base, verseFontSize: 30 }).value.verseFontSize).toBe(30);
    expect(validateNotification({ ...base, verseFontSize: 14 }).ok).toBe(true);
    expect(validateNotification({ ...base, verseFontSize: 40 }).ok).toBe(true);
  });

  it('rejects sizes outside it', () => {
    // Below ~14px the tashkeel stop being distinguishable; above ~40px even
    // a short ayah overflows the card's height cap.
    expect(validateNotification({ ...base, verseFontSize: 13 }).ok).toBe(false);
    expect(validateNotification({ ...base, verseFontSize: 41 }).ok).toBe(false);
  });

  it('rejects non-integers, which would produce a fractional-pixel font', () => {
    expect(validateNotification({ ...base, verseFontSize: 22.5 }).ok).toBe(false);
    expect(validateNotification({ ...base, verseFontSize: 'big' }).ok).toBe(false);
    expect(validateNotification({ ...base, verseFontSize: NaN }).ok).toBe(false);
  });
});
