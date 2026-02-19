/**
 * inject.js — Injected into every page loaded in the BrowserWindow.
 *
 * Creates:
 *   1. A persistent status bar at the bottom (online/offline indicator)
 *   2. A toast notification system for sync events
 *   3. Intercepts window.print() to use our PDF print preview
 *
 * Uses `window.lisApp` (exposed by preload.js).
 */
(function () {
  'use strict';

  // Guard against double injection (page reload, etc.)
  if (window.__lisStatusInjected) return;
  window.__lisStatusInjected = true;

  // If the preload bridge isn't available yet, create a stub so the UI
  // still renders.  The real bridge should always be present, but if for
  // some reason it isn't (e.g. timing edge case), the status bar will
  // still display — just without IPC functionality.
  if (!window.lisApp) {
    console.warn('[inject] window.lisApp not found — creating stub');
    window.lisApp = {
      getStatus: function () { return Promise.resolve({ online: false, pendingCount: 0 }); },
      getQueue: function () { return Promise.resolve([]); },
      fullSync: function () { return Promise.resolve({}); },
      retryConnection: function () { return Promise.resolve({}); },
      openSettings: function () { return Promise.resolve(); },
      printPreview: function () {},
      onNetworkStatus: function () {},
      onSyncComplete: function () {},
      onFullSyncProgress: function () {},
      onFullSyncEnd: function () {},
    };
  }

  /* ==============================================================
   *  Intercept window.print() → open our PDF print preview instead
   * ============================================================== */
  var _origPrint = window.print;
  window.print = function () {
    try {
      // Send the current page URL to the main process for PDF preview
      var url = window.location.href;
      window.lisApp.printPreview(url);
    } catch (e) {
      console.error('[LIS] print preview failed, falling back:', e);
      _origPrint.call(window);
    }
  };

  /* ==============================================================
   *  Status bar DOM
   * ============================================================== */
  const bar = document.createElement('div');
  bar.id = 'lis-status-bar';
  bar.className = 'lis-online';
  bar.innerHTML = [
    '<div class="lis-status-content">',
    '  <span class="lis-status-dot online" id="lis-dot"></span>',
    '  <span id="lis-status-text">Connecting…</span>',
    '  <span class="lis-pending-badge" id="lis-badge" style="display:none"></span>',
    '  <button class="lis-sync-btn" id="lis-sync-btn" style="display:none">Sync Now</button>',
    '  <button class="lis-download-btn" id="lis-download-btn" title="Download data" style="display:none">⬇</button>',
    '  <button class="lis-refresh-btn" id="lis-refresh-btn" title="Refresh">⟲</button>',
    '  <button class="lis-retry-btn" id="lis-retry-btn" title="Connect" style="display:none">Connect</button>',
    '  <button class="lis-settings-btn" id="lis-settings-btn" title="Settings">⚙</button>',
    '</div>',
  ].join('\n');
  document.body.appendChild(bar);

  const dot      = document.getElementById('lis-dot');
  const text     = document.getElementById('lis-status-text');
  const badge    = document.getElementById('lis-badge');
  const syncBtn  = document.getElementById('lis-sync-btn');
  const downloadBtn = document.getElementById('lis-download-btn');
  const refreshBtn = document.getElementById('lis-refresh-btn');
  const retryBtn = document.getElementById('lis-retry-btn');

  // progress UI (hidden until needed)
  const progressWrap = document.createElement('div');
  progressWrap.id = 'lis-sync-progress-wrap';
  progressWrap.style.display = 'none';
  progressWrap.innerHTML = '<div id="lis-sync-progress"></div>';
  bar.appendChild(progressWrap);
  const progressBar = progressWrap.querySelector('#lis-sync-progress');

  /* ==============================================================
   *  Toast helper
   * ============================================================== */
  function showToast(message, durationMs) {
    let toast = document.getElementById('lis-sync-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'lis-sync-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'show';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.className = ''; }, durationMs || 4000);
  }

  /* ==============================================================
   *  Update the bar based on status data
   * ============================================================== */
  function updateUI(data) {
    if (!data) return;

    const online  = data.online;
    const pending = data.pendingCount || 0;
    const lastFullSync = data.lastFullSync || null;

    // expose lastFullSync for use in auto-sync logic
    window.__lis_lastFullSync = lastFullSync;

    // Dot + text
    if (online) {
      // if a full-sync is active, show syncing state
      if (window.__lis_fullSyncActive) {
        bar.className = 'lis-syncing';
        dot.className = 'lis-status-dot syncing';
        text.textContent = 'Downloading data…';
      } else {
        bar.className   = 'lis-online';
        dot.className   = 'lis-status-dot online';
        text.textContent = lastFullSync ? 'Connected — data up to date' : 'Connected — no local data';
      }
    } else {
      bar.className   = 'lis-offline';
      dot.className   = 'lis-status-dot offline';
      text.textContent = 'Offline Mode — data is saved locally';
      // show Connect button when offline so users can retry connecting
      if (retryBtn) retryBtn.style.display = 'inline-block';
    }

    // Pending badge
    if (pending > 0) {
      badge.style.display = 'inline';
      badge.textContent   = pending + ' pending sync';
      syncBtn.style.display = online ? 'inline-block' : 'none';
      downloadBtn.style.display = 'inline-block';
    } else {
      badge.style.display   = 'none';
      syncBtn.style.display = 'none';
      downloadBtn.style.display = online ? 'inline-block' : 'none';
    }
    // hide retry when online
    if (retryBtn) retryBtn.style.display = online ? 'none' : retryBtn.style.display;
  }

  /* ==============================================================
   *  Wire up events
   * ============================================================== */

  // Initial status
  window.lisApp.getStatus().then(updateUI).catch(() => {});

  // Auto-trigger full-sync when connection becomes available
  async function maybeAutoFullSync(online) {
    try {
      if (!online) return;
      // don't run multiple times concurrently
      if (window.__lis_fullSyncActive) return;
      // if we already have a recent sync (within 5 minutes), skip
      const last = window.__lis_lastFullSync ? new Date(window.__lis_lastFullSync) : null;
      const FIVE_MIN = 5 * 60 * 1000;
      if (last && (Date.now() - last.getTime()) < FIVE_MIN) return;

      // mark active and update UI
      window.__lis_fullSyncActive = true;
      updateUI({ online: true, pendingCount: badge && badge.textContent ? parseInt(badge.textContent,10) : 0, lastFullSync: window.__lis_lastFullSync });
      const res = await window.lisApp.fullSync();
      window.__lis_fullSyncActive = false;

      // update lastFullSync and UI from response
      if (res && res.lastFullSync) window.__lis_lastFullSync = res.lastFullSync;
      updateUI({ online: true, pendingCount: badge && badge.textContent ? parseInt(badge.textContent,10) : 0, lastFullSync: window.__lis_lastFullSync });

      if (res && res.success) {
        showToast('✓ Full data synced (' + (res.imported || 0) + ' records)', 4000);
      } else {
        showToast('Full sync failed: ' + (res && res.reason ? res.reason : 'unknown'), 5000);
      }
    } catch (e) {
      window.__lis_fullSyncActive = false;
      showToast('Full sync error: ' + (e && e.message ? e.message : String(e)), 5000);
    }
  }

  // Live status changes from main process
  window.lisApp.onNetworkStatus(updateUI);
  window.lisApp.onNetworkStatus(function (data) {
    updateUI(data);
    maybeAutoFullSync(data && data.online);
  });

  // Sync-complete toast
  window.lisApp.onSyncComplete(function (data) {
    showToast('✓ Synced ' + data.synced + ' operation(s) — refreshing…', 3000);
  });

  // Full-sync progress events from main
  if (window.lisApp.onFullSyncProgress) {
    window.lisApp.onFullSyncProgress(function (p) {
      try {
        if (!p) return;
        if (p.phase === 'start') {
          progressWrap.style.display = 'block';
          progressBar.style.width = '0%';
        } else if (p.phase === 'progress') {
          if (p.total) {
            const pct = Math.min(100, Math.round((p.loaded / p.total) * 100));
            progressBar.style.width = pct + '%';
          } else {
            progressBar.style.width = '60%';
          }
        } else if (p.phase === 'complete') {
          progressBar.style.width = '100%';
          setTimeout(() => { progressWrap.style.display = 'none'; }, 600);
        } else if (p.phase === 'error') {
          // Defer showing transient errors until final result to avoid
          // flashing an error toast when a renderer-fallback or retry
          // subsequently succeeds. Store the reason for later.
          progressWrap.style.display = 'none';
          window.__lis_fullSyncError = p.reason || 'unknown';
        }
      } catch (e) {}
    });
  }

  if (window.lisApp.onFullSyncEnd) {
    window.lisApp.onFullSyncEnd(function (res) {
      try {
        progressWrap.style.display = 'none';
        if (res && res.success) {
          showToast('✓ Full data synced (' + (res.imported || 0) + ' records)', 4000);
          window.__lis_fullSyncError = null;
          setTimeout(function () { location.reload(); }, 1200);
        } else if (res && res.reason) {
          // Final failure — prefer explicit `res.reason` over any transient
          // progress error stored earlier.
          const reason = res.reason || window.__lis_fullSyncError || 'unknown';
          showToast('Full sync failed: ' + reason, 5000);
          window.__lis_fullSyncError = null;
        }
      } catch (e) {}
    });
  }

  // Manual sync button — trigger full data download with progress
  syncBtn.addEventListener('click', function () {
    syncBtn.textContent = 'Downloading…';
    syncBtn.disabled = true;
    progressWrap.style.display = 'block';
    progressBar.style.width = '0%';
    window.lisApp.fullSync().then(function (result) {
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Now';
      progressWrap.style.display = 'none';
      if (result && result.success) {
        showToast('✓ Full data synced (' + (result.imported || 0) + ' records)', 4000);
        setTimeout(function () { location.reload(); }, 1200);
      } else {
        showToast('Full sync failed: ' + (result && result.reason ? result.reason : 'unknown'), 4000);
      }
    }).catch(function () {
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Now';
      progressWrap.style.display = 'none';
      showToast('Full sync error', 4000);
    });
  });

  // Manual download button — explicit full data download
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () {
      downloadBtn.textContent = '⬇';
      downloadBtn.disabled = true;
      progressWrap.style.display = 'block';
      progressBar.style.width = '0%';
      window.lisApp.fullSync().then(function (result) {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '⬇';
        progressWrap.style.display = 'none';
        if (result && result.success) {
          showToast('✓ Full data synced (' + (result.imported || 0) + ' records)', 4000);
          setTimeout(function () { location.reload(); }, 1200);
        } else {
          showToast('Full sync failed: ' + (result && result.reason ? result.reason : 'unknown'), 4000);
        }
      }).catch(function () {
        downloadBtn.disabled = false;
        downloadBtn.textContent = '⬇';
        progressWrap.style.display = 'none';
        showToast('Full sync error', 4000);
      });
    });
  }

  // Refresh button — reloads the current page (useful in standalone app)
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      try { location.reload(); } catch (e) { console.error('[LIS] refresh failed', e); }
    });
  }

  // Connect/Retry button — try to re-establish connection to configured server
  if (retryBtn) {
    retryBtn.addEventListener('click', async function () {
      try {
        retryBtn.disabled = true;
        retryBtn.textContent = 'Connecting…';
        const res = await window.lisApp.retryConnection();
        retryBtn.disabled = false;
        retryBtn.textContent = 'Connect';
        if (res && res.online) {
          showToast('Connection restored — loading server UI', 3000);
          setTimeout(function () { try { location.href = res.serverUrl || '/'; } catch (e) {} }, 600);
        } else {
          showToast('Server not reachable', 3000);
        }
      } catch (e) {
        retryBtn.disabled = false;
        retryBtn.textContent = 'Connect';
        showToast('Connection attempt failed', 3000);
      }
    });
  }

  // Settings button — open the settings window in the Electron host
  const settingsBtn = document.getElementById('lis-settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', function () {
      if (window.lisApp && typeof window.lisApp.openSettings === 'function') {
        window.lisApp.openSettings();
      }
    });
  }

  // Patch fetch so thermal-print requests include the local printer override (if set)
  (function patchFetchForPrinterOverride() {
    if (!window.fetch || !window.lisApp) return;
    const _origFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
      try {
        const targetUrl = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
        if (targetUrl && targetUrl.indexOf('/patients/thermal-print') !== -1) {
          try {
            const settings = await window.lisApp.getSettings();
            const printer = settings && (settings.printerName || settings.printer);
            if (printer) {
              let bodyObj = {};
              if (init && init.body) {
                try { bodyObj = JSON.parse(init.body); } catch(_) {}
              }
              bodyObj.printer = printer;
              init = Object.assign({}, init || {}, { body: JSON.stringify(bodyObj), headers: Object.assign({}, init && init.headers, { 'Content-Type': 'application/json' }) });
            }
          } catch (e) { /* ignore */ }
        }
      } catch (e) {}
      return _origFetch(input, init);
    };
  })();
})();
