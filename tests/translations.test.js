import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseTranslation,
  AVAILABLE,
  translationUrl,
  TOTAL_AYAHS,
  downloadTranslation
} from '../src/main/translations.js';

// A real Tanzil file, captured to the fixtures directory so these tests
// never depend on tanzil.net being reachable — the same rule as the prayer
// fixtures. Falls back to a synthetic file if it has not been captured.
const FIXTURE = join(import.meta.dirname, 'fixtures', 'en.sahih.txt');

function syntheticFile(verseCount = TOTAL_AYAHS) {
  const lines = [];
  for (let i = 0; i < verseCount; i++) lines.push(`1|${i + 1}|Verse number ${i + 1}`);
  lines.push('');
  lines.push('# --------------------------------------------------------');
  lines.push('#  Name: Test Translation');
  lines.push('#  Translator: Nobody');
  lines.push('#  Language: English');
  lines.push('#  ID: test.id');
  lines.push('#  Source: Tanzil.net');
  return lines.join('\n');
}

const realFile = existsSync(FIXTURE) ? readFileSync(FIXTURE, 'utf8') : null;

describe('AVAILABLE', () => {
  it('lists translations with an id, language and name', () => {
    expect(AVAILABLE.length).toBeGreaterThan(5);
    for (const t of AVAILABLE) {
      expect(t.id).toMatch(/^[a-z]{2}\.[a-z]+$/);
      expect(t.language).toBeTruthy();
      expect(t.name).toBeTruthy();
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(AVAILABLE.map((t) => t.id)).size).toBe(AVAILABLE.length);
  });

  it('builds a plain https URL per translation', () => {
    expect(translationUrl('en.sahih')).toBe('https://tanzil.net/trans/en.sahih');
  });
});

describe('parseTranslation', () => {
  it('parses a synthetic file into exactly 6236 verses plus metadata', () => {
    const { verses, meta } = parseTranslation(syntheticFile());
    expect(verses).toHaveLength(TOTAL_AYAHS);
    expect(verses[0]).toBe('Verse number 1');
    expect(meta.name).toBe('Test Translation');
    expect(meta.language).toBe('English');
  });

  it('keeps pipes that occur inside the verse text', () => {
    // Only the first two pipes are separators; a translation containing a
    // pipe must not lose the rest of its sentence.
    const text = syntheticFile().replace('1|1|Verse number 1', '1|1|Text with | a pipe');
    expect(parseTranslation(text).verses[0]).toBe('Text with | a pipe');
  });

  it('rejects a truncated file rather than returning a partial one', () => {
    // The failure this prevents: a short download silently leaving the last
    // third of the Quran with no translation and no explanation.
    expect(() => parseTranslation(syntheticFile(4000))).toThrow(/4000 verses, expected 6236/);
  });

  it('rejects an empty or non-string input', () => {
    expect(() => parseTranslation('')).toThrow(/empty/);
    expect(() => parseTranslation(null)).toThrow(/empty/);
  });

  it('ignores blank lines and malformed rows', () => {
    const text = syntheticFile() + '\n\nnot a verse line\n';
    expect(parseTranslation(text).verses).toHaveLength(TOTAL_AYAHS);
  });

  it.runIf(realFile)('parses a real Tanzil file', () => {
    const { verses, meta } = parseTranslation(realFile);
    expect(verses).toHaveLength(TOTAL_AYAHS);
    // Al-Fatiha 1 and an-Nas 6, the first and last verses.
    expect(verses[0].toLowerCase()).toContain('name of allah');
    expect(verses[TOTAL_AYAHS - 1].toLowerCase()).toContain('mankind');
    expect(meta.name).toBeTruthy();
    expect(meta.source).toContain('Tanzil');
  });
});

describe('downloadTranslation', () => {
  it('refuses an id that is not on the list', async () => {
    await expect(downloadTranslation('ev.il')).rejects.toThrow(/Unknown translation/);
  });

  it('reports an HTTP failure rather than caching garbage', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(downloadTranslation('en.sahih', fetchFn)).rejects.toThrow(/HTTP 503/);
  });

  it('validates BEFORE writing, so a truncated download leaves no file', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => syntheticFile(10)
    });
    // Throws from parseTranslation, which runs before any mkdir/write.
    await expect(downloadTranslation('en.sahih', fetchFn)).rejects.toThrow(/10 verses/);
  });
});
