import { ipcMain } from 'electron';
import { join } from 'path';
import { createNotificationWindow } from './windows.js';

let current = null;
let dismissTimer = null;
let remainingMs = 0;
let startedAt = 0;

function close() {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = null;
  if (current && !current.isDestroyed()) current.destroy();
  current = null;
}

function arm(ms) {
  remainingMs = ms;
  startedAt = Date.now();
  dismissTimer = setTimeout(close, ms);
}

export function registerNotifierIpc() {
  ipcMain.on('verse:dismiss', close);
  ipcMain.on('verse:pause', () => {
    if (!dismissTimer) return;
    clearTimeout(dismissTimer);
    dismissTimer = null;
    remainingMs -= Date.now() - startedAt;
  });
  ipcMain.on('verse:resume', () => {
    if (!dismissTimer && current) arm(Math.max(remainingMs, 1000));
  });
}

export function showVerse(ayah, cfg) {
  if (current) return;
  current = createNotificationWindow();
  current.on('closed', () => { current = null; });
  // notifier.js is bundled into out/main/index.js alongside windows.js, so
  // import.meta.dirname is out/main/ at runtime — this resolves to
  // out/renderer/notification/index.html, matching the actual build output.
  current.loadFile(join(import.meta.dirname, '../renderer/notification/index.html'));
  current.once('ready-to-show', () => {
    current.showInactive(); // show without taking focus
    current.webContents.send('verse:show', { ayah, sound: cfg.sound });
    arm(cfg.notification.durationMs);
  });
}
