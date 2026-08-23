import { describe, it, expect } from 'vitest';
import { fireTimesForDay, nextPrayerFire, DEFAULT_PER_PRAYER } from '../src/main/prayer/schedule.js';
import { prayerTimes, formatPrayerTime } from '../src/main/prayer/times.js';

const JERUSALEM = { latitude: 31.7683, longitude: 35.2137 };
const TZ = 'Asia/Jerusalem';

const config = (perPrayer) => ({
  method: 'MuslimWorldLeague',
  school: 'standard',
  highLatitudeRule: 'recommended',
  polarCircleResolution: 'AqrabBalad',
  offsets: {},
  perPrayer: { ...DEFAULT_PER_PRAYER, ...perPrayer }
});

// Midday local, so the Date unambiguously names the intended local day.
const day = new Date('2026-08-23T09:00:00Z');

describe('fireTimesForDay', () => {
  it('fires once per enabled prayer by default, and not for sunrise', () => {
    const fires = fireTimesForDay(JERUSALEM, day, config());
    expect(fires).toHaveLength(5);
    expect(fires.map((f) => f.prayer).sort())
      .toEqual(['asr', 'dhuhr', 'fajr', 'isha', 'maghrib']);
    expect(fires.every((f) => f.kind === 'at')).toBe(true);
  });

  it('produces TWO fires for a prayer with a remind-before', () => {
    // The point of the feature: a warning does not replace the prayer.
    const fires = fireTimesForDay(JERUSALEM, day, config({
      maghrib: { enabled: true, remindAt: true, remindBefore: 15 }
    }));
    const maghrib = fires.filter((f) => f.prayer === 'maghrib');
    expect(maghrib).toHaveLength(2);
    expect(maghrib.map((f) => f.kind).sort()).toEqual(['at', 'before']);

    const at = maghrib.find((f) => f.kind === 'at');
    const before = maghrib.find((f) => f.kind === 'before');
    expect(at.at.getTime() - before.at.getTime()).toBe(15 * 60_000);
  });

  it('leaves only the warning when remindAt is off', () => {
    const fires = fireTimesForDay(JERUSALEM, day, config({
      fajr: { enabled: true, remindAt: false, remindBefore: 20 }
    }));
    const fajr = fires.filter((f) => f.prayer === 'fajr');
    expect(fajr).toHaveLength(1);
    expect(fajr[0].kind).toBe('before');
  });

  it('produces nothing for a disabled prayer, even with a remind-before set', () => {
    const fires = fireTimesForDay(JERUSALEM, day, config({
      isha: { enabled: false, remindAt: true, remindBefore: 30 }
    }));
    expect(fires.some((f) => f.prayer === 'isha')).toBe(false);
  });

  it('can enable sunrise for users who want it', () => {
    const fires = fireTimesForDay(JERUSALEM, day, config({
      sunrise: { enabled: true, remindAt: true, remindBefore: 0 }
    }));
    expect(fires.some((f) => f.prayer === 'sunrise')).toBe(true);
  });

  it('returns an empty list when nothing is enabled, rather than throwing', () => {
    const off = Object.fromEntries(
      Object.keys(DEFAULT_PER_PRAYER).map((k) => [k, { enabled: false, remindAt: true, remindBefore: 0 }])
    );
    expect(fireTimesForDay(JERUSALEM, day, config(off))).toEqual([]);
  });

  it('places the fire at the calculated prayer time', () => {
    const fires = fireTimesForDay(JERUSALEM, day, config());
    const dhuhr = fires.find((f) => f.prayer === 'dhuhr');
    const times = prayerTimes(JERUSALEM, day, config());
    expect(formatPrayerTime(dhuhr.at, TZ)).toBe(formatPrayerTime(times.dhuhr, TZ));
  });
});

describe('nextPrayerFire', () => {
  it('returns the next fire strictly after the given instant', () => {
    const times = prayerTimes(JERUSALEM, day, config());
    // One second after Dhuhr: the next fire must be Asr, not Dhuhr again.
    const justAfterDhuhr = new Date(times.dhuhr.getTime() + 1000);
    const next = nextPrayerFire(justAfterDhuhr, JERUSALEM, config());
    expect(next.prayer).toBe('asr');
  });

  it('never returns a fire exactly equal to the given instant', () => {
    // Otherwise the same notification re-fires forever.
    const times = prayerTimes(JERUSALEM, day, config());
    const next = nextPrayerFire(times.dhuhr, JERUSALEM, config());
    expect(next.at.getTime()).toBeGreaterThan(times.dhuhr.getTime());
  });

  it('crosses midnight to tomorrow\'s Fajr', () => {
    // 23:50 local — every prayer today is past, so the answer is tomorrow.
    const lateNight = new Date('2026-08-23T20:50:00Z');
    const next = nextPrayerFire(lateNight, JERUSALEM, config());
    expect(next).not.toBeNull();
    expect(next.prayer).toBe('fajr');
    expect(next.at.getTime()).toBeGreaterThan(lateNight.getTime());
    // And within the next day, not several days out.
    expect(next.at.getTime() - lateNight.getTime()).toBeLessThan(24 * 3600_000);
  });

  it('returns null when nothing is enabled', () => {
    const off = Object.fromEntries(
      Object.keys(DEFAULT_PER_PRAYER).map((k) => [k, { enabled: false, remindAt: true, remindBefore: 0 }])
    );
    expect(nextPrayerFire(day, JERUSALEM, config(off))).toBeNull();
  });

  it('picks the remind-before ahead of the prayer it warns about', () => {
    const times = prayerTimes(JERUSALEM, day, config());
    const beforeMaghrib = new Date(times.asr.getTime() + 1000);
    const next = nextPrayerFire(beforeMaghrib, JERUSALEM, config({
      maghrib: { enabled: true, remindAt: true, remindBefore: 30 }
    }));
    expect(next.prayer).toBe('maghrib');
    expect(next.kind).toBe('before');
  });

  it('rejects an invalid instant', () => {
    expect(() => nextPrayerFire(new Date('nope'), JERUSALEM, config())).toThrow(/valid Date/);
  });

  it('keeps working at a polar latitude across the whole year', () => {
    // The failure this guards: an undefined prayer time producing a fire at
    // NaN, or the lookahead finding nothing and stalling the scheduler.
    const tromso = { latitude: 69.6492, longitude: 18.9553 };
    let cursor = new Date('2026-09-01T00:00:00Z');
    for (let i = 0; i < 365; i++) {
      const next = nextPrayerFire(cursor, tromso, config());
      expect(next, `no fire found on day ${i}`).not.toBeNull();
      expect(Number.isNaN(next.at.getTime())).toBe(false);
      expect(next.at.getTime()).toBeGreaterThan(cursor.getTime());
      cursor = new Date(cursor.getTime() + 24 * 3600_000);
    }
  });
});
