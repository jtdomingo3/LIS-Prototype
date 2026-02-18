const { app, Tray, Menu, nativeImage, shell, dialog, BrowserWindow, ipcMain } = require('electron');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

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
const SERVER_SCRIPT = path.join(PROJECT_ROOT, 'server.js');

let serviceInstalled = false;
let serverChild = null;

let tray = null;
let mainWindow = null;
let logBuffer = [];

function runServiceCommand(cmd, cb) {
  // Use sc to control Windows service
  exec(cmd, (err, stdout, stderr) => {
    if (err) return cb(err, stdout || stderr);
    cb(null, stdout);
  });
}

function createMainWindow() {
  if (mainWindow) return mainWindow;
  mainWindow = new BrowserWindow({
    width: 800,
    height: 560,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  // set window icon to project build icon to match app
  try {
    const winIcon = path.join(PROJECT_ROOT, 'build', 'icon.ico');
    if (fs.existsSync(winIcon)) mainWindow.setIcon(winIcon);
  } catch (e) {}
  mainWindow.loadFile(path.join(__dirname, 'ui.html'));
  mainWindow.on('close', (e) => {
    // hide instead of close
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  // send recent logs on ready
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('log-update', logBuffer.join('\n'));
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

function startServerDirect(cb) {
  if (serverChild) return cb && cb(null, 'already running');
  try {
    // Spawn using system `node` executable; requires node on PATH or bundled EXE alternative
    // capture stdout/stderr for log streaming
    serverChild = spawn('node', [SERVER_SCRIPT], { cwd: PROJECT_ROOT, detached: false, stdio: ['ignore', 'pipe', 'pipe'] });
    serverChild.on('exit', () => { serverChild = null; appendLog('[server] exited'); });
    if (serverChild.stdout) serverChild.stdout.on('data', (d) => appendLog(d.toString()));
    if (serverChild.stderr) serverChild.stderr.on('data', (d) => appendLog('[ERR] ' + d.toString()));
    cb && cb(null, `started pid=${serverChild.pid}`);
  } catch (e) {
    serverChild = null;
    cb && cb(e);
  }
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
  const outLog = path.join(PROJECT_ROOT, 'logs', 'pm2-out.log');
  const errLog = path.join(PROJECT_ROOT, 'logs', 'pm2-error.log');
  [outLog, errLog].forEach((p) => {
    if (!fs.existsSync(p)) return;
    try { const txt = fs.readFileSync(p, 'utf8'); if (txt) appendLog(`[pm2:${path.basename(p)}] ` + txt.split('\n').slice(-200).join('\n')); } catch (e) {}
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
  });
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
  items.push({ label: 'Quit', click: () => { app.quit(); } });
  return Menu.buildFromTemplate(items);
}

function createTray() {
  // Prefer a bundled tray icon if present. Use the .ico in build to avoid pixelation.
  const buildIco = path.join(__dirname, '..', 'build', 'icon.ico');
  const localIcon = path.join(__dirname, 'icon.png');
  const assetsIcon = path.join(__dirname, '..', 'assets', 'gezyne-logo.png');
  let icon = nativeImage.createFromPath(buildIco);
  if (icon.isEmpty()) icon = nativeImage.createFromPath(localIcon);
  if (icon.isEmpty()) icon = nativeImage.createFromPath(assetsIcon);
  if (icon.isEmpty()) icon = nativeImage.createFromNamedImage('shell32_3', [16,16]);
  tray = new Tray(icon);
  tray.setToolTip('Gezyne LIS');
  // double-click the tray icon to open the UI
  tray.on('double-click', () => {
    try {
      const w = createMainWindow();
      w.show();
      w.focus();
    } catch (e) { console.warn('Failed to open UI on tray double-click', e); }
  });

  // initial menu
  // detect service presence then set menu
  checkServiceExists((err, exists) => { serviceInstalled = !!exists; if (serviceInstalled) watchPm2Logs(); checkServerUp().then(isUp => tray.setContextMenu(buildContextMenu(isUp))); });

  // update every 5s
  setInterval(async () => {
    // re-check service presence periodically in case installer registered it
    checkServiceExists((err, exists) => { if (exists && !serviceInstalled) { serviceInstalled = true; watchPm2Logs(); } else serviceInstalled = !!exists; });
    const isUp = await checkServerUp();
    tray.setContextMenu(buildContextMenu(isUp));
    try { tray.setTitle(isUp ? 'LIS: Up' : 'LIS: Down'); } catch (e) {}
  }, 5000);
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
});

// IPC handlers from renderer
ipcMain.on('start-server', (e) => {
  if (serviceInstalled) return runServiceCommand(`sc start ${SERVICE_NAME}`, (err) => { if (err) e.sender.send('log-update', `Start service failed: ${String(err)}`); else e.sender.send('log-update', 'Service start requested'); });
  startServerDirect((err, out) => { if (err) e.sender.send('log-update', `Start failed: ${String(err)}`); else e.sender.send('log-update', out); });
});

ipcMain.on('stop-server', (e) => {
  if (serviceInstalled) return runServiceCommand(`sc stop ${SERVICE_NAME}`, (err) => { if (err) e.sender.send('log-update', `Stop service failed: ${String(err)}`); else e.sender.send('log-update', 'Service stop requested'); });
  stopServerDirect((err, out) => { if (err) e.sender.send('log-update', `Stop failed: ${String(err)}`); else e.sender.send('log-update', out); });
});

ipcMain.on('restart-server', (e) => {
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

app.on('window-all-closed', (e) => {
  // keep app running in tray
  e.preventDefault();
});
