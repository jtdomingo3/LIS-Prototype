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
      getStatus: function () { return Promise.resolve({ online: false, pendingCount: 0, conflictCount: 0 }); },
      getQueue: function () { return Promise.resolve([]); },
      fullSync: function () { return Promise.resolve({}); },
      forceSync: function () { return Promise.resolve({}); },
      retryConnection: function () { return Promise.resolve({}); },
      openSettings: function () { return Promise.resolve(); },
      getConflicts: function () { return Promise.resolve([]); },
      resolveConflict: function () { return Promise.resolve({ success: true }); },
      retryConflict: function () { return Promise.resolve({ success: true }); },
      clearConflicts: function () { return Promise.resolve({ success: true }); },
      exportConflicts: function () { return Promise.resolve('{}'); },
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
    '      <span id="lis-status-text">Connected (GezyneLab DB)</span>',
    '    </div>',
    '    <span class="lis-pending-badge" id="lis-badge" style="display:none" title="Pending offline changes">',
    '      <span id="lis-badge-count">0</span> pending',
    '    </span>',
    '    <span class="lis-conflict-badge" id="lis-conflict-badge" style="display:none" title="Sync Conflicts & Non-merging Errors — Click to Inspect">',
    '      <span class="lis-conflict-dot"></span>',
    '      <span id="lis-conflict-count">0</span> sync error<span id="lis-conflict-plural">s</span>',
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
  var conflictBadgeEl = document.getElementById('lis-conflict-badge');
  var conflictCountEl = document.getElementById('lis-conflict-count');
  var conflictPluralEl = document.getElementById('lis-conflict-plural');
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
    var conflictCount = data.conflictCount || 0;

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

    if (conflictBadgeEl) {
      if (conflictCount > 0) {
        conflictBadgeEl.style.display = 'inline-flex';
        if (conflictCountEl) conflictCountEl.textContent = conflictCount;
        if (conflictPluralEl) conflictPluralEl.textContent = conflictCount === 1 ? '' : 's';
      } else {
        conflictBadgeEl.style.display = 'none';
      }
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

  if (conflictBadgeEl) {
    conflictBadgeEl.addEventListener('click', function () {
      openConflictModal();
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

  /* ── Conflict Investigation Modal ──────────────────────────────── */
  function openConflictModal() {
    var existing = document.getElementById('lis-conflict-modal-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'lis-conflict-modal-overlay';
    overlay.className = 'lis-modal-overlay';

    overlay.innerHTML = [
      '<div class="lis-modal-card">',
      '  <div class="lis-modal-header">',
      '    <div class="lis-modal-header-left">',
      '      <div class="lis-modal-icon-badge">⚠</div>',
      '      <div>',
      '        <h3 class="lis-modal-title">Sync Conflicts & Non-Merging Changes</h3>',
      '        <p class="lis-modal-subtitle">Stored changes that could not be reconciled with the central server</p>',
      '      </div>',
      '    </div>',
      '    <button class="lis-modal-close-btn" id="lis-conflict-modal-close" title="Close">✕</button>',
      '  </div>',
      '  <div class="lis-modal-body" id="lis-conflict-list">',
      '    <div style="text-align:center; padding:30px; color:#94a3b8;">Loading conflict items…</div>',
      '  </div>',
      '  <div class="lis-modal-footer">',
      '    <div style="display:flex; gap:8px;">',
      '      <button class="lis-btn" id="lis-conflict-export-btn">📥 Export JSON Report</button>',
      '      <button class="lis-btn" id="lis-conflict-clear-resolved-btn">🧹 Clear Resolved</button>',
      '      <button class="lis-btn" id="lis-conflict-clear-all-btn" style="color:#f87171; border-color:rgba(239,68,68,0.3);">🗑 Clear All</button>',
      '    </div>',
      '    <button class="lis-btn lis-btn-primary" id="lis-conflict-close-footer-btn">Close</button>',
      '  </div>',
      '</div>'
    ].join('\n');

    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
    var closeBtn = overlay.querySelector('#lis-conflict-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', function () { overlay.remove(); });
    var footerCloseBtn = overlay.querySelector('#lis-conflict-close-footer-btn');
    if (footerCloseBtn) footerCloseBtn.addEventListener('click', function () { overlay.remove(); });

    function loadConflictItems() {
      if (!window.lisApp || typeof window.lisApp.getConflicts !== 'function') return;
      window.lisApp.getConflicts().then(function (conflicts) {
        var listEl = document.getElementById('lis-conflict-list');
        if (!listEl) return;

        if (!conflicts || conflicts.length === 0) {
          listEl.innerHTML = [
            '<div class="lis-empty-conflicts">',
            '  <div class="lis-empty-conflicts-icon">✓</div>',
            '  <h4 style="margin:0 0 6px 0; font-size:16px; color:#f8fafc;">Zero Sync Conflicts</h4>',
            '  <p style="margin:0; font-size:13px;">All local workstation data is harmonized with the central server.</p>',
            '</div>'
          ].join('\n');
          return;
        }

        listEl.innerHTML = '';
        conflicts.forEach(function (item) {
          var isResolved = item.status === 'resolved';
          var card = document.createElement('div');
          card.className = 'lis-conflict-item' + (isResolved ? ' resolved' : '');
          if (isResolved) {
            card.style.borderLeftColor = '#10b981';
            card.style.opacity = '0.7';
          }

          var dateStr = '';
          try {
            dateStr = new Date(item.timestamp).toLocaleString();
          } catch (e) { dateStr = item.timestamp || ''; }

          var payloadStr = '';
          if (item.payload) {
            try {
              payloadStr = JSON.stringify(item.payload, null, 2);
            } catch (e) { payloadStr = String(item.payload); }
          }

          var entityBadge = escapeHtml(item.entity || 'general');
          var opText = escapeHtml(item.operation || 'Sync Replay');
          var errText = escapeHtml(item.error || 'Conflict or non-merging record detected');
          var statusBadge = isResolved
            ? '<span style="background:rgba(16,185,129,0.2); color:#6ee7b7; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:700;">RESOLVED</span>'
            : '<span class="lis-conflict-tag">UNRESOLVED</span>';

          var html = [
            '<div class="lis-conflict-item-header">',
            '  <div class="lis-conflict-meta">',
            '    ' + statusBadge,
            '    <span class="lis-conflict-op">' + opText + '</span>',
            '    <span style="font-size:11px; color:#cbd5e1; font-weight:600;">[' + entityBadge + ']</span>',
            '  </div>',
            '  <span class="lis-conflict-time">' + dateStr + '</span>',
            '</div>',
            '<div class="lis-conflict-error-box">' + errText + '</div>'
          ];

          if (item.resolutionNote) {
            html.push('<div style="font-size:11px; color:#6ee7b7; margin-bottom:6px;">Resolution: ' + escapeHtml(item.resolutionNote) + '</div>');
          }

          if (payloadStr) {
            var payloadId = 'payload-' + item.id;
            html.push(
              '<button class="lis-conflict-payload-toggle" data-target="' + payloadId + '">▶ View Payload Details</button>',
              '<div class="lis-conflict-payload-box" id="' + payloadId + '">' + escapeHtml(payloadStr) + '</div>'
            );
          }

          if (!isResolved) {
            html.push(
              '<div class="lis-conflict-actions">',
              '  <button class="lis-btn lis-btn-retry" data-id="' + item.id + '" style="background:rgba(56,189,248,0.2); border-color:rgba(56,189,248,0.4); color:#38bdf8;">⟳ Retry Sync</button>',
              '  <button class="lis-btn lis-btn-resolve" data-id="' + item.id + '" style="background:rgba(16,185,129,0.2); border-color:rgba(16,185,129,0.4); color:#6ee7b7;">✓ Mark Resolved</button>',
              '</div>'
            );
          }

          card.innerHTML = html.join('\n');
          listEl.appendChild(card);
        });

        // Wire up toggle buttons
        var toggles = listEl.querySelectorAll('.lis-conflict-payload-toggle');
        toggles.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var targetId = btn.getAttribute('data-target');
            var targetEl = document.getElementById(targetId);
            if (!targetEl) return;
            var isHidden = targetEl.style.display === 'none' || !targetEl.style.display;
            targetEl.style.display = isHidden ? 'block' : 'none';
            btn.textContent = isHidden ? '▼ Hide Payload Details' : '▶ View Payload Details';
          });
        });

        // Wire up retry buttons
        var retryBtns = listEl.querySelectorAll('.lis-btn-retry');
        retryBtns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            btn.disabled = true;
            btn.textContent = 'Retrying…';
            window.lisApp.retryConflict(id).then(function () {
              showToast('Conflict Re-queued', 'Operation added back to sync queue.');
              loadConflictItems();
              window.lisApp.getStatus().then(updateStatus).catch(function () {});
            }).catch(function (err) {
              btn.disabled = false;
              btn.textContent = '⟳ Retry Sync';
              showToast('Retry Failed', (err && err.message) || 'Could not retry', true);
            });
          });
        });

        // Wire up resolve buttons
        var resolveBtns = listEl.querySelectorAll('.lis-btn-resolve');
        resolveBtns.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-id');
            btn.disabled = true;
            btn.textContent = 'Resolving…';
            window.lisApp.resolveConflict(id, 'Manually marked as resolved').then(function () {
              showToast('Conflict Resolved', 'Marked conflict as resolved.');
              loadConflictItems();
              window.lisApp.getStatus().then(updateStatus).catch(function () {});
            }).catch(function (err) {
              btn.disabled = false;
              btn.textContent = '✓ Mark Resolved';
              showToast('Resolve Failed', (err && err.message) || 'Could not resolve', true);
            });
          });
        });
      }).catch(function (err) {
        var listEl = document.getElementById('lis-conflict-list');
        if (listEl) listEl.innerHTML = '<div style="color:#ef4444; padding:20px; text-align:center;">Failed to load conflicts: ' + escapeHtml(err && err.message) + '</div>';
      });
    }

    var exportBtn = overlay.querySelector('#lis-conflict-export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        if (!window.lisApp || typeof window.lisApp.exportConflicts !== 'function') return;
        window.lisApp.exportConflicts().then(function (jsonReport) {
          var blob = new Blob([jsonReport], { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'lis-sync-conflicts-' + Date.now() + '.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          showToast('Report Exported', 'Conflict report downloaded successfully.');
        }).catch(function (e) {
          showToast('Export Failed', (e && e.message) || 'Error exporting', true);
        });
      });
    }

    var clearBtn = overlay.querySelector('#lis-conflict-clear-resolved-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (!window.lisApp || typeof window.lisApp.clearConflicts !== 'function') return;
        window.lisApp.clearConflicts().then(function () {
          showToast('Cleared', 'Cleaned up resolved conflict items.');
          loadConflictItems();
          window.lisApp.getStatus().then(updateStatus).catch(function () {});
        });
      });
    }

    var clearAllBtn = overlay.querySelector('#lis-conflict-clear-all-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', function () {
        if (!confirm('Clear all conflict records from the log?')) return;
        if (!window.lisApp || typeof window.lisApp.clearAllConflicts !== 'function') return;
        window.lisApp.clearAllConflicts().then(function () {
          showToast('Cleared All', 'All conflict records removed.');
          loadConflictItems();
          window.lisApp.getStatus().then(updateStatus).catch(function () {});
        });
      });
    }

    loadConflictItems();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
