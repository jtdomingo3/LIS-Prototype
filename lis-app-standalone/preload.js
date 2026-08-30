/**
 * preload.js — Context bridge between the Electron main process and the
 *              renderer (web page). Exposes `window.lisApp` with safe
 *              IPC wrappers the injected status-bar and UI components use.
 */
const { contextBridge, ipcRenderer } = require('electron');

try {
  console.log('[preload] preload.js running (contextBridge will expose APIs)');
  try { globalThis.__preloadLoaded = true; } catch (e) { /* ignore */ }
} catch (e) { /* ignore */ }

contextBridge.exposeInMainWorld('lisApp', {
  /* ── queries ─────────────────────────────────────────────────── */
  getStatus:        ()      => ipcRenderer.invoke('get-status'),
  getQueue:         ()      => ipcRenderer.invoke('get-queue'),
  getDataStoreInfo: ()      => ipcRenderer.invoke('datastore-info'),

  /* ── actions ─────────────────────────────────────────────────── */
  queueOperation:   (op)    => ipcRenderer.invoke('queue-operation', op),
  forceSync:        ()      => ipcRenderer.invoke('force-sync'),
  retryConnection:  ()      => ipcRenderer.invoke('retry-connection'),
  clearCache:       ()      => ipcRenderer.invoke('clear-cache'),
  goOnline:         ()      => ipcRenderer.invoke('go-online'),
  printPreview:     (url)   => ipcRenderer.invoke('print-preview', { url }),

  /* ── settings & database management ─────────────────────────── */
  getSettings:      ()      => ipcRenderer.invoke('get-settings'),
  setSettings:      (s)     => ipcRenderer.invoke('set-settings', s),
  openSettings:     ()      => ipcRenderer.invoke('open-settings'),
  fullSync:         ()      => ipcRenderer.invoke('full-sync'),
  saveCredentials:  (email, password) => ipcRenderer.invoke('save-credentials', { email, password }),
  discardLocalChanges: ()   => ipcRenderer.invoke('discard-local-changes'),
  dropOfflineData:     ()   => ipcRenderer.invoke('drop-offline-data'),
  performBackup:       ()   => ipcRenderer.invoke('perform-backup'),
  deleteQueueItem:     (id) => ipcRenderer.invoke('delete-queue-item', id),
  clearQueue:          ()   => ipcRenderer.invoke('clear-queue'),

  /* ── event listeners ─────────────────────────────────────────── */
  onNetworkStatus: (callback) => {
    ipcRenderer.on('network-status', (_event, data) => callback(data));
  },
  onSyncComplete: (callback) => {
    ipcRenderer.on('sync-complete', (_event, data) => callback(data));
  },
  onFullSyncProgress: (callback) => {
    ipcRenderer.on('full-sync-progress', (_event, data) => callback(data));
  },
  onFullSyncEnd: (callback) => {
    ipcRenderer.on('full-sync-end', (_event, data) => callback(data));
  },
  onDropOfflineComplete: (callback) => {
    ipcRenderer.on('drop-offline-complete', (_event, data) => callback(data));
  }
});
