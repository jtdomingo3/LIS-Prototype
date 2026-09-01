/**
 * lis-app-standalone — Electron main process (repaired)
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { initAppLogger } = require('./lib/appLogger');
initAppLogger(path.join(os.homedir(), 'Documents', 'LIS'));

// Single-instance guard: only one copy of the standalone app may run.  If a
// second instance is launched we exit immediately.  When the existing
// instance detects the attempt we relaunch so that rerunning behaves like a
// restart (matching the tray helper behaviour).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log('[standalone] another instance is running, exiting new copy');
  app.quit();
  process.exit(0);
} else {
  let secondHandled = false;
  app.on('second-instance', () => {
    if (secondHandled) return;
    secondHandled = true;
    console.log('[standalone] second-instance detected, relaunching');
    try { /* might not be defined yet */ } catch {}
    app.relaunch();
    setImmediate(() => app.exit(0));
  });
}

// ignore harmless destroyed-object errors thrown when a window closes during
// shutdown (see tray/main.js for rationale)
process.on('uncaughtException', (err) => {
  if (err && String(err).includes('Object has been destroyed')) return;
  console.error('[standalone] uncaught exception', err);
});

const { PageCache } = require('./lib/pageCache');
const { OperationQueue } = require('./lib/operationQueue');
const { SyncEngine } = require('./lib/syncEngine');
const { DataStore } = require('./lib/dataStore');
const { NetworkMonitor } = require('./lib/networkMonitor');
const { createLocalServer } = require('./lib/localServer');
const config = require('./lib/config');

let mainWindow = null;
let pageCache = null;
let operationQueue = null;
let syncEngine = null;
let dataStore = null;
let localServer = null;
let networkMonitor = null;
let isOnline = false;
let fullSyncTimer = null;
let lastLoginSyncAt = null;
let lastSessionAuthAt = 0;
let appIcon = null;
let tray = null;
let userDataPath = null;
let cacheDir = null;
let dataDir = null;
let currentSessionEmail = null;

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
      if (userSettings.printerName || userSettings.printer) {
        process.env.PRINTER_NAME = userSettings.printerName || userSettings.printer;
      }
    }
  } catch (e) { console.warn('[Main] loadUserSettings failed', e && e.message); userSettings = {}; }
}
function saveUserSettings(newSettings = {}) {
  try {
    userSettings = Object.assign({}, userSettings, newSettings);
    if (userSettings.printerName || userSettings.printer) {
      process.env.PRINTER_NAME = userSettings.printerName || userSettings.printer;
    }
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

// ── App Security & Inactivity Auto-Lock ──────────────────────────
let appLocked = false;
let lastActivityAt = Date.now();
let lockCheckInterval = null;

function getLockPin() {
  return String(userSettings.lockPin || '0000').trim();
}

function getLockTimeoutMinutes() {
  if (userSettings.lockTimeout === undefined) return 10; // Default 10 minutes
  const parsed = parseInt(userSettings.lockTimeout, 10);
  return isNaN(parsed) ? 10 : parsed;
}

function lockApp() {
  if (appLocked) return;
  appLocked = true;
  console.log('[Security] Application locked due to inactivity or manual lock');
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-locked', { locked: true });
    }
  } catch (e) {}
}

function unlockApp(pin) {
  const correctPin = getLockPin();
  if (String(pin).trim() === correctPin) {
    appLocked = false;
    lastActivityAt = Date.now();
    console.log('[Security] Application unlocked successfully');
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('app-unlocked');
      }
    } catch (e) {}
    return { success: true };
  }
  return { success: false, reason: 'Incorrect PIN passcode. Try again.' };
}

function startLockCheckTimer() {
  if (lockCheckInterval) clearInterval(lockCheckInterval);
  lockCheckInterval = setInterval(() => {
    const timeoutMin = getLockTimeoutMinutes();
    if (timeoutMin <= 0 || appLocked) return; // 0 = never
    const elapsedMinutes = (Date.now() - lastActivityAt) / (60 * 1000);
    if (elapsedMinutes >= timeoutMin) {
      lockApp();
    }
  }, 5000);
}

/** Create a timestamped backup of the current DataStore and pending queue. */
function performBackup() {
  try {
    const backupRoot = path.join(userDataPath || app.getPath('userData'), 'backups');
    try { if (!fs.existsSync(backupRoot)) fs.mkdirSync(backupRoot, { recursive: true }); } catch (e) {}
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    let out = [];
    if (dataStore && dataStore.sqlitePath && fs.existsSync(dataStore.sqlitePath)) {
      const dst = path.join(backupRoot, `lis-data.db.${ts}.bak`);
      try { fs.copyFileSync(dataStore.sqlitePath, dst); out.push(dst); } catch (e) { console.warn('[Main] backup sqlite copy failed', e && e.message); }
    } else if (dataStore && dataStore.filePath && fs.existsSync(dataStore.filePath)) {
      const ext = path.extname(dataStore.filePath) || '.json';
      const dst = path.join(backupRoot, `data${ext}.${ts}.bak`);
      try { fs.copyFileSync(dataStore.filePath, dst); out.push(dst); } catch (e) { console.warn('[Main] backup data copy failed', e && e.message); }
    }
    if (operationQueue && operationQueue.filePath && fs.existsSync(operationQueue.filePath)) {
      const dstq = path.join(backupRoot, `pending-operations.json.${ts}.bak`);
      try { fs.copyFileSync(operationQueue.filePath, dstq); out.push(dstq); } catch (e) { console.warn('[Main] backup queue copy failed', e && e.message); }
    }
    if (out.length) console.log('[Main] performBackup created:', out.join(', '));
    return out;
  } catch (e) {
    console.warn('[Main] performBackup failed', e && e.message);
    return null;
  }
}

function openSettingsWindow() {
  if (!mainWindow) return;
  if (global._settingsWindow && !global._settingsWindow.isDestroyed()) {
    global._settingsWindow.focus();
    return;
  }
  const sw = new BrowserWindow({
    width: 860,
    height: 640,
    minWidth: 720,
    minHeight: 540,
    parent: mainWindow,
    modal: false,
    resizable: true,
    title: 'Gezyne LIS — Standalone Settings & Diagnostics',
    icon: appIcon || undefined,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, partition: 'persist:lis' }
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
    if (fullSyncTimer) { clearInterval(fullSyncTimer); fullSyncTimer = null; }
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

      // Manage periodic full-sync timer
      try { updateFullSyncTimer(isOnline); } catch (e) {}

      if (online) {
        triggerAutoSync().catch(() => {});
        if (syncEngine) {
          syncEngine.startLiveEventBridge((eventData) => {
            if (localServer && typeof localServer.broadcastEvent === 'function') {
              localServer.broadcastEvent(eventData);
            }
          }, mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null);
        }
      } else {
        if (syncEngine) {
          syncEngine.stopLiveEventBridge();
        }
      }

      // When going offline, immediately redirect the user from the real
      // server URL to the equivalent local-server URL.  This way the user
      // never notices the real server went away — auto-login on the local
      // server creates a session transparently.
      if (!online && wasOnline) {
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            const currentUrl = mainWindow.webContents.getURL();
            const base = config.SERVER_URL ? config.SERVER_URL.replace(/\/$/, '') : '';
            if (base && currentUrl.startsWith(base)) {
              const urlPath = currentUrl.slice(base.length) || '/';
              console.log('[Main] going offline — switching to local server:', urlPath);
              mainWindow.loadURL(`http://127.0.0.1:${config.LOCAL_PORT}${urlPath}`);
            }
          }
        } catch (e) { /* ignore */ }
      }
    });

    networkMonitor.on('check', (online) => {
      isOnline = online;
      if (online && operationQueue && operationQueue.countPending() > 0) {
        triggerAutoSync().catch(() => {});
      }
    });

    networkMonitor.start();
    setupRequestInterceptor();
    if (isOnline && syncEngine) {
      syncEngine.startLiveEventBridge((eventData) => {
        if (localServer && typeof localServer.broadcastEvent === 'function') {
          localServer.broadcastEvent(eventData);
        }
      }, mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null);
    }
    // ensure periodic sync timer reflects current network state
    try { updateFullSyncTimer(isOnline); } catch (e) {}
  } catch (e) { console.error('[Main] startNetworkMonitor failed', e && e.message); }
}

function updateFullSyncTimer(online) {
  try {
    if (fullSyncTimer) { clearInterval(fullSyncTimer); fullSyncTimer = null; }
    if (!online) return;
    const interval = parseInt(config.FULL_SYNC_INTERVAL || 0, 10) || 0;
    if (interval <= 0) return;
    fullSyncTimer = setInterval(async () => {
      try {
        if (!syncEngine || !mainWindow || mainWindow.isDestroyed()) return;
        console.log('[Main] periodic full-sync triggered');
        await syncEngine.fullSync(mainWindow.webContents);
        sendStatus();
      } catch (e) { console.error('[Main] periodic full-sync failed', e && e.message); }
    }, interval);
  } catch (e) { console.error('[Main] updateFullSyncTimer failed', e && e.message); }
}

async function createWindow() {
  userDataPath = app.getPath('userData');
  cacheDir = path.join(userDataPath, 'page-cache');
  dataDir = path.join(userDataPath, 'data');

  try { if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true }); } catch(e) {}
  try { if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }); } catch(e) {}

  // load persisted settings and apply overrides before services start
  loadUserSettings();
  currentSessionEmail = null; // Always require explicit login upon launching app

  // Clear previous session partition cookies on startup so every launch starts at Login
  try {
    const sess = session.fromPartition('persist:lis');
    if (sess) sess.clearStorageData({ storages: ['cookies'] }).catch(() => {});
  } catch (e) {}

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

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Prevent web pages from forcing full screen on button clicks
  mainWindow.webContents.on('enter-html-full-screen', () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setFullScreen(false);
      }
    } catch (e) {}
  });

  if (process.argv.includes('--dev')) {
    try {
      mainWindow.webContents.once('dom-ready', () => {
        try { mainWindow.webContents.openDevTools({ mode: 'detach' }); } catch (e) {}
      });
    } catch (e) { /* ignore */ }
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
  // DataStore will persist the full synced DB into Documents/LIS/app_sync/data.json
  try { dataStore = new DataStore(); } catch (e) { dataStore = null; }
  // Attach DataStore to operationQueue so replaceTempId can update stored records
  try { if (operationQueue && dataStore) operationQueue.dataStore = dataStore; } catch (e) {}
  syncEngine = new SyncEngine(operationQueue, config, dataStore);
  localServer = createLocalServer(pageCache, operationQueue, config, dataStore);

  // Fresh launch starts with NO pre-authenticated user session (manual login required)
  currentSessionEmail = null;
  if (localServer && localServer.setAutoLoginEmail) {
    localServer.setAutoLoginEmail(null);
  }

  global.onUserLogin = (email, password, user) => {
    console.log('[Main] user authenticated manually:', email);
    currentSessionEmail = email;
    if (localServer && localServer.setAutoLoginEmail) localServer.setAutoLoginEmail(email);
    if (syncEngine) {
      syncEngine.setAutoLoginEmail(email);
      syncEngine.setCredentials(email, password);
      syncEngine._ensureServerAuth().then(() => {
        syncEngine.processQueue().catch(() => {});
      });
    }
  };

  global.onUserLogout = () => {
    console.log('[Main] user logged out');
    currentSessionEmail = null;
    if (localServer && localServer.setAutoLoginEmail) localServer.setAutoLoginEmail(null);
    if (syncEngine) {
      syncEngine.setAutoLoginEmail(null);
      syncEngine.setCredentials(null, null);
    }
  };

  if (config.SERVER_URL) {
    // start monitor via helper (ensures consistent wiring)
    startNetworkMonitor().catch(() => {});
  } else {
    console.log('[Main] no SERVER_URL configured — starting in offline mode');
    isOnline = false;
    // open settings so user can configure server
    try { setTimeout(openSettingsWindow, 300); } catch (e) {}
  }

  // On page reload / navigation, perform fast simultaneous two-way sync
  mainWindow.webContents.on('did-start-loading', () => {
    try {
      if (isOnline) {
        if (operationQueue && operationQueue.countPending() > 0) {
          triggerAutoSync().catch(() => {});
        }
        if (syncEngine) {
          syncEngine.scheduleAutoFullSync(mainWindow.webContents, 200);
        }
      }
    } catch (e) {}
  });

  mainWindow.webContents.on('did-finish-load', async () => {
    // Always inject the status bar / client scripts first — before any async
    // work that might hang or bail early and prevent the injection.
    injectClientScripts();

    // ── Track the logged-in user only when actively authenticated ─────
    try {
      const isLoginPage = await mainWindow.webContents.executeJavaScript(
        '!!(document.querySelector(\'form[action="/login"]\') || document.querySelector(\'input[name="email"]\'))'
      );
      if (isLoginPage) {
        currentSessionEmail = null;
        if (localServer && localServer.setAutoLoginEmail) localServer.setAutoLoginEmail(null);
      } else {
        const userName = await mainWindow.webContents.executeJavaScript(
          '(function(){ try { var el = document.querySelector(\'a[href="/users/profile"]\'); return el ? el.textContent.trim() : null; } catch(e){ return null; } })()'
        );
        if (userName && dataStore) {
          const users = dataStore.getCollection('users') || [];
          const match = users.find(u => u.name && u.name.trim() === userName);
          if (match && match.email && match.email !== currentSessionEmail) {
            currentSessionEmail = match.email;
            if (localServer && localServer.setAutoLoginEmail) localServer.setAutoLoginEmail(currentSessionEmail);
            if (syncEngine) syncEngine.setAutoLoginEmail(currentSessionEmail);
            console.log('[Main] tracked logged-in user:', currentSessionEmail);
          }
        }
      }
    } catch (e) { /* ignore user tracking errors */ }

    try {
      const url = mainWindow.webContents.getURL();
      if (config.SERVER_URL && url.startsWith(config.SERVER_URL)) {
        const html = await mainWindow.webContents.executeJavaScript('document.documentElement.outerHTML');
        try {
          const trimmed = (html || '').trim();
          if (trimmed && !trimmed.startsWith('<') && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
            console.warn('[Main] detected JSON document loaded in main frame — redirecting to server root');
            try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(config.SERVER_URL); } catch (e) {}
            return;
          }
        } catch (e) { /* ignore parsing errors */ }
        const urlObj = new URL(url);
        pageCache.store(urlObj.pathname + (urlObj.search || ''), html);
      }
    } catch (e) { /* ignore */ }
  });

  // Intercept all main-frame navigations to ensure the app ALWAYS stays on the local server
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      if (!targetUrl) return;
      const localBase = `http://127.0.0.1:${config.LOCAL_PORT}`;
      if (targetUrl.startsWith(localBase)) {
        // Allow all local navigations
        return;
      }
      // If navigating to the central server or external link, redirect path to local server
      if (config.SERVER_URL) {
        const base = config.SERVER_URL.replace(/\/$/, '');
        if (targetUrl.startsWith(base)) {
          const urlPath = targetUrl.slice(base.length) || '/';
          event.preventDefault();
          console.log('[Main] Local-First: redirecting server link to local UI:', urlPath);
          mainWindow.loadURL(`http://127.0.0.1:${config.LOCAL_PORT}${urlPath}`);
        }
      }
    } catch (e) { /* ignore */ }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'l' && input.type === 'keyDown') {
      event.preventDefault();
      lockApp();
      return;
    }
    if (input.control && input.key.toLowerCase() === 'p' && input.type === 'keyDown' && !appLocked) {
      event.preventDefault();
      const url = mainWindow.webContents.getURL();
      openPrintPreviewWindow(url);
      return;
    }
    if (!appLocked) {
      lastActivityAt = Date.now();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, _code, _desc, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    const localBase = `http://127.0.0.1:${config.LOCAL_PORT}`;
    if (!validatedURL || !validatedURL.startsWith(localBase)) {
      loadOfflinePage('/');
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      const p = u.pathname || '';

      // If opening Kiosk: load server's real Kiosk directly in the browser
      if (p.includes('/kiosk') || p.includes('/assigned') || u.searchParams.has('kiosk')) {
        let serverKioskUrl = url;
        if (config.SERVER_URL) {
          const serverBase = config.SERVER_URL.replace(/\/$/, '');
          serverKioskUrl = `${serverBase}/kiosk`;
        }
        console.log('[Main] Opening Live Server Kiosk in external browser:', serverKioskUrl);
        shell.openExternal(serverKioskUrl);
        return { action: 'deny' };
      }

      if (p.startsWith('/reports/print') || p.startsWith('/reports/result') || p.includes('print-multiple') || p.includes('/print')) {
        openPrintPreviewWindow(url);
        return { action: 'deny' };
      }
      openChildWindow(url);
      return { action: 'deny' };
    } catch (e) {
      return { action: 'allow' };
    }
  });

  // Detect navigation to dashboard (post-login) and trigger a background full-sync if online
  mainWindow.webContents.on('did-navigate', async (_event, url) => {
    try {
      if (!config.AUTO_FULLSYNC_ON_LOGIN) return;
      if (!config.SERVER_URL || !isOnline) return;
      const localBase = `http://127.0.0.1:${config.LOCAL_PORT}`;
      if (!url || !url.startsWith(localBase)) return;
      const path = url.slice(localBase.length) || '/';
      // when user visits /dashboard after login, trigger background sync
      if (path.startsWith('/dashboard')) {
        const LAST_MIN = 5 * 60 * 1000;
        const now = Date.now();
        if (lastLoginSyncAt && (now - lastLoginSyncAt) < LAST_MIN) return;
        lastLoginSyncAt = now;
        try {
          console.log('[Main] Local-First: dashboard reached — running background full-sync');
          const res = await syncEngine.fullSync(mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null);
          sendStatus();
          if (res && res.success) {
            try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('full-sync-end', res); } catch (e) {}
          }
        } catch (e) { console.error('[Main] login-triggered full-sync failed', e && e.message); }
      }
    } catch (e) { /* ignore */ }
  });

  loadApp();
}

/* ==================================================================
 *  Navigation helpers
 * ================================================================== */
async function loadApp() {
  console.log(`[Main] Local-First: loading standalone UI on http://127.0.0.1:${config.LOCAL_PORT}`);
  try {
    await mainWindow.loadURL(`http://127.0.0.1:${config.LOCAL_PORT}/`);
    sendStatus();
  } catch (e) {
    console.error('[Main] failed to load local server URL:', e && e.message);
  }

  // If server is configured and online, perform background sync
  if (config.SERVER_URL && isOnline) {
    setTimeout(async () => {
      try {
        console.log('[Main] online on startup — running background full-sync');
        await syncEngine.fullSync(mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null);
        sendStatus();
      } catch (e) {
        console.warn('[Main] startup full-sync failed:', e && e.message);
      }
    }, 1500);
  }
}

function loadOfflinePage(urlPath) {
  mainWindow.loadURL(`http://127.0.0.1:${config.LOCAL_PORT}${urlPath || '/'}`);
}

/* ==================================================================
 *  Request interceptor
 * ================================================================== */
function setupRequestInterceptor() {
  const ses = session.fromPartition('persist:lis');

  if (!config.SERVER_URL) return;

  ses.webRequest.onBeforeRequest({ urls: [`${config.SERVER_URL}/*`] }, (details, callback) => {
    try {
      // ONLY redirect top-level user browser window navigations from remote URL to local server
      if (details.resourceType === 'main_frame' || details.resourceType === 'sub_frame') {
        const urlObj = new URL(details.url);
        const urlPath = urlObj.pathname + (urlObj.search || '');
        return callback({ redirectURL: `http://127.0.0.1:${config.LOCAL_PORT}${urlPath}` });
      }

      // Allow ALL background sync requests, API calls, net.request, login POST, exports to reach the real server
      callback({});
    } catch (e) {
      callback({});
    }
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
ipcMain.handle('get-status', () => ({ online: isOnline, pendingCount: operationQueue.countPending(), serverUrl: config.SERVER_URL, serverConfigured: !!config.SERVER_URL, cachedPages: pageCache.list().length, lastFullSync: dataStore ? dataStore.getMeta('lastFullSync') : null }));
ipcMain.handle('get-queue', () => operationQueue.getAll());
ipcMain.handle('queue-operation', (_e, operation) => { operationQueue.add(operation); return { success: true, pendingCount: operationQueue.countPending() }; });
ipcMain.handle('force-sync', async () => { if (!isOnline) return { success: false, reason: 'offline' }; const synced = await syncEngine.processQueue(); sendStatus(); return { success: true, synced }; });
ipcMain.handle('full-sync', async () => {
  if (!config.SERVER_URL) return { success: false, reason: 'no-server-configured' };
  try {
    // Notify renderer that full-sync is starting
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('full-sync-progress', { phase: 'start' }); } catch (e) {}
    const res = await syncEngine.fullSync(mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null);
    sendStatus();
    // include datastore info when available
    const dsInfo = dataStore ? dataStore.info() : null;
    // notify renderer that full-sync ended
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('full-sync-end', Object.assign({}, res || {}, { datastore: dsInfo })); } catch (e) {}
    return Object.assign({}, res || {}, { datastore: dsInfo });
  } catch (e) { return { success: false, reason: e && e.message } }
});
async function triggerAutoSync() {
  try {
    if (!isOnline || !syncEngine || !operationQueue) return;
    const pending = operationQueue.countPending();
    if (pending === 0 || syncEngine._syncing) return;
    console.log(`[Main] triggerAutoSync starting — ${pending} pending operation(s)`);
    const synced = await syncEngine.processQueue();
    const remaining = operationQueue ? operationQueue.countPending() : 0;
    sendStatus();
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('sync-complete', { synced, remaining });
      }
    } catch (e) {}
    if (remaining === 0 && synced > 0) {
      console.log('[Main] auto-sync completed all items — running full-sync');
      try { if (pageCache && typeof pageCache.clear === 'function') pageCache.clear(); } catch (e) {}
      await syncEngine.fullSync(mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null, { replace: true });
      sendStatus();
    }
  } catch (e) {
    console.error('[Main] triggerAutoSync failed:', e && e.message);
  }
}

ipcMain.handle('retry-connection', async () => {
  if (!config.SERVER_URL) return { online: false, reason: 'no-server-configured' };
  if (!networkMonitor) networkMonitor = new NetworkMonitor(config.SERVER_URL, config.PING_INTERVAL);
  const online = await networkMonitor.checkOnce();
  isOnline = online;
  sendStatus();
  if (online) {
    triggerAutoSync().catch(() => {});
  }
  return { online };
});
ipcMain.handle('datastore-info', () => {
  try { return dataStore ? dataStore.info() : { exists: false, reason: 'no-datastore' }; } catch (e) { return { exists: false, error: e && e.message }; }
});
ipcMain.handle('clear-cache', () => { pageCache.clear(); return { success: true }; });
ipcMain.handle('go-online', () => {
  if (!config.SERVER_URL) return { success: false, reason: 'no-server-configured' };
  if (networkMonitor) {
    networkMonitor.checkOnce().then(online => {
      isOnline = online;
      sendStatus();
      if (online) triggerAutoSync().catch(() => {});
    }).catch(() => {});
  }
  return { success: true };
});

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

// Thermal Printer Test IPC
ipcMain.handle('test-thermal-print', async (_e, { printer }) => {
  try {
    const { spawnSync } = require('child_process');
    const scriptPath = path.join(__dirname, 'scripts', 'thermal_test.js');
    if (!fs.existsSync(scriptPath)) {
      return { success: false, reason: 'thermal_test.js not found' };
    }
    const targetPrinter = printer || userSettings.printerName || userSettings.printer || process.env.PRINTER_NAME || undefined;
    const args = [scriptPath, '--receipt'];
    if (targetPrinter) args.push('--printer', targetPrinter);

    const spawnEnv = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
    const proc = spawnSync(process.execPath, args, { cwd: __dirname, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env: spawnEnv });
    if (proc.error) {
      console.error('[Thermal] spawn error:', proc.error);
      return { success: false, reason: String(proc.error) };
    }
    if (proc.status !== 0) {
      console.error('[Thermal] print failed:', proc.stderr || proc.stdout);
      return { success: false, reason: proc.stderr || proc.stdout || ('Exit code: ' + proc.status) };
    }
    return { success: true, output: proc.stdout };
  } catch (e) {
    return { success: false, reason: e && e.message };
  }
});

// Security IPC Handlers
ipcMain.handle('get-security-settings', () => ({
  lockTimeout: getLockTimeoutMinutes(),
  isLocked: appLocked,
  hasDefaultPin: getLockPin() === '0000'
}));

ipcMain.handle('change-pin', (_e, { currentPin, newPin }) => {
  const currentStored = getLockPin();
  if (String(currentPin).trim() !== currentStored) {
    return { success: false, reason: 'Current PIN is incorrect.' };
  }
  const cleanNew = String(newPin || '').trim();
  if (!/^\d{4}$/.test(cleanNew)) {
    return { success: false, reason: 'New PIN must be exactly 4 numeric digits.' };
  }
  saveUserSettings({ lockPin: cleanNew });
  return { success: true };
});

ipcMain.handle('set-lock-timeout', (_e, { timeoutMinutes }) => {
  const parsed = parseInt(timeoutMinutes, 10);
  saveUserSettings({ lockTimeout: isNaN(parsed) ? 10 : parsed });
  lastActivityAt = Date.now();
  return { success: true, timeout: getLockTimeoutMinutes() };
});

ipcMain.handle('lock-app', () => {
  lockApp();
  return { success: true };
});

ipcMain.handle('unlock-app', (_e, { pin }) => {
  return unlockApp(pin);
});

ipcMain.handle('report-activity', () => {
  lastActivityAt = Date.now();
  return { success: true };
});

// Application Logs & Diagnostics IPC
ipcMain.handle('get-recent-logs', async () => {
  try {
    const { getRecentLogs, getLogPath } = require('./lib/appLogger');
    return {
      logs: getRecentLogs(300),
      path: getLogPath()
    };
  } catch (e) {
    return { logs: 'Error reading logs: ' + (e && e.message), path: '' };
  }
});

ipcMain.handle('export-logs', async () => {
  try {
    const { getLogPath } = require('./lib/appLogger');
    const logPath = getLogPath();
    if (!fs.existsSync(logPath)) {
      return { success: false, message: 'No log file found to export.' };
    }
    const defaultName = `gezyne-lis-logs-${new Date().toISOString().slice(0, 10)}.log`;
    const targetWin = global._settingsWindow || mainWindow;
    const res = await dialog.showSaveDialog(targetWin, {
      title: 'Export Application Logs',
      defaultPath: path.join(app.getPath('downloads') || app.getPath('documents'), defaultName),
      filters: [{ name: 'Log Files', extensions: ['log', 'txt'] }]
    });
    if (res.canceled || !res.filePath) {
      return { success: false, message: 'Export canceled.' };
    }
    fs.copyFileSync(logPath, res.filePath);
    return { success: true, path: res.filePath, message: 'Logs exported to ' + res.filePath };
  } catch (e) {
    return { success: false, message: 'Export failed: ' + (e && e.message) };
  }
});

ipcMain.handle('clear-logs', async () => {
  try {
    const { clearLogFile } = require('./lib/appLogger');
    clearLogFile();
    return { success: true };
  } catch (e) {
    return { success: false, message: e && e.message };
  }
});

// Discard local queued changes and attempt full-sync (triggered from renderer settings)
ipcMain.handle('discard-local-changes', async () => {
  try {
    // Backup current data
    try { performBackup(); } catch (e) { console.warn('[Main] backup before discard failed', e && e.message); }
    // Clear pending queue
    try { if (operationQueue && typeof operationQueue.clearAll === 'function') operationQueue.clearAll(); } catch (e) { console.error('[Main] failed to clear operation queue', e); }
    // Attempt full-sync to refresh local datastore
    try {
      if (!config.SERVER_URL) return { success: false, reason: 'no-server-configured' };
      const res = await syncEngine.fullSync(mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null);
      sendStatus();
      return Object.assign({ success: true }, res || {});
    } catch (e) {
      console.error('[Main] discard-local-changes fullSync failed', e && e.message);
      return { success: false, reason: e && e.message };
    }
  } catch (e) {
    console.error('[Main] discard-local-changes failed', e && e.message);
    return { success: false, reason: e && e.message };
  }
});

// Drop offline data and replace with server export (destructive)
ipcMain.handle('drop-offline-data', async () => {
  try {
    try { performBackup(); } catch (e) { console.warn('[Main] backup before drop failed', e && e.message); }
    if (!config.SERVER_URL) return { success: false, reason: 'no-server-configured' };
    const engine = syncEngine;
    const { net } = require('electron');
    const base = config.SERVER_URL.replace(/\/$/, '');
    const candidateUrls = [base + '/export/data.json', base + '/data.json'];
    let fetched = null;
    let lastErr = null;
    for (const url of candidateUrls) {
      try { fetched = await engine._fetchJson(net, url); if (fetched) break; } catch (e) { lastErr = e; }
    }
    if (!fetched || typeof fetched !== 'object') return { success: false, reason: (lastErr && lastErr.message) ? lastErr.message : 'no-data' };
    // Overwrite DataStore
    try {
      if (dataStore) {
        if (Array.isArray(fetched.users)) dataStore.setCollection('users', fetched.users);
        if (Array.isArray(fetched.patients)) dataStore.setCollection('patients', fetched.patients);
        if (Array.isArray(fetched.tests)) dataStore.setCollection('tests', fetched.tests);
        if (Array.isArray(fetched.templates)) dataStore.setCollection('templates', fetched.templates);
        if (fetched.counters && typeof fetched.counters === 'object') { dataStore._data.counters = fetched.counters; }
        try { dataStore._save(); } catch (e) {}
        try { dataStore.setMeta('lastFullSync', new Date().toISOString()); } catch (e) {}
      }
      // Recreate the in-memory offline DB so route handlers use fresh data
      try {
        const { createOfflineDb } = require('./lib/offlineDb');
        if (typeof createOfflineDb === 'function' && dataStore) {
          global.db = createOfflineDb(dataStore);
          console.log('[Main] recreated global.db from DataStore after drop');
        }
      } catch (e) { console.warn('[Main] failed to recreate global.db', e && e.message); }
      if (operationQueue && typeof operationQueue.clearAll === 'function') operationQueue.clearAll();
      // Clear page cache so any cached server HTML won't be served
      try { if (pageCache && typeof pageCache.clear === 'function') pageCache.clear(); } catch (e) {}
      sendStatus();
      const importedCount = (Array.isArray(fetched.patients) ? fetched.patients.length : 0);
      // Notify renderer that full-sync-like replacement completed so it can reload.
      // Then force a main-window reload (ignore cache) so the current page reflects
      // the recreated `global.db` and cleared page cache.
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('full-sync-end', { success: true, imported: importedCount, datastore: dataStore ? dataStore.info() : null });
          mainWindow.webContents.send('drop-offline-complete', { success: true, imported: importedCount });
          // Give the renderer a brief moment to process the IPC, then reload
          setTimeout(() => {
            try {
              if (mainWindow && !mainWindow.isDestroyed()) {
                if (typeof mainWindow.webContents.reloadIgnoringCache === 'function') {
                  mainWindow.webContents.reloadIgnoringCache();
                } else if (typeof mainWindow.webContents.reload === 'function') {
                  mainWindow.webContents.reload();
                }
              }
            } catch (e) { /* ignore reload errors */ }
          }, 250);
        }
      } catch (e) {}
      return { success: true, imported: importedCount };
    } catch (e) {
      console.error('[Main] failed to apply fetched server data', e && e.message);
      return { success: false, reason: e && e.message };
    }
  } catch (e) { console.error('[Main] drop-offline-data failed', e && e.message); return { success: false, reason: e && e.message }; }
});

// Credential capture — securely store login credentials for server re-auth
ipcMain.handle('save-credentials', (_e, { email, password }) => {
  try {
    saveUserSettings({ _syncEmail: email, _syncPassword: password });
    if (syncEngine) syncEngine.setCredentials(email, password);
    if (syncEngine) syncEngine.setAutoLoginEmail(email);
    // Also update the session email for auto-login
    if (email && email !== currentSessionEmail) {
      currentSessionEmail = email;
      saveUserSettings({ lastUserEmail: email });
      if (localServer && localServer.setAutoLoginEmail) localServer.setAutoLoginEmail(email);
    }
    console.log('[Main] stored credentials for server re-auth:', email);
    return { success: true };
  } catch (e) {
    return { success: false, error: e && e.message };
  }
});

// Perform manual backup of SQLite DB and queue
ipcMain.handle('perform-backup', async () => {
  try {
    const files = performBackup();
    return { success: !!(files && files.length), files: files || [] };
  } catch (e) {
    return { success: false, error: e && e.message };
  }
});

// Delete specific queued mutation
ipcMain.handle('delete-queue-item', async (_e, id) => {
  try {
    if (!operationQueue || !id) return { success: false, reason: 'invalid-id' };
    const initialLen = operationQueue.operations.length;
    operationQueue.operations = operationQueue.operations.filter(o => o.id !== id);
    if (operationQueue.operations.length !== initialLen) {
      operationQueue._save();
      sendStatus();
      return { success: true, pendingCount: operationQueue.countPending() };
    }
    return { success: false, reason: 'not-found' };
  } catch (e) {
    return { success: false, error: e && e.message };
  }
});

// Clear all pending operations
ipcMain.handle('clear-queue', async () => {
  try {
    if (!operationQueue) return { success: false, reason: 'no-queue' };
    operationQueue.clearAll();
    sendStatus();
    return { success: true };
  } catch (e) {
    return { success: false, error: e && e.message };
  }
});

/* ==================================================================
 *  Print preview and child windows
 * ================================================================== */
function openPrintPreviewWindow(url) {
  if (openPrintPreviewWindow._busy) { console.log('[Print] already generating preview, skipping duplicate'); return; }
  openPrintPreviewWindow._busy = true;

  // Normalize URL to local server loopback
  let targetUrl = url;
  try {
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `http://127.0.0.1:${config.LOCAL_PORT}${targetUrl.startsWith('/') ? '' : '/'}${targetUrl}`;
    } else if (config.SERVER_URL && targetUrl.startsWith(config.SERVER_URL.replace(/\/$/, ''))) {
      targetUrl = targetUrl.replace(config.SERVER_URL.replace(/\/$/, ''), `http://127.0.0.1:${config.LOCAL_PORT}`);
    }
  } catch (_) {}

  console.log('[Print] opening print preview for:', targetUrl);

  const sourceWin = new BrowserWindow({
    width: 800,
    height: 1100,
    show: false,
    icon: appIcon || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload-print.js'),
      nodeIntegration: false,
      contextIsolation: true,
      partition: 'persist:lis'
    }
  });

  sourceWin.loadURL(targetUrl);
  sourceWin.webContents.on('dom-ready', () => {
    sourceWin.webContents.executeJavaScript('window.print = function(){}; void 0;').catch(() => {});
  });

  const stallTimer = setTimeout(() => {
    console.error('[Print] PDF generation stalled — forcing cleanup');
    try { if (sourceWin && !sourceWin.isDestroyed()) sourceWin.close(); } catch {}
    openPrintPreviewWindow._busy = false;
  }, 30000);

  sourceWin.webContents.on('did-finish-load', async () => {
    await sourceWin.webContents.executeJavaScript('window.print = function(){}; void 0;').catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    try {
      const pdfBuffer = await sourceWin.webContents.printToPDF({
        printBackground: true,
        preferCSSPageSize: true,
        margins: { marginType: 'none' }
      });
      try { sourceWin.close(); } catch {}
      const tmpDir = path.join(userDataPath, 'temp-pdfs');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const pdfPath = path.join(tmpDir, `report-${Date.now()}.pdf`);
      fs.writeFileSync(pdfPath, pdfBuffer);
      console.log('[Print] PDF generated successfully at:', pdfPath);

      // Open in-app dedicated print preview window with PDF.js viewer
      const previewWin = new BrowserWindow({
        width: 1020,
        height: 900,
        title: 'Print Preview — Gezyne LIS',
        icon: appIcon || undefined,
        backgroundColor: '#0f172a',
        webPreferences: {
          preload: path.join(__dirname, 'preload-print.js'),
          nodeIntegration: false,
          contextIsolation: true,
        }
      });
      previewWin.loadFile(path.join(__dirname, 'renderer', 'print-preview.html'), {
        query: { pdf: pdfPath }
      });
      previewWin.once('ready-to-show', () => {
        try { previewWin.show(); } catch {}
      });
      previewWin.on('closed', () => {
        setTimeout(() => { try { if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath); } catch {} }, 5000);
      });
    } catch (err) {
      console.error('[Print] PDF generation failed:', err);
      try { sourceWin.close(); } catch {}
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.print();
    }
    clearTimeout(stallTimer);
    openPrintPreviewWindow._busy = false;
  });

  sourceWin.webContents.on('did-fail-load', () => {
    console.error('[Print] source window failed to load');
    try { sourceWin.close(); } catch {}
    openPrintPreviewWindow._busy = false;
    try { clearTimeout(stallTimer); } catch(e) {}
  });
}

function openChildWindow(url) {
  try {
    let targetUrl = url;
    try {
      const u = new URL(url);
      u.searchParams.set('popup', '1');
      targetUrl = u.toString();
    } catch (e) {
      targetUrl = url + (url.includes('?') ? '&' : '?') + 'popup=1';
    }
    const child = new BrowserWindow({ width: 1040, height: 850, title: 'Report Preview — Gezyne LIS', icon: appIcon || undefined, webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, partition: 'persist:lis' } });
    child.loadURL(targetUrl).catch(() => {});
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
        if (p.startsWith('/reports/print') || p.startsWith('/reports/result') || p.includes('print-multiple') || p.includes('/print')) { openPrintPreviewWindow(newUrl); return { action: 'deny' }; }
        openChildWindow(newUrl);
        return { action: 'deny' };
      } catch (e) { return { action: 'allow' }; }
    });
  } catch (e) { console.error('[Main] openChildWindow failed:', e && e.message); }
}

ipcMain.handle('print-preview', async (_e, { url }) => { openPrintPreviewWindow(url); return { success: true }; });
ipcMain.handle('read-pdf-file', async (_e, { filePath }) => { try { if (filePath && fs.existsSync(filePath)) { const buffer = fs.readFileSync(filePath); return new Uint8Array(buffer); } } catch (e) { console.error('[Print] read-pdf-file failed:', e); } return null; });
ipcMain.handle('save-pdf', async (_e, { sourcePath }) => { const result = await dialog.showSaveDialog(mainWindow, { title: 'Save Report PDF', defaultPath: 'LIS-Report.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (!result.canceled && result.filePath) { fs.copyFileSync(sourcePath, result.filePath); return { success: true, path: result.filePath }; } return { success: false }; });
ipcMain.handle('get-printers', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      const printers = await win.webContents.getPrintersAsync();
      return printers || [];
    }
  } catch (e) {
    console.error('[Print] getPrintersAsync error:', e);
  }
  return [];
});

ipcMain.handle('print-silent', async (event, opts = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      const marginType = opts.margins || 'none';
      const printOpts = {
        silent: true,
        deviceName: opts.printerName || undefined,
        copies: parseInt(opts.copies, 10) || 1,
        color: opts.color !== undefined ? !!opts.color : true,
        landscape: opts.orientation === 'landscape',
        printBackground: true,
        margins: { marginType: marginType }
      };
      if (opts.pageSize && opts.pageSize !== 'Default') {
        printOpts.pageSize = opts.pageSize;
      }
      if (opts.scaleFactor && !isNaN(opts.scaleFactor)) {
        printOpts.scaleFactor = parseInt(opts.scaleFactor, 10);
      }
      return new Promise((resolve) => {
        win.webContents.print(printOpts, (success, failureReason) => {
          if (!success) console.warn('[Print] silent print result:', success, failureReason);
          resolve({ success, failureReason });
        });
      });
    }
  } catch (e) {
    console.error('[Print] print-silent error:', e);
    return { success: false, error: e && e.message };
  }
  return { success: false };
});

ipcMain.handle('print-current-window', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.webContents.print({ silent: false });
      return { success: true };
    }
  } catch (e) { console.error('[Print] print-current-window error:', e); }
  return { success: false };
});
ipcMain.handle('close-current-window', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
      return { success: true };
    }
  } catch (e) { console.error('[Print] close-current-window error:', e); }
  return { success: false };
});

/* ==================================================================
 *  System tray
 * ================================================================== */
function createTray() {
  try {
    const trayIcon = appIcon ? appIcon.resize({ width: 16, height: 16 }) : nativeImage.createEmpty();
    tray = new Tray(trayIcon);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Gezyne LIS', click: () => mainWindow && mainWindow.show() },
      { label: '🔒 Lock App (Ctrl+L)', click: () => lockApp() },
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
  // Ensure all network timers and full-sync intervals are stopped
  // so the Node event loop can exit cleanly before quitting.
  try { stopNetworkMonitor().catch(() => {}); } catch (e) { if (networkMonitor) try { networkMonitor.stop(); } catch {} }
  try { if (localServer) localServer.close(); } catch (e) {}
  app.quit();
});

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

app.whenReady().then(() => {
  createWindow();
  createTray();
  startLockCheckTimer();
});
