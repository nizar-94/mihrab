import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('settingsAPI', {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (patch) => ipcRenderer.invoke('settings:save', patch),
  resetPosition: () => ipcRenderer.invoke('settings:resetPosition'),
  preview: () => ipcRenderer.send('settings:preview'),
  // City search runs in main so the 2.3 MB database is parsed once per
  // process rather than once per Settings window.
  searchCities: (query) => ipcRenderer.invoke('cities:search', query),
  // "What times would these settings produce?" — without saving them.
  previewPrayerTimes: (patch) => ipcRenderer.invoke('prayer:preview', patch)
});
