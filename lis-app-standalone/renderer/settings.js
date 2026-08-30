(async function () {
  'use strict';

  // Elements
  const serverEl = document.getElementById('serverUrl');
  const printerEl = document.getElementById('printerName');
  const lastSyncEl = document.getElementById('lastSyncTime');
  const testConnBtn = document.getElementById('testConnBtn');
  const saveBtn = document.getElementById('saveBtn');
  const closeBtn = document.getElementById('closeBtn');
  const closeHeaderBtn = document.getElementById('closeHeaderBtn');
  const discardBtn = document.getElementById('discardBtn');
  const dropBtn = document.getElementById('dropBtn');
  const backupBtn = document.getElementById('backupBtn');
  const refreshQueueBtn = document.getElementById('refreshQueueBtn');
  const clearQueueBtn = document.getElementById('clearQueueBtn');
  const queueTbody = document.getElementById('queueTbody');
  const feedbackEl = document.getElementById('feedbackMsg');

  // Stats elements
  const statPatients = document.getElementById('statPatients');
  const statTests = document.getElementById('statTests');
  const statUsers = document.getElementById('statUsers');
  const statTemplates = document.getElementById('statTemplates');
  const dbFilePath = document.getElementById('dbFilePath');
  const dbEngine = document.getElementById('dbEngine');
  const dbFileSize = document.getElementById('dbFileSize');

  function setFeedback(msg, isError) {
    if (!feedbackEl) return;
    feedbackEl.textContent = msg;
    feedbackEl.className = 'feedback-msg' + (isError ? ' error' : '');
    setTimeout(() => {
      if (feedbackEl.textContent === msg) feedbackEl.textContent = '';
    }, 4000);
  }

  // Tab switching
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const tabId = item.getAttribute('data-tab');
      const targetPane = document.getElementById(tabId);
      if (targetPane) targetPane.classList.add('active');

      if (tabId === 'tab-storage' || tabId === 'tab-queue') {
        loadDataStoreInfo();
        loadQueue();
      }
    });
  });

  // Load initial settings & status
  async function load() {
    try {
      if (!window.lisApp) return;

      const s = await window.lisApp.getSettings();
      if (s) {
        if (s.serverUrl) serverEl.value = s.serverUrl;
        if (s.printerName || s.printer) printerEl.value = s.printerName || s.printer || '';
      }

      const st = await window.lisApp.getStatus();
      if (st && st.lastFullSync) {
        lastSyncEl.textContent = new Date(st.lastFullSync).toLocaleString();
      }

      await loadDataStoreInfo();
      await loadQueue();
    } catch (e) {
      console.warn('[Settings] load failed:', e);
    }
  }

  async function loadDataStoreInfo() {
    try {
      if (!window.lisApp) return;
      const info = await window.lisApp.getDataStoreInfo();
      if (info) {
        if (info.filePath) dbFilePath.textContent = info.filePath;
        if (info.engine) dbEngine.textContent = info.engine;
        if (info.size) {
          const kb = Math.round(info.size / 1024);
          dbFileSize.textContent = kb > 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb + ' KB';
        }
        if (info.counts) {
          if (statPatients) statPatients.textContent = info.counts.patients || 0;
          if (statTests) statTests.textContent = info.counts.tests || 0;
          if (statUsers) statUsers.textContent = info.counts.users || 0;
          if (statTemplates) statTemplates.textContent = info.counts.templates || 0;
        }
      }
    } catch (e) { }
  }

  async function loadQueue() {
    try {
      if (!window.lisApp || !queueTbody) return;
      const queue = await window.lisApp.getQueue();
      const pending = Array.isArray(queue) ? queue.filter(o => o.status === 'pending') : [];

      if (!pending.length) {
        queueTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b; padding:20px;">No pending operations in queue. All data synced.</td></tr>';
        return;
      }

      let html = '';
      pending.forEach((op, idx) => {
        const time = op.createdAt ? new Date(op.createdAt).toLocaleTimeString() : '—';
        const method = op.method || 'POST';
        const methodBadge = method === 'POST' ? '<span style="color:#60a5fa;font-weight:700;">POST</span>' :
                            method === 'PUT' ? '<span style="color:#34d399;font-weight:700;">PUT</span>' :
                            '<span style="color:#f87171;font-weight:700;">DEL</span>';
        let urlShort = op.url || '';
        try { urlShort = new URL(op.url).pathname; } catch (e) {}

        html += `
          <tr>
            <td>${methodBadge}</td>
            <td title="${op.url}">${urlShort}</td>
            <td>${time}</td>
            <td><span class="badge-ver" style="background:rgba(245,158,11,0.15);color:#fbbf24;border-color:rgba(245,158,11,0.3)">Pending</span></td>
            <td>
              <button class="btn btn-danger btn-sm" onclick="window.removeQueueItem('${op.id}')">Delete</button>
            </td>
          </tr>
        `;
      });
      queueTbody.innerHTML = html;
    } catch (e) {
      console.warn('[Settings] loadQueue failed:', e);
    }
  }

  window.removeQueueItem = async function (id) {
    if (!confirm('Remove this queued operation?')) return;
    try {
      const res = await window.lisApp.deleteQueueItem(id);
      if (res && res.success) {
        setFeedback('Queued operation removed.');
        loadQueue();
      }
    } catch (e) {
      setFeedback('Failed to remove item: ' + e.message, true);
    }
  };

  // Test Connection
  if (testConnBtn) {
    testConnBtn.addEventListener('click', async () => {
      const url = serverEl.value ? String(serverEl.value).trim() : '';
      if (!url) {
        setFeedback('Please enter a server URL to test.', true);
        return;
      }
      testConnBtn.disabled = true;
      testConnBtn.textContent = 'Testing…';
      try {
        const res = await window.lisApp.retryConnection();
        testConnBtn.disabled = false;
        testConnBtn.textContent = 'Test';
        if (res && res.online) {
          setFeedback('✓ Connection Successful! Server is reachable.');
        } else {
          setFeedback('✕ Server Unreachable. Please check the IP and port.', true);
        }
      } catch (e) {
        testConnBtn.disabled = false;
        testConnBtn.textContent = 'Test';
        setFeedback('✕ Error testing connection.', true);
      }
    });
  }

  // Save Settings
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        const newSettings = {
          serverUrl: serverEl.value ? String(serverEl.value).trim() : '',
          printerName: printerEl.value ? String(printerEl.value).trim() : ''
        };
        await window.lisApp.setSettings(newSettings);
        setFeedback('✓ Settings saved successfully.');
        setTimeout(() => { try { window.close(); } catch (e) {} }, 600);
      } catch (e) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Settings';
        setFeedback('Failed to save settings: ' + e.message, true);
      }
    });
  }

  // Backup SQLite DB
  if (backupBtn) {
    backupBtn.addEventListener('click', async () => {
      backupBtn.disabled = true;
      backupBtn.innerHTML = '<span>⏳</span> Backing up…';
      try {
        const res = await window.lisApp.performBackup();
        backupBtn.disabled = false;
        backupBtn.innerHTML = '<span>💾</span> Backup SQLite Database Now';
        if (res && res.success) {
          setFeedback('✓ Backup created in Documents/GezyneLIS/backups');
        } else {
          setFeedback('Backup failed or no files copied.', true);
        }
      } catch (e) {
        backupBtn.disabled = false;
        backupBtn.innerHTML = '<span>💾</span> Backup SQLite Database Now';
        setFeedback('Backup failed: ' + e.message, true);
      }
    });
  }

  // Discard Local Changes
  if (discardBtn) {
    discardBtn.addEventListener('click', async () => {
      if (!confirm('Discard all local queued changes and pull latest records from server? This will backup current data first.')) return;
      discardBtn.disabled = true;
      try {
        const res = await window.lisApp.discardLocalChanges();
        discardBtn.disabled = false;
        if (res && res.success) {
          setFeedback('✓ Local changes discarded and fresh server records loaded.');
          loadDataStoreInfo();
          loadQueue();
        } else {
          setFeedback('Discard failed: ' + (res.reason || 'unknown'), true);
        }
      } catch (e) {
        discardBtn.disabled = false;
        setFeedback('Discard failed: ' + e.message, true);
      }
    });
  }

  // Drop and replace from server
  if (dropBtn) {
    dropBtn.addEventListener('click', async () => {
      if (!confirm('Warning: This will overwrite the local SQLite database with a fresh export from the server. Continue?')) return;
      dropBtn.disabled = true;
      try {
        const res = await window.lisApp.dropOfflineData();
        dropBtn.disabled = false;
        if (res && res.success) {
          setFeedback('✓ Offline database rebuilt from server export.');
          loadDataStoreInfo();
          loadQueue();
        } else {
          setFeedback('Rebuild failed: ' + (res.reason || 'unknown'), true);
        }
      } catch (e) {
        dropBtn.disabled = false;
        setFeedback('Rebuild failed: ' + e.message, true);
      }
    });
  }

  // Refresh Queue
  if (refreshQueueBtn) {
    refreshQueueBtn.addEventListener('click', loadQueue);
  }

  // Clear Queue
  if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', async () => {
      if (!confirm('Clear all pending operations from the queue?')) return;
      try {
        await window.lisApp.clearQueue();
        setFeedback('Pending queue cleared.');
        loadQueue();
      } catch (e) {
        setFeedback('Failed to clear queue.', true);
      }
    });
  }

  // Close buttons
  if (closeBtn) closeBtn.addEventListener('click', () => { try { window.close(); } catch (e) {} });
  if (closeHeaderBtn) closeHeaderBtn.addEventListener('click', () => { try { window.close(); } catch (e) {} });

  load();
})();
