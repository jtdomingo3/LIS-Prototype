const { app, Tray, Menu, nativeImage, shell, dialog, BrowserWindow, ipcMain } = require('electron');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// ensure only a single instance of the tray helper can run at once.  If a
// second instance is launched we let the first one handle the request; the
// second exits immediately.  When the first instance receives the
// `second-instance` event we restart ourselves so that re-running the
// executable behaves like "restart and run" as requested by the user.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // another instance is running - immediately quit this one; prevent any
  // further initialization or UI creation by exiting the process.
  console.log('[tray] second-instance startup: exiting new copy');
  // give Electron a moment to clean up
  app.quit();
  process.exit(0);
} else {
  // guard against recursive relaunch loops.  once we start handling a
  // second-instance event we ignore further ones until the app actually
  // exits.
  let secondInstanceHandled = false;
  app.on('second-instance', () => {
    if (secondInstanceHandled) return;
    secondInstanceHandled = true;
    console.log('[tray] second-instance detected, relaunching');
    try { appendLog('[tray] second-instance detected, relaunching'); } catch (e) {}
    app.relaunch();
    // exit on next tick to allow relaunch to spawn cleanly
    setImmediate(() => app.exit(0));
  });
}

// global error handler to suppress harmless "Object has been destroyed"
process.on('uncaughtException', (err) => {
  if (err && String(err).includes('Object has been destroyed')) {
    // ignore
    return;
  }
  // otherwise let it print so we can diagnose
  console.error('[tray] uncaught exception', err);
});


const SERVICE_NAME = 'GezyneLIS';
const PORT = process.env.PORT || 3000;

function getNetworkAddresses() {
  const port = process.env.PORT || 3000;
  const nets = os.networkInterfaces();
  const all = [];
  const physical = [];

  for (const name of Object.keys(nets)) {
    const isVirtualName = /virtual|vbox|vmware|vethernet|wsl|docker|loopback|bluetooth|hyper-v/i.test(name);
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        const addr = net.address;
        if (!addr || addr.startsWith('169.254')) continue;
        const isVirtualIp = addr.startsWith('192.168.56.'); // Common VirtualBox Host-Only IP range
        const isVirtual = isVirtualName || isVirtualIp;
        
        const item = {
          name,
          address: addr,
          url: `http://${addr}:${port}`,
          isVirtual
        };
        all.push(item);
        if (!isVirtual) {
          physical.push(item);
        }
      }
    }
  }

  // Preferred network LAN address: first non-virtual IPv4, else first available IPv4, else 127.0.0.1
  const primaryNet = physical.length > 0 ? physical[0] : (all.length > 0 ? all[0] : null);
  const networkIp = primaryNet ? primaryNet.address : (process.env.HOST || 'localhost');

  return {
    port,
    localUrl: `http://localhost:${port}`,
    localHostIp: '127.0.0.1',
    networkUrl: `http://${networkIp}:${port}`,
    networkIp: networkIp,
    primaryName: primaryNet ? primaryNet.name : 'Local Network',
    allAddresses: all,
    hasMultiple: all.length > 1
  };
}

function getLocalIp() {
  if (process.env.HOST) return process.env.HOST;
  const netInfo = getNetworkAddresses();
  return netInfo.networkIp;
}

const HOST = getLocalIp();
const URL = `http://${HOST}:${PORT}`;
const PROJECT_ROOT = path.join(__dirname, '..');

// Determine where the server entrypoint lives in dev vs packaged installer
let SERVER_DIR = PROJECT_ROOT;
let SERVER_SCRIPT = path.join(SERVER_DIR, 'server.js');
let SERVER_IS_EXE = false;

(function locateServer() {
  const candidates = [
    path.join(PROJECT_ROOT, 'server.js'),
    path.join(PROJECT_ROOT, 'server', 'server.js'),
    path.join(process.resourcesPath || '', 'server.js'),
    path.join(process.resourcesPath || '', 'server', 'server.js'),
    path.join(PROJECT_ROOT, '..', 'server.js')
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) { SERVER_SCRIPT = c; SERVER_DIR = path.dirname(c); return; } } catch (e) {}
  }
  // fallback: packaged EXE names we might bundle in installer
  const exeCandidates = [
    path.join(process.resourcesPath || '', 'server', 'laboratory-information-system.exe'),
    path.join(PROJECT_ROOT, 'dist', 'laboratory-information-system.exe'),
    path.join(PROJECT_ROOT, 'laboratory-information-system.exe'),
    path.join(process.resourcesPath || '', 'laboratory-information-system.exe'),
    path.join(process.resourcesPath || '', 'server', 'GezyneLIS.exe'),
    path.join(PROJECT_ROOT, 'dist', 'GezyneLIS.exe'),
    path.join(PROJECT_ROOT, 'GezyneLIS.exe'),
    path.join(process.resourcesPath || '', 'GezyneLIS.exe')
  ];
  for (const e of exeCandidates) {
    try { if (fs.existsSync(e)) { SERVER_SCRIPT = e; SERVER_DIR = path.dirname(e); SERVER_IS_EXE = true; return; } } catch (err) {}
  }
})();

let serviceInstalled = false;
let serverChild = null;
let serverAutoStarted = false;
let pm2Available = false;

let tray = null;
let mainWindow = null;
let logBuffer = [];

// Ensure proper taskbar grouping on Windows and set a clear app name
try {
  app.setAppUserModelId && app.setAppUserModelId('com.gezyne.lis-server');
  try { app.name = 'Gezyne LIS Server'; } catch (e) {}
} catch (e) {}

function runServiceCommand(cmd, cb) {
  // Use sc to control Windows service
  exec(cmd, (err, stdout, stderr) => {
    if (err) return cb(err, stdout || stderr);
    cb(null, stdout);
  });
}

function detectPm2(cb) {
  exec('pm2 -v', (err, stdout) => {
    if (!err && stdout && String(stdout).trim().length > 0) {
      pm2Available = true;
      return cb && cb(true);
    }
    exec('npx pm2 -v', (err2, stdout2) => {
      pm2Available = (!err2 && !!stdout2 && String(stdout2).trim().length > 0);
      return cb && cb(pm2Available);
    });
  });
}

function createMainWindow() {
  if (mainWindow) return mainWindow;
  const winIcon = findAppIcon();
  mainWindow = new BrowserWindow({
    width: 800,
    height: 560,
    title: 'Gezyne LIS Server',
    icon: winIcon || undefined,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  // also ensure icon is set after creation
  try { if (winIcon) mainWindow.setIcon(winIcon); } catch (e) {}
  mainWindow.loadFile(path.join(__dirname, 'ui.html'));
  mainWindow.on('close', (e) => {
    // hide instead of close
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  // hide window when minimized (send to tray)
  mainWindow.on('minimize', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
  // send recent logs on ready
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('log-update', logBuffer.join('\n'));
      // send server address info and status
      try {
        const addrInfo = getNetworkAddresses();
        mainWindow.webContents.send('server-address', addrInfo);
        checkServerUp().then(isUp => {
          if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('server-status', { isUp, status: isUp ? 'online' : 'offline' });
          }
        });
      } catch (e) {}
    }
  });
  return mainWindow;
}

function checkServiceExists(cb) {
  exec(`sc query "${SERVICE_NAME}"`, (err, stdout, stderr) => {
    const output = (stdout || '') + (stderr || '');
    if (err) {
      // service not found typically yields error text with 1060
      if (/1060|does not exist/i.test(output)) return cb(null, false);
      return cb(null, false);
    }
    cb(null, true);
  });
}

// prefer PM2 if available; detection will be run during app startup to avoid races

function startServerDirect(cb) {
  if (serverChild) return cb && cb(null, 'already running');
  try {
    // compute data directory via the helper; computeDataDir will either call
    // into lib/dataPath (when available) or fall back to ProgramData.
    const dataDir = computeDataDir();
    console.log('[tray] startServerDirect using DATA_DIR', dataDir);
    const env = Object.assign({}, process.env, { DATA_DIR: dataDir });

    // spawn packaged exe when present; otherwise run `node server.js`
    if (SERVER_IS_EXE) {
      serverChild = spawn(SERVER_SCRIPT, [], { cwd: SERVER_DIR, detached: false, stdio: ['ignore', 'pipe', 'pipe'], env });
    } else {
      serverChild = spawn('node', [SERVER_SCRIPT], { cwd: SERVER_DIR, detached: false, stdio: ['ignore', 'pipe', 'pipe'], env });
    }
    serverChild.on('exit', () => { serverChild = null; appendLog('[server] exited'); });
    if (serverChild.stdout) serverChild.stdout.on('data', (d) => appendLog(d.toString()));
    if (serverChild.stderr) serverChild.stderr.on('data', (d) => appendLog('[ERR] ' + d.toString()));
    cb && cb(null, `started pid=${serverChild && serverChild.pid}`);
  } catch (e) {
    serverChild = null;
    cb && cb(e);
  }
}

// compute the directory the server will use for data, mirroring the
// logic in lib/dataPath.js but without requiring the helper (which isn't
// included in the tray ASAR).  This allows the tray to create/migrate the
// folder ahead of time and avoids crashes when the module is absent.
function computeDataDir() {
  // When pm2 is available the tray always launches the server with
  // DATA_DIR = ProgramData\GezyneLIS.  We must use the same directory so
  // that uploads / restores write to the location the server actually reads.
  if (pm2Available) {
    const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
    const d = path.join(programDataBase, 'GezyneLIS');
    try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    return d;
  }
  try {
    const { getDataDir } = require('../lib/dataPath');
    return getDataDir();
  } catch (err) {
    // module not available (packaged tray); fall back to ProgramData
    const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
    const d = path.join(programDataBase, 'GezyneLIS');
    try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
    return d;
  }
}

let isPm2Starting = false;

function startViaPm2(cb) {
  if (isPm2Starting) return cb && cb(null, 'PM2 start in progress');
  isPm2Starting = true;

  try {
    const chosen = computeDataDir();
    console.log('[tray] pm2 startup using DATA_DIR', chosen);
  } catch (err) {
    console.error('[tray] failed to prepare data dir for pm2', err);
  }

  const cfgCandidates = [
    path.join(PROJECT_ROOT, 'ecosystem.config.js'),
    path.join(PROJECT_ROOT, '..', 'ecosystem.config.js'),
    path.join(process.resourcesPath || '', 'ecosystem.config.js'),
    path.join(process.resourcesPath || '', 'server', 'ecosystem.config.js')
  ];
  const cfg = cfgCandidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || path.join(PROJECT_ROOT, 'ecosystem.config.js');

  const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
  const dataDir = process.env.DATA_DIR || path.join(programDataBase, 'GezyneLIS');
  const pm2Env = Object.assign({}, process.env, { DATA_DIR: dataDir });

  // Force clean reload from ecosystem configuration to ensure binary paths and env are up to date
  exec(`pm2 delete lis-app`, { cwd: path.dirname(cfg), env: pm2Env }, () => {
    const command = `pm2 start "${cfg}" --env production`;
    exec(command, { cwd: path.dirname(cfg), env: pm2Env }, (err, stdout, stderr) => {
      isPm2Starting = false;
      if (!err) {
        exec('pm2 save', { cwd: path.dirname(cfg) }, () => {});
        appendLog('[pm2] Server started via PM2 (reloaded config)');
        return cb && cb(null, stdout || 'PM2 started');
      }

      const stderrText = String(stderr || err || stdout || '').trim();
      appendLog('[pm2] PM2 start notice: ' + stderrText);

      // Fallback: spawn server directly so the system is guaranteed to start
      appendLog('[pm2] Falling back to direct process spawn for 100% uptime');
      startServerDirect(cb);
    });
  });
}

function stopViaPm2(cb) {
  exec('pm2 stop lis-app', { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
    if (err) return cb && cb(err, stdout || stderr);
    appendLog('[pm2] stopped lis-app');
    cb && cb(null, stdout || 'pm2 stopped');
  });
}

function restartViaPm2(cb) {
  const cfgCandidates = [
    path.join(PROJECT_ROOT, 'ecosystem.config.js'),
    path.join(PROJECT_ROOT, '..', 'ecosystem.config.js'),
    path.join(process.resourcesPath || '', 'ecosystem.config.js'),
    path.join(process.resourcesPath || '', 'server', 'ecosystem.config.js')
  ];
  const cfg = cfgCandidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || path.join(PROJECT_ROOT, 'ecosystem.config.js');
  const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
  const dataDir = process.env.DATA_DIR || path.join(programDataBase, 'GezyneLIS');
  const pm2Env = Object.assign({}, process.env, { DATA_DIR: dataDir });

  exec(`pm2 delete lis-app`, { cwd: path.dirname(cfg), env: pm2Env }, () => {
    exec(`pm2 start "${cfg}" --env production`, { cwd: path.dirname(cfg), env: pm2Env }, (err, stdout, stderr) => {
      if (err) return cb && cb(err, stdout || stderr);
      appendLog('[pm2] restarted lis-app with fresh configuration');
      cb && cb(null, stdout || 'pm2 restarted');
    });
  });
}

function stopServerDirect(cb) {
  if (!serverChild) return cb && cb(new Error('not running'));
  try {
    process.kill(serverChild.pid);
    serverChild = null;
    cb && cb(null, 'stopped');
  } catch (e) {
    cb && cb(e);
  }
}

function appendLog(line) {
  const ts = new Date().toISOString();
  const out = `[${ts}] ${String(line).trim()}`;
  logBuffer.push(out);
  if (logBuffer.length > 2000) logBuffer = logBuffer.slice(logBuffer.length - 2000);
  try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('log-update', logBuffer.join('\n')); } catch (e) {}
}

// If pm2/pm2 logs exist, tail them and append
function watchPm2Logs() {
  const watched = new Set();

  function tailFile(p) {
    if (!p || watched.has(p)) return;
    watched.add(p);
    try {
      if (!fs.existsSync(p)) return;
      const txt = fs.readFileSync(p, 'utf8');
      if (txt) appendLog(`[pm2:${path.basename(p)}] ` + txt.split('\n').slice(-200).join('\n'));
    } catch (e) {}
    try {
      fs.watchFile(p, { interval: 1000 }, (curr, prev) => {
        if (curr.size > prev.size) {
          try {
            const s = fs.createReadStream(p, { start: prev.size, end: curr.size });
            let buf = '';
            s.on('data', (d) => { buf += d.toString(); });
            s.on('end', () => { appendLog(`[pm2:${path.basename(p)}] ` + buf); });
          } catch (e) {}
        }
      });
    } catch (e) {}
  }

  if (pm2Available) {
    // Try to locate pm2-managed process log paths using `pm2 jlist`
    exec('pm2 jlist', { cwd: PROJECT_ROOT }, (err, stdout) => {
      if (!err && stdout) {
        try {
          const list = JSON.parse(stdout);
          for (const proc of list) {
            const env = proc.pm2_env || proc.pm2_env;
            if (!env) continue;
            const name = env.name || '';
            // match expected process name used by ecosystem (lis-app)
            if (name && name.toLowerCase().includes('lis-app')) {
              tailFile(env.pm_out_log_path);
              tailFile(env.pm_err_log_path);
            }
          }
        } catch (e) {}
      }

      // Fallbacks: project-local logs and default pm2 home logs
      tailFile(path.join(PROJECT_ROOT, 'logs', 'pm2-out.log'));
      tailFile(path.join(PROJECT_ROOT, 'logs', 'pm2-error.log'));
      // also check per-user writable logs (used by packaged ecosystem.config.js)
      const userLogs = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Gezyne LIS Server', 'logs');
      tailFile(path.join(userLogs, 'pm2-out.log'));
      tailFile(path.join(userLogs, 'pm2-error.log'));
      try {
        const pm2Home = process.env.PM2_HOME || path.join(os.homedir(), '.pm2', 'logs');
        if (fs.existsSync(pm2Home) && fs.lstatSync(pm2Home).isDirectory()) {
          const files = fs.readdirSync(pm2Home);
          for (const f of files) {
            if (f.toLowerCase().includes('lis-app') && f.toLowerCase().endsWith('.log')) tailFile(path.join(pm2Home, f));
          }
        }
      } catch (e) {}
    });
  } else {
    // No pm2 available; watch project-local logs
    tailFile(path.join(PROJECT_ROOT, 'logs', 'pm2-out.log'));
    tailFile(path.join(PROJECT_ROOT, 'logs', 'pm2-error.log'));
  }
}

function checkServerUp() {
  return new Promise((resolve) => {
    const req = http.request({ method: 'HEAD', host: HOST, port: PORT, path: '/', timeout: 2000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function buildContextMenu(isUp) {
  const items = [];
  items.push({ label: 'Open UI', click: () => { createMainWindow(); mainWindow.show(); } });
  items.push({ label: isUp ? 'Open LIS (browser)' : 'Open LIS (server not ready)', click: () => shell.openExternal(URL) });
  items.push({ label: 'Settings', click: () => { const w = createMainWindow(); w.show(); w.focus(); w.webContents.send('open-settings'); } });
  items.push({ type: 'separator' });

  if (serviceInstalled) {
    items.push({ label: 'Start Service', click: () => runServiceCommand(`sc start ${SERVICE_NAME}`, (e, out) => { if (e) dialog.showErrorBox('Start failed', String(e)); }) });
    items.push({ label: 'Stop Service', click: () => runServiceCommand(`sc stop ${SERVICE_NAME}`, (e, out) => { if (e) dialog.showErrorBox('Stop failed', String(e)); }) });
    items.push({ label: 'Restart Service', click: () => runServiceCommand(`sc stop ${SERVICE_NAME} && sc start ${SERVICE_NAME}`, (e) => { if (e) dialog.showErrorBox('Restart failed', String(e)); }) });
  } else {
    items.push({ label: 'Start Server (tray)', click: () => startServerDirect((e, out) => { if (e) dialog.showErrorBox('Start failed', String(e)); }) });
    items.push({ label: 'Stop Server (tray)', click: () => stopServerDirect((e) => { if (e) dialog.showErrorBox('Stop failed', String(e)); }) });
    items.push({ label: 'Restart Server (tray)', click: () => { stopServerDirect(() => startServerDirect((e) => { if (e) dialog.showErrorBox('Restart failed', String(e)); })); } });
  }

  items.push({ type: 'separator' });
  items.push({ label: 'Quit', click: () => {
    // ensure any child server started by tray is killed
    try { if (serverChild && serverChild.pid) process.kill(serverChild.pid); } catch (e) {}
    app.isQuitting = true;
    app.quit();
  } });
  return Menu.buildFromTemplate(items);
}

function createTray() {
  // Prefer a bundled tray icon if present. Use the .ico in build to avoid pixelation.
  const nativeIcon = findAppIcon();
  const localIcon = path.join(__dirname, 'icon.png');
  const assetsIcon = path.join(__dirname, '..', 'assets', 'gezyne-logo.png');
  let icon = nativeIcon || nativeImage.createFromPath(localIcon);
  if (!icon || icon.isEmpty()) icon = nativeImage.createFromPath(assetsIcon);
  if (!icon || icon.isEmpty()) icon = nativeImage.createFromNamedImage('shell32_3', [16,16]);
  tray = new Tray(icon);
  tray.setToolTip('Gezyne LIS Server');
  // double-click the tray icon to open the UI
  tray.on('double-click', () => {
    try {
      const w = createMainWindow();
      w.show();
      w.focus();
    } catch (e) { console.warn('Failed to open UI on tray double-click', e); }
  });

  // initial menu
  // detect pm2 and service presence then set menu (run pm2 detection first to avoid races)
  detectPm2((avail) => {
    pm2Available = !!avail;
    watchPm2Logs(); // Always start log tailing
    checkServiceExists((err, exists) => {
      serviceInstalled = !!exists;
      checkServerUp().then(isUp => tray.setContextMenu(buildContextMenu(isUp)));
    });
  });

  // update every 3s
  setInterval(async () => {
    // re-check service presence periodically in case installer registered it
    checkServiceExists((err, exists) => {
      if (exists && !serviceInstalled) {
        serviceInstalled = true;
        watchPm2Logs();
      } else serviceInstalled = !!exists;
    });
    const isUp = await checkServerUp();
    tray.setContextMenu(buildContextMenu(isUp));
    try { tray.setTitle(isUp ? 'LIS: Up' : 'LIS: Down'); } catch (e) {}
    try {
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        const addrInfo = getNetworkAddresses();
        mainWindow.webContents.send('server-address', addrInfo);
        mainWindow.webContents.send('server-status', { isUp, status: isUp ? 'online' : 'offline' });
      }
    } catch (e) {}
  }, 3000);
}

// Return first existing icon path across common dev/packaged locations
function findAppIcon() {
  const candidates = [
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(process.resourcesPath || '', 'app', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.ico'),           // dev: tray/build/icon.ico
    path.join(__dirname, 'build', 'icon.ico'),                 // alt: tray/build/icon.ico when executed from other cwd
    path.join(PROJECT_ROOT, 'build', 'icon.ico'),
    path.join(__dirname, '..', 'assets', 'gezyne-logo.png')
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        try {
          const img = nativeImage.createFromPath(p);
          if (img && !img.isEmpty()) return img;
        } catch (e) {
          // fallthrough to continue searching
        }
      }
    } catch (e) {}
  }
  return null;
}

app.whenReady().then(() => {
  createTray();
  // open UI on start
  // hide default app menu (File/Edit/View...) so it doesn't appear
  try { Menu.setApplicationMenu(null); } catch (e) {}
  createMainWindow();
  if (mainWindow) {
    try { mainWindow.setMenuBarVisibility(false); mainWindow.setAutoHideMenuBar(true); } catch (e) {}
    mainWindow.show();
  }
  // Auto-start server when tray launches (detect pm2 first, then prefer pm2 > service > direct spawn)
  try {
    detectPm2((pm2Found) => {
      pm2Available = !!pm2Found;
      appendLog('[tray] pm2 detection: ' + (pm2Available ? 'available' : 'not available'));
      checkServiceExists((err, exists) => {
        serviceInstalled = !!exists;

        // helper fallback that attempts a direct spawn and sets serverAutoStarted on success
        function tryFallbackDirect() {
          appendLog('[tray] attempting direct spawn fallback...');
          startServerDirect((errF, outF) => {
            if (errF) appendLog('[tray] fallback spawn failed: ' + String(errF));
            else {
              appendLog('[tray] fallback spawn success: ' + outF);
              serverAutoStarted = true;
            }
          });
        }

        if (pm2Available) {
          appendLog('[tray] PM2 available; starting via pm2...');
          startViaPm2((errp, outp) => {
            if (errp) {
              appendLog('[tray] pm2 start failed: ' + String(errp));
              // fall back to direct spawn when pm2 start fails
              tryFallbackDirect();
            } else {
              appendLog('[tray] ' + String(outp));
              serverAutoStarted = true;
            }
            watchPm2Logs();
          });
        } else if (serviceInstalled) {
          appendLog('[tray] Windows service detected; attempting to start service...');
          runServiceCommand(`sc start ${SERVICE_NAME}`, (err2) => {
            if (err2) {
              appendLog('[tray] Failed to start service: ' + String(err2));
              // fallback to direct spawn
              tryFallbackDirect();
            } else {
              appendLog('[tray] Service start requested');
              serverAutoStarted = true;
            }
            watchPm2Logs();
          });
        } else {
          appendLog('[tray] No service detected; spawning server directly...');
          startServerDirect((err3, out) => {
            if (err3) appendLog('[tray] Failed to spawn server: ' + String(err3));
            else {
              appendLog('[tray] ' + out);
              serverAutoStarted = true;
            }
          });
        }

        // safety: if nothing has started after a short delay, attempt a direct spawn
        setTimeout(async () => {
          if (serverAutoStarted) return;
          const isUp = await checkServerUp();
          if (!isUp) {
            appendLog('[tray] Auto-start fallback: server still down; attempting direct spawn');
            tryFallbackDirect();
          } else {
            serverAutoStarted = true; // server already reachable
          }
        }, 4000);
      });
    });
  } catch (e) { appendLog('[tray] Auto-start failed: ' + String(e)); }
});

// IPC handlers from renderer
ipcMain.on('start-server', (e) => {
  if (pm2Available) return startViaPm2((err, out) => { if (err) e.sender.send('log-update', `pm2 start failed: ${String(err)}`); else e.sender.send('log-update', String(out)); });
  if (serviceInstalled) return runServiceCommand(`sc start ${SERVICE_NAME}`, (err) => { if (err) e.sender.send('log-update', `Start service failed: ${String(err)}`); else e.sender.send('log-update', 'Service start requested'); });
  startServerDirect((err, out) => { if (err) e.sender.send('log-update', `Start failed: ${String(err)}`); else e.sender.send('log-update', out); });
});

ipcMain.on('stop-server', (e) => {
  if (pm2Available) return stopViaPm2((err, out) => { if (err) e.sender.send('log-update', `pm2 stop failed: ${String(err)}`); else e.sender.send('log-update', String(out)); });
  if (serviceInstalled) return runServiceCommand(`sc stop ${SERVICE_NAME}`, (err) => { if (err) e.sender.send('log-update', `Stop service failed: ${String(err)}`); else e.sender.send('log-update', 'Service stop requested'); });
  stopServerDirect((err, out) => { if (err) e.sender.send('log-update', `Stop failed: ${String(err)}`); else e.sender.send('log-update', out); });
});

ipcMain.on('restart-server', (e) => {
  if (pm2Available) return restartViaPm2((err, out) => { if (err) e.sender.send('log-update', `pm2 restart failed: ${String(err)}`); else e.sender.send('log-update', String(out)); });
  if (serviceInstalled) return runServiceCommand(`sc stop ${SERVICE_NAME} && sc start ${SERVICE_NAME}`, (err) => { if (err) e.sender.send('log-update', `Restart failed: ${String(err)}`); else e.sender.send('log-update', 'Service restart requested'); });
  stopServerDirect(() => startServerDirect((err, out) => { if (err) e.sender.send('log-update', `Restart failed: ${String(err)}`); else e.sender.send('log-update', out); }));
});

ipcMain.on('open-lis', (e) => {
  shell.openExternal(URL);
});

ipcMain.on('hide-window', (e) => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.on('exit-app', (e) => {
  // ensure any child server started by tray is killed
  try { if (serverChild && serverChild.pid) process.kill(serverChild.pid); } catch (e) {}
  app.isQuitting = true;
  app.quit();
});

ipcMain.on('request-logs', (e) => {
  e.sender.send('log-update', logBuffer.join('\n'));
});

ipcMain.on('run-log-command', (e, rawCmd) => {
  const cmd = String(rawCmd || '').trim();
  if (!cmd) return;

  appendLog(`$ ${cmd}`);

  // Built-in commands
  if (cmd.toLowerCase() === 'help' || cmd.toLowerCase() === '?') {
    appendLog('[terminal] Available Commands:');
    appendLog('  • pm2 status          - Check status of PM2 managed processes');
    appendLog('  • pm2 restart lis-app - Restart the PM2 server application');
    appendLog('  • pm2 logs            - Display PM2 logs');
    appendLog('  • pm2 list            - List running PM2 processes');
    appendLog('  • start / stop        - Control the LIS server process');
    appendLog('  • clear / cls         - Clear log terminal output view');
    appendLog('  • ip                  - List all local & network IP addresses');
    appendLog('  • <command>           - Execute CLI command in server environment');
    return;
  }

  if (cmd.toLowerCase() === 'clear' || cmd.toLowerCase() === 'cls') {
    logBuffer = [];
    appendLog('[terminal] Log view cleared');
    return;
  }

  if (cmd.toLowerCase() === 'ip') {
    const net = getNetworkAddresses();
    appendLog(`[terminal] Local URL:   ${net.localUrl}`);
    appendLog(`[terminal] Network URL: ${net.networkUrl}`);
    if (net.allAddresses && net.allAddresses.length) {
      net.allAddresses.forEach(a => {
        appendLog(`  • ${a.name}: http://${a.address}:${net.port} ${a.isVirtual ? '(Virtual)' : '(LAN)'}`);
      });
    }
    return;
  }

  if (cmd.toLowerCase() === 'start') {
    if (pm2Available) return startViaPm2();
    if (serviceInstalled) return runServiceCommand(`sc start ${SERVICE_NAME}`, () => {});
    return startServerDirect();
  }

  if (cmd.toLowerCase() === 'stop') {
    if (pm2Available) return stopViaPm2();
    if (serviceInstalled) return runServiceCommand(`sc stop ${SERVICE_NAME}`, () => {});
    return stopServerDirect();
  }

  // Execute shell / CLI command
  exec(cmd, { cwd: SERVER_DIR, timeout: 30000, env: process.env }, (err, stdout, stderr) => {
    if (stdout && stdout.trim()) {
      appendLog(stdout.trim());
    }
    if (stderr && stderr.trim()) {
      appendLog(`[ERR] ${stderr.trim()}`);
    }
    if (err && !stdout && !stderr) {
      appendLog(`[ERR] Command failed: ${err.message}`);
    }
  });
});

// Provide app icon as data URL to renderer so UI img tags can display it reliably
ipcMain.handle('get-app-icon', async () => {
  try {
    const img = findAppIcon();
    if (!img) return null;
    // If findAppIcon returned a path string (older fallback), ensure nativeImage
    const native = typeof img === 'string' ? nativeImage.createFromPath(img) : img;
    if (!native || native.isEmpty()) return null;
    return native.toDataURL();
  } catch (e) {
    return null;
  }
});

ipcMain.handle('save-logs', async () => {
  try {
    const docs = path.join(os.homedir(), 'Documents');
    const targetDir = path.join(docs, 'LIS', 'logs');
    fs.mkdirSync(targetDir, { recursive: true });
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-');
    const fname = `lis-logs-${ts}.log`;
    const fpath = path.join(targetDir, fname);
    fs.writeFileSync(fpath, logBuffer.join('\n'), 'utf8');
    // open folder containing the logs
    try { await require('electron').shell.openPath(targetDir); } catch (e) {}
    return { ok: true, path: fpath };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// ---- Restore handlers (Settings) ----

// Resolve the data directory the server uses (mirrors computeDataDir / dataPath)
function resolveDataFiles() {
  const dataDir = computeDataDir();
  appendLog('[settings] resolved data dir: ' + dataDir);
  return {
    dataDir,
    dataFile: path.join(dataDir, 'data.json'),
    usersFile: path.join(dataDir, 'data-users.json'),
    dbFile: path.join(dataDir, 'lis-data.db')
  };
}

// Helper: restart server asynchronously so uploads take effect
function restartServerAsync() {
  appendLog('[settings] restarting server to apply changes...');
  if (pm2Available) {
    restartViaPm2((err) => {
      if (err) appendLog('[settings] pm2 restart failed: ' + String(err));
      else appendLog('[settings] server restarted via pm2');
    });
  } else if (serviceInstalled) {
    runServiceCommand(`sc stop ${SERVICE_NAME} && sc start ${SERVICE_NAME}`, (err) => {
      if (err) appendLog('[settings] service restart failed: ' + String(err));
      else appendLog('[settings] server restarted via service');
    });
  } else {
    stopServerDirect(() => startServerDirect((err) => {
      if (err) appendLog('[settings] direct restart failed: ' + String(err));
      else appendLog('[settings] server restarted via direct spawn');
    }));
  }
}

// Helper: import JSON into SQLite if available
function importIntoSqlite(dbFile, jsonPath, type) {
  try {
    const { createDb } = require('../lib/sqliteDb');
    const { importJsonFile } = require('../lib/migrateJsonToSqlite');
    const sdb = createDb(dbFile);
    importJsonFile(sdb, jsonPath, type);
    sdb.close();
    appendLog('[settings] Synced ' + type + ' into SQLite database');
  } catch (e) {
    appendLog('[settings] SQLite sync notice: ' + e.message);
  }
}

// Restore users: seed the default admin account into data-users.json and SQLite DB
ipcMain.handle('restore-users', async () => {
  try {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const { usersFile, dbFile, dataDir } = resolveDataFiles();

    // ensure directory exists
    fs.mkdirSync(dataDir, { recursive: true });

    // read existing users (if any)
    let existing = [];
    try {
      if (fs.existsSync(usersFile)) {
        const raw = fs.readFileSync(usersFile, 'utf8');
        existing = JSON.parse(raw);
        if (!Array.isArray(existing)) existing = [];
      }
    } catch (e) { existing = []; }

    // check if admin already exists
    let admin = existing.find(u => u.email === 'admin@lab.com');
    const hash = await bcrypt.hash('password123', 12);

    if (!admin) {
      admin = {
        id: uuidv4(),
        name: 'Admin User',
        email: 'admin@lab.com',
        password: hash,
        role: 'Admin',
        licenseNumber: null,
        signature: null,
        autoSignature: { enabled: false, until: null },
        permissions: {
          dashboard: true, patients: true, reception: true,
          tests: true, reports: true, worksheet: true,
          templates: true, users: true, delete: true
        },
        status: 'Active',
        createdAt: new Date().toISOString(),
        lastLogin: null
      };
      existing.push(admin);
    } else {
      // reset password and ensure admin role
      admin.password = hash;
      admin.role = 'Admin';
      admin.status = 'Active';
      admin.permissions = {
        dashboard: true, patients: true, reception: true,
        tests: true, reports: true, worksheet: true,
        templates: true, users: true, delete: true
      };
    }

    fs.writeFileSync(usersFile, JSON.stringify(existing, null, 2), 'utf8');
    appendLog('[settings] Restored admin user in ' + usersFile);

    // Also update SQLite database directly if it exists
    try {
      if (fs.existsSync(dbFile)) {
        const { createDb } = require('../lib/sqliteDb');
        const sdb = createDb(dbFile);
        const currentUsers = sdb.getUsers() || [];
        const idx = currentUsers.findIndex(u => u.email === 'admin@lab.com');
        if (idx >= 0) currentUsers[idx] = admin;
        else currentUsers.push(admin);
        sdb.saveUsers(currentUsers);
        sdb.close();
        appendLog('[settings] Restored admin user in SQLite database ' + dbFile);
      }
    } catch (e) { appendLog('[settings] warning: could not update sqlite users: ' + String(e)); }

    // restart server so it picks up the new user data
    restartServerAsync();
    return { ok: true };
  } catch (e) {
    appendLog('[settings] restore-users failed: ' + String(e));
    return { ok: false, error: String(e) };
  }
});

// Restore data: reset database to empty initial structure
ipcMain.handle('restore-data', async () => {
  try {
    const { dataFile: df, dbFile, dataDir } = resolveDataFiles();

    // ensure directory exists
    fs.mkdirSync(dataDir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');

    // backup current data.json before overwriting
    if (fs.existsSync(df)) {
      const backupPath = path.join(dataDir, `data-backup-${ts}.json`);
      try { fs.copyFileSync(df, backupPath); appendLog('[settings] backed up data.json to ' + backupPath); } catch (e) {}
    }

    // backup SQLite db before resetting
    if (fs.existsSync(dbFile)) {
      const backupDbPath = path.join(dataDir, `lis-data-backup-${ts}.db`);
      try { fs.copyFileSync(dbFile, backupDbPath); appendLog('[settings] backed up lis-data.db to ' + backupDbPath); } catch (e) {}
    }

    const initialData = {
      users: [],
      patients: [],
      tests: [],
      templates: [],
      counters: {}
    };

    fs.writeFileSync(df, JSON.stringify(initialData, null, 2), 'utf8');

    // Reset SQLite database directly
    try {
      if (fs.existsSync(dbFile)) {
        const { createDb } = require('../lib/sqliteDb');
        const sdb = createDb(dbFile);
        sdb.write(initialData);
        sdb.close();
        appendLog('[settings] Reset SQLite database ' + dbFile);
      }
    } catch (e) {
      appendLog('[settings] SQLite reset notice: ' + e.message);
    }

    appendLog('[settings] Restored database to empty initial state');
    restartServerAsync();
    return { ok: true };
  } catch (e) {
    appendLog('[settings] restore-data failed: ' + String(e));
    return { ok: false, error: String(e) };
  }
});

// Upload data.json: let user pick a JSON file and import it
ipcMain.handle('upload-data', async () => {
  try {
    const { dataFile: df, dbFile, dataDir } = resolveDataFiles();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select data.json to upload',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { cancelled: true };

    const srcPath = result.filePaths[0];

    // validate JSON
    const raw = fs.readFileSync(srcPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) throw new Error('File is not a valid JSON object');

    // ensure directory exists
    fs.mkdirSync(dataDir, { recursive: true });

    // backup current before overwriting
    if (fs.existsSync(df)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(dataDir, `data-backup-${ts}.json`);
      try { fs.copyFileSync(df, backupPath); appendLog('[settings] backed up data.json to ' + backupPath); } catch (e) {}
    }

    fs.writeFileSync(df, raw, 'utf8');
    appendLog('[settings] Uploaded data.json from ' + srcPath + ' to ' + df);

    // Sync into SQLite
    importIntoSqlite(dbFile, df, 'data');

    // restart server so it picks up the new file
    restartServerAsync();
    return { ok: true };
  } catch (e) {
    appendLog('[settings] upload-data failed: ' + String(e));
    return { ok: false, error: String(e) };
  }
});

// Upload data-users.json: let user pick a JSON file and import it
ipcMain.handle('upload-users', async () => {
  try {
    const { usersFile, dbFile, dataDir } = resolveDataFiles();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select data-users.json to upload',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths || !result.filePaths.length) return { cancelled: true };

    const srcPath = result.filePaths[0];

    // validate JSON
    const raw = fs.readFileSync(srcPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Users file must be a JSON array');

    // ensure directory exists
    fs.mkdirSync(dataDir, { recursive: true });

    // backup current before overwriting
    if (fs.existsSync(usersFile)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(dataDir, `data-users-backup-${ts}.json`);
      try { fs.copyFileSync(usersFile, backupPath); appendLog('[settings] backed up data-users.json to ' + backupPath); } catch (e) {}
    }

    fs.writeFileSync(usersFile, raw, 'utf8');
    appendLog('[settings] Uploaded data-users.json from ' + srcPath + ' to ' + usersFile);

    // Sync into SQLite
    importIntoSqlite(dbFile, usersFile, 'users');

    // restart server so it picks up the new file
    restartServerAsync();
    return { ok: true };
  } catch (e) {
    appendLog('[settings] upload-users failed: ' + String(e));
    return { ok: false, error: String(e) };
  }
});

app.on('window-all-closed', (e) => {
  // Only prevent quitting when not explicitly quitting.
  if (!app.isQuitting) {
    e.preventDefault();
  }
});
