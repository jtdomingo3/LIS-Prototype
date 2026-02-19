/**
 * SyncEngine — Replays queued offline operations to the remote LIS server
 *              using Electron's `net` module so that session cookies from
 *              the BrowserWindow partition are included automatically.
 */

class SyncEngine {
  constructor(operationQueue, config, dataStore) {
    this.queue = operationQueue;
    this.config = config;
    this.dataStore = dataStore || null;
    this._syncing = false;
    this._credentials = null; // { email, password } for server re-auth
  }

  /** Store credentials so we can re-authenticate with the server when needed. */
  setCredentials(email, password) {
    this._credentials = (email && password) ? { email, password } : null;
  }

  /** Store the auto-login email for hash-based auth fallback. */
  setAutoLoginEmail(email) {
    this._autoLoginEmail = email || null;
  }

  /**
   * Get the bcrypt hash for the auto-login user from the DataStore.
   * Used for hash-based authentication with the server sync endpoint.
   */
  _getAutoLoginHash() {
    try {
      const email = this._autoLoginEmail;
      if (!email || !this.dataStore) return null;
      const users = this.dataStore.getCollection('users') || [];
      const user = users.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
      return (user && user.password) ? { email: user.email, hash: user.password } : null;
    } catch (e) { return null; }
  }

  /**
   * Authenticate with the real server by POSTing to /login.
   * Sets the session cookie in the persist:lis partition so
   * subsequent requests are authenticated.
   */
  async _ensureServerAuth() {
    if (!this._credentials) {
      console.log('[Sync] no stored plain-text credentials — will use hash-based auth headers');
      return false;
    }
    if (!this.config || !this.config.SERVER_URL) return false;

    const { net, session } = require('electron');
    const base = this.config.SERVER_URL.replace(/\/$/, '');
    const loginUrl = base + '/login';

    return new Promise((resolve) => {
      try {
        const sess = session.fromPartition('persist:lis');
        const { BrowserWindow } = require('electron');
        const req = net.request({
          method: 'POST',
          url: loginUrl,
          session: sess,
          redirect: 'manual', // handle redirects after cookie persistence
        });
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        const body = new URLSearchParams({
          email: this._credentials.email,
          password: this._credentials.password,
        }).toString();

        let responseBody = '';
        req.on('response', async (res) => {
          res.on('data', (chunk) => { responseBody += chunk.toString(); });
          res.on('end', async () => {
            // Log headers for debugging
            try { console.log('[Sync] login response headers:', res.headers); } catch (e) {}

            if (res.statusCode >= 400) {
              console.warn('[Sync] server auth returned', res.statusCode, responseBody.slice(0,200));
              return resolve(false);
            }

            // Verify that a session cookie was set in the persist:lis partition
            try {
              const cookies = await sess.cookies.get({ name: 'connect.sid' });
              if (cookies && cookies.length) {
                console.log('[Sync] authenticated with server and session cookie set (connect.sid)');
                return resolve(true);
              }
              // Fallback: accept any cookie as sign of session establishment
              const anyCookies = await sess.cookies.get({});
              if (anyCookies && anyCookies.length) {
                console.log('[Sync] authenticated with server — cookies present');
                return resolve(true);
              }
            } catch (e) {
              console.warn('[Sync] cookie check failed:', e && e.message);
            }

            // No session cookie -> attempt renderer-based login (hidden BrowserWindow)
            console.log('[Sync] no session cookie after net login — attempting hidden renderer login fallback');
            try {
              const { BrowserWindow } = require('electron');
              const win = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:lis', nodeIntegration: false, contextIsolation: true } });
              try {
                // Load login page in hidden window
                await win.loadURL(loginUrl);
                // Fill and submit the login form if present
                const submitJs = `(function(){ try {
                  var e = document.querySelector('input[name="email"]');
                  var p = document.querySelector('input[name="password"]');
                  if (!e || !p) return { ok:false, err:'no-form' };
                  e.value = ${JSON.stringify(this._credentials.email)};
                  p.value = ${JSON.stringify(this._credentials.password)};
                  var f = document.querySelector('form[action="/login"]') || document.querySelector('form');
                  if (f) { f.submit(); return { ok:true, method:'form' }; }
                  var btn = document.querySelector('button[type="submit"]') || document.querySelector('input[type="submit"]');
                  if (btn) { btn.click(); return { ok:true, method:'button' }; }
                  return { ok:false, err:'no-submit' };
                } catch(e){ return { ok:false, err: String(e) }; } })()`;
                try { await win.webContents.executeJavaScript(submitJs, true); } catch (e) { /* ignore exec errors */ }

                // Poll for cookie set (give server time to redirect and set cookie)
                const start = Date.now();
                let found = false;
                while ((Date.now() - start) < 8000) {
                  try {
                    const cookies2 = await sess.cookies.get({ name: 'connect.sid' });
                    if (cookies2 && cookies2.length) { found = true; break; }
                  } catch (e) { /* ignore */ }
                  await new Promise(r => setTimeout(r, 400));
                }
                try { if (!win.isDestroyed()) win.close(); } catch (e) {}
                if (found) {
                  console.log('[Sync] renderer login set session cookie (connect.sid)');
                  return resolve(true);
                }
              } catch (e) {
                try { if (!win.isDestroyed()) win.close(); } catch (ee) {}
                console.warn('[Sync] renderer login attempt failed:', e && e.message);
              }
            } catch (e) {
              console.warn('[Sync] renderer login fallback error:', e && e.message);
            }

            // Still no cookie -> treat as auth failure
            console.warn('[Sync] login did not result in persisted session cookie; status', res.statusCode);
            resolve(false);
          });
        });

        req.on('error', async (err) => {
          console.error('[Sync] server auth request failed:', err && err.message);
          // Try renderer fallback on request errors (e.g., Redirect was cancelled)
          try {
            console.log('[Sync] attempting renderer login fallback after net error');
            const win = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:lis', nodeIntegration: false, contextIsolation: true } });
            try {
              await win.loadURL(loginUrl);
              const submitJs = `(function(){ try {
                var e = document.querySelector('input[name="email"]');
                var p = document.querySelector('input[name="password"]');
                if (!e || !p) return { ok:false, err:'no-form' };
                e.value = ${JSON.stringify(this._credentials.email)};
                p.value = ${JSON.stringify(this._credentials.password)};
                var f = document.querySelector('form[action="/login"]') || document.querySelector('form');
                if (f) { f.submit(); return { ok:true, method:'form' }; }
                var btn = document.querySelector('button[type="submit"]') || document.querySelector('input[type="submit"]');
                if (btn) { btn.click(); return { ok:true, method:'button' }; }
                return { ok:false, err:'no-submit' };
              } catch(e){ return { ok:false, err: String(e) }; } })()`;
              try { await win.webContents.executeJavaScript(submitJs, true); } catch (e) {}

              const start = Date.now();
              let found = false;
              while ((Date.now() - start) < 8000) {
                try {
                  const cookies2 = await sess.cookies.get({ name: 'connect.sid' });
                  if (cookies2 && cookies2.length) { found = true; break; }
                } catch (e) { }
                await new Promise(r => setTimeout(r, 400));
              }
              try { if (!win.isDestroyed()) win.close(); } catch (e) {}
              if (found) {
                console.log('[Sync] renderer login set session cookie (connect.sid) after net error');
                return resolve(true);
              }
            } catch (e) {
              try { if (!win.isDestroyed()) win.close(); } catch (ee) {}
              console.warn('[Sync] renderer login attempt failed after net error:', e && e.message);
            }
          } catch (e) {
            console.warn('[Sync] renderer login fallback error after net error:', e && e.message);
          }
          resolve(false);
        });

        req.write(body);
        req.end();
      } catch (e) {
        console.error('[Sync] _ensureServerAuth error:', e && e.message);
        resolve(false);
      }
    });
  }

    /** Attempt a full download of server data.json into the local DataStore.
     *  Returns an object { success: boolean, reason?: string, imported?: number }
     */
    async fullSync(progressSender) {
      if (!this.config || !this.config.SERVER_URL) return { success: false, reason: 'no-server-url' };
      if (!this.dataStore) return { success: false, reason: 'no-datastore' };

      // Authenticate with the real server before fetching data
      await this._ensureServerAuth();

      const { net } = require('electron');
      // prefer authenticated export endpoint if available
      const base = this.config.SERVER_URL.replace(/\/$/, '');
      const candidateUrls = [base + '/export/data.json', base + '/data.json'];
      try {
        let result = null;
        let lastErr = null;
        for (const url of candidateUrls) {
          try {
            console.log('[Sync] attempting full-sync from', url);
            if (progressSender) progressSender.send('full-sync-progress', { phase: 'start', url });
            result = await this._fetchJson(net, url, progressSender);
            console.log('[Sync] fetched data from', url, '=>', Array.isArray(result) ? `array(${result.length})` : (result && typeof result === 'object' ? Object.keys(result).join(',') : typeof result));
            if (result) break;
          } catch (e) {
            lastErr = e;
            console.error('[Sync] full-sync attempt failed for', url, e && e.message);
            // If the server requires authentication (401) but we have a renderer
            // webContents available, try fetching from the renderer so browser
            // session cookies are used (fallback without streaming progress).
            try {
              if (e && String(e.message).startsWith('http:401') && progressSender && typeof progressSender.executeJavaScript === 'function') {
                console.log('[Sync] falling back to renderer fetch for', url);
                const js = `(async () => { const r = await fetch(${JSON.stringify(url)}, { credentials: 'include' }); const t = await r.text(); return { status: r.status, text: t }; })()`;
                const res = await progressSender.executeJavaScript(js);
                if (res && res.status >= 200 && res.status < 300) {
                  try { result = JSON.parse(res.text); console.log('[Sync] renderer fetch parsed JSON from', url); break; } catch (pe) { lastErr = new Error('invalid-json'); }
                } else {
                  console.error('[Sync] renderer fetch returned', res && res.status);
                  lastErr = new Error('http:' + (res && res.status ? res.status : 'unknown'));
                }
              }
            } catch (ee) {
              console.error('[Sync] renderer fetch fallback failed for', url, ee && ee.message);
            }
            continue;
          }
        }
        if (!result) throw lastErr || new Error('no-data');
        if (!result || typeof result !== 'object') return { success: false, reason: 'invalid-json' };

        // Merge known collections (best-effort)
        const collections = ['users', 'patients', 'tests', 'templates', 'counters'];
        let imported = 0;
        for (const col of collections) {
          if (Array.isArray(result[col])) {
            this.dataStore.mergeCollection(col, result[col]);
            imported += result[col].length;
          } else if (result[col] && typeof result[col] === 'object' && col === 'counters') {
            this.dataStore.setCollection(col, result[col]);
          }
        }
        const now = new Date().toISOString();
        this.dataStore.setMeta('lastFullSync', now);
        console.log('[Sync] fullSync imported', imported, 'records — saved to', this.dataStore.filePath);
        if (progressSender) progressSender.send('full-sync-progress', { phase: 'complete', imported, filePath: this.dataStore.filePath, lastFullSync: now });
        return { success: true, imported, filePath: this.dataStore.filePath, lastFullSync: now };
      } catch (e) {
        console.error('[Sync] fullSync failed:', e && e.message);
        if (progressSender) progressSender.send('full-sync-progress', { phase: 'error', reason: e && e.message });
        return { success: false, reason: e && e.message };
      }
    }

    _fetchJson(net, url, progressSender) {
      return new Promise((resolve, reject) => {
        try {
          const { session } = require('electron');
          const req = net.request({ method: 'GET', url, session: session.fromPartition('persist:lis'), redirect: 'follow' });

          // Add hash-based auth headers as fallback when no session exists
          const hashAuth = this._getAutoLoginHash();
          if (hashAuth) {
            req.setHeader('X-LIS-Sync-Email', hashAuth.email);
            req.setHeader('X-LIS-Sync-Hash', hashAuth.hash);
            console.log('[Sync] sending hash-based auth headers for', hashAuth.email);
          }

          let body = '';
          let loaded = 0;
          let total = null;
          req.on('response', (res) => {
            // try to read Content-Length
            try {
              const hdr = res.headers && (res.headers['content-length'] || res.headers['Content-Length']);
              if (hdr) total = parseInt(Array.isArray(hdr) ? hdr[0] : hdr, 10);
            } catch (e) { total = null; }

            res.on('data', (chunk) => {
              try { const len = chunk.length || (chunk.byteLength || 0); loaded += len; } catch (e) {}
              body += chunk.toString();
              if (progressSender) {
                try { progressSender.send('full-sync-progress', { phase: 'progress', loaded, total }); } catch (e) {}
              }
            });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('invalid-json')); }
              } else {
                console.error('[Sync] _fetchJson non-2xx', url, 'status=', res.statusCode, 'headers=', res.headers, 'bodySnippet=', (body || '').slice(0,200));
                reject(new Error('http:' + res.statusCode));
              }
            });
          });
          req.on('error', (err) => reject(err));
          req.end();
        } catch (e) { reject(e); }
      });
    }

  /**
   * Replay every pending operation in order.
   * Returns the number of successfully synced operations.
   */
  async processQueue() {
    if (this._syncing) return 0;
    this._syncing = true;

    const pending = this.queue.getPending();
    if (!pending.length) { this._syncing = false; return 0; }

    // Authenticate with the real server before replaying operations
    await this._ensureServerAuth();

    console.log(`[Sync] starting — ${pending.length} operation(s) to replay`);
    let synced = 0;

    // Lazy-require electron net (only available in main process)
    const { net } = require('electron');

    for (const op of pending) {
      try {
        await this._replayWithRetry(net, op);
        this.queue.markSynced(op.id);
        synced++;
        console.log(`[Sync] ✓ ${op.method} ${op.url}`);
      } catch (e) {
        console.error(`[Sync] ✗ ${op.method} ${op.url} — ${e.message}`);
        this.queue.markFailed(op.id, e.message, this.config.MAX_SYNC_RETRIES);
        // Stop on first failure to preserve ordering guarantees
        break;
      }
    }

    // Housekeeping — drop completed entries
    if (synced) this.queue.clearSynced();
    this._syncing = false;
    console.log(`[Sync] done — ${synced} synced, ${this.queue.countPending()} still pending`);
    return synced;
  }

  /* ── replay a single operation via electron net ───────────────── */
  _replay(net, op) {
    return new Promise((resolve, reject) => {
      const { session } = require('electron');
      let settled = false;

      const request = net.request({
        method: 'POST',        // HTML forms always POST (with ?_method for PUT/DELETE)
        url: op.url,
        session: session.fromPartition('persist:lis'),
        redirect: 'manual',    // handle redirects via the 'redirect' event
      });

      // Always include hash-based auth headers so the server can bootstrap
      // a session even without a cookie.
      const hashAuth = this._getAutoLoginHash();
      if (hashAuth) {
        request.setHeader('X-LIS-Sync-Email', hashAuth.email);
        request.setHeader('X-LIS-Sync-Hash', hashAuth.hash);
      }

      // Encode body as URL-encoded form data (same as HTML form).
      // Use qs.stringify (same lib as Express's body parser) to correctly
      // handle arrays and nested objects, unlike URLSearchParams.
      if (op.body && typeof op.body === 'object' && Object.keys(op.body).length) {
        request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        let encoded;
        try {
          const qs = require('qs');
          encoded = qs.stringify(op.body, { arrayFormat: 'repeat', encode: true });
        } catch (_) {
          // fallback to URLSearchParams if qs is unavailable
          encoded = new URLSearchParams(op.body).toString();
        }
        request.write(encoded);
      }

      // Handle redirect event — Electron fires this INSTEAD of a 302 response
      // when redirect:'manual' is set.
      request.on('redirect', (statusCode, _method, redirectUrl) => {
        if (settled) return;
        const redirPath = (redirectUrl || '').replace(/^https?:\/\/[^/]+/, '');
        console.log(`[Sync] _replay redirect: status=${statusCode} -> ${redirPath}`);

        // Auth bounce: redirect to / or /login
        if (redirPath === '/' || redirPath === '/login' || redirPath.startsWith('/?') || redirPath.startsWith('/login?')) {
          settled = true;
          reject(new Error(`Auth redirect to ${redirPath} — session not valid (status ${statusCode})`));
          return;
        }

        // Any other redirect = server processed the form successfully
        settled = true;
        console.log(`[Sync] _replay server processed form -> ${redirPath} — success`);
        resolve({ status: statusCode, redirectTo: redirectUrl });
      });

      request.on('response', (response) => {
        let responseBody = '';
        response.on('data', (chunk) => { responseBody += chunk.toString(); });
        response.on('end', () => {
          if (settled) return;
          settled = true;
          const status = response.statusCode;
          console.log(`[Sync] _replay response: status=${status} bodyLen=${responseBody.length}`);
          if (status >= 200 && status < 300) {
            resolve({ status, body: responseBody });
          } else if (status >= 300 && status < 400) {
            // Shouldn't happen with redirect:'manual', but just in case
            resolve({ status, body: responseBody });
          } else {
            reject(new Error(`Server returned ${status}: ${responseBody.slice(0, 200)}`));
          }
        });
      });

      request.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });

      request.end();
    });
  }

  /**
   * Replay a single operation with retry: if the first attempt gets an auth
   * redirect, re-authenticate and try once more.
   */
  async _replayWithRetry(net, op) {
    try {
      return await this._replay(net, op);
    } catch (e) {
      const msg = e && e.message ? e.message : '';
      if (msg.includes('Auth redirect') || msg.includes('Redirect was cancelled')) {
        console.log('[Sync] auth failed during replay — re-authenticating and retrying');
        await this._ensureServerAuth();
        return await this._replay(net, op);
      }
      throw e;
    }
  }
}

module.exports = { SyncEngine };
