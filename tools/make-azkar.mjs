// Builds resources/azkar.json from the Morning-And-Evening-Adhkar-DB.
//
// Source: https://github.com/Seen-Arabic/Morning-And-Evening-Adhkar-DB
//   MIT licensed, Arabic (ar.json) and English (en.json), 34 adhkar, each
//   carrying its own hadith citation in a `source` field.
//
// PROVENANCE NOTE. The Arabic text here is Qur'an and hadith, which nobody
// can copyright; the MIT licence covers the compilation and the English
// translation, and is a claim by the uploader rather than a guarantee. The
// text was therefore spot-checked against nine well-known adhkar before
// being adopted — Ayat al-Kursi, Sayyid al-Istighfar, al-Ikhlas, al-Falaq,
// an-Nas, "Bismillah alladhi la yadurru", "Radeetu billahi rabban",
// "Hasbiyallah", and "Subhanallah wa bihamdihi" — all of which are present
// and correctly attributed. The per-entry `source` citation is carried
// through into the output so any future claim can be checked at its own
// reference rather than taken on trust.
//
// The upstream `type` field is translated into something readable:
//   0 -> both     (said morning and evening)
//   1 -> morning
//   2 -> evening
// Verified against the dataset: the type-1 entries are the ones containing
// "asbahna" (we have entered upon morning) and type-2 the "amsayna" ones.
//
// Usage: node tools/make-azkar.mjs

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'resources', 'azkar.json');
const REPO = 'Seen-Arabic/Morning-And-Evening-Adhkar-DB';
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;

const WHEN = { 0: 'both', 1: 'morning', 2: 'evening' };

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

console.log('downloading adhkar...');
const [ar, en] = await Promise.all([getJson(`${RAW}/ar.json`), getJson(`${RAW}/en.json`)]);

// Pin the exact commit the data came from, so the bundled file can always
// be traced back to a specific upstream state.
const commits = await getJson(`https://api.github.com/repos/${REPO}/commits?per_page=1`);
const commit = commits[0]?.sha ?? 'unknown';

const byOrder = new Map(en.map((e) => [e.order, e]));

const entries = [];
for (const entry of ar) {
  const translated = byOrder.get(entry.order);
  if (!entry.content) continue;

  const when = WHEN[entry.type];
  if (!when) throw new Error(`unexpected type ${entry.type} on entry ${entry.order}`);

  entries.push({
    order: entry.order,
    when,
    ar: entry.content,
    en: translated?.translation ?? '',
    translit: translated?.transliteration ?? '',
    // How many times the dhikr is repeated. Displayed on the card, because
    // "say this three times" is part of the dhikr, not a footnote.
    count: Number(entry.count) || 1,
    countAr: entry.count_description ?? '',
    countEn: translated?.count_description ?? '',
    // The hadith citation, kept for verifiability rather than display.
    source: entry.source ?? ''
  });
}

entries.sort((a, b) => a.order - b.order);

const morning = entries.filter((e) => e.when !== 'evening').length;
const evening = entries.filter((e) => e.when !== 'morning').length;

await mkdir(join(import.meta.dirname, '..', 'resources'), { recursive: true });
await writeFile(OUT, JSON.stringify({
  source: `https://github.com/${REPO}`,
  commit,
  license: 'MIT — see NOTICE',
  entries
}, null, 1));

console.log(`wrote resources/azkar.json — ${entries.length} adhkar (${morning} morning, ${evening} evening)`);
console.log(`upstream commit ${commit}`);
