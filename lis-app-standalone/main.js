/**
 * lis-app-standalone — Electron main process
 *
 * Creates a BrowserWindow that loads the remote LIS server.
 * When the server is unreachable the app switches to "offline mode":
 *   • Cached pages are served by a local Express server
 *   • Form submissions are queued and synced when connectivity returns
 *   • A status bar shows the current connection state
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  dialog,
  shell,
  Menu,
  Tray,
  nativeImage,
} = require('electron');
const path = require('path');
const fs   = require('fs');

const config           = require('./lib/config');
const { NetworkMonitor }  = require('./lib/networkMonitor');
const { PageCache }       = require('./lib/pageCache');
const { OperationQueue }  = require('./lib/operationQueue');
const { SyncEngine }      = require('./lib/syncEngine');
const { createLocalServer } = require('./lib/localServer');

/* ── Single-instance lock ─────────────────────────────────────────── */
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  // Another instance is already running — quit this one silently
  app.quit();
}

/* ── app-wide state ───────────────────────────────────────────────── */
let mainWindow    = null;
let tray          = null;
let networkMonitor;
let pageCache;
let operationQueue;
let syncEngine;
let localServer;
let isOnline      = false;

/* ── paths ────────────────────────────────────────────────────────── */
const userDataPath = app.getPath('userData');
const cacheDir     = path.join(userDataPath, 'page-cache');
const dataDir      = path.join(userDataPath, 'data');

/* ── app icon (Gezyne logo) ───────────────────────────────────────── */
const LOGO_PATH = path.join(__dirname, 'assets', 'gezyne-logo.png');
let appIcon = null;
try { appIcon = nativeImage.createFromPath(LOGO_PATH); } catch { /* fallback to default */ }

/* ==================================================================
 *  Window creation
 * ================================================================== */
async function createWindow() {
  mainWindow = new BrowserWindow({
    width:  1400,
    height: 900,
    minWidth:  1024,
    minHeight: 600,
    icon: appIcon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      partition: 'persist:lis',         // persistent session → cookies survive restart
    },
    title: 'Gezyne LIS',
    autoHideMenuBar: true,
    show: false,                        // show after first paint to avoid flash
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // ── Open DevTools in dev mode for debugging ──
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  /* ── Initialise services ─────────────────────────────────────── */
  pageCache      = new PageCache(cacheDir);
  operationQueue = new OperationQueue(dataDir);
  syncEngine     = new SyncEngine(operationQueue, config);
  localServer    = createLocalServer(pageCache, operationQueue, config);

  /* ── Network monitoring ──────────────────────────────────────── */
  networkMonitor = new NetworkMonitor(config.SERVER_URL, config.PING_INTERVAL);
  // Do an IMMEDIATE network check before anything else so `isOnline`
  // has the correct value before the user can interact with the page.
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
        // Small delay so the user can read the "synced" toast
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(config.SERVER_URL);
          }
        }, 1500);
      }
    }
  });

  networkMonitor.start();

  /* ── Request interception (offline fallback) ─────────────────── */
  setupRequestInterceptor();

  /* ── Cache pages on every successful navigation ──────────────── */
  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const url = mainWindow.webContents.getURL();
      if (url.startsWith(config.SERVER_URL)) {
        const html = await mainWindow.webContents.executeJavaScript(
          'document.documentElement.outerHTML',
        );
        const urlObj = new URL(url);
        pageCache.store(urlObj.pathname + (urlObj.search || ''), html);
      }
    } catch { /* ignore */ }

    // Inject the status-bar overlay and offline helpers
    injectClientScripts();
  });

  /* ── Intercept Ctrl+P to use our print preview ───────────────── */
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'p' && input.type === 'keyDown') {
      event.preventDefault();
      const url = mainWindow.webContents.getURL();
      openPrintPreviewWindow(url);
    }
  });

  /* ── Catch full-page load failures (e.g. first load offline) ── */
  mainWindow.webContents.on(
    'did-fail-load',
    (_event, _code, _desc, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      if (validatedURL && validatedURL.startsWith(config.SERVER_URL)) {
        const urlObj = new URL(validatedURL);
        const urlPath = urlObj.pathname + (urlObj.search || '');
        loadOfflinePage(urlPath);
      }
    },
  );

  /* ── Handle new-window requests (target="_blank" print links) ── */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // If the URL looks like a print/result page, open it in our own
    // child window (with the same partition & preload) so we can
    // intercept window.print() there too.
    if (url.includes('/reports/') || url.includes('print')) {
      openPrintPreviewWindow(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  /* ── Initial navigation ──────────────────────────────────────── */
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
 *  Request interceptor — redirects server requests through the local
 *  offline cache when the network is down.
 * ================================================================== */
function setupRequestInterceptor() {
  const ses = session.fromPartition('persist:lis');

  ses.webRequest.onBeforeRequest(
    { urls: [`${config.SERVER_URL}/*`] },
    (details, callback) => {
      /* Online → let the real request through */
      if (isOnline) return callback({});
      /* ── NEVER intercept auth routes — login/logout must always
       *    reach the server (or fail naturally if truly offline) ── */
      try {
        const urlPath = new URL(details.url).pathname;
        if (urlPath === '/login' || urlPath === '/logout' || urlPath === '/') {
          console.log('[Intercept] allowing auth route through:', details.method, urlPath);
          return callback({});
        }
      } catch { /* parse error — let through */ return callback({}); }
      /* ── POST / PUT / DELETE → queue + redirect ────────────── */
      if (details.method !== 'GET') {
        // Extract form body from uploadData
        const body = parseUploadData(details.uploadData);

        operationQueue.add({
          method: details.method,
          url: details.url,
          body,
          timestamp: new Date().toISOString(),
        });

        // Cancel the real request
        callback({ cancel: true });

        // Navigate back to the referring page with a notification
        const referer = details.referrer || details.url;
        let refPath = '/';
        try { refPath = new URL(referer).pathname; } catch { /* use / */ }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(
            `http://127.0.0.1:${config.LOCAL_PORT}${refPath}?offline_queued=1`,
          );
        }
        return;
      }

      /* ── GET (main frame) → serve from local cache ─────────── */
      if (details.resourceType === 'mainFrame') {
        const urlObj = new URL(details.url);
        const urlPath = urlObj.pathname + (urlObj.search || '');
        callback({
          redirectURL: `http://127.0.0.1:${config.LOCAL_PORT}${urlPath}`,
        });
        return;
      }

      /* ── Sub-resources (CSS / JS / img) → let Electron's HTTP
       *    cache try; if that fails the resource simply won't load
       *    (the page content is still usable) ────────────────── */
      callback({});
    },
  );
}

/* Parse Electron uploadData into a plain key→value object */
function parseUploadData(uploadData) {
  const body = {};
  if (!uploadData || !uploadData.length) return body;
  for (const item of uploadData) {
    if (item.bytes) {
      try {
        const str = Buffer.from(item.bytes).toString('utf8');
        for (const [k, v] of new URLSearchParams(str)) {
          // Handle repeated keys (e.g. checkboxes: tests[]=a&tests[]=b)
          if (body[k] !== undefined) {
            if (!Array.isArray(body[k])) body[k] = [body[k]];
            body[k].push(v);
          } else {
            body[k] = v;
          }
        }
      } catch { /* skip unparseable chunks */ }
    }
  }
  return body;
}

/* ==================================================================
 *  Client-side injection (status bar + helpers)
 * ================================================================== */
function injectClientScripts() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  try {
    const css = fs.readFileSync(
      path.join(__dirname, 'renderer', 'inject.css'), 'utf8',
    );
    const js = fs.readFileSync(
      path.join(__dirname, 'renderer', 'inject.js'), 'utf8',
    );

    mainWindow.webContents.insertCSS(css).catch(() => {});
    mainWindow.webContents.executeJavaScript(js).catch(() => {});

    // Push current status to the freshly injected script
    sendStatus();
  } catch (e) {
    console.error('[Main] inject error:', e.message);
  }
}

function sendStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('network-status', {
      online: isOnline,
      pendingCount: operationQueue ? operationQueue.countPending() : 0,
    });
  }
}

/* ==================================================================
 *  IPC handlers (renderer → main)
 * ================================================================== */
ipcMain.handle('get-status', () => ({
  online: isOnline,
  pendingCount: operationQueue.countPending(),
  serverUrl: config.SERVER_URL,
  cachedPages: pageCache.list().length,
}));

ipcMain.handle('get-queue', () => operationQueue.getAll());

ipcMain.handle('queue-operation', (_e, operation) => {
  operationQueue.add(operation);
  return { success: true, pendingCount: operationQueue.countPending() };
});

ipcMain.handle('force-sync', async () => {
  if (!isOnline) return { success: false, reason: 'offline' };
  const synced = await syncEngine.processQueue();
  sendStatus();
  return { success: true, synced };
});

ipcMain.handle('retry-connection', async () => {
  const online = await networkMonitor.checkOnce();
  if (online && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(config.SERVER_URL);
  }
  return { online };
});

ipcMain.handle('clear-cache', () => {
  pageCache.clear();
  return { success: true };
});

ipcMain.handle('go-online', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(config.SERVER_URL);
  }
});

/* ==================================================================
 *  Print preview — opens a PDF preview in a dedicated window
 * ================================================================== */

/**
 * Open a URL in a hidden child window, wait for its content to render,
 * generate a PDF, then display that PDF in a visible preview window
 * with native print support.
 */
function openPrintPreviewWindow(url) {
  // Guard: prevent multiple concurrent preview operations
  if (openPrintPreviewWindow._busy) {
    console.log('[Print] already generating preview, skipping duplicate');
    return;
  }
  openPrintPreviewWindow._busy = true;
  console.log('[Print] opening print preview for:', url);
  // Create a hidden "source" window that loads the report page and prints to PDF
  const sourceWin = new BrowserWindow({
    width: 800,
    height: 1100,
    show: false,
    icon: appIcon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload-print.js'),
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:lis',
    },
  });

  sourceWin.loadURL(url);

  // Suppress window.print() as early as possible — templates sometimes call it.
  sourceWin.webContents.on('dom-ready', () => {
    sourceWin.webContents.executeJavaScript('window.print = function(){}; void 0;').catch(() => {});
  });

  // Safety timer: if PDF generation stalls, release the busy guard and close the source window
  const stallTimer = setTimeout(() => {
    console.error('[Print] PDF generation stalled — forcing cleanup');
    try { if (sourceWin && !sourceWin.isDestroyed()) sourceWin.close(); } catch {}
    openPrintPreviewWindow._busy = false;
  }, 30000);

  sourceWin.webContents.on('did-finish-load', async () => {
    // Double-suppress in case dom-ready handler didn't win the race
    await sourceWin.webContents.executeJavaScript('window.print = function(){}; void 0;').catch(() => {});

    // Give the page time to render signatures / images
    await new Promise(r => setTimeout(r, 800));

    try {
      const pdfBuffer = await sourceWin.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: 'none' },
      });

      sourceWin.close();

      // Save PDF to a temp file
      const tmpDir = path.join(userDataPath, 'temp-pdfs');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const pdfPath = path.join(tmpDir, `report-${Date.now()}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);

      // Open the PDF in the system default viewer so users get a native preview + print UI
      const openRes = await shell.openPath(pdfPath);
      if (openRes) {
        console.error('[Print] shell.openPath returned error:', openRes);
      }

      // Schedule cleanup of the temporary file after a delay (allow viewer to read it)
      setTimeout(() => {
        try { fs.unlinkSync(pdfPath); } catch { /* ignore */ }
      }, 120000);
    } catch (err) {
      console.error('[Print] PDF generation failed:', err);
      try { sourceWin.close(); } catch {}
      // Fallback: show the system print dialog on the main page
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.print();
      }
    }

    clearTimeout(stallTimer);
    openPrintPreviewWindow._busy = false;
  });

  // Safety: if the source window fails to load or gets stuck, release the guard
  sourceWin.webContents.on('did-fail-load', () => {
    console.error('[Print] source window failed to load');
    try { sourceWin.close(); } catch {}
    openPrintPreviewWindow._busy = false;
    try { clearTimeout(stallTimer); } catch(e) {}
  });
}

/* ── IPC: renderer requests a print preview ──────────────────────── */
ipcMain.handle('print-preview', async (_e, { url }) => {
  openPrintPreviewWindow(url);
  return { success: true };
});

/* ── IPC: read a PDF file from disk (preload is sandboxed, no fs) ── */
ipcMain.handle('read-pdf-file', async (_e, { filePath }) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      return new Uint8Array(buffer);
    }
  } catch (e) {
    console.error('[Print] read-pdf-file failed:', e);
  }
  return null;
});

/* ── IPC: save the PDF to a user-chosen location ─────────────────── */
ipcMain.handle('save-pdf', async (_e, { sourcePath }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Report PDF',
    defaultPath: 'LIS-Report.pdf',
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (!result.canceled && result.filePath) {
    fs.copyFileSync(sourcePath, result.filePath);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

/* ── IPC: open the PDF in the OS default viewer (gives full preview + native print dialog) ── */
ipcMain.handle('open-pdf', async (_e, { filePath }) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      // shell.openPath resolves with an empty string on success, or error text on failure
      const res = await shell.openPath(filePath);
      if (!res) return { success: true };
      console.error('[Print] shell.openPath error:', res);
    }
  } catch (err) {
    console.error('[Print] open-pdf failed:', err);
  }
  return { success: false };
});

/* ==================================================================
 *  System tray
 * ================================================================== */
function createTray() {
  try {
    // Use the Gezyne logo as the tray icon
    const trayIcon = appIcon
      ? appIcon.resize({ width: 16, height: 16 })
      : nativeImage.createEmpty();
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

/* ==================================================================
 *  App lifecycle
 * ================================================================== */
app.whenReady().then(() => {
  createWindow();
  createTray();
});

// When a second instance tries to launch, focus the existing window
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (networkMonitor) networkMonitor.stop();
  if (localServer)    localServer.close();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
