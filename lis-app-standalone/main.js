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

async function createWindow() {
  userDataPath = app.getPath('userData');
  cacheDir = path.join(userDataPath, 'page-cache');
  dataDir = path.join(userDataPath, 'data');

  try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch(e) {}
  try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); } catch(e) {}

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

  // services
  pageCache = new PageCache(cacheDir);
  operationQueue = new OperationQueue(dataDir);
  syncEngine = new SyncEngine(operationQueue, config);
  localServer = createLocalServer(pageCache, operationQueue, config);

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

  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const url = mainWindow.webContents.getURL();
      if (url.startsWith(config.SERVER_URL)) {
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
    if (validatedURL && validatedURL.startsWith(config.SERVER_URL)) {
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
ipcMain.handle('get-status', () => ({ online: isOnline, pendingCount: operationQueue.countPending(), serverUrl: config.SERVER_URL, cachedPages: pageCache.list().length }));
ipcMain.handle('get-queue', () => operationQueue.getAll());
ipcMain.handle('queue-operation', (_e, operation) => { operationQueue.add(operation); return { success: true, pendingCount: operationQueue.countPending() }; });
ipcMain.handle('force-sync', async () => { if (!isOnline) return { success: false, reason: 'offline' }; const synced = await syncEngine.processQueue(); sendStatus(); return { success: true, synced }; });
ipcMain.handle('retry-connection', async () => { const online = await networkMonitor.checkOnce(); if (online && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(config.SERVER_URL); return { online }; });
ipcMain.handle('clear-cache', () => { pageCache.clear(); return { success: true }; });
ipcMain.handle('go-online', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(config.SERVER_URL); });

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
