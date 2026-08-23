import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  sessionEntries,
  selectDhikr,
  nextAzkarFire,
  effectiveEntries,
  DEFAULT_AZKAR,
  MORNING_ANCHORS,
  EVENING_ANCHORS
} from '../src/main/azkar.js';
import { prayerTimes, formatPrayerTime } from '../src/main/prayer/times.js';

// The real bundled dataset, read directly rather than through loadAzkar()
// (which needs Electron to resolve its path). Testing against the actual
// shipped data is the point — a malformed entry should fail here.
const data = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'resources', 'azkar.json'), 'utf8')
);
const entries = data.entries;

const JERUSALEM = { latitude: 31.7683, longitude: 35.2137, timezone: 'Asia/Jerusalem' };
const PRAYER = {
  method: 'MuslimWorldLeague',
  school: 'standard',
  highLatitudeRule: 'recommended',
  polarCircleResolution: 'AqrabBalad',
  offsets: {},
  perPrayer: {}
};

describe('the bundled dataset', () => {
  it('is present, non-trivial, and traceable to an upstream commit', () => {
    expect(entries.length).toBeGreaterThan(20);
    expect(data.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(data.source).toContain('github.com');
  });

  it('gives every dhikr Arabic text, a session, and a repeat count', () => {
    for (const e of entries) {
      expect(e.ar, `entry ${e.order} has no Arabic`).toBeTruthy();
      expect(['both', 'morning', 'evening']).toContain(e.when);
      expect(Number.isInteger(e.count) && e.count >= 1, `entry ${e.order} count`).toBe(true);
    }
  });

  it('carries a source citation for every entry', () => {
    // Provenance is the reason this dataset was accepted at all: the Arabic
    // is Qur'an and hadith, and MIT covers only the compilation. An entry
    // with no citation could not be checked against anything.
    for (const e of entries) {
      expect(e.source, `entry ${e.order} has no citation`).toBeTruthy();
    }
  });

  it('contains the core adhkar', () => {
    // Diacritics vary between sources, so compare with harakat stripped.
    const norm = (s) => s
      .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
      .replace(/[آأإٱ]/g, 'ا')
      .replace(/\s+/g, ' ');
    const haystack = entries.map((e) => norm(e.ar));
    const required = [
      'الله لا اله الا هو الحي القيوم',   // Ayat al-Kursi
      'اللهم انت ربي لا اله الا انت',      // Sayyid al-Istighfar
      'قل هو الله احد',                    // al-Ikhlas
      'قل اعوذ برب الفلق',                 // al-Falaq
      'قل اعوذ برب الناس'                  // an-Nas
    ];
    for (const needle of required) {
      expect(haystack.some((h) => h.includes(norm(needle))), `missing: ${needle}`).toBe(true);
    }
  });
});

describe('sessionEntries', () => {
  it('includes shared adhkar in both sessions', () => {
    const both = entries.filter((e) => e.when === 'both');
    expect(both.length).toBeGreaterThan(0);
    for (const session of ['morning', 'evening']) {
      const set = sessionEntries(entries, session);
      for (const e of both) expect(set).toContain(e);
    }
  });

  it('keeps session-specific adhkar out of the other session', () => {
    const morning = sessionEntries(entries, 'morning');
    const evening = sessionEntries(entries, 'evening');
    expect(morning.every((e) => e.when !== 'evening')).toBe(true);
    expect(evening.every((e) => e.when !== 'morning')).toBe(true);
    // And both sets are actually populated.
    expect(morning.length).toBeGreaterThan(10);
    expect(evening.length).toBeGreaterThan(10);
  });
});

describe('selectDhikr', () => {
  it('returns the entry at the given position', () => {
    const set = sessionEntries(entries, 'morning');
    const picked = selectDhikr(entries, 'morning', 3);
    expect(picked.entry).toBe(set[3]);
    expect(picked.index).toBe(3);
    expect(picked.total).toBe(set.length);
  });

  it('advances by one', () => {
    expect(selectDhikr(entries, 'morning', 0).nextPosition).toBe(1);
  });

  it('wraps at the end of the set rather than stopping', () => {
    const total = sessionEntries(entries, 'morning').length;
    expect(selectDhikr(entries, 'morning', total - 1).nextPosition).toBe(0);
  });

  it('folds an out-of-range or corrupt position back in', () => {
    const total = sessionEntries(entries, 'morning').length;
    expect(selectDhikr(entries, 'morning', total + 5).index).toBe(5 % total);
    expect(selectDhikr(entries, 'morning', -1).index).toBe(0);
    expect(selectDhikr(entries, 'morning', 'nonsense').index).toBe(0);
    expect(selectDhikr(entries, 'morning', undefined).index).toBe(0);
  });

  it('returns null for an empty dataset rather than throwing', () => {
    expect(selectDhikr([], 'morning', 0)).toBeNull();
  });
});

describe('nextAzkarFire', () => {
  // Explicit all-off base rather than spreading DEFAULT_AZKAR: both
  // sessions are ENABLED by default now (the app asks for a location on
  // first run, so they can be useful immediately), and spreading the
  // defaults would leave the other session on and stop these tests
  // isolating anything.
  const OFF = {
    morning: { enabled: false, anchor: 'fajr', offsetMinutes: 30 },
    evening: { enabled: false, anchor: 'asr', offsetMinutes: 30 },
    position: { morning: 0, evening: 0 },
    disabled: [],
    custom: []
  };
  const config = (overrides = {}) => ({ ...structuredClone(OFF), ...overrides });

  it('returns null when both sessions are off', () => {
    expect(nextAzkarFire(new Date('2026-08-23T00:00:00Z'), JERUSALEM, PRAYER, config())).toBeNull();
  });

  it('fires the configured offset after the anchor prayer', () => {
    // Midday UTC, deliberately far from any day boundary: an instant near
    // local midnight makes this assertion depend on the HOST's timezone,
    // which is how the CI runner (UTC) disagreed with a UTC+3 laptop.
    const after = new Date('2026-08-23T00:30:00Z');
    const fire = nextAzkarFire(after, JERUSALEM, PRAYER, config({
      morning: { enabled: true, anchor: 'fajr', offsetMinutes: 30 }
    }));
    expect(fire.session).toBe('morning');

    const times = prayerTimes(JERUSALEM, after, PRAYER);
    expect(fire.at.getTime() - times.fajr.getTime()).toBe(30 * 60_000);
  });

  it(`uses the LOCATION timezone to pick the day, not the host machine`, () => {
    // The bug this guards: adhan reads the calendar day off the Date using
    // the host's local getters. Someone in London with their location set
    // to Jerusalem is already on tomorrow's date there from 22:00 London
    // time, and would otherwise get the wrong day's times every night.
    const lateInJerusalem = new Date('2026-08-23T21:30:00Z'); // 00:30 on the 24th, Jerusalem
    const withZone = prayerTimes(JERUSALEM, lateInJerusalem, PRAYER);
    const nextDayNoon = prayerTimes(JERUSALEM, new Date('2026-08-24T09:00:00Z'), PRAYER);
    // Both must resolve to the SAME local day in Jerusalem.
    expect(formatPrayerTime(withZone.fajr, JERUSALEM.timezone))
      .toBe(formatPrayerTime(nextDayNoon.fajr, JERUSALEM.timezone));
  });

  it('tracks the anchor rather than a fixed clock time', () => {
    // The point of anchoring: six months apart, Fajr moves, and so must
    // the reminder.
    const summer = nextAzkarFire(new Date('2026-06-22T00:00:00Z'), JERUSALEM, PRAYER, config({
      morning: { enabled: true, anchor: 'fajr', offsetMinutes: 0 }
    }));
    const winter = nextAzkarFire(new Date('2026-12-22T00:00:00Z'), JERUSALEM, PRAYER, config({
      morning: { enabled: true, anchor: 'fajr', offsetMinutes: 0 }
    }));
    const shown = (d) => formatPrayerTime(d, JERUSALEM.timezone);
    expect(shown(summer.at)).not.toBe(shown(winter.at));
  });

  it('honours the evening anchor choice', () => {
    const after = new Date('2026-08-23T06:00:00Z');
    const asr = nextAzkarFire(after, JERUSALEM, PRAYER, config({
      evening: { enabled: true, anchor: 'asr', offsetMinutes: 0 }
    }));
    const maghrib = nextAzkarFire(after, JERUSALEM, PRAYER, config({
      evening: { enabled: true, anchor: 'maghrib', offsetMinutes: 0 }
    }));
    const times = prayerTimes(JERUSALEM, after, PRAYER);
    expect(asr.at.getTime()).toBe(times.asr.getTime());
    expect(maghrib.at.getTime()).toBe(times.maghrib.getTime());
  });

  it('picks the earlier of the two sessions', () => {
    const after = new Date('2026-08-22T22:00:00Z');
    const fire = nextAzkarFire(after, JERUSALEM, PRAYER, config({
      morning: { enabled: true, anchor: 'fajr', offsetMinutes: 0 },
      evening: { enabled: true, anchor: 'maghrib', offsetMinutes: 0 }
    }));
    expect(fire.session).toBe('morning');
  });

  it('crosses to tomorrow once today\'s sessions have passed', () => {
    const lateNight = new Date('2026-08-23T21:00:00Z');
    const fire = nextAzkarFire(lateNight, JERUSALEM, PRAYER, config({
      morning: { enabled: true, anchor: 'fajr', offsetMinutes: 0 }
    }));
    expect(fire).not.toBeNull();
    expect(fire.at.getTime()).toBeGreaterThan(lateNight.getTime());
    expect(fire.at.getTime() - lateNight.getTime()).toBeLessThan(24 * 3600_000);
  });

  it('never returns a fire at or before the given instant', () => {
    let cursor = new Date('2026-08-23T00:00:00Z');
    for (let i = 0; i < 40; i++) {
      const fire = nextAzkarFire(cursor, JERUSALEM, PRAYER, config({
        morning: { enabled: true, anchor: 'fajr', offsetMinutes: 30 },
        evening: { enabled: true, anchor: 'asr', offsetMinutes: 30 }
      }));
      expect(fire, `no fire at step ${i}`).not.toBeNull();
      expect(fire.at.getTime()).toBeGreaterThan(cursor.getTime());
      cursor = new Date(fire.at.getTime() + 1000);
    }
  });

  it('keeps working at a polar latitude', () => {
    const tromso = { latitude: 69.6492, longitude: 18.9553, timezone: 'Europe/Oslo' };
    const fire = nextAzkarFire(new Date('2027-06-21T00:00:00Z'), tromso, PRAYER, config({
      morning: { enabled: true, anchor: 'fajr', offsetMinutes: 30 }
    }));
    expect(fire).not.toBeNull();
    expect(Number.isNaN(fire.at.getTime())).toBe(false);
  });
});

describe('anchor options', () => {
  it('offers sensible anchors for each session', () => {
    expect(MORNING_ANCHORS.map((a) => a.id)).toEqual(['fajr', 'sunrise']);
    expect(EVENING_ANCHORS.map((a) => a.id)).toEqual(['asr', 'maghrib']);
  });
});

describe('DEFAULT_AZKAR', () => {
  it('has both sessions enabled out of the box', () => {
    // Safe because the app prompts for a location on first run and the
    // provider is location-gated: nothing fires before one is set.
    expect(DEFAULT_AZKAR.morning.enabled).toBe(true);
    expect(DEFAULT_AZKAR.evening.enabled).toBe(true);
  });

  it('anchors to Fajr and Asr, half an hour after', () => {
    expect(DEFAULT_AZKAR.morning.anchor).toBe('fajr');
    expect(DEFAULT_AZKAR.evening.anchor).toBe('asr');
    expect(DEFAULT_AZKAR.morning.offsetMinutes).toBe(30);
  });

  it('starts with nothing switched off and nothing custom', () => {
    expect(DEFAULT_AZKAR.disabled).toEqual([]);
    expect(DEFAULT_AZKAR.custom).toEqual([]);
  });
});

describe('effectiveEntries', () => {
  it('drops adhkar the user switched off', () => {
    const off = { disabled: [entries[0].order, entries[1].order], custom: [] };
    const result = effectiveEntries(entries, off);
    expect(result).toHaveLength(entries.length - 2);
    expect(result.some((e) => e.order === entries[0].order)).toBe(false);
  });

  it(`appends the user own additions, flagged as custom`, () => {
    const mine = { id: 'custom-1', ar: 'سبحان الله', en: 'Glory be to Allah', count: 33, when: 'both' };
    const result = effectiveEntries(entries, { disabled: [], custom: [mine] });
    expect(result).toHaveLength(entries.length + 1);
    expect(result.at(-1).custom).toBe(true);
    expect(result.at(-1).ar).toBe(mine.ar);
  });

  it('is an opt-OUT list, so new bundled adhkar appear automatically', () => {
    // A future release adding a dhikr must not have it silently excluded
    // from every existing user's config — which is what an opt-in list of
    // enabled ids would do.
    const withNew = [...entries, { order: 9999, when: 'both', ar: 'new', en: '', count: 1 }];
    const result = effectiveEntries(withNew, { disabled: [entries[0].order], custom: [] });
    expect(result.some((e) => e.order === 9999)).toBe(true);
  });

  it('handles a missing config', () => {
    expect(effectiveEntries(entries, undefined)).toHaveLength(entries.length);
    expect(effectiveEntries(undefined, {})).toEqual([]);
  });

  it('feeds selectDhikr, so a disabled dhikr is never shown', () => {
    const first = sessionEntries(entries, 'morning')[0];
    const remaining = effectiveEntries(entries, { disabled: [first.order], custom: [] });
    const picked = selectDhikr(remaining, 'morning', 0);
    expect(picked.entry.order).not.toBe(first.order);
  });
});
