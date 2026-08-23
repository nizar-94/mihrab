import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('verseAPI', {
  onVerse: (cb) => ipcRenderer.on('verse:show', (_e, payload) => cb(payload)),
  // Prayer cards reuse the same window and the same dismiss/pin/size
  // channels — only the content differs, so only the inbound channel does.
  onPrayer: (cb) => ipcRenderer.on('prayer:show', (_e, payload) => cb(payload)),
  dismiss: () => ipcRenderer.send('verse:dismiss'),
  pauseTimer: () => ipcRenderer.send('verse:pause'),
  resumeTimer: () => ipcRenderer.send('verse:resume'),
  pin: () => ipcRenderer.send('verse:pin'),
  reportSize: (height) => ipcRenderer.send('verse:size', { height })
});
