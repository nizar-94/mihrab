import { ipcMain } from 'electron';
import { join } from 'path';
import { createNotificationWindow, positionNotificationWindow } from './windows.js';

// Safety net for FIX 2: if the renderer never gets to ready-to-show (bad
// preload, crashed renderer, etc.), don't let `current` wedge forever.
const READY_TIMEOUT_MS = 5000;

let current = null;
let dismissTimer = null;
let remainingMs = 0;
let startedAt = 0;
let readyTimeout = null;
let pendingDurationMs = 0;
let pendingOnShown = null;
let pinned = false;

function close() {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = null;
  if (readyTimeout) clearTimeout(readyTimeout);
  readyTimeout = null;
  pinned = false;
  // If we're closing before verse:size ever arrived (ready-timeout,
  // loadFile rejection, or a dismiss that races the initial render), the
  // verse was never actually shown — onShown must not fire in that case.
  pendingOnShown = null;
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
    if (!dismissTimer && current && !pinned) arm(Math.max(remainingMs, 1000));
  });
  // FEATURE 4: pin cancels the auto-dismiss countdown permanently (until
  // the user dismisses manually) — once pinned, verse:resume must not be
  // able to re-arm the timer (see the !pinned guard above).
  ipcMain.on('verse:pin', () => {
    if (!current) return;
    pinned = true;
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  });
  // FIX 1: the renderer reports its measured content height once the card
  // has laid out and the webfont has settled; only then do we resize,
  // reposition, and actually reveal the window, so the user never sees it
  // jump or resize on screen.
  ipcMain.on('verse:size', (event, payload) => {
    if (!current || current.isDestroyed()) return;
    if (event.sender !== current.webContents) return;
    positionNotificationWindow(current, payload && payload.height);
    if (!current.isVisible()) {
      current.showInactive(); // show without taking focus
      arm(pendingDurationMs);
      // The verse is genuinely on screen now — this is the only point at
      // which onShown may fire (see FIX 1 in showVerse below).
      const onShown = pendingOnShown;
      pendingOnShown = null;
      onShown?.();
    }
  });
}

/**
 * Open the notification card and hand the renderer its content.
 *
 * Extracted so verse and prayer cards share one implementation of the parts
 * that were hard to get right — the concurrency guard, the ready-to-show
 * timeout that stops `current` wedging forever, and the loadFile rejection
 * path. A second copy of that logic for prayers would be a second place for
 * those bugs to come back.
 *
 * @param {(win: Electron.BrowserWindow) => void} send - called once the
 *   window is ready, to push its content over IPC
 */
function showCard(send, cfg, onShown) {
  // FIX 3: callers need to know whether this call actually displayed
  // something or was skipped because a card is already on screen — a caller
  // that records reading position before knowing this would silently skip
  // verses in sequential mode.
  if (current) return false;

  pinned = false;
  pendingDurationMs = cfg.notification.durationMs;
  pendingOnShown = onShown;
  current = createNotificationWindow();
  current.on('closed', () => { current = null; });

  // FIX 2 (part 1): if ready-to-show never fires (crashed renderer, bad
  // preload, etc.), `current` must not wedge forever — every future verse
  // would otherwise be silently suppressed for the life of the process.
  readyTimeout = setTimeout(() => {
    console.error('[notifier] notification window did not become ready within', READY_TIMEOUT_MS, 'ms; closing');
    close();
  }, READY_TIMEOUT_MS);

  current.once('ready-to-show', () => {
    clearTimeout(readyTimeout);
    readyTimeout = null;
    send(current);
    // Sizing, positioning, showInactive(), and arming the dismiss timer all
    // happen once the renderer reports its measured height (verse:size, see
    // registerNotifierIpc above).
  });

  // notifier.js is bundled into out/main/index.js alongside windows.js, so
  // import.meta.dirname is out/main/ at runtime — this resolves to
  // out/renderer/notification/index.html, matching the actual build output.
  current
    .loadFile(join(import.meta.dirname, '../renderer/notification/index.html'))
    .catch((err) => {
      // FIX 2 (part 2): an unhandled rejection here previously left
      // `current` non-null forever with no dismiss timer ever armed.
      console.error('[notifier] failed to load notification window:', err);
      close();
    });

  return true;
}

export function showVerse(ayah, cfg, onShown) {
  return showCard(
    (win) => win.webContents.send('verse:show', { ayah, sound: cfg.sound, notification: cfg.notification }),
    cfg,
    onShown
  );
}

/**
 * Prayer card. Same window, same lifecycle, different content.
 *
 * @param {{prayer:string, en:string, ar:string, kind:'at'|'before',
 *          time:string, location:string}} prayer
 */
export function showPrayer(prayer, cfg, onShown) {
  return showCard(
    (win) => win.webContents.send('prayer:show', { prayer, sound: cfg.sound, sample: prayer.sample === true }),
    cfg,
    onShown
  );
}

/**
 * Fasting reminder card. Fires the day BEFORE the fast, so the wording is
 * deliberately future-tense.
 *
 * @param {{fastDate:string, weekday:string, reasons:string[], hijri:string}} fasting
 */
export function showFasting(fasting, cfg, onShown) {
  return showCard(
    (win) => win.webContents.send('fasting:show', { fasting, sound: cfg.sound, sample: fasting.sample === true }),
    cfg,
    onShown
  );
}

/**
 * Azkar card: one dhikr, its repeat count, and where it sits in the set.
 *
 * @param {{session:string, ar:string, en:string, translit:string,
 *          count:number, countLabel:string, index:number, total:number}} dhikr
 */
export function showDhikr(dhikr, cfg, onShown) {
  return showCard(
    (win) => win.webContents.send('dhikr:show', { dhikr, sound: cfg.sound, notification: cfg.notification, sample: dhikr.sample === true }),
    cfg,
    onShown
  );
}
