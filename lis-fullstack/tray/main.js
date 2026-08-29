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

function getLocalIp() {
  // prefer explicit HOST env var if provided
  if (process.env.HOST) return process.env.HOST;
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        // skip docker/virtual adapters with local-only addresses like 169.254
        if (net.address && !net.address.startsWith('169.254')) return net.address;
      }
    }
  }
  return 'localhost';
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
      // send server address info
      try { mainWindow.webContents.send('server-address', { host: HOST, port: PORT }); } catch (e) {}
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

function startViaPm2(cb) {
  // ensure the data directory exists/migrated before pm2 spins up the server.
  try {
    const chosen = computeDataDir();
    console.log('[tray] pm2 startup will use DATA_DIR', chosen);
  } catch (err) {
    console.error('[tray] failed to prepare data dir for pm2', err);
  }

  // locate ecosystem.config.js in likely locations and pass absolute path to pm2
  const cfgCandidates = [
    path.join(PROJECT_ROOT, 'ecosystem.config.js'),
    path.join(PROJECT_ROOT, '..', 'ecosystem.config.js'),
    path.join(process.resourcesPath || '', 'ecosystem.config.js')
  ];
  const cfg = cfgCandidates.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || path.join(PROJECT_ROOT, 'ecosystem.config.js');

  // include DATA_DIR in the environment for pm2-launched processes as well
  const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
  const dataDir = path.join(programDataBase, 'GezyneLIS');
  const pm2Env = Object.assign({}, process.env, { DATA_DIR: dataDir });
  exec(`pm2 start "${cfg}" --env production`, { cwd: path.dirname(cfg), env: pm2Env }, (err, stdout, stderr) => {
    if (!err) {
      exec('pm2 save', { cwd: path.dirname(cfg) }, (e) => {
        if (e) appendLog('[pm2] pm2 save failed: ' + String(e));
        appendLog('[pm2] started via ' + cfg);
        cb && cb(null, stdout || 'pm2 started');
      });
      return;
    }

    // If pm2 failed because the configured script wasn't found in the packaged layout,
    // try to start the packaged EXE directly (fallback).
    const stderrText = String(stderr || err || stdout || '');
    appendLog('[pm2] start failed: ' + stderrText.trim());

    // fallback: if we have a packaged EXE, ask pm2 to run it directly
    if (!SERVER_IS_EXE) return cb && cb(err, stdout || stderr);

    appendLog('[pm2] Attempting fallback: start packaged EXE via pm2');
    const exePath = SERVER_SCRIPT; // should point to the EXE by locateServer logic
    exec(`pm2 start "${exePath}" --name lis-app --interpreter none --env production`, { cwd: SERVER_DIR, env: pm2Env }, (err2, out2, errOut2) => {
      if (err2) return cb && cb(err2, out2 || errOut2 || stderrText);
      exec('pm2 save', { cwd: SERVER_DIR }, (e2) => { if (e2) appendLog('[pm2] pm2 save failed: ' + String(e2)); });
      appendLog('[pm2] started packaged EXE via pm2: ' + exePath);
      cb && cb(null, out2 || 'pm2 started exe');
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
  exec('pm2 restart lis-app', { cwd: PROJECT_ROOT }, (err, stdout, stderr) => {
    if (err) return cb && cb(err, stdout || stderr);
    appendLog('[pm2] restarted lis-app');
    cb && cb(null, stdout || 'pm2 restarted');
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
    checkServiceExists((err, exists) => { serviceInstalled = !!exists; if (serviceInstalled) watchPm2Logs(); checkServerUp().then(isUp => tray.setContextMenu(buildContextMenu(isUp))); });
  });

  // update every 5s
  setInterval(async () => {
    // re-check service presence periodically in case installer registered it
    checkServiceExists((err, exists) => { if (exists && !serviceInstalled) { serviceInstalled = true; watchPm2Logs(); } else serviceInstalled = !!exists; });
    const isUp = await checkServerUp();
    tray.setContextMenu(buildContextMenu(isUp));
    try { tray.setTitle(isUp ? 'LIS: Up' : 'LIS: Down'); } catch (e) {}
  }, 5000);
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

// Restore users: seed the default admin account into data-users.json
ipcMain.handle('restore-users', async () => {
  try {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const { usersFile, dataDir } = resolveDataFiles();

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

    // Also update the users array inside data.json if it exists
    try {
      const { dataFile: df } = resolveDataFiles();
      if (fs.existsSync(df)) {
        const data = JSON.parse(fs.readFileSync(df, 'utf8'));
        if (data && Array.isArray(data.users)) {
          const idx = data.users.findIndex(u => u.email === 'admin@lab.com');
          const stripped = { id: admin.id, name: admin.name, email: admin.email, password: admin.password, role: admin.role, status: admin.status, createdAt: admin.createdAt, lastLogin: admin.lastLogin };
          if (idx >= 0) data.users[idx] = stripped;
          else data.users.push(stripped);
          fs.writeFileSync(df, JSON.stringify(data, null, 2), 'utf8');
        }
      }
    } catch (e) { appendLog('[settings] warning: could not update data.json users: ' + String(e)); }

    // restart server so it picks up the new user data
    restartServerAsync();
    return { ok: true };
  } catch (e) {
    appendLog('[settings] restore-users failed: ' + String(e));
    return { ok: false, error: String(e) };
  }
});

// Restore data: reset data.json to empty initial structure
ipcMain.handle('restore-data', async () => {
  try {
    const { dataFile: df, dataDir } = resolveDataFiles();

    // ensure directory exists
    fs.mkdirSync(dataDir, { recursive: true });

    // backup current data.json before overwriting
    if (fs.existsSync(df)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(dataDir, `data-backup-${ts}.json`);
      try { fs.copyFileSync(df, backupPath); appendLog('[settings] backed up data.json to ' + backupPath); } catch (e) {}
    }

    const initialData = {
      users: [],
      patients: [],
      tests: [],
      templates: [],
      counters: {}
    };

    fs.writeFileSync(df, JSON.stringify(initialData, null, 2), 'utf8');
    appendLog('[settings] Restored data.json to empty initial state in ' + df);
    return { ok: true };
  } catch (e) {
    appendLog('[settings] restore-data failed: ' + String(e));
    return { ok: false, error: String(e) };
  }
});

// Upload data.json: let user pick a JSON file and copy it as data.json
ipcMain.handle('upload-data', async () => {
  try {
    const { dataFile: df, dataDir } = resolveDataFiles();
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
    // restart server so it picks up the new file
    restartServerAsync();
    return { ok: true };
  } catch (e) {
    appendLog('[settings] upload-data failed: ' + String(e));
    return { ok: false, error: String(e) };
  }
});

// Upload data-users.json: let user pick a JSON file and copy it as data-users.json
ipcMain.handle('upload-users', async () => {
  try {
    const { usersFile, dataDir } = resolveDataFiles();
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
