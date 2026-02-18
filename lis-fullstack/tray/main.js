const { app, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fetch = globalThis.fetch || require('node-fetch');

const SERVICE_NAME = 'GezyneLIS';
const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;

let tray = null;

function runServiceCommand(cmd, cb) {
  // Use sc to control Windows service
  exec(cmd, (err, stdout, stderr) => {
    if (err) return cb(err, stdout || stderr);
    cb(null, stdout);
  });
}

function checkServerUp() {
  return fetch(URL, { method: 'HEAD', cache: 'no-store' })
    .then(r => r.ok)
    .catch(() => false);
}

function buildContextMenu(isUp) {
  return Menu.buildFromTemplate([
    { label: isUp ? 'Open LIS (browser)' : 'Open LIS (server not ready)', click: () => shell.openExternal(URL) },
    { type: 'separator' },
    { label: 'Start Service', click: () => runServiceCommand(`sc start ${SERVICE_NAME}`, (e, out) => { if (e) dialog.showErrorBox('Start failed', String(e)); }) },
    { label: 'Stop Service', click: () => runServiceCommand(`sc stop ${SERVICE_NAME}`, (e, out) => { if (e) dialog.showErrorBox('Stop failed', String(e)); }) },
    { label: 'Restart Service', click: () => runServiceCommand(`sc stop ${SERVICE_NAME} && sc start ${SERVICE_NAME}`, (e) => { if (e) dialog.showErrorBox('Restart failed', String(e)); }) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit(); } }
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) icon = nativeImage.createFromNamedImage('shell32_3', [16,16]);
  tray = new Tray(icon);
  tray.setToolTip('Gezyne LIS');

  // initial menu
  checkServerUp().then(isUp => tray.setContextMenu(buildContextMenu(isUp)));

  // update every 5s
  setInterval(async () => {
    const isUp = await checkServerUp();
    tray.setContextMenu(buildContextMenu(isUp));
    tray.setTitle(isUp ? 'LIS: Up' : 'LIS: Down');
  }, 5000);
}

app.whenReady().then(() => {
  createTray();
});

app.on('window-all-closed', (e) => {
  // keep app running in tray
  e.preventDefault();
});
