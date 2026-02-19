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

      if (online && !wasOnline) {
        console.log('[Main] connection restored — syncing queue…');
        const synced = await syncEngine.processQueue();
        const remaining = operationQueue ? operationQueue.countPending() : 0;
        sendStatus();
        // Stay on current page — do NOT force-reload to the server URL.
        // The user keeps working on the local server seamlessly. When they
        // explicitly click "Connect" or "Refresh" they will switch to the
        // real server.  Background full-sync keeps data up-to-date.
        try {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('sync-complete', { synced, remaining });
          }
        } catch (e) { /* ignore */ }

        // After replaying the queue, trigger a full-sync to pull fresh data
        try {
          if (remaining === 0) {
            console.log('[Main] queue empty — triggering full-sync');
            await syncEngine.fullSync(mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null);
            sendStatus();
          }
        } catch (e) { console.error('[Main] post-reconnect full-sync failed:', e && e.message); }
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

    networkMonitor.start();
    setupRequestInterceptor();
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
  currentSessionEmail = userSettings.lastUserEmail || null;

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
  syncEngine = new SyncEngine(operationQueue, config, dataStore);
  localServer = createLocalServer(pageCache, operationQueue, config, dataStore);

  // Load stored credentials for server re-authentication during sync
  if (userSettings._syncEmail && userSettings._syncPassword) {
    syncEngine.setCredentials(userSettings._syncEmail, userSettings._syncPassword);
  }
  // Always set the auto-login email so hash-based auth fallback works
  if (currentSessionEmail) {
    syncEngine.setAutoLoginEmail(currentSessionEmail);
  }

  // Activate auto-login on the local server so offline transitions are seamless
  if (currentSessionEmail && localServer && localServer.setAutoLoginEmail) {
    localServer.setAutoLoginEmail(currentSessionEmail);
  }

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
    // Always inject the status bar / client scripts first — before any async
    // work that might hang or bail early and prevent the injection.
    injectClientScripts();

    // ── Track the logged-in user for seamless offline auto-login ─────
    try {
      const userName = await mainWindow.webContents.executeJavaScript(
        '(function(){ try { var el = document.querySelector(\'a[href="/users/profile"]\'); return el ? el.textContent.trim() : null; } catch(e){ return null; } })()'
      );
      if (userName && dataStore) {
        const users = dataStore.getCollection('users') || [];
        const match = users.find(u => u.name && u.name.trim() === userName);
        if (match && match.email && match.email !== currentSessionEmail) {
          currentSessionEmail = match.email;
          try { saveUserSettings({ lastUserEmail: currentSessionEmail }); } catch (e) {}
          if (localServer && localServer.setAutoLoginEmail) localServer.setAutoLoginEmail(currentSessionEmail);
          if (syncEngine) syncEngine.setAutoLoginEmail(currentSessionEmail);
          console.log('[Main] tracked logged-in user:', currentSessionEmail);
        }
      }
    } catch (e) { /* ignore user tracking errors */ }

    // ── Detect explicit logout (landed on login page with no session) ──
    try {
      const currentUrl = mainWindow.webContents.getURL();
      const localBase = `http://127.0.0.1:${config.LOCAL_PORT}`;
      // If on login page of real server or local server
      const isServerRoot = config.SERVER_URL && currentUrl === config.SERVER_URL.replace(/\/$/, '') + '/';
      const isLocalRoot = currentUrl === localBase + '/';
      if (isServerRoot || isLocalRoot) {
        // Check if the page is actually the login page (has login form)
        const hasLoginForm = await mainWindow.webContents.executeJavaScript(
          '!!(document.querySelector(\'form[action="/login"]\') || document.querySelector(\'input[name="email"]\'))'
        );
        // Only clear auto-login if user explicitly logged out (no auto-login
        // email means they arrived here naturally)
        // We DON'T clear auto-login here — the auto-login middleware will
        // redirect them away from the login page via requireGuest.
      }
    } catch (e) { /* ignore */ }

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

  // When offline, intercept all main-frame navigations to the server and
  // redirect them to the local offline server instead. The local server now
  // renders full EJS pages so users can navigate the entire app offline.
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      if (!config.SERVER_URL) return;
      // When online, let the navigation go to the real server
      if (isOnline) return;
      const base = config.SERVER_URL.replace(/\/$/, '');
      if (!targetUrl || !targetUrl.startsWith(base)) return;
      const urlPath = targetUrl.slice(base.length) || '/';
      event.preventDefault();
      console.log('[Main] offline — redirecting navigation to local server:', urlPath);
      try {
        mainWindow.loadURL(`http://127.0.0.1:${config.LOCAL_PORT}${urlPath}`);
      } catch (e) { loadOfflinePage(urlPath); }
    } catch (e) { /* ignore */ }
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

  // Detect navigation to dashboard (post-login) and trigger a full-sync
  mainWindow.webContents.on('did-navigate', async (_event, url) => {
    try {
      // ── Session-loss detection: if the user lands on the real server's
      //    login page while we have a tracked user, the server must have
      //    restarted and lost its sessions.  Redirect to the local server
      //    so the auto-login middleware creates a new session seamlessly.
      if (config.SERVER_URL && currentSessionEmail) {
        const base = config.SERVER_URL.replace(/\/$/, '');
        if (url === base + '/' || url === base) {
          try {
            const isLoginPage = await mainWindow.webContents.executeJavaScript(
              "!!(document.querySelector('form[action=\"/login\"]') || document.querySelector('input[name=\"email\"]'))"
            );
            if (isLoginPage) {
                  // Debounce repeated re-auth attempts
                  const now = Date.now();
                  if (now - lastSessionAuthAt < 10000) {
                    console.log('[Main] recent re-auth attempt in last 10s — skipping');
                    return;
                  }
                  lastSessionAuthAt = now;
                  console.log('[Main] session lost on real server — attempting re-auth before switching to local server');
                  try {
                    // Try to re-authenticate using stored credentials (SyncEngine)
                    const authPromise = (syncEngine && typeof syncEngine._ensureServerAuth === 'function') ? syncEngine._ensureServerAuth() : Promise.resolve(false);
                    // Timeout the auth attempt to avoid hanging the UI (8s)
                    const timeout = new Promise(r => setTimeout(() => r(false), 8000));
                    const authOk = await Promise.race([authPromise, timeout]);
                    if (authOk) {
                      console.log('[Main] re-auth succeeded — staying on real server');
                      // reload root so session-backed redirects will occur
                      try { if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(config.SERVER_URL); } catch (e) {}
                      lastSessionAuthAt = Date.now();
                      return;
                    }
                  } catch (e) { console.warn('[Main] re-auth attempt failed:', e && e.message); }
                  console.log('[Main] switching to local server after failed re-auth');
                  mainWindow.loadURL(`http://127.0.0.1:${config.LOCAL_PORT}/`);
                  return;
                } else {
              console.log('[Main] landed on server root but no login form detected — staying with real server');
            }
          } catch (e) {
            console.warn('[Main] login detection failed, not switching to local server:', e && e.message);
          }
        }
      }
    } catch (e) { /* ignore */ }
    try {
      if (!config.AUTO_FULLSYNC_ON_LOGIN) return;
      if (!config.SERVER_URL) return;
      const base = config.SERVER_URL.replace(/\/$/, '');
      if (!url || !url.startsWith(base)) return;
      const path = url.slice(base.length) || '/';
      // when server redirects to /dashboard after login, trigger an immediate full-sync
      if (path.startsWith('/dashboard')) {
        const LAST_MIN = 5 * 60 * 1000;
        const now = Date.now();
        if (lastLoginSyncAt && (now - lastLoginSyncAt) < LAST_MIN) return; // avoid repeats
        lastLoginSyncAt = now;
        try {
          console.log('[Main] detected dashboard navigation — running full-sync');
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
  // The local server now renders full EJS pages with DataStore data,
  // so always redirect there for offline viewing.
  mainWindow.loadURL(`http://127.0.0.1:${config.LOCAL_PORT}${urlPath}`);
}

/* ==================================================================
 *  Request interceptor
 * ================================================================== */
function setupRequestInterceptor() {
  const ses = session.fromPartition('persist:lis');

  ses.webRequest.onBeforeRequest({ urls: [`${config.SERVER_URL}/*`] }, (details, callback) => {
    // Track explicit logout so we can clear auto-login state
    try {
      if (details.method === 'POST') {
        const urlObj = new URL(details.url);
        if (urlObj.pathname === '/logout') {
          currentSessionEmail = null;
          if (localServer && localServer.setAutoLoginEmail) localServer.setAutoLoginEmail(null);
          try { saveUserSettings({ lastUserEmail: '' }); } catch (e) {}
          console.log('[Main] explicit logout detected — cleared auto-login');
        }
      }
    } catch (e) { /* ignore */ }

    if (isOnline) return callback({});

    // When offline, redirect ALL requests to the local server which now
    // renders full EJS pages and serves DataStore-backed JSON endpoints.
    try {
      const urlObj = new URL(details.url);
      const urlPath = urlObj.pathname + (urlObj.search || '');

      // For non-GET methods (POST/PUT/DELETE), queue the operation
      if (details.method !== 'GET') {
        // Don't queue auth operations (login/logout) — they are local-only
        if (urlPath === '/login' || urlPath === '/logout') {
          callback({ redirectURL: `http://127.0.0.1:${config.LOCAL_PORT}${urlPath}` });
          return;
        }
        const body = parseUploadData(details.uploadData);
        operationQueue.add({ method: details.method, url: details.url, body, timestamp: new Date().toISOString() });
        // Redirect to local server so the route handler processes the form
        // (which will also save to DataStore for offline mutations)
        callback({ redirectURL: `http://127.0.0.1:${config.LOCAL_PORT}${urlPath}` });
        return;
      }

      // Skip static asset extensions — let Electron cache handle those
      if (/\.(js|css|png|jpg|jpeg|svg|woff2?|ico|map|mp3|mp4|webp|ttf|eot)$/i.test(urlPath)) {
        return callback({});
      }

      // Redirect all GET requests to the local server
      console.log('[Intercept] offline — redirecting to local server:', details.method, urlPath);
      callback({ redirectURL: `http://127.0.0.1:${config.LOCAL_PORT}${urlPath}` });
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
ipcMain.handle('retry-connection', async () => {
  if (!config.SERVER_URL) return { online: false, reason: 'no-server-configured' };
  if (!networkMonitor) networkMonitor = new NetworkMonitor(config.SERVER_URL, config.PING_INTERVAL);
  const online = await networkMonitor.checkOnce();
  isOnline = online;
  sendStatus();
  // Don't force-load the real server URL here — the user stays on the
  // local server. If the server is back, the status bar will update to
  // "Connected" and background sync will keep data up to date.
  return { online };
});
ipcMain.handle('datastore-info', () => {
  try { return dataStore ? dataStore.info() : { exists: false, reason: 'no-datastore' }; } catch (e) { return { exists: false, error: e && e.message }; }
});
ipcMain.handle('clear-cache', () => { pageCache.clear(); return { success: true }; });
ipcMain.handle('go-online', () => {
  if (!config.SERVER_URL) return { success: false, reason: 'no-server-configured' };
  // Don't force-load real server — stay on local server to prevent logout
  // after server restarts.  Trigger a sync check instead.
  if (networkMonitor) networkMonitor.checkOnce().then(online => { isOnline = online; sendStatus(); }).catch(() => {});
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
      if (operationQueue && typeof operationQueue.clearAll === 'function') operationQueue.clearAll();
      sendStatus();
      return { success: true, imported: (Array.isArray(fetched.patients) ? fetched.patients.length : 0) };
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
});
