/**
 * lis-app-standalone — Electron main process (repaired)
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { PageCache } = require('./lib/pageCache');
const { OperationQueue } = require('./lib/operationQueue');
const { SyncEngine } = require('./lib/syncEngine');
const { NetworkMonitor } = require('./lib/networkMonitor');
const { createLocalServer } = require('./lib/localServer');
const config = require('./lib/config');

let mainWindow = null;
let pageCache = null;
let operationQueue = null;
let syncEngine = null;
let localServer = null;
let networkMonitor = null;
let isOnline = false;
let appIcon = null;
let tray = null;
let userDataPath = null;
let cacheDir = null;
let dataDir = null;

// persisted user settings (stored in userData/settings.json)
let userSettings = {};
function settingsFilePath() {
  return path.join(userDataPath || app.getPath('userData'), 'settings.json');
}
function loadUserSettings() {
  try {
    const p = settingsFilePath();
    if (fs.existsSync(p)) {
      userSettings = JSON.parse(fs.readFileSync(p, 'utf8') || '{}');
      // apply server override if present
      if (userSettings.serverUrl) config.SERVER_URL = userSettings.serverUrl;
    }
  } catch (e) { console.warn('[Main] loadUserSettings failed', e && e.message); userSettings = {}; }
}
function saveUserSettings(newSettings = {}) {
  try {
    userSettings = Object.assign({}, userSettings, newSettings);
    fs.writeFileSync(settingsFilePath(), JSON.stringify(userSettings, null, 2), 'utf8');
    if (newSettings.serverUrl) {
      config.SERVER_URL = newSettings.serverUrl;
      // apply and start network monitor/request interception
      try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(config.SERVER_URL); } catch (e) {}
      // start network monitor in background (no await)
      startNetworkMonitor().catch(() => {});
    } else if (Object.prototype.hasOwnProperty.call(newSettings, 'serverUrl') && !newSettings.serverUrl) {
      // user cleared server url — stop monitor and go offline
      config.SERVER_URL = '';
      stopNetworkMonitor().catch(() => {});
      isOnline = false;
      sendStatus();
    }
  } catch (e) { console.warn('[Main] saveUserSettings failed', e && e.message); }
}

function openSettingsWindow() {
  if (!mainWindow) return;
  if (global._settingsWindow && !global._settingsWindow.isDestroyed()) {
    global._settingsWindow.focus();
    return;
  }
  const sw = new BrowserWindow({
    width: 520,
    height: 360,
    parent: mainWindow,
    modal: false,
    resizable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  sw.removeMenu();
  sw.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  global._settingsWindow = sw;
  sw.on('closed', () => { global._settingsWindow = null; });
}

async function stopNetworkMonitor() {
  try {
    if (networkMonitor) {
      try { networkMonitor.stop(); } catch (e) {}
      networkMonitor = null;
    }
  } catch (e) { console.warn('[Main] stopNetworkMonitor failed', e && e.message); }
}

async function startNetworkMonitor() {
  try {
    await stopNetworkMonitor();
    if (!config.SERVER_URL) return;
    networkMonitor = new NetworkMonitor(config.SERVER_URL, config.PING_INTERVAL);
    isOnline = await networkMonitor.checkOnce();
    console.log('[Main] initial network check:', isOnline ? 'ONLINE' : 'OFFLINE');

    networkMonitor.on('status-change', async (online) => {
      const wasOnline = isOnline;
      isOnline = online;
      sendStatus();

      if (online && !wasOnline) {
        console.log('[Main] connection restored — syncing queue…');
        const synced = await syncEngine.processQueue();
        sendStatus();
        if (synced > 0 && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync-complete', { synced });
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(config.SERVER_URL);
          }, 1500);
        }
      }
    });

    networkMonitor.start();
    setupRequestInterceptor();
  } catch (e) { console.error('[Main] startNetworkMonitor failed', e && e.message); }
}

async function createWindow() {
  userDataPath = app.getPath('userData');
  cacheDir = path.join(userDataPath, 'page-cache');
  dataDir = path.join(userDataPath, 'data');

  try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch(e) {}
  try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); } catch(e) {}

  // load persisted settings and apply overrides before services start
  loadUserSettings();

  // load application icon if available
  try {
    const iconPath = path.join(__dirname, 'assets', 'gezyne-logo.png');
    if (fs.existsSync(iconPath)) appIcon = nativeImage.createFromPath(iconPath);
  } catch (e) { appIcon = null; }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Gezyne LIS',
    autoHideMenuBar: true,
    show: false,
    icon: appIcon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:lis',
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Track and handle main-window renderer crashes: attempt one reload,
  // then open the server URL in the external browser and quit the app.
  if (!mainWindow._crashCount) mainWindow._crashCount = 0;
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Main] main render-process-gone:', details && details.reason, details);
    try {
      const prev = mainWindow._crashCount || 0;
      mainWindow._crashCount = prev + 1;
      if (prev < 1) {
        console.log('[Main] attempting single reload of main window after crash');
        try { if (!mainWindow.isDestroyed()) mainWindow.reload(); } catch (e) {}
        return;
      }
      console.warn('[Main] main renderer crashed repeatedly; opening externally and quitting');
      try { if (config.SERVER_URL) shell.openExternal(config.SERVER_URL); } catch (e) {}
      try { app.quit(); } catch (e) {}
    } catch (e) { console.error('[Main] error handling main render-process-gone:', e && e.message); }
  });
  mainWindow.on('unresponsive', () => { console.error('[Main] main window became unresponsive'); });
  mainWindow.webContents.on('crashed', () => { console.error('[Main] main renderer crashed'); });

  // services
  pageCache = new PageCache(cacheDir);
  operationQueue = new OperationQueue(dataDir);
  syncEngine = new SyncEngine(operationQueue, config);
  localServer = createLocalServer(pageCache, operationQueue, config);

  if (config.SERVER_URL) {
    // start monitor via helper (ensures consistent wiring)
    startNetworkMonitor().catch(() => {});
  } else {
    console.log('[Main] no SERVER_URL configured — starting in offline mode');
    isOnline = false;
    // open settings so user can configure server
    try { setTimeout(openSettingsWindow, 300); } catch (e) {}
  }

  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const url = mainWindow.webContents.getURL();
      if (config.SERVER_URL && url.startsWith(config.SERVER_URL)) {
        const html = await mainWindow.webContents.executeJavaScript('document.documentElement.outerHTML');
        const urlObj = new URL(url);
        pageCache.store(urlObj.pathname + (urlObj.search || ''), html);
      }
    } catch (e) { /* ignore */ }

    injectClientScripts();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'p' && input.type === 'keyDown') {
      event.preventDefault();
      const url = mainWindow.webContents.getURL();
      openPrintPreviewWindow(url);
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, _code, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (config.SERVER_URL && validatedURL && validatedURL.startsWith(config.SERVER_URL)) {
      const urlObj = new URL(validatedURL);
      const urlPath = urlObj.pathname + (urlObj.search || '');
      loadOfflinePage(urlPath);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      const p = u.pathname || '';
      if (p.startsWith('/reports/print') || p.startsWith('/reports/result') || p === '/reports/print-multiple') {
        openPrintPreviewWindow(url);
        return { action: 'deny' };
      }
      openChildWindow(url);
      return { action: 'deny' };
    } catch (e) {
      return { action: 'allow' };
    }
  });

  loadApp();
}

/* ==================================================================
 *  Navigation helpers
 * ================================================================== */
async function loadApp() {
  if (!config.SERVER_URL) {
    console.log('[Main] no SERVER_URL configured — showing offline UI and settings');
    try { openSettingsWindow(); } catch (e) {}
    isOnline = false;
    loadOfflinePage('/');
    return;
  }

  try {
    await mainWindow.loadURL(config.SERVER_URL);
    isOnline = true;
    sendStatus();
  } catch {
    console.log('[Main] server unreachable on startup — loading offline');
    isOnline = false;
    loadOfflinePage('/');
  }
}

function loadOfflinePage(urlPath) {
  if (pageCache.has(urlPath) || pageCache.has(urlPath.split('?')[0])) {
    mainWindow.loadURL(`http://127.0.0.1:${config.LOCAL_PORT}${urlPath}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'offline.html'));
  }
}

/* ==================================================================
 *  Request interceptor
 * ================================================================== */
function setupRequestInterceptor() {
  const ses = session.fromPartition('persist:lis');

  ses.webRequest.onBeforeRequest({ urls: [`${config.SERVER_URL}/*`] }, (details, callback) => {
    if (isOnline) return callback({});
    try {
      const urlPath = new URL(details.url).pathname;
      if (urlPath === '/login' || urlPath === '/logout' || urlPath === '/') {
        console.log('[Intercept] allowing auth route through:', details.method, urlPath);
        return callback({});
      }
    } catch { return callback({}); }

    if (details.method !== 'GET') {
      const body = parseUploadData(details.uploadData);
      operationQueue.add({ method: details.method, url: details.url, body, timestamp: new Date().toISOString() });
      callback({ cancel: true });
      const referer = details.referrer || details.url;
      let refPath = '/';
      try { refPath = new URL(referer).pathname; } catch { }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`http://127.0.0.1:${config.LOCAL_PORT}${refPath}?offline_queued=1`);
      }
      return;
    }

    if (details.resourceType === 'mainFrame') {
      const urlObj = new URL(details.url);
      const urlPath = urlObj.pathname + (urlObj.search || '');
      callback({ redirectURL: `http://127.0.0.1:${config.LOCAL_PORT}${urlPath}` });
      return;
    }

    callback({});
  });
}

function parseUploadData(uploadData) {
  const body = {};
  if (!uploadData || !uploadData.length) return body;
  for (const item of uploadData) {
    if (item.bytes) {
      try {
        const str = Buffer.from(item.bytes).toString('utf8');
        for (const [k, v] of new URLSearchParams(str)) {
          if (body[k] !== undefined) {
            if (!Array.isArray(body[k])) body[k] = [body[k]];
            body[k].push(v);
          } else {
            body[k] = v;
          }
        }
      } catch { }
    }
  }
  return body;
}

/* ==================================================================
 *  Client-side injection
 * ================================================================== */
function injectClientScripts() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const css = fs.readFileSync(path.join(__dirname, 'renderer', 'inject.css'), 'utf8');
    const js = fs.readFileSync(path.join(__dirname, 'renderer', 'inject.js'), 'utf8');
    mainWindow.webContents.insertCSS(css).catch(() => {});
    mainWindow.webContents.executeJavaScript(js).catch(() => {});
    sendStatus();
  } catch (e) {
    console.error('[Main] inject error:', e.message);
  }
}

function sendStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('network-status', { online: isOnline, pendingCount: operationQueue ? operationQueue.countPending() : 0 });
  }
}

/* ==================================================================
 *  IPC handlers
 * ================================================================== */
ipcMain.handle('get-status', () => ({ online: isOnline, pendingCount: operationQueue.countPending(), serverUrl: config.SERVER_URL, serverConfigured: !!config.SERVER_URL, cachedPages: pageCache.list().length }));
ipcMain.handle('get-queue', () => operationQueue.getAll());
ipcMain.handle('queue-operation', (_e, operation) => { operationQueue.add(operation); return { success: true, pendingCount: operationQueue.countPending() }; });
ipcMain.handle('force-sync', async () => { if (!isOnline) return { success: false, reason: 'offline' }; const synced = await syncEngine.processQueue(); sendStatus(); return { success: true, synced }; });
ipcMain.handle('retry-connection', async () => {
  if (!config.SERVER_URL) return { online: false, reason: 'no-server-configured' };
  if (!networkMonitor) networkMonitor = new NetworkMonitor(config.SERVER_URL, config.PING_INTERVAL);
  const online = await networkMonitor.checkOnce();
  if (online && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(config.SERVER_URL);
  return { online };
});
ipcMain.handle('clear-cache', () => { pageCache.clear(); return { success: true }; });
ipcMain.handle('go-online', () => { if (!config.SERVER_URL) return { success: false, reason: 'no-server-configured' }; if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(config.SERVER_URL); return { success: true }; });

// Settings IPC
ipcMain.handle('get-settings', () => {
  return Object.assign({}, userSettings, { serverUrl: config.SERVER_URL });
});
ipcMain.handle('set-settings', (_e, settings) => {
  saveUserSettings(settings || {});
  return { success: true };
});
ipcMain.handle('open-settings', () => {
  openSettingsWindow();
  return { success: true };
});

/* ==================================================================
 *  Print preview and child windows
 * ================================================================== */
function openPrintPreviewWindow(url) {
  if (openPrintPreviewWindow._busy) { console.log('[Print] already generating preview, skipping duplicate'); return; }
  openPrintPreviewWindow._busy = true;
  console.log('[Print] opening print preview for:', url);

  const sourceWin = new BrowserWindow({ width: 800, height: 1100, show: false, icon: appIcon || undefined, webPreferences: { preload: path.join(__dirname, 'preload-print.js'), nodeIntegration: false, contextIsolation: true, partition: 'persist:lis' } });
  sourceWin.loadURL(url);
  sourceWin.webContents.on('dom-ready', () => { sourceWin.webContents.executeJavaScript('window.print = function(){}; void 0;').catch(() => {}); });

  const stallTimer = setTimeout(() => { console.error('[Print] PDF generation stalled — forcing cleanup'); try { if (sourceWin && !sourceWin.isDestroyed()) sourceWin.close(); } catch {} openPrintPreviewWindow._busy = false; }, 30000);

  sourceWin.webContents.on('did-finish-load', async () => {
    await sourceWin.webContents.executeJavaScript('window.print = function(){}; void 0;').catch(() => {});
    await new Promise(r => setTimeout(r, 800));
    try {
      const pdfBuffer = await sourceWin.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
      sourceWin.close();
      const tmpDir = path.join(userDataPath, 'temp-pdfs'); if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const pdfPath = path.join(tmpDir, `report-${Date.now()}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      const openRes = await shell.openPath(pdfPath);
      if (openRes) console.error('[Print] shell.openPath returned error:', openRes);
      setTimeout(() => { try { fs.unlinkSync(pdfPath); } catch { } }, 120000);
    } catch (err) {
      console.error('[Print] PDF generation failed:', err);
      try { sourceWin.close(); } catch {}
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.print();
    }
    clearTimeout(stallTimer);
    openPrintPreviewWindow._busy = false;
  });

  sourceWin.webContents.on('did-fail-load', () => { console.error('[Print] source window failed to load'); try { sourceWin.close(); } catch {} openPrintPreviewWindow._busy = false; try { clearTimeout(stallTimer); } catch(e) {} });
}

function openChildWindow(url) {
  try {
    const child = new BrowserWindow({ width: 1000, height: 800, icon: appIcon || undefined, webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, partition: 'persist:lis' } });
    child.loadURL(url).catch(() => {});
    child.once('ready-to-show', () => { try { child.show(); } catch {} });
    try { if (process && process.argv && process.argv.includes('--dev')) child.webContents.openDevTools({ mode: 'detach' }); } catch (e) {}
    // Track child renderer crashes for this URL: attempt a reload once, then open externally and close.
    if (!openChildWindow._crashCounts) openChildWindow._crashCounts = new Map();
    child.webContents.on('render-process-gone', (_event, details) => {
      console.error('[Main] child render-process-gone:', details && details.reason, details);
      try {
        const key = url;
        const prev = openChildWindow._crashCounts.get(key) || 0;
        openChildWindow._crashCounts.set(key, prev + 1);
        if (prev < 1) {
          console.log('[Main] attempting single reload of child window after crash');
          try { if (!child.isDestroyed()) child.reload(); } catch (e) {}
          return;
        }
        console.warn('[Main] child crashed repeatedly; opening externally and closing child');
        try { shell.openExternal(key); } catch (e) {}
        try { if (!child.isDestroyed()) child.close(); } catch (e) {}
      } catch (e) { console.error('[Main] error handling child render-process-gone:', e && e.message); }
    });
    child.on('unresponsive', () => { console.error('[Main] child window became unresponsive'); });
    child.webContents.on('crashed', () => { console.error('[Main] child renderer crashed'); });
    child.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      console.error('[Main] child window failed to load:', errorCode, errorDescription, validatedURL);
      try {
        if (!child.isDestroyed()) {
          child.webContents.executeJavaScript("document.body.innerHTML = '<div style=\"padding:24px;font-family:Segoe UI,Arial,sans-serif;\'><h2>Failed to load content</h2><p>URL: '+JSON.stringify('"+validatedURL+"')+'</p><p>Check the main process logs for details.</p></div>'");
        }
      } catch (e) {}
    });
    child.webContents.setWindowOpenHandler(({ url: newUrl }) => {
      try {
        const u = new URL(newUrl);
        const p = u.pathname || '';
        if (p.startsWith('/reports/print') || p.startsWith('/reports/result') || p === '/reports/print-multiple') { openPrintPreviewWindow(newUrl); return { action: 'deny' }; }
        openChildWindow(newUrl);
        return { action: 'deny' };
      } catch (e) { return { action: 'allow' }; }
    });
  } catch (e) { console.error('[Main] openChildWindow failed:', e && e.message); }
}

ipcMain.handle('print-preview', async (_e, { url }) => { openPrintPreviewWindow(url); return { success: true }; });
ipcMain.handle('read-pdf-file', async (_e, { filePath }) => { try { if (filePath && fs.existsSync(filePath)) { const buffer = fs.readFileSync(filePath); return new Uint8Array(buffer); } } catch (e) { console.error('[Print] read-pdf-file failed:', e); } return null; });
ipcMain.handle('save-pdf', async (_e, { sourcePath }) => { const result = await dialog.showSaveDialog(mainWindow, { title: 'Save Report PDF', defaultPath: 'LIS-Report.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (!result.canceled && result.filePath) { fs.copyFileSync(sourcePath, result.filePath); return { success: true, path: result.filePath }; } return { success: false }; });
ipcMain.handle('open-pdf', async (_e, { filePath }) => { try { if (filePath && fs.existsSync(filePath)) { const res = await shell.openPath(filePath); if (!res) return { success: true }; console.error('[Print] shell.openPath error:', res); } } catch (err) { console.error('[Print] open-pdf failed:', err); } return { success: false }; });

/* ==================================================================
 *  System tray
 * ================================================================== */
function createTray() {
  try {
    const trayIcon = appIcon ? appIcon.resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Gezyne LIS', click: () => mainWindow && mainWindow.show() },
      { label: 'Settings', click: () => openSettingsWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setToolTip('Gezyne LIS');
    tray.setContextMenu(contextMenu);
    tray.on('double-click', () => mainWindow && mainWindow.show());
  } catch { /* tray is non-critical */ }
}

app.on('window-all-closed', () => {
  if (networkMonitor) networkMonitor.stop();
  if (localServer) localServer.close();
  app.quit();
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

app.whenReady().then(() => {
  createWindow();
  createTray();
});
