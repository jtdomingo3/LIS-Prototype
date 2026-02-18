(async function(){
  const serverEl = document.getElementById('serverUrl');
  const printerEl = document.getElementById('printerName');
  const saveBtn = document.getElementById('saveBtn');
  const closeBtn = document.getElementById('closeBtn');

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

  load();
})();
