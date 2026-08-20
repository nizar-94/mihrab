import { describe, it, expect } from 'vitest';
import { nextFireAfter } from '../src/main/scheduler/nextFire.js';

const d = (h, m) => new Date(2026, 7, 20, h, m, 0, 0);

describe('interval mode', () => {
  const s = { mode: 'interval', everyMinutes: 90 };

  it('anchors to local midnight, not to the current time', () => {
    expect(nextFireAfter(s, d(0, 10))).toEqual(d(1, 30));
  });

  it('advances to the next slot mid-day', () => {
    expect(nextFireAfter(s, d(4, 0))).toEqual(d(4, 30));
  });

  it('returns the next slot, never the current instant', () => {
    expect(nextFireAfter(s, d(1, 30))).toEqual(d(3, 0));
  });

  it('rolls over to the next day', () => {
    expect(nextFireAfter(s, d(23, 30))).toEqual(new Date(2026, 7, 21, 0, 0, 0, 0));
  });
});

describe('minuteOfHour mode', () => {
  const s = { mode: 'minuteOfHour', minutes: [25, 55] };

  it('picks the next minute within the hour', () => {
    expect(nextFireAfter(s, d(9, 10))).toEqual(d(9, 25));
    expect(nextFireAfter(s, d(9, 30))).toEqual(d(9, 55));
  });

  it('rolls into the next hour', () => {
    expect(nextFireAfter(s, d(9, 55))).toEqual(d(10, 25));
  });

  it('sorts unsorted input', () => {
    expect(nextFireAfter({ mode: 'minuteOfHour', minutes: [55, 25] }, d(9, 10))).toEqual(d(9, 25));
  });

  it('rolls across midnight', () => {
    expect(nextFireAfter(s, d(23, 55))).toEqual(new Date(2026, 7, 21, 0, 25, 0, 0));
  });
});

describe('dailyTimes mode', () => {
  const s = { mode: 'dailyTimes', times: ['09:00', '14:30', '20:00'] };

  it('picks the next time today', () => {
    expect(nextFireAfter(s, d(10, 0))).toEqual(d(14, 30));
  });

  it('rolls to tomorrow after the last time', () => {
    expect(nextFireAfter(s, d(21, 0))).toEqual(new Date(2026, 7, 21, 9, 0, 0, 0));
  });

  it('sorts unsorted input', () => {
    expect(nextFireAfter({ mode: 'dailyTimes', times: ['20:00', '09:00'] }, d(0, 0))).toEqual(d(9, 0));
  });

  it('uses wall-clock construction so DST cannot shift the hour', () => {
    const r = nextFireAfter(s, new Date(2026, 2, 28, 23, 0, 0, 0));
    expect(r.getHours()).toBe(9);
    expect(r.getMinutes()).toBe(0);
  });
});
