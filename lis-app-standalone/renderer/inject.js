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

  // Bail if the bridge isn't available (shouldn't happen, but be safe)
  if (!window.lisApp) return;

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
    '  <button class="lis-refresh-btn" id="lis-refresh-btn" title="Refresh">⟲</button>',
    '</div>',
  ].join('\n');
  document.body.appendChild(bar);

  const dot      = document.getElementById('lis-dot');
  const text     = document.getElementById('lis-status-text');
  const badge    = document.getElementById('lis-badge');
  const syncBtn  = document.getElementById('lis-sync-btn');
  const refreshBtn = document.getElementById('lis-refresh-btn');

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

    // Dot + text
    if (online) {
      bar.className   = 'lis-online';
      dot.className   = 'lis-status-dot online';
      text.textContent = 'Connected to Server';
    } else {
      bar.className   = 'lis-offline';
      dot.className   = 'lis-status-dot offline';
      text.textContent = 'Offline Mode — data is saved locally';
    }

    // Pending badge
    if (pending > 0) {
      badge.style.display = 'inline';
      badge.textContent   = pending + ' pending sync';
      syncBtn.style.display = online ? 'inline-block' : 'none';
    } else {
      badge.style.display   = 'none';
      syncBtn.style.display = 'none';
    }
  }

  /* ==============================================================
   *  Wire up events
   * ============================================================== */

  // Initial status
  window.lisApp.getStatus().then(updateUI).catch(() => {});

  // Live status changes from main process
  window.lisApp.onNetworkStatus(updateUI);

  // Sync-complete toast
  window.lisApp.onSyncComplete(function (data) {
    showToast('✓ Synced ' + data.synced + ' operation(s) — refreshing…', 3000);
  });

  // Manual sync button
  syncBtn.addEventListener('click', function () {
    syncBtn.textContent = 'Syncing…';
    syncBtn.disabled = true;
    window.lisApp.forceSync().then(function (result) {
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Now';
      if (result.success && result.synced > 0) {
        showToast('✓ Synced ' + result.synced + ' operation(s)', 3000);
        setTimeout(function () { location.reload(); }, 1200);
      } else if (!result.success) {
        showToast('Cannot sync — still offline', 3000);
      } else {
        showToast('Nothing to sync', 2000);
      }
    }).catch(function () {
      syncBtn.disabled = false;
      syncBtn.textContent = 'Sync Now';
    });
  });

  // Refresh button — reloads the current page (useful in standalone app)
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      try { location.reload(); } catch (e) { console.error('[LIS] refresh failed', e); }
    });
  }
})();
