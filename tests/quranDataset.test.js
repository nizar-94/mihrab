import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read the bundled Quran dataset directly from disk. Do NOT import
// src/main/quran.js here - it pulls in Electron's `app` module, which
// is not available under Vitest and will fail to load.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const datasetPath = path.join(__dirname, '..', 'resources', 'quran-uthmani.json');
const raw = fs.readFileSync(datasetPath, 'utf8');
const ayahs = JSON.parse(raw);

const EXPECTED_TOTAL = 6236;
const TOTAL_SURAHS = 114;

// Canonical ayah counts per surah, 1-indexed by position (surah 1..114).
const CANONICAL_AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
  111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73,
  54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60,
  49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19,
  26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3,
  6, 3, 5, 4, 5, 6,
];

const REPLACEMENT_CHAR = '�';

describe('bundled Quran dataset (resources/quran-uthmani.json)', () => {
  it('contains exactly 6236 entries', () => {
    expect(ayahs.length).toBe(EXPECTED_TOTAL);
  });

  it('starts with Al-Fatiha 1:1 at index 0', () => {
    expect(ayahs[0].surahNumber).toBe(1);
    expect(ayahs[0].ayahNumber).toBe(1);
  });

  it('ends with An-Nas 114:6 at index 6235', () => {
    const last = ayahs[EXPECTED_TOTAL - 1];
    expect(last.surahNumber).toBe(114);
    expect(last.ayahNumber).toBe(6);
  });

  it('has surah numbers running 1..114 in ascending order with no gaps', () => {
    const seenSurahs = [];
    let prev = 0;
    for (const { surahNumber } of ayahs) {
      expect(surahNumber).toBeGreaterThanOrEqual(prev);
      if (surahNumber !== prev) {
        // surah number must increase by exactly 1 when it changes
        expect(surahNumber).toBe(prev + 1);
        seenSurahs.push(surahNumber);
        prev = surahNumber;
      }
    }
    expect(seenSurahs.length).toBe(TOTAL_SURAHS);
    expect(seenSurahs[0]).toBe(1);
    expect(seenSurahs[seenSurahs.length - 1]).toBe(TOTAL_SURAHS);
  });

  it('has ayahNumber running 1..N with no gaps or duplicates within each surah', () => {
    let expectedAyah = 1;
    let prevSurah = null;
    for (const { surahNumber, ayahNumber } of ayahs) {
      if (surahNumber !== prevSurah) {
        expectedAyah = 1;
        prevSurah = surahNumber;
      }
      expect(
        ayahNumber,
        `surah ${surahNumber}: expected ayah ${expectedAyah}, got ${ayahNumber}`
      ).toBe(expectedAyah);
      expectedAyah += 1;
    }
  });

  it('has non-empty text and surahName on every entry', () => {
    for (const { surahNumber, ayahNumber, text, surahName } of ayahs) {
      expect(
        typeof text === 'string' && text.trim().length > 0,
        `surah ${surahNumber} ayah ${ayahNumber}: text is empty`
      ).toBe(true);
      expect(
        typeof surahName === 'string' && surahName.trim().length > 0,
        `surah ${surahNumber} ayah ${ayahNumber}: surahName is empty`
      ).toBe(true);
    }
  });

  it('contains no Unicode replacement characters (U+FFFD) indicating encoding corruption', () => {
    const corrupted = ayahs.filter(
      ({ text, surahName }) =>
        text.includes(REPLACEMENT_CHAR) || surahName.includes(REPLACEMENT_CHAR)
    );
    expect(
      corrupted,
      `found ${corrupted.length} entries containing U+FFFD: ${corrupted
        .map((e) => `${e.surahNumber}:${e.ayahNumber}`)
        .join(', ')}`
    ).toEqual([]);
  });

  it('matches the canonical per-surah ayah counts exactly', () => {
    const counts = new Array(TOTAL_SURAHS).fill(0);
    for (const { surahNumber } of ayahs) {
      counts[surahNumber - 1] += 1;
    }

    for (let i = 0; i < TOTAL_SURAHS; i++) {
      const surahNumber = i + 1;
      const actual = counts[i];
      const expected = CANONICAL_AYAH_COUNTS[i];
      expect(
        actual,
        `surah ${surahNumber} has ${actual} ayahs, expected ${expected}`
      ).toBe(expected);
    }
  });
});
