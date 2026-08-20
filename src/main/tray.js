import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'path';

export function createTray(handlers) {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources/icons/tray.png'));
  const tray = new Tray(icon);
  tray.setToolTip('Muslim App');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show verse now', click: handlers.onShowNow },
    { label: 'Settings', click: handlers.onSettings },
    { type: 'separator' },
    { label: 'Quit', click: handlers.onQuit }
  ]));
  return tray;
}
