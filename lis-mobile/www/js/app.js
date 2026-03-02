/**
 * Gezyne LIS — Mobile App (Cordova)
 *
 * Opens the configured LIS server URL inside the InAppBrowser plugin
 * so it works like a native embedded browser (no external browser).
 * Persists the server URL in localStorage.
 */

document.addEventListener('deviceready', onDeviceReady, false);

// ─── DOM refs ───
const settingsScreen  = document.getElementById('settings-screen');
const webviewScreen   = document.getElementById('webview-screen');
const serverUrlInput  = document.getElementById('server-url');
const btnConnect      = document.getElementById('btn-connect');
const statusEl        = document.getElementById('connection-status');
const loadingOverlay  = document.getElementById('loading-overlay');
const toolbarTitle    = document.getElementById('toolbar-title');
const btnBack         = document.getElementById('btn-back');
const btnForward      = document.getElementById('btn-forward');
const btnReload       = document.getElementById('btn-reload');
const btnSettings     = document.getElementById('btn-settings');
const frameContainer  = document.getElementById('frame-container');

let currentBrowser = null;   // InAppBrowser reference

// ─── Storage helpers ───
const STORAGE_KEY = 'lis_server_url';
function getSavedUrl()      { return localStorage.getItem(STORAGE_KEY) || ''; }
function saveUrl(url)       { localStorage.setItem(STORAGE_KEY, url); }

// ─── Initialisation ───
function onDeviceReady() {
  const saved = getSavedUrl();
  serverUrlInput.value = saved || 'http://192.168.31.86:3000/';

  // If we already have a saved URL, auto-connect
  if (saved) {
    connectToServer(saved);
  }

  btnConnect.addEventListener('click', onConnectClick);
  btnSettings.addEventListener('click', showSettings);
  btnBack.addEventListener('click', () => { if (currentBrowser) currentBrowser.executeScript({ code: 'history.back()' }); });
  btnForward.addEventListener('click', () => { if (currentBrowser) currentBrowser.executeScript({ code: 'history.forward()' }); });
  btnReload.addEventListener('click', () => { if (currentBrowser) currentBrowser.executeScript({ code: 'location.reload()' }); });

  // Handle Android back button
  document.addEventListener('backbutton', function (e) {
    e.preventDefault();
    if (currentBrowser) {
      currentBrowser.executeScript({ code: 'history.back()' });
    } else if (!settingsScreen.classList.contains('hidden')) {
      // Already on settings — minimize app
      navigator.app.exitApp();
    }
  }, false);
}

// ─── Connect flow ───
function onConnectClick() {
  let url = serverUrlInput.value.trim();
  if (!url) {
    showStatus('Please enter a server URL', 'error');
    return;
  }
  // ensure protocol
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  // remove trailing slash for consistency then re-add
  url = url.replace(/\/+$/, '') + '/';
  serverUrlInput.value = url;
  connectToServer(url);
}

function connectToServer(url) {
  showLoading(true);
  showStatus('', '');
  saveUrl(url);
  // Open InAppBrowser directly — the XHR pre-test is unreliable
  // because Cordova's WebView may block mixed-content HTTP requests.
  // InAppBrowser runs in its own WebView context and handles HTTP fine.
  openInAppBrowser(url);
}

// ─── InAppBrowser ───
function openInAppBrowser(url) {
  // Close any existing browser
  if (currentBrowser) {
    try { currentBrowser.close(); } catch (e) {}
    currentBrowser = null;
  }

  showScreen('webview');

  // Open InAppBrowser — hidden in a way that we overlay it
  var options = [
    'location=no',
    'toolbar=no',
    'hidden=no',
    'clearcache=no',
    'clearsessioncache=no',
    'zoom=no',
    'hardwareback=yes',
    'mediaPlaybackRequiresUserAction=no',
    'shouldPauseOnSuspend=no',
    'closebuttoncaption=Close',
    'disallowoverscroll=yes',
    'enableViewportScale=yes',
    'allowInlineMediaPlayback=yes',
    'fullscreen=no'
  ].join(',');

  currentBrowser = cordova.InAppBrowser.open(url, '_blank', options);

  currentBrowser.addEventListener('loadstart', function () {
    showLoading(true);
  });

  currentBrowser.addEventListener('loadstop', function () {
    showLoading(false);
  });

  currentBrowser.addEventListener('loaderror', function (e) {
    showLoading(false);
    showStatus('Cannot reach server: ' + (e.message || 'Check URL and network'), 'error');
    try { currentBrowser.close(); } catch (ex) {}
    currentBrowser = null;
    showScreen('settings');
  });

  currentBrowser.addEventListener('exit', function () {
    currentBrowser = null;
    showScreen('settings');
  });
}

// ─── UI helpers ───
function showScreen(name) {
  if (name === 'settings') {
    settingsScreen.classList.remove('hidden');
    webviewScreen.classList.add('hidden');
  } else {
    settingsScreen.classList.add('hidden');
    webviewScreen.classList.remove('hidden');
  }
}

function showSettings() {
  if (currentBrowser) {
    try { currentBrowser.close(); } catch (e) {}
    currentBrowser = null;
  }
  showScreen('settings');
}

function showLoading(on) {
  if (on) loadingOverlay.classList.remove('hidden');
  else    loadingOverlay.classList.add('hidden');
}

function showStatus(msg, type) {
  if (!msg) { statusEl.classList.add('hidden'); return; }
  statusEl.textContent = msg;
  statusEl.className = 'status ' + (type || '');
}
