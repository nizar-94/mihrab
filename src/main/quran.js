import { readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

let cache = null;

function load() {
  if (!cache) {
    cache = JSON.parse(readFileSync(join(app.getAppPath(), 'resources/quran-uthmani.json'), 'utf8'));
  }
  return cache;
}

export function getAyah(index) {
  const row = load()[index];
  if (!row) throw new Error(`Ayah index out of range: ${index}`);
  return { index, ...row };
}
