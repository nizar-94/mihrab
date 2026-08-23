import { describe, it, expect } from 'vitest';
import { hijriDate, isWhiteDay, hijriMonthName, formatHijri, HIJRI_MONTHS } from '../src/main/hijri.js';

describe('hijriDate — calendar choice', () => {
  // The single most important test in this file. The captured aladhan
  // response for this date (tests/fixtures/prayer-times/aladhan.json was
  // taken the same day) reports 10-03-1448 under HJCoSA. islamic-umalqura
  // agrees; islamic-civil is a day behind. Phase 4's white days, Ashura and
  // Arafah reminders all hang off this being right.
  it('matches the aladhan reference for 2026-08-23 in Asia/Jerusalem', () => {
    const d = new Date('2026-08-23T12:00:00+03:00');
    expect(hijriDate(d, 'Asia/Jerusalem')).toEqual({ day: 10, month: 3, year: 1448 });
  });

  it('would disagree with islamic-civil — proving the calendar choice matters', () => {
    const d = new Date('2026-08-23T12:00:00+03:00');
    const civil = new Intl.DateTimeFormat('en-u-ca-islamic-civil', {
      day: 'numeric',
      timeZone: 'Asia/Jerusalem'
    }).format(d);
    // If this ever starts matching, the platform's calendar data changed and
    // the assertion above needs re-checking against a fresh reference.
    expect(Number(civil)).not.toBe(hijriDate(d, 'Asia/Jerusalem').day);
  });
});

describe('hijriDate — timezone handling', () => {
  it('resolves the same instant to different Hijri days either side of the date line', () => {
    // 2026-08-23T11:00Z is the 23rd in Kiritimati (UTC+14, already the 24th
    // locally) and still the 22nd in Midway (UTC-11).
    const instant = new Date('2026-08-23T11:00:00Z');
    const east = hijriDate(instant, 'Pacific/Kiritimati');
    const west = hijriDate(instant, 'Pacific/Midway');
    expect(east.day).not.toBe(west.day);
  });

  it('rejects a missing or empty timezone rather than silently using the host zone', () => {
    const d = new Date('2026-08-23T12:00:00Z');
    expect(() => hijriDate(d, '')).toThrow(/timeZone/);
    expect(() => hijriDate(d, undefined)).toThrow(/timeZone/);
  });

  it('rejects an invalid date', () => {
    expect(() => hijriDate(new Date('nonsense'), 'UTC')).toThrow(/valid Date/);
    expect(() => hijriDate('2026-08-23', 'UTC')).toThrow(/valid Date/);
  });
});

describe('hijriDate — shape', () => {
  it('returns numeric day, month and year', () => {
    const h = hijriDate(new Date('2026-08-23T12:00:00Z'), 'UTC');
    expect(typeof h.day).toBe('number');
    expect(typeof h.month).toBe('number');
    expect(typeof h.year).toBe('number');
    expect(h.month).toBeGreaterThanOrEqual(1);
    expect(h.month).toBeLessThanOrEqual(12);
    expect(h.day).toBeGreaterThanOrEqual(1);
    expect(h.day).toBeLessThanOrEqual(30);
  });

  it('advances by one day across a local midnight', () => {
    const before = hijriDate(new Date('2026-08-23T20:00:00Z'), 'UTC');
    const after = hijriDate(new Date('2026-08-24T20:00:00Z'), 'UTC');
    expect(after.day).not.toBe(before.day);
  });
});

describe('isWhiteDay', () => {
  it('is true for the 13th, 14th and 15th', () => {
    for (const day of [13, 14, 15]) {
      expect(isWhiteDay({ day, month: 3, year: 1448 })).toBe(true);
    }
  });

  it('is false either side of the window', () => {
    for (const day of [1, 12, 16, 29]) {
      expect(isWhiteDay({ day, month: 3, year: 1448 })).toBe(false);
    }
  });
});

describe('month names', () => {
  it('has twelve months starting at Muharram', () => {
    expect(HIJRI_MONTHS).toHaveLength(12);
    expect(hijriMonthName(1)).toBe('Muharram');
    expect(hijriMonthName(9)).toBe('Ramadan');
    expect(hijriMonthName(12)).toBe('Dhu al-Hijjah');
  });

  it('degrades gracefully rather than returning undefined for a bad month', () => {
    expect(hijriMonthName(0)).toBe('Month 0');
    expect(hijriMonthName(13)).toBe('Month 13');
  });

  it('formats a full date', () => {
    expect(formatHijri({ day: 10, month: 3, year: 1448 })).toBe('10 Rabi al-awwal 1448 AH');
  });
});
