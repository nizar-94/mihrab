import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('settingsAPI', {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (patch) => ipcRenderer.invoke('settings:save', patch),
  resetPosition: () => ipcRenderer.invoke('settings:resetPosition'),
  preview: () => ipcRenderer.send('settings:preview')
});
