// Default (non-named) import, same reasoning as config.js and updater.js:
// under a real Electron main process this is the Electron API object; under
// plain Node (this file loaded by Vitest) 'electron' resolves to a plain
// string, so destructuring yields `undefined` rather than throwing. A named
// `import { Tray, Menu } from 'electron'` fails to even load outside
// Electron — which is exactly why menuTemplate() below had no test until
// this import was converted. Nothing here is *called* at module scope, so
// the undefined bindings are inert until a real Electron process supplies
// the real ones.
import electron from 'electron';
import { join } from 'path';
import { readFileSync } from 'node:fs';

const { Tray, Menu, nativeImage, app, nativeTheme } = electron;

// state shape: { paused: boolean, failing: boolean, errorLabel: string|null,
//                updateLabel: string|null, version: string|null }
// updateLabel comes straight from updater.js's statusLabel(getUpdateState())
// — null while idle (nothing checked yet, or a no-op dev build), otherwise
// a ready-to-display sentence for whichever of the three required manual-
// check outcomes (available/downloading, up to date, failed) or background
// states (checking, downloaded) is current.
const DEFAULT_STATE = { paused: false, failing: false, errorLabel: null, updateLabel: null, version: null };

// Pure: returns the menu *template* (a plain array of plain objects) rather
// than a built Menu. Same split as updater.js's reduceUpdateState/statusLabel
// vs its autoUpdater wiring — all the branching lives in a function that
// needs no Electron process, so it can be asserted directly in Vitest, and
// buildMenu below is left as a one-line adapter with nothing to get wrong.
export function menuTemplate(handlers, state) {
  const template = [
    { label: 'Show verse now', click: handlers.onShowNow },
    // FEATURE 2: label flips between the two verbs on every rebuild so the
    // menu always names the action a click will take next, not the current
    // state as a noun.
    { label: state.paused ? 'Resume reminders' : 'Pause reminders', click: handlers.onTogglePause }
  ];

  if (state.failing) {
    template.push(
      { type: 'separator' },
      // FEATURE 3: informational — routes to Settings since there is
      // nowhere dedicated to show scheduler errors; the point is that the
      // failure is discoverable from the menu at all.
      { label: state.errorLabel || 'Reminders have stopped — click for Settings', click: handlers.onSettings }
    );
  }

  template.push(
    { label: 'Settings', click: handlers.onSettings },
    { type: 'separator' }
  );

  // Disabled, informational — grouped with the update item deliberately:
  // "what am I running" and "is there something newer" are the same
  // question asked twice, so they belong in the same section. Omitted
  // entirely rather than rendered as "v null" when the version is absent,
  // which is the case for DEFAULT_STATE (createTray runs before index.js
  // has supplied any state) and under any caller that doesn't pass one.
  if (state.version) {
    template.push({ label: `Mihrab v${state.version}`, enabled: false });
  }

  template.push(
    // Single menu item doubling as both the trigger (click) and the status
    // display (label) — reuses the exact same rebuild-from-current-state
    // mechanism as the paused/failing items above (updateTray() replaces
    // the whole Menu on every state change) rather than adding a second,
    // competing way of keeping the tray in sync. Always enabled: clicking
    // it while a check is already in flight is harmless (updater.js's
    // events just report the same in-progress state again).
    { label: state.updateLabel ? `Updates: ${state.updateLabel}` : 'Check for updates', click: handlers.onCheckForUpdates },
    { type: 'separator' },
    { label: 'Quit', click: handlers.onQuit }
  );

  return template;
}

// Thin adapter over the pure template above. Kept as a separate export so
// callers (createTray/updateTray) are unchanged and the Electron-dependent
// step stays one line.
export function buildMenu(handlers, state) {
  return Menu.buildFromTemplate(menuTemplate(handlers, state));
}

export function tooltipFor(state) {
  if (state.failing) return 'Mihrab — reminders have stopped';
  if (state.paused) return 'Mihrab — reminders paused';
  if (state.updateLabel) return `Mihrab — ${state.updateLabel}`;
  return 'Mihrab';
}

// The tray icons are a few KB each, unlike the ~1.8 MB Quran dataset in
// quran.js — there's no size/perf reason to keep them out of app.asar, so
// they stay packed inside the archive (see the `files` list in
// electron-builder.yml, which keeps resources/icons/** in the default set).
// No dev/packaged branch is needed: both fs.readFileSync and
// nativeImage.createFromPath read transparently from inside an asar
// archive, so app.getAppPath() joined with the resource's relative path
// resolves in both cases — in dev it's a real directory, in a packaged app
// it's ".../resources/app.asar/resources/icons/...", which Electron treats
// as a virtual path into the archive.
//
// Two variants ship, and the naming is about the COLOUR OF THE ICON, not
// the theme it belongs to: `tray-light-*` has a cream (#F2F1EE) finial and
// base, so it reads against a DARK taskbar (Windows' default); `tray-dark-*`
// uses near-black (#16161A) for a light taskbar. Picking the wrong one
// makes two thirds of the mark disappear into the background — only the
// gold dome would remain visible.
function trayImage() {
  const variant = nativeTheme?.shouldUseDarkColors ? 'light' : 'dark';
  const dir = join(app.getAppPath(), 'resources/icons');
  // 16px is the base; 24 and 32 are the designer's own exports for 150% and
  // 200% display scaling. Supplying them as real representations beats
  // handing Electron one 32px file to downscale, which is what visibly
  // softens tray icons on 100%-scaling displays.
  const image = nativeImage.createFromPath(join(dir, `tray-${variant}-16.png`));
  for (const size of [24, 32]) {
    try {
      image.addRepresentation({
        scaleFactor: size / 16,
        buffer: readFileSync(join(dir, `tray-${variant}-${size}.png`))
      });
    } catch {
      // A missing high-DPI export must never stop the tray icon existing —
      // the app is unusable without it. The 16px base is already loaded.
    }
  }
  return image;
}

export function createTray(handlers) {
  const tray = new Tray(trayImage());
  tray.setToolTip(tooltipFor(DEFAULT_STATE));
  tray.setContextMenu(buildMenu(handlers, DEFAULT_STATE));
  // Double-click opens Settings — the conventional Windows tray gesture,
  // and the same handler the menu's Settings item uses. Single click is
  // deliberately left alone: on Windows a single left click is what opens
  // the context menu, so binding anything to it would fight the menu.
  tray.on('double-click', () => handlers.onSettings());
  // Windows lets the user switch between light and dark taskbars at any
  // time, without restarting anything. Swap the variant when that happens,
  // or the icon silently half-vanishes until the next launch.
  nativeTheme?.on?.('updated', () => {
    if (!tray.isDestroyed()) tray.setImage(trayImage());
  });
  return tray;
}

// Electron Menu instances are immutable once built — there is no API to
// relabel an existing item, only to replace the whole menu. So "the label
// updates" means: construct a fresh Menu from the current state and call
// setContextMenu again. Called by index.js whenever paused/failing changes.
export function updateTray(tray, handlers, state) {
  if (!tray || tray.isDestroyed()) return;
  tray.setToolTip(tooltipFor(state));
  tray.setContextMenu(buildMenu(handlers, state));
}
