const { app, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const { exec, spawn } = require('child_process');
const path = require('path');
const http = require('http');

const SERVICE_NAME = 'GezyneLIS';
const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;
const PROJECT_ROOT = path.join(__dirname, '..');
const SERVER_SCRIPT = path.join(PROJECT_ROOT, 'server.js');

let serviceInstalled = false;
let serverChild = null;

let tray = null;

function runServiceCommand(cmd, cb) {
  // Use sc to control Windows service
  exec(cmd, (err, stdout, stderr) => {
    if (err) return cb(err, stdout || stderr);
    cb(null, stdout);
  });
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
    serverChild = spawn('node', [SERVER_SCRIPT], { cwd: PROJECT_ROOT, detached: false, stdio: 'ignore' });
    serverChild.unref();
    serverChild.on('exit', () => { serverChild = null; });
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

function checkServerUp() {
  return new Promise((resolve) => {
    const req = http.request({ method: 'HEAD', host: '127.0.0.1', port: PORT, path: '/', timeout: 2000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

function buildContextMenu(isUp) {
  const items = [];
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

  // initial menu
  // detect service presence then set menu
  checkServiceExists((err, exists) => { serviceInstalled = !!exists; checkServerUp().then(isUp => tray.setContextMenu(buildContextMenu(isUp))); });

  // update every 5s
  setInterval(async () => {
    // re-check service presence periodically in case installer registered it
    checkServiceExists((err, exists) => { serviceInstalled = !!exists; });
    const isUp = await checkServerUp();
    tray.setContextMenu(buildContextMenu(isUp));
    try { tray.setTitle(isUp ? 'LIS: Up' : 'LIS: Down'); } catch (e) {}
  }, 5000);
}

app.whenReady().then(() => {
  createTray();
});

app.on('window-all-closed', (e) => {
  // keep app running in tray
  e.preventDefault();
});
