import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'path';

// state shape: { paused: boolean, failing: boolean, errorLabel: string|null,
//                updateLabel: string|null }
// updateLabel comes straight from updater.js's statusLabel(getUpdateState())
// — null while idle (nothing checked yet, or a no-op dev build), otherwise
// a ready-to-display sentence for whichever of the three required manual-
// check outcomes (available/downloading, up to date, failed) or background
// states (checking, downloaded) is current.
const DEFAULT_STATE = { paused: false, failing: false, errorLabel: null, updateLabel: null };

// Exported (like shouldFire in engine.js) so the menu-construction and
// tooltip logic can be exercised and inspected directly under a real
// Electron process without needing to click an actual tray icon.
export function buildMenu(handlers, state) {
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
    { type: 'separator' },
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

  return Menu.buildFromTemplate(template);
}

export function tooltipFor(state) {
  if (state.failing) return 'Muslim App — reminders have stopped';
  if (state.paused) return 'Muslim App — reminders paused';
  if (state.updateLabel) return `Muslim App — ${state.updateLabel}`;
  return 'Muslim App';
}

// tray.png is a few-KB 32x32 icon, unlike the ~1.8 MB Quran dataset in
// quran.js — there's no size/perf reason to keep it out of app.asar, so it
// stays packed inside the archive (see the `files` list in
// electron-builder.yml, which keeps resources/icons/** in the default set).
// No dev/packaged branch is needed here: nativeImage.createFromPath is one
// of the Electron APIs documented to read transparently from inside an
// asar archive, so app.getAppPath() joined with the resource's relative
// path resolves correctly in both cases — in dev it's a real directory, in
// a packaged app it's ".../resources/app.asar/resources/icons/tray.png",
// which Electron treats as a virtual path into the archive.
export function createTray(handlers) {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources/icons/tray.png'));
  const tray = new Tray(icon);
  tray.setToolTip(tooltipFor(DEFAULT_STATE));
  tray.setContextMenu(buildMenu(handlers, DEFAULT_STATE));
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
