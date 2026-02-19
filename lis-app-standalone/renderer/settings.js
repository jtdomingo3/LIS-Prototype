(async function(){
  const serverEl = document.getElementById('serverUrl');
  const printerEl = document.getElementById('printerName');
  const saveBtn = document.getElementById('saveBtn');
  const closeBtn = document.getElementById('closeBtn');
  const discardBtn = document.getElementById('discardBtn');
  const dropBtn = document.getElementById('dropBtn');

  async function load() {
    try {
      const s = await window.lisApp.getSettings();
      if (s && s.serverUrl) serverEl.value = s.serverUrl;
      if (s && (s.printerName || s.printer)) printerEl.value = s.printerName || s.printer || '';
    } catch (e) {}
  }
  saveBtn.addEventListener('click', async function(){
    const newS = { serverUrl: serverEl.value ? String(serverEl.value).trim() : '', printerName: printerEl.value ? String(printerEl.value).trim() : '' };
    await window.lisApp.setSettings(newS);
    // reload main window of the app to apply server change
    try { window.close(); } catch(e) {}
  });
  closeBtn.addEventListener('click', () => { try { window.close(); } catch(e) {} });

  if (discardBtn) {
    discardBtn.addEventListener('click', async () => {
      if (!confirm('Discard all local queued changes and fetch latest from server? This cannot be undone.')) return;
      try {
        const res = await window.lisApp.discardLocalChanges();
        if (res && res.success) {
          alert('Local changes discarded. Local data refreshed.');
          try { window.close(); } catch(e) {}
        } else {
          alert('Discard failed: ' + (res && res.reason ? res.reason : 'unknown'));
        }
      } catch (e) { alert('Discard failed: ' + (e && e.message)); }
    });
  }

  if (dropBtn) {
    dropBtn.addEventListener('click', async () => {
      if (!confirm('Drop all offline data and replace from server export? This is destructive and will overwrite local data.')) return;
      try {
        const res = await window.lisApp.dropOfflineData();
        if (res && res.success) {
          alert('Offline data replaced from server.');
          try { window.close(); } catch(e) {}
        } else {
          alert('Replace failed: ' + (res && res.reason ? res.reason : 'unknown'));
        }
      } catch (e) { alert('Replace failed: ' + (e && e.message)); }
    });
  }

  load();
})();
