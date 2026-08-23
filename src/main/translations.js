// Quran translations — downloaded on demand, never bundled.
//
// LICENSING, and why this works the way it does.
//
// Tanzil's Arabic text is CC-BY 3.0 and ships with the app. Its
// TRANSLATIONS are not: that page carries blanket terms stating they are
// "for non-commercial purposes only". A non-commercial restriction is not
// an open-source licence, so bundling one would conflict with this
// project's GPL-3.0 and would fail SignPath's "no non-open component" bar
// for code signing.
//
// Downloading at the user's request sidesteps that entirely. The project
// redistributes nothing, the signed installer contains no translation, and
// the user fetches the text themselves for their own non-commercial use.
// This is the one place the app touches the network other than the update
// check, it is opt-in, and everything degrades to Arabic-only if it fails.
//
// Attribution is shown in the UI and a link back to Tanzil is kept, as
// their terms require of applications using more than three translations.

import electron from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const { app } = electron;

export const TOTAL_AYAHS = 6236;

/** Where a translation is fetched from. Plain text, `surah|ayah|text`. */
export const translationUrl = (id) => `https://tanzil.net/trans/${id}`;

/**
 * The translations offered in Settings.
 *
 * A curated subset rather than Tanzil's full list of 80+: every entry here
 * was verified to resolve and to contain exactly 6236 verses. Tanzil also
 * asks that their list not be redistributed wholesale, which a curated
 * selection respects.
 */
export const AVAILABLE = Object.freeze([
  { id: 'en.sahih', language: 'English', name: 'Saheeh International' },
  { id: 'en.pickthall', language: 'English', name: 'Pickthall' },
  { id: 'en.yusufali', language: 'English', name: 'Yusuf Ali' },
  { id: 'en.hilali', language: 'English', name: 'Hilali & Khan' },
  { id: 'ar.muyassar', language: 'Arabic', name: 'Tafsir al-Muyassar' },
  { id: 'fr.hamidullah', language: 'French', name: 'Hamidullah' },
  { id: 'es.cortes', language: 'Spanish', name: 'Cortes' },
  { id: 'de.aburida', language: 'German', name: 'Abu Rida' },
  { id: 'it.piccardo', language: 'Italian', name: 'Piccardo' },
  { id: 'nl.keyzer', language: 'Dutch', name: 'Keyzer' },
  { id: 'ru.kuliev', language: 'Russian', name: 'Kuliev' },
  { id: 'tr.diyanet', language: 'Turkish', name: 'Diyanet İşleri' },
  { id: 'ur.jalandhry', language: 'Urdu', name: 'Jalandhry' },
  { id: 'fa.makarem', language: 'Persian', name: 'Makarem Shirazi' },
  { id: 'id.indonesian', language: 'Indonesian', name: 'Bahasa Indonesia' },
  { id: 'ms.basmeih', language: 'Malay', name: 'Basmeih' },
  { id: 'bn.bengali', language: 'Bengali', name: 'Zohurul Hoque' },
  { id: 'sw.barwani', language: 'Swahili', name: 'Al-Barwani' },
  { id: 'zh.jian', language: 'Chinese', name: 'Ma Jian' },
  { id: 'ha.gumi', language: 'Hausa', name: 'Gumi' }
]);

/**
 * Parse Tanzil's plain-text format into verses plus the metadata block it
 * appends at the end.
 *
 * Throws rather than returning a partial result: a truncated download that
 * silently produced 4,000 verses would leave the last third of the Quran
 * showing no translation with no indication why.
 *
 * @param {string} text
 * @returns {{verses: string[], meta: object}}
 */
export function parseTranslation(text) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Translation file is empty.');
  }

  const verses = [];
  const meta = {};

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      // Footer block: "#  Name: Saheeh International"
      const match = /^#\s*([A-Za-z ]+):\s*(.+?)\s*$/.exec(line);
      if (match) meta[match[1].trim().toLowerCase().replace(/\s+/g, '')] = match[2];
      continue;
    }

    // surah|ayah|text — the text itself may contain further pipes, so the
    // split is limited to the first two.
    const first = line.indexOf('|');
    const second = line.indexOf('|', first + 1);
    if (first === -1 || second === -1) continue;

    const surah = Number(line.slice(0, first));
    const ayah = Number(line.slice(first + 1, second));
    if (!Number.isInteger(surah) || !Number.isInteger(ayah)) continue;

    verses.push(line.slice(second + 1));
  }

  if (verses.length !== TOTAL_AYAHS) {
    throw new Error(`Translation has ${verses.length} verses, expected ${TOTAL_AYAHS}.`);
  }

  return { verses, meta };
}

// --- Storage ----------------------------------------------------------
//
// Cached under userData, NOT inside the installation directory: an app
// update replaces the install but leaves userData alone, so a downloaded
// translation survives upgrading.

function cacheDir() {
  return join(app.getPath('userData'), 'translations');
}

export function translationFile(id) {
  // The id comes from AVAILABLE, but this path is built from it, so it is
  // constrained anyway — a value containing a separator must never be able
  // to escape the cache directory.
  const safe = String(id).replace(/[^a-zA-Z0-9._-]/g, '');
  return join(cacheDir(), `${safe}.json`);
}

export function isDownloaded(id) {
  return existsSync(translationFile(id));
}

/** Every translation id currently cached on disk. */
export function downloadedIds() {
  try {
    return readdirSync(cacheDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -'.json'.length));
  } catch {
    return [];
  }
}

/**
 * Fetch, validate and cache a translation.
 * @param {string} id
 * @param {typeof fetch} [fetchFn] - injectable for tests
 */
export async function downloadTranslation(id, fetchFn = fetch) {
  if (!AVAILABLE.some((t) => t.id === id)) {
    throw new Error(`Unknown translation: ${id}`);
  }

  const res = await fetchFn(translationUrl(id));
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const text = await res.text();

  // Parsed and validated BEFORE anything is written, so a failed or
  // truncated download can never leave a corrupt file behind that the app
  // would then load on every launch.
  const { verses, meta } = parseTranslation(text);

  mkdirSync(cacheDir(), { recursive: true });
  writeFileSync(
    translationFile(id),
    JSON.stringify({ id, meta, downloadedAt: new Date().toISOString(), verses })
  );

  return { id, meta, count: verses.length };
}

let cache = null;

/**
 * Load a cached translation, or null if it is absent or unreadable.
 *
 * Never throws: a missing or corrupt translation must degrade to
 * Arabic-only, not stop a verse being shown.
 */
export function loadTranslation(id) {
  if (!id) return null;
  if (cache?.id === id) return cache;
  try {
    const parsed = JSON.parse(readFileSync(translationFile(id), 'utf8'));
    if (!Array.isArray(parsed.verses) || parsed.verses.length !== TOTAL_AYAHS) return null;
    cache = parsed;
    return cache;
  } catch {
    return null;
  }
}

/** The translated text for an ayah index (0-based), or null. */
export function translatedVerse(id, index) {
  const loaded = loadTranslation(id);
  if (!loaded) return null;
  return loaded.verses[index] ?? null;
}

export function removeTranslation(id) {
  try {
    rmSync(translationFile(id), { force: true });
    if (cache?.id === id) cache = null;
    return true;
  } catch {
    return false;
  }
}
