import { app, ipcMain } from 'electron';
import { join } from 'path';
import { createTray } from './tray.js';
import { getConfig, setConfig } from './config.js';
import { selectIndex } from './verses.js';
import { getAyah } from './quran.js';
import { showVerse, registerNotifierIpc } from './notifier.js';
import { SchedulerEngine } from './scheduler/engine.js';
import { createSettingsWindow } from './windows.js';
import { validateSchedule, validateQuietHours, validateSound } from './validate.js';

let tray = null;
let engine = null;
let settingsWin = null;

export function fire() {
  const cfg = getConfig();
  const { index, nextPosition } = selectIndex(cfg.verseOrder, cfg.sequencePosition);
  // Persist position and lastFiredAt BEFORE showing, so a crash mid-display
  // cannot replay the same ayah or double-fire the slot.
  setConfig({ sequencePosition: nextPosition, lastFiredAt: new Date().toISOString() });
  showVerse(getAyah(index), cfg);
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = createSettingsWindow();
  // index.js is bundled into out/main/index.js alongside windows.js and
  // notifier.js, so import.meta.dirname is out/main/ at runtime — matches
  // notifier.js's scheme for resolving the built renderer HTML.
  settingsWin.loadFile(join(import.meta.dirname, '../renderer/settings/index.html'));
  settingsWin.once('ready-to-show', () => settingsWin.show());
  // Destroyed, never hidden — closing Settings must leave no renderer process.
  settingsWin.on('closed', () => { settingsWin = null; });
}

function registerSettingsIpc() {
  ipcMain.handle('settings:load', () => {
    const config = getConfig();
    const a = getAyah(config.sequencePosition);
    return { config, surahName: a.surahName, ayahNumber: a.ayahNumber };
  });

  ipcMain.handle('settings:save', (_e, patch) => {
    // Every field is re-validated here with the same validators that guard
    // the disk-read path in config.js's migrate(). The renderer's own checks
    // are convenience only.
    const s = validateSchedule(patch.schedule);
    if (!s.ok) return s;
    const q = validateQuietHours(patch.quietHours);
    if (!q.ok) return q;
    const snd = validateSound(patch.sound);
    if (!snd.ok) return snd;
    const verseOrder = patch.verseOrder === 'sequential' ? 'sequential' : 'random';
    setConfig({ schedule: s.value, quietHours: q.value, sound: snd.value, verseOrder });
    return { ok: true };
  });

  ipcMain.handle('settings:resetPosition', () => { setConfig({ sequencePosition: 0 }); });
  ipcMain.on('settings:preview', () => fire());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.nizar.muslimapp');

  app.whenReady().then(() => {
    registerNotifierIpc();
    registerSettingsIpc();
    tray = createTray({
      onShowNow: fire,
      onSettings: openSettings,
      onQuit: () => app.quit()
    });

    engine = new SchedulerEngine(() => {
      const c = getConfig();
      return {
        schedule: c.schedule,
        quietHours: c.quietHours,
        lastFiredAt: c.lastFiredAt ? new Date(c.lastFiredAt) : null
      };
    }, fire);

    engine.start().catch((err) => console.error('scheduler failed to start', err));
  });

  // A tray app must survive all windows closing.
  app.on('window-all-closed', (e) => e.preventDefault());
}
