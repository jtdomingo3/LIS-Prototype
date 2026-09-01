/**
 * inject.js — State-of-the-art Client Injected Status Bar & Sync Bridge
 *
 * Provides:
 *   1. Glassmorphic floating status pill at the bottom (Online / Offline / SQLite DataStore)
 *   2. Real-time sync progress, pending queue counter, quick-sync trigger
 *   3. Modern toast notification system for sync events
 *   4. Intercepts window.print() to route to PDF print preview
 */
(function () {
  'use strict';

  if (window.__lisStatusInjected) return;
  window.__lisStatusInjected = true;

  /* ── Neutralize auto-fullscreen and clear persistent fullscreen flags ─ */
  try {
    localStorage.removeItem('keepFullscreen');
    localStorage.removeItem('kioskFullscreen');
    // If inside /shell wrapper, redirect immediately to target url
    if (window.location.pathname === '/shell') {
      var target = new URLSearchParams(window.location.search).get('url') || '/dashboard';
      window.location.replace(target);
      return;
    }
    // Prevent DOM elements from forcing HTML5 fullscreen on button clicks
    if (document && document.documentElement) {
      document.documentElement.requestFullscreen = function () { return Promise.resolve(); };
      document.documentElement.webkitRequestFullscreen = function () { return Promise.resolve(); };
      document.documentElement.mozRequestFullScreen = function () { return Promise.resolve(); };
      document.documentElement.msRequestFullscreen = function () { return Promise.resolve(); };
    }
  } catch (e) { }

  if (!window.lisApp) {
    console.warn('[inject] window.lisApp not found — creating stub');
    window.lisApp = {
      getStatus: function () { return Promise.resolve({ online: false, pendingCount: 0 }); },
      getQueue: function () { return Promise.resolve([]); },
      fullSync: function () { return Promise.resolve({}); },
      forceSync: function () { return Promise.resolve({}); },
      retryConnection: function () { return Promise.resolve({}); },
      openSettings: function () { return Promise.resolve(); },
      printPreview: function () {},
      onNetworkStatus: function () {},
      onSyncComplete: function () {},
      onFullSyncProgress: function () {},
      onFullSyncEnd: function () {},
    };
  }

  /* ── Intercept window.print() → open PDF preview ─────────────── */
  var _origPrint = window.print;
  window.print = function () {
    try {
      var url = window.location.href;
      window.lisApp.printPreview(url);
    } catch (e) {
      console.error('[LIS] print preview failed, falling back:', e);
      _origPrint.call(window);
    }
  };

  /* ── Capture login credentials for server re-auth ─────────────── */
  (function captureLoginCredentials() {
    try {
      var form = document.querySelector('form[action="/login"]');
      if (!form) return;
      form.addEventListener('submit', function () {
        try {
          var emailInput = form.querySelector('input[name="email"]');
          var passwordInput = form.querySelector('input[name="password"]');
          if (emailInput && passwordInput && emailInput.value && passwordInput.value) {
            if (window.lisApp && typeof window.lisApp.saveCredentials === 'function') {
              window.lisApp.saveCredentials(emailInput.value, passwordInput.value);
            }
          }
        } catch (e) { }
      });
    } catch (e) { }
  })();

  /* ── Create Status Bar DOM ────────────────────────────────────── */
  var bar = document.createElement('div');
  bar.id = 'lis-status-bar';
  bar.className = 'lis-online';
  bar.innerHTML = [
    '<div class="lis-status-content">',
    '  <div class="lis-status-left">',
    '    <div class="lis-status-indicator" id="lis-status-pill">',
    '      <span class="lis-status-dot online" id="lis-dot"></span>',
    '      <span id="lis-status-text">Connected</span>',
    '    </div>',
    '    <span class="lis-pending-badge" id="lis-badge" style="display:none" title="Pending offline changes">',
    '      <span id="lis-badge-count">0</span> pending',
    '    </span>',
    '    <div id="lis-sync-progress-wrap">',
    '      <div id="lis-sync-progress"></div>',
    '    </div>',
    '  </div>',
    '  <div class="lis-status-right">',
    '    <button class="lis-btn lis-btn-primary" id="lis-sync-btn" style="display:none">',
    '      <span>⟳</span> Sync Now',
    '    </button>',
    '    <button class="lis-btn" id="lis-retry-btn" style="display:none">',
    '      <span>⚡</span> Connect',
    '    </button>',
    '    <button class="lis-btn lis-btn-icon" id="lis-refresh-btn" title="Refresh page">⟲</button>',
    '    <button class="lis-btn lis-btn-icon" id="lis-settings-btn" title="Settings & GezyneLab DB Storage">⚙</button>',
    '  </div>',
    '</div>',
  ].join('\n');
  document.body.appendChild(bar);

  /* ── Create Toast Notification DOM ────────────────────────────── */
  var toast = document.createElement('div');
  toast.id = 'lis-sync-toast';
  toast.innerHTML = [
    '<div class="lis-toast-icon" id="lis-toast-icon">✓</div>',
    '<div class="lis-toast-body">',
    '  <div class="lis-toast-title" id="lis-toast-title">Sync Complete</div>',
    '  <div class="lis-toast-desc" id="lis-toast-desc">Offline records synchronized successfully.</div>',
    '</div>',
  ].join('\n');
  document.body.appendChild(toast);

  var toastTimer = null;
  function showToast(title, desc, isError) {
    var iconEl = document.getElementById('lis-toast-icon');
    var titleEl = document.getElementById('lis-toast-title');
    var descEl = document.getElementById('lis-toast-desc');

    if (titleEl) titleEl.textContent = title || 'Notification';
    if (descEl) descEl.textContent = desc || '';
    if (iconEl) {
      iconEl.textContent = isError ? '✕' : '✓';
      iconEl.className = 'lis-toast-icon' + (isError ? ' error' : '');
    }
    toast.className = isError ? 'toast-error show' : 'show';

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.className = '';
    }, 4500);
  }

  /* ── Status elements ──────────────────────────────────────────── */
  var dotEl = document.getElementById('lis-dot');
  var textEl = document.getElementById('lis-status-text');
  var badgeEl = document.getElementById('lis-badge');
  var badgeCountEl = document.getElementById('lis-badge-count');
  var syncBtn = document.getElementById('lis-sync-btn');
  var retryBtn = document.getElementById('lis-retry-btn');
  var refreshBtn = document.getElementById('lis-refresh-btn');
  var settingsBtn = document.getElementById('lis-settings-btn');
  var progressWrap = document.getElementById('lis-sync-progress-wrap');
  var progressBar = document.getElementById('lis-sync-progress');

  function updateStatus(data) {
    if (!data) return;
    var online = data.online;
    var count = data.pendingCount || 0;

    if (online) {
      bar.className = 'lis-online';
      dotEl.className = 'lis-status-dot online';
      textEl.textContent = 'Connected (GezyneLab DB)';
      if (retryBtn) retryBtn.style.display = 'none';
      if (syncBtn) syncBtn.style.display = count > 0 ? 'inline-flex' : 'none';
    } else {
      bar.className = 'lis-offline';
      dotEl.className = 'lis-status-dot offline';
      textEl.textContent = 'Offline Mode (GezyneLab DB)';
      if (retryBtn) retryBtn.style.display = 'inline-flex';
      if (syncBtn) syncBtn.style.display = 'none';
    }

    if (count > 0) {
      badgeEl.style.display = 'inline-flex';
      badgeCountEl.textContent = count;
    } else {
      badgeEl.style.display = 'none';
    }
  }

  // Initial status query
  window.lisApp.getStatus().then(updateStatus).catch(function () {});

  // Listen for main-process updates
  window.lisApp.onNetworkStatus(updateStatus);

  window.lisApp.onSyncComplete(function (data) {
    var synced = data.synced || 0;
    var remaining = data.remaining || 0;
    if (synced > 0) {
      showToast('Sync Successful', 'Synced ' + synced + ' offline operation' + (synced === 1 ? '' : 's') + ' to server.');
    }
    window.lisApp.getStatus().then(updateStatus).catch(function () {});
  });

  window.lisApp.onFullSyncProgress(function (data) {
    if (!data) return;
    if (data.phase === 'start') {
      bar.className = 'lis-syncing';
      dotEl.className = 'lis-status-dot syncing';
      textEl.textContent = 'Syncing GezyneLab DB…';
      if (progressWrap) progressWrap.style.display = 'block';
      if (progressBar) progressBar.style.width = '10%';
    } else if (data.phase === 'progress' && data.total && data.loaded) {
      var pct = Math.min(100, Math.round((data.loaded / data.total) * 100));
      if (progressBar) progressBar.style.width = pct + '%';
    } else if (data.phase === 'complete') {
      if (progressWrap) progressWrap.style.display = 'none';
      window.lisApp.getStatus().then(updateStatus).catch(function () {});
      showToast('Database Synchronized', 'Downloaded and updated ' + (data.imported || 0) + ' records.');
    } else if (data.phase === 'error') {
      if (progressWrap) progressWrap.style.display = 'none';
      window.lisApp.getStatus().then(updateStatus).catch(function () {});
      showToast('Sync Warning', data.reason || 'Could not complete database sync.', true);
    }
  });

  window.lisApp.onFullSyncEnd(function (data) {
    if (progressWrap) progressWrap.style.display = 'none';
    window.lisApp.getStatus().then(updateStatus).catch(function () {});
  });

  /* ── Interactive Actions ──────────────────────────────────────── */
  if (syncBtn) {
    syncBtn.addEventListener('click', function () {
      syncBtn.disabled = true;
      syncBtn.innerHTML = '<span>⏳</span> Syncing…';
      window.lisApp.forceSync().then(function (res) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<span>⟳</span> Sync Now';
        if (res && res.success) {
          showToast('Sync Finished', 'Processed pending queue.');
        }
      }).catch(function (err) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<span>⟳</span> Sync Now';
        showToast('Sync Failed', (err && err.message) || 'Error syncing', true);
      });
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      retryBtn.disabled = true;
      retryBtn.innerHTML = '<span>⏳</span> Connecting…';
      window.lisApp.retryConnection().then(function (res) {
        retryBtn.disabled = false;
        retryBtn.innerHTML = '<span>⚡</span> Connect';
        if (res && res.online) {
          showToast('Connected', 'Server connection established.');
        } else {
          showToast('Connection Offline', 'Server still unreachable.', true);
        }
      }).catch(function () {
        retryBtn.disabled = false;
        retryBtn.innerHTML = '<span>⚡</span> Connect';
      });
    });
  }

  if (badgeEl) {
    badgeEl.addEventListener('click', function () {
      if (window.lisApp.openSettings) window.lisApp.openSettings();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      window.location.reload();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', function () {
      if (window.lisApp.openSettings) window.lisApp.openSettings();
    });
  }
})();
