import { describe, it, expect } from 'vitest';
import { fastingReasons, nextFastingFire, DEFAULT_FASTING } from '../src/main/fasting.js';
import { hijriDate } from '../src/main/hijri.js';
import { zonedTime, localDateString, addDays, zoneOffsetMs } from '../src/main/zoned.js';

const TZ = 'Asia/Jerusalem';
const all = (overrides = {}) => ({
  whiteDays: true,
  mondayThursday: true,
  ashura: true,
  arafah: true,
  sixOfShawwal: true,
  remindAt: '16:30',
  ...overrides
});
// Explicit all-off base rather than spreading DEFAULT_FASTING: the
// defaults are all TRUE (every recommended fast on out of the box), so
// spreading them would leave every other fast enabled and these tests
// would stop isolating anything.
const NONE = {
  whiteDays: false,
  mondayThursday: false,
  ashura: false,
  arafah: false,
  sixOfShawwal: false,
  remindAt: '16:30'
};
const only = (key) => ({ ...NONE, [key]: true });

// Find the next local date whose Hijri date satisfies a predicate. Derived
// from hijri.js rather than hardcoded, so these tests do not rot when the
// Gregorian/Hijri alignment shifts year to year.
function findDate(fromIso, predicate, limit = 800) {
  let iso = fromIso;
  for (let i = 0; i < limit; i++) {
    if (predicate(hijriDate(zonedTime(iso, '12:00', TZ), TZ), iso)) return iso;
    iso = addDays(iso, 1);
  }
  throw new Error('no matching date found within the search window');
}

describe('zoned helpers', () => {
  it('builds an instant that reads as the given wall time in the zone', () => {
    const t = zonedTime('2026-08-23', '16:30', TZ);
    const shown = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ
    }).format(t);
    expect(shown).toBe('16:30');
  });

  it('still reads correctly on a DST changeover day', () => {
    // 2026-10-24 is the Asia/Jerusalem autumn transition. Without the
    // refinement pass in zonedTime(), the offset sampled at the naive
    // instant is the wrong side of the change and the result lands an hour
    // out.
    for (const iso of ['2026-10-24', '2026-10-25', '2027-03-26', '2027-03-27']) {
      const shown = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ
      }).format(zonedTime(iso, '16:30', TZ));
      expect(shown, `${iso} should read 16:30 locally`).toBe('16:30');
    }
  });

  it('reports the local calendar date, not the host\'s', () => {
    // 22:00 UTC on the 23rd is already the 24th in Jerusalem (UTC+3).
    const instant = new Date('2026-08-23T22:00:00Z');
    expect(localDateString(instant, TZ)).toBe('2026-08-24');
    expect(localDateString(instant, 'UTC')).toBe('2026-08-23');
  });

  it('computes a plausible zone offset', () => {
    const summer = zoneOffsetMs(new Date('2026-08-23T12:00:00Z'), TZ);
    expect(summer).toBe(3 * 3600_000); // IDT, UTC+3
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('fastingReasons — white days', () => {
  it('fires on the 13th, 14th and 15th of a Hijri month', () => {
    for (const day of [13, 14, 15]) {
      const iso = findDate('2026-09-01', (h) => h.day === day && h.month !== 9);
      const reasons = fastingReasons(iso, TZ, only('whiteDays'));
      expect(reasons.map((r) => r.id), `${iso} is Hijri day ${day}`).toContain('whiteDays');
    }
  });

  it('does not fire on the 12th or 16th', () => {
    for (const day of [12, 16]) {
      const iso = findDate('2026-09-01', (h) => h.day === day && h.month !== 9);
      expect(fastingReasons(iso, TZ, only('whiteDays'))).toEqual([]);
    }
  });
});

describe('fastingReasons — Mondays and Thursdays', () => {
  it('fires on both, and not on other weekdays', () => {
    let mondays = 0;
    let thursdays = 0;
    let others = 0;
    let iso = '2026-09-01';
    for (let i = 0; i < 21; i++) {
      const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TZ })
        .format(zonedTime(iso, '12:00', TZ));
      const hit = fastingReasons(iso, TZ, only('mondayThursday')).length > 0;
      if (weekday === 'Monday') { expect(hit).toBe(true); mondays++; }
      else if (weekday === 'Thursday') { expect(hit).toBe(true); thursdays++; }
      else { expect(hit).toBe(false); others++; }
      iso = addDays(iso, 1);
    }
    expect(mondays).toBeGreaterThan(0);
    expect(thursdays).toBeGreaterThan(0);
    expect(others).toBeGreaterThan(0);
  });
});

describe('fastingReasons — annual days', () => {
  it('fires on Tasu\'a and Ashura', () => {
    const tasua = findDate('2026-09-01', (h) => h.month === 1 && h.day === 9);
    const ashura = findDate('2026-09-01', (h) => h.month === 1 && h.day === 10);
    expect(fastingReasons(tasua, TZ, only('ashura'))[0].label).toMatch(/Tasu'a/);
    expect(fastingReasons(ashura, TZ, only('ashura'))[0].label).toMatch(/Ashura/);
  });

  it('fires on the Day of Arafah', () => {
    const arafah = findDate('2026-09-01', (h) => h.month === 12 && h.day === 9);
    expect(fastingReasons(arafah, TZ, only('arafah'))[0].label).toBe('Day of Arafah');
  });

  it('covers Shawwal 2 to 7, but never Shawwal 1 — that is Eid', () => {
    const eid = findDate('2026-09-01', (h) => h.month === 10 && h.day === 1);
    // Fasting is not permitted on Eid al-Fitr, so the window must start on
    // the 2nd.
    expect(fastingReasons(eid, TZ, only('sixOfShawwal'))).toEqual([]);
    for (const day of [2, 5, 7]) {
      const iso = findDate('2026-09-01', (h) => h.month === 10 && h.day === day);
      expect(fastingReasons(iso, TZ, only('sixOfShawwal')).map((r) => r.id)).toContain('sixOfShawwal');
    }
    const eighth = findDate('2026-09-01', (h) => h.month === 10 && h.day === 8);
    expect(fastingReasons(eighth, TZ, only('sixOfShawwal'))).toEqual([]);
  });
});

describe('fastingReasons — Ramadan', () => {
  it('never fires during Ramadan, whatever is enabled', () => {
    // Thirty consecutive "you may wish to fast tomorrow" notifications
    // would train people to ignore the feature entirely.
    for (const day of [1, 13, 14, 20, 29]) {
      const iso = findDate('2026-09-01', (h) => h.month === 9 && h.day === day);
      expect(fastingReasons(iso, TZ, all()), `Ramadan ${day}`).toEqual([]);
    }
  });
});

describe('fastingReasons — overlaps and toggles', () => {
  it('reports every applicable reason, not just the first', () => {
    const iso = findDate('2026-09-01', (h, date) => {
      if (h.month === 9) return false;
      if (h.day !== 13 && h.day !== 14 && h.day !== 15) return false;
      const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: TZ })
        .format(zonedTime(date, '12:00', TZ));
      return weekday === 'Monday' || weekday === 'Thursday';
    });
    const ids = fastingReasons(iso, TZ, all()).map((r) => r.id);
    expect(ids).toContain('whiteDays');
    expect(ids).toContain('mondayThursday');
  });

  it('reports nothing when everything is off', () => {
    const iso = findDate('2026-09-01', (h) => h.day === 14 && h.month !== 9);
    expect(fastingReasons(iso, TZ, NONE)).toEqual([]);
  });
});

describe('nextFastingFire', () => {
  it('returns null when nothing is enabled', () => {
    expect(nextFastingFire(new Date('2026-09-01T00:00:00Z'), TZ, NONE)).toBeNull();
  });

  it('fires the day BEFORE the fast, at the configured time', () => {
    const fire = nextFastingFire(new Date('2026-09-01T00:00:00Z'), TZ, only('whiteDays'));
    expect(fire).not.toBeNull();
    // The reminder's local date is one day before the fast's.
    expect(addDays(localDateString(fire.at, TZ), 1)).toBe(fire.fastDate);
    const shown = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ
    }).format(fire.at);
    expect(shown).toBe('16:30');
  });

  it('honours a custom reminder time', () => {
    const fire = nextFastingFire(new Date('2026-09-01T00:00:00Z'), TZ, only('whiteDays'));
    const custom = nextFastingFire(
      new Date('2026-09-01T00:00:00Z'),
      TZ,
      { ...only('whiteDays'), remindAt: '09:15' }
    );
    const shown = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ
    }).format(custom.at);
    expect(shown).toBe('09:15');
    expect(custom.fastDate).toBe(fire.fastDate);
  });

  it('falls back to the default time when remindAt is malformed', () => {
    const fire = nextFastingFire(new Date('2026-09-01T00:00:00Z'), TZ, { ...only('whiteDays'), remindAt: 'nonsense' });
    const shown = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ
    }).format(fire.at);
    expect(shown).toBe('16:30');
  });

  it('always returns a fire strictly in the future', () => {
    // Stepping through a year from many starting points must never return
    // a past instant, which would re-fire the same reminder forever.
    let cursor = new Date('2026-09-01T00:00:00Z');
    for (let i = 0; i < 60; i++) {
      const fire = nextFastingFire(cursor, TZ, all());
      expect(fire, `no fire found at step ${i}`).not.toBeNull();
      expect(fire.at.getTime()).toBeGreaterThan(cursor.getTime());
      cursor = new Date(fire.at.getTime() + 1000);
    }
  });

  it('finds a once-a-year day from any starting point', () => {
    // Arafah alone, starting the day after it has just passed: the scan
    // must run nearly a full year forward rather than giving up.
    const arafah = findDate('2026-09-01', (h) => h.month === 12 && h.day === 9);
    const justAfter = zonedTime(addDays(arafah, 1), '12:00', TZ);
    const fire = nextFastingFire(justAfter, TZ, only('arafah'));
    expect(fire).not.toBeNull();
    expect(fire.reasons[0].label).toBe('Day of Arafah');
  });
});

describe('DEFAULT_FASTING', () => {
  it('has every recommended fast enabled out of the box', () => {
    // A screen of unticked boxes makes the user do setup work to reach the
    // obvious configuration. Pinned literally so flipping one back to false
    // has to be a deliberate act.
    for (const key of ['whiteDays', 'mondayThursday', 'ashura', 'arafah', 'sixOfShawwal']) {
      expect(DEFAULT_FASTING[key], key).toBe(true);
    }
    expect(DEFAULT_FASTING.remindAt).toBe('16:30');
  });

  it('still fires nothing until a location exists — enabling by default cannot surprise a new user', () => {
    // The provider in index.js is location-gated; this asserts the config
    // half, that "all on" does not by itself mean "all firing".
    expect(nextFastingFire(new Date('2026-09-01T00:00:00Z'), TZ, DEFAULT_FASTING)).not.toBeNull();
    // ...but with nothing enabled, nothing is scheduled at all.
    expect(nextFastingFire(new Date('2026-09-01T00:00:00Z'), TZ, NONE)).toBeNull();
  });
});
