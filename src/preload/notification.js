import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('verseAPI', {
  onVerse: (cb) => ipcRenderer.on('verse:show', (_e, payload) => cb(payload)),
  dismiss: () => ipcRenderer.send('verse:dismiss'),
  pauseTimer: () => ipcRenderer.send('verse:pause'),
  resumeTimer: () => ipcRenderer.send('verse:resume')
});
