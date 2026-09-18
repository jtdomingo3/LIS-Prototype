const { ipcRenderer, shell } = require('electron');

// ---- Controls ----
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const restartBtn = document.getElementById('restart');
const openBtn = document.getElementById('open');
const hideBtn = document.getElementById('hide');
const saveBtn = document.getElementById('save');
const settingsBtn = document.getElementById('settings');
const exitBtn = document.getElementById('exit');

startBtn.addEventListener('click', () => ipcRenderer.send('start-server'));
stopBtn.addEventListener('click', () => ipcRenderer.send('stop-server'));
restartBtn.addEventListener('click', () => ipcRenderer.send('restart-server'));
openBtn.addEventListener('click', () => ipcRenderer.send('open-lis'));
hideBtn.addEventListener('click', () => ipcRenderer.send('hide-window'));
exitBtn.addEventListener('click', () => ipcRenderer.send('exit-app'));

saveBtn.addEventListener('click', () => ipcRenderer.invoke('save-logs').then((res) => {
  const msg = res && res.path ? `Logs saved: ${res.path}` : `Save failed: ${String(res && res.error || '')}`;
  appendLocalLog(msg);
}));

// ---- Address & Status Handling ----
const addrLocalEl = document.getElementById('addr-local');
const addrNetworkEl = document.getElementById('addr-network');
const copyLocalBtn = document.getElementById('copy-local');
const copyNetworkBtn = document.getElementById('copy-network');
const openLocalBtn = document.getElementById('open-local');
const openNetworkBtn = document.getElementById('open-network');
const multiIpBox = document.getElementById('multi-ip-box');
const multiIpSelect = document.getElementById('multi-ip-select');

const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');

let currentLocalUrl = 'http://localhost:3000';
let currentNetworkUrl = '';

function copyToClipboard(btn, text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
    }, 1500);
  }).catch(() => {});
}

copyLocalBtn.addEventListener('click', () => copyToClipboard(copyLocalBtn, addrLocalEl.textContent));
copyNetworkBtn.addEventListener('click', () => copyToClipboard(copyNetworkBtn, addrNetworkEl.textContent));

openLocalBtn.addEventListener('click', () => {
  if (currentLocalUrl) ipcRenderer.send('open-lis');
});
openNetworkBtn.addEventListener('click', () => {
  const url = addrNetworkEl.textContent;
  if (url && url.startsWith('http')) {
    try { require('electron').shell.openExternal(url); } catch (e) { ipcRenderer.send('open-lis'); }
  } else {
    ipcRenderer.send('open-lis');
  }
});

ipcRenderer.on('server-address', (event, data) => {
  if (!data) return;
  if (typeof data === 'object') {
    if (data.localUrl) {
      currentLocalUrl = data.localUrl;
      addrLocalEl.textContent = data.localUrl;
    }
    if (data.networkUrl) {
      currentNetworkUrl = data.networkUrl;
      addrNetworkEl.textContent = data.networkUrl;
    } else if (data.host && data.port) {
      addrNetworkEl.textContent = `http://${data.host}:${data.port}`;
    }

    // Populate multiple IPs if available
    if (data.allAddresses && Array.isArray(data.allAddresses) && data.allAddresses.length > 1) {
      multiIpBox.style.display = 'flex';
      multiIpSelect.innerHTML = '';
      data.allAddresses.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = item.url;
        opt.textContent = `${item.name}: ${item.url} ${item.isVirtual ? '(Virtual)' : '(LAN)'}`;
        multiIpSelect.appendChild(opt);
      });
    } else {
      multiIpBox.style.display = 'none';
    }
  }
});

multiIpSelect.addEventListener('change', () => {
  if (multiIpSelect.value) {
    addrNetworkEl.textContent = multiIpSelect.value;
  }
});

ipcRenderer.on('server-status', (event, data) => {
  if (!data) return;
  const isUp = !!data.isUp;
  if (isUp) {
    statusBadge.className = 'status-badge status-online';
    statusText.textContent = 'Server Online';
  } else {
    statusBadge.className = 'status-badge status-offline';
    statusText.textContent = 'Server Stopped';
  }
});

// ---- Settings Modal ----
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const restoreUsersBtn = document.getElementById('restore-users');
const restoreDataBtn = document.getElementById('restore-data');
const restoreStatus = document.getElementById('restore-status');

settingsBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
settingsClose.addEventListener('click', () => { settingsModal.style.display = 'none'; });
settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; });

ipcRenderer.on('open-settings', () => { settingsModal.style.display = 'flex'; });

function showRestoreStatus(msg, isError) {
  restoreStatus.textContent = msg;
  restoreStatus.style.color = isError ? '#ff4d4f' : '#52c41a';
}

restoreUsersBtn.addEventListener('click', async () => {
  restoreUsersBtn.disabled = true;
  showRestoreStatus('Restoring admin user...', false);
  try {
    const res = await ipcRenderer.invoke('restore-users');
    showRestoreStatus(res.ok ? 'Default admin user restored successfully.' : ('Failed: ' + (res.error || 'unknown')), !res.ok);
  } catch (e) {
    showRestoreStatus('Error: ' + String(e), true);
  }
  restoreUsersBtn.disabled = false;
});

restoreDataBtn.addEventListener('click', async () => {
  if (!confirm('This will reset data.json to an empty database.\nPatients, tests, and templates will be cleared.\n\nContinue?')) return;
  restoreDataBtn.disabled = true;
  showRestoreStatus('Restoring database...', false);
  try {
    const res = await ipcRenderer.invoke('restore-data');
    showRestoreStatus(res.ok ? 'Data restored to empty database.' : ('Failed: ' + (res.error || 'unknown')), !res.ok);
  } catch (e) {
    showRestoreStatus('Error: ' + String(e), true);
  }
  restoreDataBtn.disabled = false;
});

// Upload handlers
const uploadDataBtn = document.getElementById('upload-data');
const uploadUsersBtn = document.getElementById('upload-users');
const uploadStatus = document.getElementById('upload-status');

function showUploadStatus(msg, isError) {
  uploadStatus.textContent = msg;
  uploadStatus.style.color = isError ? '#ff4d4f' : '#52c41a';
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

// ---- Server Logs & Interactive Terminal Console ----
const logsEl = document.getElementById('logs');
const autoscrollToggle = document.getElementById('autoscroll-toggle');
const clearLogsBtn = document.getElementById('clear-logs');
const copyLogsBtn = document.getElementById('copy-logs');

const cmdInput = document.getElementById('cmd-input');
const cmdSendBtn = document.getElementById('cmd-send');

let cmdHistory = [];
let historyIndex = -1;

function appendLocalLog(text) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${text}\n`;
  logsEl.textContent += line;
  if (autoscrollToggle.checked) {
    logsEl.scrollTop = logsEl.scrollHeight;
  }
}

ipcRenderer.on('log-update', (event, data) => {
  logsEl.textContent = data || '';
  if (autoscrollToggle && autoscrollToggle.checked) {
    logsEl.scrollTop = logsEl.scrollHeight;
  }
});

setInterval(() => ipcRenderer.send('request-logs'), 2000);

clearLogsBtn.addEventListener('click', () => {
  logsEl.textContent = '';
  ipcRenderer.send('run-log-command', 'cls');
});

copyLogsBtn.addEventListener('click', () => {
  copyToClipboard(copyLogsBtn, logsEl.textContent);
});

// Command Submission
function sendTerminalCommand() {
  const val = cmdInput.value.trim();
  if (!val) return;

  cmdHistory.push(val);
  historyIndex = cmdHistory.length;

  if (val.toLowerCase() === 'cls' || val.toLowerCase() === 'clear') {
    logsEl.textContent = '';
  }

  ipcRenderer.send('run-log-command', val);
  cmdInput.value = '';
}

cmdSendBtn.addEventListener('click', sendTerminalCommand);

cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendTerminalCommand();
  } else if (e.key === 'ArrowUp') {
    if (cmdHistory.length > 0 && historyIndex > 0) {
      historyIndex--;
      cmdInput.value = cmdHistory[historyIndex];
    }
  } else if (e.key === 'ArrowDown') {
    if (historyIndex < cmdHistory.length - 1) {
      historyIndex++;
      cmdInput.value = cmdHistory[historyIndex];
    } else {
      historyIndex = cmdHistory.length;
      cmdInput.value = '';
    }
  }
});

// App Icon
ipcRenderer.invoke('get-app-icon').then((dataUrl) => {
  try {
    if (dataUrl) {
      const img = document.getElementById('logo');
      if (img) img.src = dataUrl;
    }
  } catch (e) {}
}).catch(() => {});
