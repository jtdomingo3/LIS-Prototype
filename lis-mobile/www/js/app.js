(function (window) {
  const DEFAULT_SERVER_URL = 'http://192.168.31.86:3000';
  let SERVER_URL = DEFAULT_SERVER_URL;

  async function loadServerUrl() {
    try {
      const saved = await window.LISDataStore.get('server_url');
      if (saved && String(saved).trim()) SERVER_URL = String(saved).trim();
    } catch (e) { /* ignore */ }
  }

  function updateServerDisplay() {
    const el = document.getElementById('current-server');
    const input = document.getElementById('server-url-input');
    if (el) el.textContent = SERVER_URL ? `server: ${SERVER_URL}` : 'server: not set';
    if (input) input.value = SERVER_URL || DEFAULT_SERVER_URL;
  }

  function saveServerUrl(val) {
    SERVER_URL = val || DEFAULT_SERVER_URL;
    return window.LISDataStore.set('server_url', SERVER_URL).then(()=> updateServerDisplay());
  }

  async function testServerUrl(url) {
    // Primary probe: try to load the URL into a hidden iframe and detect a real load.
    const iframeProbe = () => new Promise((resolve) => {
      const timer = setTimeout(()=> { cleanup(); resolve({ ok: false, error: 'timeout' }); }, 4000);
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      let cleaned = false;
      function cleanup() {
        if (cleaned) return; cleaned = true;
        clearTimeout(timer);
        frame.removeEventListener('load', onload);
        frame.removeEventListener('error', onerror);
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }
      const onload = () => {
        // If same-origin we can inspect the document; if it's about:blank or empty treat as failure.
        try {
          const doc = frame.contentDocument || frame.contentWindow.document;
          const href = (doc && doc.location) ? String(doc.location.href) : '';
          if (!href || href === 'about:blank' || (doc.body && doc.body.childElementCount === 0)) {
            cleanup();
            resolve({ ok: false, error: 'no-content' });
            return;
          }
          // loaded same-origin content with visible DOM
          cleanup();
          resolve({ ok: true, status: 200 });
        } catch (e) {
          // cross-origin access denied -> treat as loaded (reachable)
          cleanup();
          resolve({ ok: true, status: 0 });
        }
      };
      const onerror = () => { cleanup(); resolve({ ok: false, error: 'loaderror' }); };
      frame.addEventListener('load', onload);
      frame.addEventListener('error', onerror);
      document.body.appendChild(frame);
      // start probe
      try { frame.src = url; }
      catch (e) { cleanup(); resolve({ ok: false, error: String(e) }); }
    });

    // Try iframe probe first (avoids CORS issues). If it fails, fallback to a "no-cors" fetch probe.
    try {
      const iframeResult = await iframeProbe();
      if (iframeResult.ok) return iframeResult;
    } catch (e) { /* continue to fetch fallback */ }

    // Fetch fallback (opaque/no-cors) — resolves when network reachable even if CORS blocks the payload.
    const controller = new AbortController();
    const timeout = setTimeout(()=> controller.abort(), 4000);
    try {
      const res = await fetch(url, { method: 'GET', signal: controller.signal, cache: 'no-store', mode: 'no-cors' });
      clearTimeout(timeout);
      const reachable = res && (res.ok || res.type === 'opaque' || res.status === 0);
      return { ok: !!reachable, status: reachable && res.status ? res.status : 0 };
    } catch (err) {
      clearTimeout(timeout);
      return { ok: false, error: String(err) };
    }
  }

  // Load remote server into the embedded iframe. If embedding fails (blocked by X-Frame-*),
  // fallback to InAppBrowser.
  function loadServerInIframe(url) {
    const iframe = document.getElementById('remote-frame');
    const splash = document.getElementById('splash');
    const serverTestResult = document.getElementById('server-test-result');

    serverTestResult.textContent = 'Loading…';
    splash.style.display = 'flex';
    iframe.style.display = 'none';

    let fired = false;
    const onLoad = () => {
      fired = true;
      serverTestResult.textContent = 'Loaded';
      splash.style.display = 'none';
      iframe.style.display = 'block';
      iframe.removeEventListener('load', onLoad);
      clearTimeout(checkTimer);
    };

    iframe.addEventListener('load', onLoad);
    iframe.src = url;

    // if iframe doesn't load within 5s, assume embedding blocked — fallback to InAppBrowser
    const checkTimer = setTimeout(()=>{
      if (!fired) {
        iframe.removeEventListener('load', onLoad);
        splash.style.display = 'none';
        iframe.style.display = 'none';
        serverTestResult.textContent = 'Embedding blocked — opening in app browser';
        if (window.cordova && cordova.InAppBrowser) {
          cordova.InAppBrowser.open(url, '_blank', 'location=yes,toolbar=yes');
        } else {
          window.location.href = url;
        }
      }
    }, 5000);
  }

  function updateStatus(state, pending = 0, progress = 0) {
    const bar = document.getElementById('lis-status-bar');
    const dot = bar.querySelector('.lis-status-dot');
    const text = bar.querySelector('.lis-status-text');
    const pendingBadge = document.getElementById('lis-pending');
    const progressEl = document.getElementById('lis-sync-progress');

    bar.className = '';
    bar.classList.add('lis-' + state);
    dot.className = 'lis-status-dot ' + state;
    text.textContent = state === 'offline' ? 'Offline — changes will be queued' : (state === 'online' ? 'Online' : 'Syncing…');
    pendingBadge.textContent = pending + ' pending';
    progressEl.style.width = progress + '%';
  }

  async function refreshPendingUI() {
    const pending = await window.LISOperationQueue.length();
    document.getElementById('pending-count').textContent = pending ? `${pending} queued` : 'no pending';
    document.getElementById('queue-contents').textContent = JSON.stringify(await window.LISOperationQueue.all(), null, 2);
    document.getElementById('lis-pending').textContent = pending + ' pending';
  }

  async function showSnapshotIfAny() {
    const wrap = document.getElementById('remote-viewer-wrap');
    const view = document.getElementById('remote-viewer');
    wrap.style.display = 'none';
    try {
      const data = await window.LISDataStore.get('snapshot:' + SERVER_URL);
      if (data && data.html) {
        view.innerHTML = data.html;
        wrap.style.display = 'block';
      } else {
        view.innerHTML = 'No snapshot saved for this server.';
      }
    } catch (err) {
      view.innerHTML = 'Error loading snapshot: ' + String(err);
    }
  }

  async function trySync() {
    updateStatus('syncing', await window.LISOperationQueue.length(), 0);
    const result = await window.LISOperationQueue.flush(SERVER_URL, (remaining)=>{
      updateStatus('syncing', remaining, Math.max(0, 100 - remaining * 10));
    });
    if (result.success) updateStatus('online', 0, 100);
    else updateStatus('offline', result.remaining, 0);
    await refreshPendingUI();
    return result;
  }

  async function init() {
    await window.LISDataStore.init();
    await window.LISOperationQueue.init();

    // load persisted server URL
    await loadServerUrl();
    updateServerDisplay();

    // guarded handlers for controls that may or may not exist in the current shell UI
    const openRemoteBtn = document.getElementById('btn-open-remote');
    if (openRemoteBtn) {
      openRemoteBtn.addEventListener('click', ()=> {
        if (!SERVER_URL) { alert('Server URL not set — open Settings to configure.'); return; }
        loadServerInIframe(SERVER_URL);
      });
    }

    const retryBtn = document.getElementById('btn-retry-remote');
    if (retryBtn) {
      retryBtn.addEventListener('click', async ()=> {
        const r = document.getElementById('server-test-result');
        r.textContent = 'Checking...';
        const res = await testServerUrl(SERVER_URL);
        if (res.ok) {
          r.textContent = res.status ? `OK — HTTP ${res.status}` : 'OK — reachable';
          loadServerInIframe(SERVER_URL);
        } else {
          r.textContent = `Error: ${res.error}`;
          alert('Server unreachable — will show cached snapshot if available.');
          showSnapshotIfAny();
        }
      });
    }

    const snapBtn = document.getElementById('btn-save-snapshot');
    if (snapBtn) {
      snapBtn.addEventListener('click', async ()=>{
        if (!SERVER_URL) { alert('Set server first'); return; }
        const r = document.getElementById('server-test-result');
        r.textContent = 'Fetching snapshot...';
        try {
          const resp = await fetch(SERVER_URL, { method: 'GET' });
          const html = await resp.text();
          await window.LISDataStore.set('snapshot:' + SERVER_URL, { html: html, ts: Date.now() });
          r.textContent = 'Snapshot saved';
          showSnapshotIfAny();
        } catch (err) {
          r.textContent = 'Snapshot failed: ' + String(err);
        }
      });
    }

    const topSettingsBtn = document.getElementById('btn-settings');
    if (topSettingsBtn) {
      topSettingsBtn.addEventListener('click', ()=> {
        const p = document.getElementById('settings-panel');
        p.style.display = (p.style.display === 'block') ? 'none' : 'block';
      });
    }

    // bottom-bar settings shortcut (visible while iframe is shown)
    const openBottom = document.getElementById('open-settings-bottom');
    if (openBottom) openBottom.addEventListener('click', ()=> { document.getElementById('settings-panel').style.display = 'block'; });

    const saveServerBtn = document.getElementById('server-url-save');
    if (saveServerBtn) {
      saveServerBtn.addEventListener('click', async ()=> {
        const v = document.getElementById('server-url-input').value.trim();
        if (!v) { alert('Enter a server URL (e.g. http://192.168.31.86:3000)'); return; }
        await saveServerUrl(v);
        document.getElementById('settings-panel').style.display = 'none';
      });
    }

    const resetDefaultBtn = document.getElementById('server-url-reset-default');
    if (resetDefaultBtn) {
      resetDefaultBtn.addEventListener('click', async ()=> {
        await saveServerUrl(DEFAULT_SERVER_URL);
        document.getElementById('settings-panel').style.display = 'none';
      });
    }

    const testServerBtn = document.getElementById('server-url-test');
    if (testServerBtn) {
      testServerBtn.addEventListener('click', async ()=> {
        const v = document.getElementById('server-url-input').value.trim() || SERVER_URL;
        const r = document.getElementById('server-test-result');
        r.textContent = 'Testing...';
        const res = await testServerUrl(v);
        if (res.ok) r.textContent = res.status ? `OK — HTTP ${res.status}` : 'OK — reachable';
        else r.textContent = `Error: ${res.error}`;
        await loadServerUrl();
        updateServerDisplay();
      });
    }

    const openSystemBtn = document.getElementById('open-system-browser');
    if (openSystemBtn) {
      openSystemBtn.addEventListener('click', ()=>{
        const url = document.getElementById('server-url-input').value.trim() || SERVER_URL;
        if (!url) { alert('Server URL not set'); return; }
        if (window.cordova && cordova.InAppBrowser) {
          cordova.InAppBrowser.open(url, '_system');
        } else {
          window.open(url, '_blank');
        }
      });
    }

    const useLocalBtn = document.getElementById('btn-use-local');
    if (useLocalBtn) useLocalBtn.addEventListener('click', ()=> { document.getElementById('local-ui').style.display = 'block'; });

    const addOpBtn = document.getElementById('btn-add-op');
    if (addOpBtn) addOpBtn.addEventListener('click', async ()=>{
      const op = { method:'POST', path:'/api/tests', body: { sample: 'demo', ts: Date.now() } };
      await window.LISOperationQueue.enqueue(op);
      await refreshPendingUI();
    });
    document.getElementById('lis-sync-now').addEventListener('click', trySync);

    async function networkChange() {
      if (navigator.onLine) {
        updateStatus('online', 0, 0);
        trySync();
      } else {
        updateStatus('offline', await window.LISOperationQueue.length(), 0);
      }
    }
    window.addEventListener('online', networkChange);
    window.addEventListener('offline', networkChange);

    // if server reachable, open it immediately (simple wrapper behaviour)
    updateStatus(navigator.onLine ? 'online' : 'offline', await window.LISOperationQueue.length(), 0);
    await refreshPendingUI();

    // Auto-open server (attempt to embed; don't pre-flight with fetch because CORS can block the probe)
    if (SERVER_URL && SERVER_URL.trim()) {
      // Try to embed directly — iframe load/fallback handles blocked embedding
      loadServerInIframe(SERVER_URL);
      return;
    }

    if (navigator.onLine) await trySync();
  }

  function start() {
    if (window.cordova) document.addEventListener('deviceready', init, false);
    else document.addEventListener('DOMContentLoaded', init, false);
  }
  start();
})(window);
