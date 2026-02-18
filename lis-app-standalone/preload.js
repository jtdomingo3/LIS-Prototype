/**
 * preload.js — Context bridge between the Electron main process and the
 *              renderer (web page).  Exposes `window.lisApp` with safe
 *              IPC wrappers the injected status-bar script can use.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lisApp', {
  /* ── queries ─────────────────────────────────────────────────── */
  getStatus:        ()      => ipcRenderer.invoke('get-status'),
  getQueue:         ()      => ipcRenderer.invoke('get-queue'),

  /* ── actions ─────────────────────────────────────────────────── */
  queueOperation:   (op)    => ipcRenderer.invoke('queue-operation', op),
  forceSync:        ()      => ipcRenderer.invoke('force-sync'),
  retryConnection:  ()      => ipcRenderer.invoke('retry-connection'),
  clearCache:       ()      => ipcRenderer.invoke('clear-cache'),
  goOnline:         ()      => ipcRenderer.invoke('go-online'),
  printPreview:     (url)   => ipcRenderer.invoke('print-preview', { url }),

  /* ── event listeners ─────────────────────────────────────────── */
  onNetworkStatus: (callback) => {
    ipcRenderer.on('network-status', (_event, data) => callback(data));
  },
  onSyncComplete: (callback) => {
    ipcRenderer.on('sync-complete', (_event, data) => callback(data));
  },
});
