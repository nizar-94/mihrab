import { readFileSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

let cache = null;

// The Quran dataset (~1.8 MB) is deliberately shipped OUTSIDE app.asar —
// see electron-builder.yml's extraResources entry — rather than bundled
// into the archive with the rest of the app. It's large, read wholesale
// with a synchronous fs.readFileSync, and doesn't benefit from living in
// the archive the way small source/UI files do.
//
// That means its on-disk location differs between dev and a packaged
// build, so the two cases are resolved explicitly rather than relying on
// a single path that happens to work in both:
//   - packaged (app.isPackaged === true): extraResources places the file
//     directly in the app's resources directory, i.e. process.resourcesPath.
//   - dev (electron-vite dev / vitest): there is no resources directory
//     alongside a packaged app yet, so we fall back to the project's own
//     resources/ folder via app.getAppPath() (the project root in dev).
// app.isPackaged is used rather than inferring from the path itself
// because it's the API Electron provides specifically for this decision.
function quranDataPath() {
  return app.isPackaged
    ? join(process.resourcesPath, 'quran-uthmani.json')
    : join(app.getAppPath(), 'resources/quran-uthmani.json');
}

function load() {
  if (!cache) {
    cache = JSON.parse(readFileSync(quranDataPath(), 'utf8'));
  }
  return cache;
}

export function getAyah(index) {
  const row = load()[index];
  if (!row) throw new Error(`Ayah index out of range: ${index}`);
  return { index, ...row };
}
