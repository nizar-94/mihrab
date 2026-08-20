import { BrowserWindow, screen } from 'electron';
import { join } from 'path';

const WIDTH = 420;
const HEIGHT = 260;
const MARGIN = 16;

export function createNotificationWindow() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x, y, width, height } = display.workArea;

  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: x + width - WIDTH - MARGIN,
    y: y + height - HEIGHT - MARGIN,
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

export function createSettingsWindow() {
  return new BrowserWindow({
    width: 520,
    height: 640,
    resizable: false,
    autoHideMenuBar: true,
    show: false,
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
