import { BrowserWindow, screen, app } from 'electron';
import { join } from 'path';

// The window icon Windows shows in the taskbar and the window's own title
// bar. Without an explicit `icon`, Electron falls back to the executable's
// icon — which is unreliable here: the app sets an AppUserModelId
// (com.nizar.muslimapp), so Windows resolves the taskbar icon through the
// Start Menu shortcut carrying that ID rather than from the window, and
// shows a generic placeholder when that lookup does not land on the app's
// real icon. Pointing at the artwork directly removes the guesswork.
//
// 256x256 (the same source artwork as build/icon.ico, which produces the
// installer and .exe icons) rather than the 32x32 resources/icons/tray.png,
// so Windows downscales from a large source for the 32px taskbar and 48px
// alt-tab slots instead of upscaling a small one. Lives in
// resources/icons/, which electron-builder.yml keeps in the packed default
// file set, so app.getAppPath() resolves it inside app.asar exactly as
// tray.js does for tray.png.
const APP_ICON = () => join(app.getAppPath(), 'resources/icons/app.png');

const WIDTH = 420;
const DEFAULT_HEIGHT = 260;
const MIN_HEIGHT = 90;
const MAX_HEIGHT_RATIO = 0.6;
const MARGIN = 16;

function workArea() {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
}

export function createNotificationWindow() {
  const { x, y, width, height } = workArea();

  const win = new BrowserWindow({
    // Created off-screen-invisible (show: false) at a placeholder size —
    // the real size/position is set by positionNotificationWindow() once
    // the renderer reports its measured content height, before the window
    // is ever shown. This initial geometry is never seen by the user.
    width: WIDTH,
    height: DEFAULT_HEIGHT,
    x: x + width - WIDTH - MARGIN,
    y: y + height - DEFAULT_HEIGHT - MARGIN,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: {
      // Built by electron-vite: this file (windows.js) is bundled into
      // out/main/index.js, so import.meta.dirname at runtime is out/main/.
      // electron-vite builds the preload as an ES module (.mjs) because
      // package.json declares "type": "module" — verified against the
      // actual out/preload/ build output, which emits notification.mjs,
      // not notification.js.
      preload: join(import.meta.dirname, '../preload/notification.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Electron's sandboxed preload context runs "as plain JavaScript
      // without an ESM context" — import/export in an ESM (.mjs) preload
      // is silently a no-op there, so contextBridge.exposeInMainWorld
      // never runs and window.verseAPI stays undefined in the renderer.
      // This was caught at runtime (Task 7 self-test): the preload path
      // resolved and the file existed, but the renderer still had no
      // verseAPI. Electron's own docs confirm ESM preload requires
      // sandbox: false. contextIsolation stays true, so the renderer still
      // has no direct Node/Electron access outside what this preload
      // explicitly exposes via contextBridge.
      sandbox: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  return win;
}

// Resizes and repositions the (still-hidden) notification window to fit its
// measured content height, clamped to [MIN_HEIGHT, 60% of the work area's
// height] so a pathologically long ayah (e.g. Al-Baqarah 2:282) can't push
// the card off-screen — it may keep an internal scrollbar in that rare case
// instead. Re-anchored bottom-right, above the taskbar, on the display that
// currently holds the cursor, using the same margin as creation. Must be
// called (and the window shown) only after the renderer has reported its
// real height, so the user never sees the window resize on screen.
export function positionNotificationWindow(win, contentHeight) {
  if (!win || win.isDestroyed()) return;
  const { x, y, width, height } = workArea();
  const maxHeight = Math.round(height * MAX_HEIGHT_RATIO);
  const measured = Math.round(Number(contentHeight)) || DEFAULT_HEIGHT;
  const h = Math.min(Math.max(measured, MIN_HEIGHT), maxHeight);
  win.setBounds({
    x: x + width - WIDTH - MARGIN,
    y: y + height - h - MARGIN,
    width: WIDTH,
    height: h
  });
}

export function createSettingsWindow() {
  return new BrowserWindow({
    width: 520,
    height: 640,
    resizable: false,
    autoHideMenuBar: true,
    show: false,
    icon: APP_ICON(),
    webPreferences: {
      // Same build-output scheme as the notification preload above: this
      // file is bundled into out/main/index.js, so import.meta.dirname is
      // out/main/ at runtime, and electron-vite emits the ESM preload as
      // settings.mjs (not .js) because package.json declares "type": "module".
      preload: join(import.meta.dirname, '../preload/settings.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Required for the same reason as the notification window: this
      // preload uses ESM import/export. With the default sandbox: true,
      // Electron runs the preload without an ESM context, so
      // contextBridge.exposeInMainWorld silently never executes and
      // window.settingsAPI stays undefined — every control fails at once
      // with no useful error. contextIsolation stays true.
      sandbox: false
    }
  });
}
