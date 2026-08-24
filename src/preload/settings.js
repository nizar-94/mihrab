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
  previewPrayerTimes: (patch) => ipcRenderer.invoke('prayer:preview', patch),
  listAzkar: () => ipcRenderer.invoke('azkar:list'),
  resolveLocation: (coords) => ipcRenderer.invoke('location:resolve', coords),
  showSample: (kind) => ipcRenderer.invoke('notification:sample', kind),
  listTranslations: () => ipcRenderer.invoke('translations:list'),
  downloadTranslation: (id) => ipcRenderer.invoke('translations:download', id),
  removeTranslation: (id) => ipcRenderer.invoke('translations:remove', id),
  selectTranslation: (id) => ipcRenderer.invoke('translations:select', id)
});
