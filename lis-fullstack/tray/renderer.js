const { ipcRenderer } = require('electron');

const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const restartBtn = document.getElementById('restart');
const openBtn = document.getElementById('open');
const hideBtn = document.getElementById('hide');
const logsEl = document.getElementById('logs');
const saveBtn = document.getElementById('save');
const exitBtn = document.getElementById('exit');

startBtn.addEventListener('click', () => ipcRenderer.send('start-server'));
stopBtn.addEventListener('click', () => ipcRenderer.send('stop-server'));
restartBtn.addEventListener('click', () => ipcRenderer.send('restart-server'));
openBtn.addEventListener('click', () => ipcRenderer.send('open-lis'));
hideBtn.addEventListener('click', () => ipcRenderer.send('hide-window'));
saveBtn.addEventListener('click', () => ipcRenderer.invoke('save-logs').then((res) => {
  // show result in logs pane
  const msg = res && res.path ? `Logs saved: ${res.path}` : `Save failed: ${String(res && res.error || '')}`;
  logsEl.textContent = msg + '\n' + logsEl.textContent;
}));

exitBtn.addEventListener('click', () => ipcRenderer.send('exit-app'));

// ---- Settings modal ----
const settingsBtn = document.getElementById('settings');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const restoreUsersBtn = document.getElementById('restore-users');
const restoreDataBtn = document.getElementById('restore-data');
const restoreStatus = document.getElementById('restore-status');

settingsBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
settingsClose.addEventListener('click', () => { settingsModal.style.display = 'none'; });
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; });

// Allow main process (tray context menu) to open settings
ipcRenderer.on('open-settings', () => { settingsModal.style.display = 'flex'; });

function showRestoreStatus(msg, isError) {
  restoreStatus.textContent = msg;
  restoreStatus.style.color = isError ? '#e74c3c' : 'var(--green)';
}

restoreUsersBtn.addEventListener('click', async () => {
  restoreUsersBtn.disabled = true;
  showRestoreStatus('Restoring users...', false);
  try {
    const res = await ipcRenderer.invoke('restore-users');
    showRestoreStatus(res.ok ? 'Default admin user restored successfully.' : ('Failed: ' + (res.error || 'unknown')), !res.ok);
  } catch (e) {
    showRestoreStatus('Error: ' + String(e), true);
  }
  restoreUsersBtn.disabled = false;
});

restoreDataBtn.addEventListener('click', async () => {
  if (!confirm('This will reset data.json to an empty database.\\nPatients, tests, and templates will be cleared.\\n\\nContinue?')) return;
  restoreDataBtn.disabled = true;
  showRestoreStatus('Restoring data...', false);
  try {
    const res = await ipcRenderer.invoke('restore-data');
    showRestoreStatus(res.ok ? 'Data restored to empty database.' : ('Failed: ' + (res.error || 'unknown')), !res.ok);
  } catch (e) {
    showRestoreStatus('Error: ' + String(e), true);
  }
  restoreDataBtn.disabled = false;
});

// ---- Upload handlers ----
const uploadDataBtn = document.getElementById('upload-data');
const uploadUsersBtn = document.getElementById('upload-users');
const uploadStatus = document.getElementById('upload-status');

function showUploadStatus(msg, isError) {
  uploadStatus.textContent = msg;
  uploadStatus.style.color = isError ? '#e74c3c' : 'var(--green)';
}

uploadDataBtn.addEventListener('click', async () => {
  uploadDataBtn.disabled = true;
  showUploadStatus('Selecting file...', false);
  try {
    const res = await ipcRenderer.invoke('upload-data');
    if (res.cancelled) { showUploadStatus('', false); }
    else showUploadStatus(res.ok ? 'data.json uploaded. Server restarting...' : ('Failed: ' + (res.error || 'unknown')), !res.ok);
  } catch (e) {
    showUploadStatus('Error: ' + String(e), true);
  }
  uploadDataBtn.disabled = false;
});

uploadUsersBtn.addEventListener('click', async () => {
  uploadUsersBtn.disabled = true;
  showUploadStatus('Selecting file...', false);
  try {
    const res = await ipcRenderer.invoke('upload-users');
    if (res.cancelled) { showUploadStatus('', false); }
    else showUploadStatus(res.ok ? 'data-users.json uploaded. Server restarting...' : ('Failed: ' + (res.error || 'unknown')), !res.ok);
  } catch (e) {
    showUploadStatus('Error: ' + String(e), true);
  }
  uploadUsersBtn.disabled = false;
});

ipcRenderer.on('log-update', (event, data) => {
  logsEl.textContent = data || '';
  // scroll to bottom
  logsEl.scrollTop = logsEl.scrollHeight;
});

// request periodic logs
setInterval(() => ipcRenderer.send('request-logs'), 2000);

ipcRenderer.on('server-address', (event, data) => {
  const el = document.getElementById('address');
  if (!el) return;
  if (data && data.host && data.port) el.textContent = `Server: http://${data.host}:${data.port}`;
  else el.textContent = 'Server: --';
});

// request the app icon from main and set the header image
ipcRenderer.invoke('get-app-icon').then((dataUrl) => {
  try {
    if (dataUrl) {
      const img = document.getElementById('logo');
      if (img) img.src = dataUrl;
    }
  } catch (e) {}
}).catch(() => {});
