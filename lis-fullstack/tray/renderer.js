const { ipcRenderer } = require('electron');

const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');
const restartBtn = document.getElementById('restart');
const openBtn = document.getElementById('open');
const hideBtn = document.getElementById('hide');
const logsEl = document.getElementById('logs');

startBtn.addEventListener('click', () => ipcRenderer.send('start-server'));
stopBtn.addEventListener('click', () => ipcRenderer.send('stop-server'));
restartBtn.addEventListener('click', () => ipcRenderer.send('restart-server'));
openBtn.addEventListener('click', () => ipcRenderer.send('open-lis'));
hideBtn.addEventListener('click', () => ipcRenderer.send('hide-window'));

ipcRenderer.on('log-update', (event, data) => {
  logsEl.textContent = data || '';
  // scroll to bottom
  logsEl.scrollTop = logsEl.scrollHeight;
});

// request periodic logs
setInterval(() => ipcRenderer.send('request-logs'), 2000);
