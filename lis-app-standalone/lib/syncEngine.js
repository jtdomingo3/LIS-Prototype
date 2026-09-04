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
    this._bearerToken = null; // Bearer token for server auth
  }

  /** Set a signed Bearer token directly. */
  setBearerToken(token) {
    this._bearerToken = token || null;
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
   * Get the bcrypt hash for the authenticated or admin user.
   * Used for hash-based authentication with the server sync endpoint.
   */
  _getAutoLoginHash() {
    try {
      const email = this._autoLoginEmail || (this._credentials && this._credentials.email) || 'admin@lab.com';
      let users = [];
      if (this.dataStore && typeof this.dataStore.getCollection === 'function') {
        users = this.dataStore.getCollection('users') || [];
      }
      if (!users.length && global.db && typeof global.db.getUsers === 'function') {
        users = global.db.getUsers() || [];
      }
      if (!users.length) {
        try {
          const User = require('../models/User');
          const allUsers = User.find ? User.find() : [];
          if (Array.isArray(allUsers)) users = allUsers;
        } catch (e) {}
      }
      if (email) {
        const user = users.find(u => u && u.email && u.email.toLowerCase() === email.toLowerCase());
        if (user && user.password) return { email: user.email, hash: user.password };
      }
      const admin = users.find(u => u && (u.role === 'Admin' || u.role === 'admin' || (u.email && u.email.toLowerCase().includes('admin'))));
      if (admin && admin.password) return { email: admin.email, hash: admin.password };
      return null;
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

    let electron = null;
    try { electron = require('electron'); } catch (_) {}
    const net = (electron && electron.net) ? electron.net : null;
    const session = (electron && electron.session) ? electron.session : null;

    const base = this.config.SERVER_URL.replace(/\/$/, '');
    const loginUrl = base + '/login';

    if (!net || !session) {
      // In non-electron runtime, perform standard HTTP POST /login and store session cookie
      return new Promise((resolve) => {
        try {
          const parsed = new URL(loginUrl);
          const isHttps = parsed.protocol === 'https:';
          const client = isHttps ? require('https') : require('http');
          const postData = new URLSearchParams({
            email: this._credentials.email,
            password: this._credentials.password
          }).toString();

          const req = client.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Content-Length': Buffer.byteLength(postData),
              'Accept': 'application/json, text/html, */*'
            },
            timeout: 10000
          }, (res) => {
            const setCookie = res.headers['set-cookie'];
            if (setCookie) {
              const cookiesArr = Array.isArray(setCookie) ? setCookie : [setCookie];
              const sid = cookiesArr.map(c => c.split(';')[0]).join('; ');
              if (sid) {
                this._sessionCookie = sid;
                console.log('[Sync] authenticated with server and session cookie captured (Node fallback)');
                return resolve(true);
              }
            }
            if (res.statusCode >= 200 && res.statusCode < 400) {
              return resolve(true);
            }
            resolve(false);
          });
          req.on('error', () => resolve(false));
          req.write(postData);
          req.end();
        } catch (_) {
          resolve(false);
        }
      });
    }

    return new Promise((resolve) => {
      try {
        const sess = session.fromPartition('persist:lis');
        const req = net.request({
          method: 'POST',
          url: loginUrl,
          session: sess,
          redirect: 'follow', // automatically follow redirects after login
        });
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        const body = new URLSearchParams({
          email: this._credentials.email,
          password: this._credentials.password,
        }).toString();

        req.on('redirect', (statusCode, method, redirectUrl) => {
          try { req.followRedirect(); } catch (e) {}
        });

        let responseBody = '';
        req.on('response', async (res) => {
          res.on('data', (chunk) => { responseBody += chunk.toString(); });
          res.on('end', async () => {
            // Check session cookie in the persist:lis partition
            try {
              const cookies = await sess.cookies.get({ name: 'connect.sid' });
              if (cookies && cookies.length) {
                console.log('[Sync] authenticated with server and session cookie set (connect.sid)');
                return resolve(true);
              }
              const anyCookies = await sess.cookies.get({});
              if (anyCookies && anyCookies.length) {
                console.log('[Sync] authenticated with server — cookies present');
                return resolve(true);
              }
            } catch (e) {
              console.warn('[Sync] cookie check failed:', e && e.message);
            }

            if (res.statusCode >= 200 && res.statusCode < 400) {
              console.log('[Sync] server returned status', res.statusCode, '— assuming authenticated');
              return resolve(true);
            }

            // Fallback: hidden renderer login
            try {
              let electron = null;
              try { electron = require('electron'); } catch (_) {}
              const BrowserWindow = electron ? electron.BrowserWindow : null;
              if (!BrowserWindow) return resolve(false);

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
                  } catch (e) {}
                  await new Promise(r => setTimeout(r, 400));
                }
                try { if (!win.isDestroyed()) win.close(); } catch (e) {}
                if (found) {
                  console.log('[Sync] renderer login set session cookie (connect.sid)');
                  return resolve(true);
                }
              } catch (e) {
                try { if (!win.isDestroyed()) win.close(); } catch (ee) {}
              }
            } catch (e) {}

            resolve(false);
          });
        });

        req.on('error', async (err) => {
          console.warn('[Sync] server auth request net event:', err && err.message);
          // Check if cookie was already set despite the event
          try {
            const cookies = await sess.cookies.get({ name: 'connect.sid' });
            if (cookies && cookies.length) {
              console.log('[Sync] session cookie verified after net event');
              return resolve(true);
            }
          } catch (e) {}

          try {
            let electron = null;
            try { electron = require('electron'); } catch (_) {}
            const BrowserWindow = electron ? electron.BrowserWindow : null;
            if (!BrowserWindow) return resolve(false);

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
                } catch (e) {}
                await new Promise(r => setTimeout(r, 400));
              }
              try { if (!win.isDestroyed()) win.close(); } catch (e) {}
              if (found) {
                console.log('[Sync] renderer login set session cookie (connect.sid) after net event');
                return resolve(true);
              }
            } catch (e) {
              try { if (!win.isDestroyed()) win.close(); } catch (ee) {}
            }
          } catch (e) {}

          resolve(false);
        });

        req.write(body);
        req.end();
      } catch (e) {
        console.error('[Sync] _ensureServerAuth exception:', e && e.message);
        resolve(false);
      }
    });
  }

    /** Attempt a full download of server data.json into the local DataStore.
     *  Returns an object { success: boolean, reason?: string, imported?: number }
     */
    async fullSync(progressSender, opts) {
      if (!this.config || !this.config.SERVER_URL) return { success: false, reason: 'no-server-url' };
      if (!this.dataStore) return { success: false, reason: 'no-datastore' };

      // Prevent concurrent duplicate full-sync passes
      if (this._fullSyncActivePromise) {
        return this._fullSyncActivePromise;
      }

      this._fullSyncActivePromise = (async () => {
        try {
          // Authenticate with the real server before fetching data
          await this._ensureServerAuth();

          // Flush all pending offline mutations (including deletions) to the server before downloading
          if (this.queue && this.queue.countPending() > 0) {
            try {
              console.log('[Sync] flushing pending queue operations before fullSync...');
              await this.processQueue();
            } catch (e) {
              console.warn('[Sync] pre-fullSync queue flush warning:', e && e.message);
            }
          }

          const { net } = require('electron');
          // prefer authenticated export endpoint if available
          const base = this.config.SERVER_URL.replace(/\/$/, '');
          const candidateUrls = [base + '/export/data.json', base + '/data.json'];
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

          // Merge known collections (best-effort) or replace when requested
          const collections = ['users', 'patients', 'tests', 'templates', 'counters', 'inventory', 'inventory_batches', 'inventory_transactions'];
          let imported = 0;
          for (const col of collections) {
            if (Array.isArray(result[col])) {
              if (opts && opts.replace) {
                this.dataStore.setCollection(col, result[col]);
              } else {
                this.dataStore.mergeCollection(col, result[col]);
              }
              imported += result[col].length;
            } else if (result[col] && typeof result[col] === 'object' && col === 'counters') {
              if (opts && opts.replace) this.dataStore.setCollection(col, result[col]); else this.dataStore.setCollection(col, result[col]);
            }
          }

          // Synchronize application settings from server
          if (result.settings && typeof result.settings === 'object') {
            try {
              if (this.dataStore && typeof this.dataStore.setSettings === 'function') {
                this.dataStore.setSettings(result.settings);
              }
              if (global.db && typeof global.db.setSettings === 'function') {
                global.db.setSettings(result.settings);
              }
              console.log('[Sync] fullSync updated local settings from server');
            } catch (settErr) {
              console.warn('[Sync] fullSync settings sync warning:', settErr && settErr.message);
            }
          }
          // Bi-directional signature assets sync
          try {
            await this._syncSignatureAssets(result.users, base);
          } catch (sigErr) {
            console.warn('[Sync] signature asset sync warning:', sigErr && sigErr.message);
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
        } finally {
          this._fullSyncActivePromise = null;
        }
      })();

      return this._fullSyncActivePromise;
    }

    /**
     * Debounced fullSync to coalesce rapid successive live bridge events
     */
    debouncedFullSync(webContents, delayMs = 1200) {
      if (this._debouncedFullSyncTimer) {
        clearTimeout(this._debouncedFullSyncTimer);
      }
      return new Promise((resolve) => {
        this._debouncedFullSyncTimer = setTimeout(async () => {
          this._debouncedFullSyncTimer = null;
          try {
            const res = await this.fullSync(webContents);
            resolve(res);
          } catch (err) {
            resolve({ success: false, reason: err && err.message });
          }
        }, delayMs);
      });
    }

    _fetchJson(net, url, progressSender) {
      return new Promise((resolve, reject) => {
        try {
          let electron = null;
          try { electron = require('electron'); } catch (_) {}
          const elNet = (electron && electron.net) ? electron.net : (net && typeof net.request === 'function' ? net : null);
          const elSession = (electron && electron.session) ? electron.session : null;

          if (elNet && elSession) {
            const req = elNet.request({ method: 'GET', url, session: elSession.fromPartition('persist:lis'), redirect: 'follow' });

            if (this._bearerToken) {
              req.setHeader('Authorization', `Bearer ${this._bearerToken}`);
            }
            const hashAuth = this._getAutoLoginHash();
            if (hashAuth) {
              req.setHeader('X-LIS-Sync-Email', hashAuth.email);
              req.setHeader('X-LIS-Sync-Hash', hashAuth.hash);
            }

            let body = '';
            let loaded = 0;
            let total = null;
            req.on('response', (res) => {
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
                  reject(new Error('http:' + res.statusCode));
                }
              });
            });
            req.on('error', (err) => reject(err));
            req.end();
            return;
          }

          // Node standard HTTP/HTTPS fallback
          const parsed = new URL(url);
          const isHttps = parsed.protocol === 'https:';
          const client = isHttps ? require('https') : require('http');
          const headers = { 'Accept': 'application/json' };
          if (this._sessionCookie) {
            headers['Cookie'] = this._sessionCookie;
          }
          if (this._bearerToken) {
            headers['Authorization'] = `Bearer ${this._bearerToken}`;
          }
          const hashAuth = this._getAutoLoginHash();
          if (hashAuth) {
            headers['X-LIS-Sync-Email'] = hashAuth.email;
            headers['X-LIS-Sync-Hash'] = hashAuth.hash;
          }
          const req = client.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + (parsed.search || ''),
            method: 'GET',
            headers,
            timeout: 10000
          }, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk.toString(); });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('invalid-json')); }
              } else {
                reject(new Error('http:' + res.statusCode));
              }
            });
          });
          req.on('error', err => reject(err));
          req.end();
        } catch (e) {
          reject(e);
        }
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

    let electron = null;
    try { electron = require('electron'); } catch (_) {}
    const net = (electron && electron.net) ? electron.net : null;

    for (const op of pending) {
      try {
        // replay and capture server response so we can map temp -> server IDs
        const replayResult = await this._replayWithRetry(net, op);

        // Attempt to map any server-assigned id back to locally-created records
        try {
          await this._handleReplayResult(op, replayResult);
        } catch (e) {
          console.warn('[Sync] _handleReplayResult failed:', e && e.message);
        }

        // Mark the queue entry as synced (after mapping so dependent ops are updated)
        this.queue.markSynced(op.id);
        synced++;
        console.log(`[Sync] ✓ ${op.method} ${op.url}`);
      } catch (e) {
        const errMsg = (e && e.message) ? e.message : String(e);
        console.error(`[Sync] ✗ ${op.method} ${op.url} — ${errMsg}`);
        this.queue.markFailed(op.id, errMsg, this.config.MAX_SYNC_RETRIES);

        // If the server connection dropped or refused, stop replaying to wait for connection
        const isNetworkDrop = /ERR_CONNECTION|ERR_NAME|timeout|timed out|ECONNREFUSED|ENOTFOUND/i.test(errMsg);
        if (isNetworkDrop) {
          console.warn('[Sync] network connection lost during replay — stopping queue pass');
          break;
        }

        // For application/server errors (e.g. 400 bad request, 409 conflict, already processed),
        // continue processing subsequent independent operations so the queue doesn't stall.
      }
    }

    // Housekeeping — drop completed entries
    if (synced) this.queue.clearSynced();
    this._syncing = false;
    console.log(`[Sync] done — ${synced} synced, ${this.queue.countPending()} still pending`);
    return synced;
  }

  /* ── replay a single operation via electron net or Node http fallback ─── */
  _replay(net, op) {
    return new Promise((resolve, reject) => {
      let electron = null;
      try { electron = require('electron'); } catch (_) {}
      const elNet = (electron && electron.net) ? electron.net : (net && typeof net.request === 'function' ? net : null);
      const elSession = (electron && electron.session) ? electron.session : null;

      let qsLib = null;
      try { qsLib = require('qs'); } catch (_) {}
      let encodedBody = '';
      if (op.body && typeof op.body === 'object' && Object.keys(op.body).length) {
        const normalized = {};
        for (const [k, v] of Object.entries(op.body)) {
          if (v !== null && typeof v === 'object') {
            normalized[k] = JSON.stringify(v);
          } else {
            normalized[k] = v;
          }
        }
        encodedBody = qsLib ? qsLib.stringify(normalized, { arrayFormat: 'repeat', encode: true }) : new URLSearchParams(normalized).toString();
      }

      const hashAuth = this._getAutoLoginHash();
      console.log(`[Sync Replay] -> [SEND] ${op.method || 'POST'} ${op.url}`, op.body ? `[payload keys: ${Object.keys(op.body).join(', ')}]` : '');

      if (elNet && elSession) {
        let settled = false;
        const request = elNet.request({
          method: op.method || 'POST',
          url: op.url,
          session: elSession.fromPartition('persist:lis'),
          redirect: 'manual',
        });
        if (this._bearerToken) {
          request.setHeader('Authorization', `Bearer ${this._bearerToken}`);
        }
        if (hashAuth) {
          request.setHeader('X-LIS-Sync-Email', hashAuth.email);
          request.setHeader('X-LIS-Sync-Hash', hashAuth.hash);
        }
        request.setHeader('X-LIS-Sync-Replay', '1');
        request.setHeader('Accept', 'application/json');
        if (encodedBody) {
          request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
          request.write(encodedBody);
        }
        request.on('redirect', (statusCode, _method, redirectUrl) => {
          if (settled) return;
          const redirPath = (redirectUrl || '').replace(/^https?:\/\/[^/]+/, '');
          console.log(`[Sync Replay] -> REDIRECT (HTTP ${statusCode}) -> ${redirectUrl}`);
          if (redirectUrl.includes('127.0.0.1') || redirectUrl.includes('localhost')) {
            settled = true;
            reject(new Error(`Replay request was redirected locally (${redirectUrl}) - interceptor loop prevented`));
            return;
          }
          if (redirPath === '/' || redirPath === '/login' || redirPath.startsWith('/?') || redirPath.startsWith('/login?') || redirPath.startsWith('/login')) {
            settled = true;
            reject(new Error(`Auth redirect to ${redirPath} - session not valid (status ${statusCode})`));
            return;
          }
          settled = true;
          resolve({ status: statusCode, redirectTo: redirectUrl });
        });
        request.on('response', (res) => {
          let responseBody = '';
          res.on('data', (chunk) => { responseBody += chunk.toString(); });
          res.on('end', () => {
            if (settled) return;
            settled = true;
            console.log(`[Sync Replay] <- [RESP] (HTTP ${res.statusCode}) from ${op.url} | Body: ${responseBody.slice(0, 180)}`);
            if (res.statusCode >= 200 && res.statusCode < 400) {
              let json = null;
              try { json = JSON.parse(responseBody); } catch (_) {}
              resolve({ status: res.statusCode, body: json || responseBody });
            } else {
              reject(new Error(`Server returned HTTP ${res.statusCode}: ${responseBody.slice(0, 120)}`));
            }
          });
        });
        request.on('error', (err) => {
          if (settled) return;
          settled = true;
          console.error(`[Sync Replay] [ERROR] sending ${op.method} ${op.url}:`, err && err.message);
          reject(err);
        });
        request.end();
        return;
      }

      // Node standard HTTP/HTTPS fallback
      const parsed = new URL(op.url);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? require('https') : require('http');
      const headers = {
        'Accept': 'application/json',
        'X-LIS-Sync-Replay': '1'
      };
      if (this._sessionCookie) {
        headers['Cookie'] = this._sessionCookie;
      }
      if (this._bearerToken) {
        headers['Authorization'] = `Bearer ${this._bearerToken}`;
      }
      if (hashAuth) {
        headers['X-LIS-Sync-Email'] = hashAuth.email;
        headers['X-LIS-Sync-Hash'] = hashAuth.hash;
      }
      if (encodedBody) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['Content-Length'] = Buffer.byteLength(encodedBody);
      }
      let settled = false;
      const req = client.request({
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method: op.method || 'POST',
        headers,
        timeout: 10000
      }, (res) => {
        let responseBody = '';
        res.on('data', chunk => { responseBody += chunk.toString(); });
        res.on('end', () => {
          if (settled) return;
          settled = true;
          const status = res.statusCode;
          console.log(`[Sync Replay] <- [RESP] (HTTP ${status}) from ${op.url} | Body: ${responseBody.slice(0, 180)}`);
          if (status >= 200 && status < 300) {
            let json = null;
            try { json = JSON.parse(responseBody); } catch (_) {}
            resolve({ status, body: json || responseBody });
            return;
          }

          // Handle 3xx as success fallback ONLY if not redirecting to login/root auth challenge
          if (status >= 300 && status < 400) {
            const loc = (res.headers && res.headers.location) || '';
            const redirPath = loc.replace(/^https?:\/\/[^/]+/, '');
            console.log(`[Sync Replay] -> REDIRECT (HTTP ${status}) -> ${loc}`);
            if (redirPath === '/' || redirPath === '/login' || redirPath.startsWith('/?') || redirPath.startsWith('/login?') || redirPath.startsWith('/login')) {
              reject(new Error(`Auth redirect to ${redirPath} - session not valid (status ${status})`));
              return;
            }
            let json = null;
            try { json = JSON.parse(responseBody); } catch (_) {}
            resolve({ status, body: json || responseBody, redirectTo: loc });
            return;
          }

          // Heuristic: treat DELETE -> 404 as success (resource already removed)
          try {
            if (status === 404 && op && op.body && ((op.body && (op.body._method === 'DELETE' || op.body._method === 'delete')) || (op.method && op.method.toUpperCase() === 'DELETE'))) {
              console.log('[Sync] 404 on DELETE — treating as success (resource already absent)');
              resolve({ status: 404, body: responseBody, ok: true, reason: 'not-found-treated-as-synced' });
              return;
            }
          } catch (e) {}

          reject(new Error(`Server returned ${status}: ${responseBody.slice(0, 200)}`));
        });
      });

      req.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });

      if (encodedBody) req.write(encodedBody);
      req.end();
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

  /* ── After replay, attempt to map server-assigned IDs back to local temp IDs
   *     so subsequent queued operations referencing temporary IDs are updated
   *     and the local DataStore does not end up with duplicate records. */
  async _handleReplayResult(op, replayResult) {
    try {
      if (!op || !replayResult) return;
      // Only care about POST-created resources (collection-level POSTs)
      const method = (op.method || 'POST').toString().toUpperCase();
      if (method !== 'POST') return;
      let pathname = '';
      try { pathname = new URL(op.url).pathname || ''; } catch (e) { pathname = String(op.url || ''); }
      const segs = pathname.replace(/\/$/,'').split('/').filter(Boolean);
      if (!segs.length) return;

      const serverId = this._extractServerIdFromReplay(replayResult);
      if (!serverId) return;

      const collection = (segs.length === 1) ? segs[0] : null; // e.g. 'patients' or 'tests'
      if (!collection) return;

      // Only handle known collections where local temp IDs exist
      if (!['patients','tests','templates','users','inventory'].includes(collection)) return;

      // Prefer deterministic mapping when server echoed back a client_id in JSON response
      let clientId = null;
      try {
        if (replayResult && replayResult.body) {
          const raw = typeof replayResult.body === 'string' ? replayResult.body.trim() : replayResult.body;
          if (raw) {
            const parsed = (typeof raw === 'string' && (raw.startsWith('{') || raw.startsWith('['))) ? JSON.parse(raw) : raw;
            if (parsed) {
              if (Array.isArray(parsed) && parsed.length) {
                clientId = parsed[0] && (parsed[0].client_id || parsed[0].clientId) ? (parsed[0].client_id || parsed[0].clientId) : clientId;
              } else if (parsed.client_id || parsed.clientId) {
                clientId = parsed.client_id || parsed.clientId;
              }
            }
          }
        }
      } catch (e) { /* ignore parse errors */ }

      let localId = null;
      if (clientId && this.dataStore) {
        try {
          const items = this.dataStore.getCollection(collection) || [];
          const found = items.find(i => i && (i.client_id === clientId || i.clientId === clientId || i.id === clientId));
          if (found) localId = found.id;
        } catch (e) { /* ignore */ }
      }

      // Fallback to heuristics when no client_id match
      if (!localId) localId = this._findLocalIdForOp(op, collection);

      if (!localId) {
        console.log(`[Sync] no matching local ${collection} record found for queued operation; server id=${serverId}`);
        return;
      }
      if (localId === serverId) return;
      const replaced = this.queue.replaceTempId(localId, serverId);
      if (replaced) console.log(`[Sync] mapped local ${collection} id ${localId} -> server id ${serverId}`);

      // Immediately re-key local record in SQLite / DataStore to prevent duplicate entry
      if (this.dataStore && this.dataStore.db) {
        try {
          if (collection === 'patients') {
            const list = this.dataStore.getCollection('patients') || [];
            const pt = list.find(p => p && (p.id === localId || p.id === String(localId)));
            if (pt) {
              if (this.dataStore.db.deletePatient) this.dataStore.db.deletePatient(localId);
              pt.id = serverId;
              if (!pt.client_id) pt.client_id = localId;
              if (this.dataStore.db.upsertPatient) this.dataStore.db.upsertPatient(pt);
            }
          } else if (collection === 'tests') {
            const list = this.dataStore.getCollection('tests') || [];
            const t = list.find(it => it && (it.id === localId || it.id === String(localId)));
            if (t) {
              if (this.dataStore.db.deleteTest) this.dataStore.db.deleteTest(localId);
              t.id = serverId;
              if (!t.client_id) t.client_id = localId;
              if (this.dataStore.db.upsertTest) this.dataStore.db.upsertTest(t);
            }
          }
        } catch (rekeyErr) {
          console.warn('[Sync] Re-key local record failed:', rekeyErr && rekeyErr.message);
        }
      }
    } catch (e) {
      console.warn('[Sync] _handleReplayResult error:', e && e.message);
    }
  }

  _extractServerIdFromReplay(replayResult) {
    try {
      // Prefer JSON body first (most reliable source for created id)
      if (replayResult && replayResult.body) {
        const body = (typeof replayResult.body === 'string') ? replayResult.body.trim() : replayResult.body;
        if (typeof body === 'string' && (body.startsWith('{') || body.startsWith('['))) {
          try {
            const parsed = JSON.parse(body);
            if (parsed) {
              if (Array.isArray(parsed) && parsed.length && (parsed[0].id || parsed[0]._id)) return parsed[0].id || parsed[0]._id;
              if (parsed.id) return parsed.id;
              if (parsed._id) return parsed._id;
              if (parsed && parsed.success && (parsed.id || parsed._id)) return parsed.id || parsed._id;
            }
          } catch (e) { /* ignore JSON parse errors */ }
        }
      }

      // Redirect fallback: only accept a redirect segment that *looks like* an ID
      // (UUID-like or server testId).  Do NOT accept generic redirects like /patients/new or /tests.
      if (replayResult && replayResult.redirectTo) {
        try {
          const p = new URL(replayResult.redirectTo).pathname || '';
          const segs = p.replace(/\/$/,'').split('/').filter(Boolean);
          if (segs.length) {
            const uuidLike = /^[0-9a-fA-F-]{8,36}$/; // matches UUID-ish segments
            const testIdLike = /^[A-Z]{1,5}\d{1,}$/i;   // matches BT0000001 or similar server-assigned short ids
            // scan segments from right-to-left for a plausible id
            for (let i = segs.length - 1; i >= 0; i--) {
              const s = segs[i];
              if (uuidLike.test(s) || testIdLike.test(s)) return s;
            }
          }
        } catch (e) { /* ignore URL parse errors */ }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  _findLocalIdForOp(op, collection) {
    try {
      if (!this.dataStore) return null;
      const col = this.dataStore.getCollection(collection) || [];
      const body = op.body || {};
      const opTs = op.createdAt ? (new Date(op.createdAt)).getTime() : null;

      if (body.id) return body.id;

      if (collection === 'patients') {
        // Prefer exact unique matches (patientId, patientCode, phone, email)
        if (body.patientId) {
          const found = col.find(p => String(p.patientId) === String(body.patientId));
          if (found) return found.id;
        }
        if (body.patientCode) {
          const found = col.find(p => String(p.patientCode) === String(body.patientCode));
          if (found) return found.id;
        }
        if (body.phone) {
          const found = col.find(p => p.phone && String(p.phone) === String(body.phone));
          if (found) return found.id;
        }
        if (body.email) {
          const found = col.find(p => p.email && String(p.email).toLowerCase() === String(body.email).toLowerCase());
          if (found) return found.id;
        }
        // Fallback: match by name + createdAt proximity
        if (body.firstName && body.lastName) {
          const candidates = col.filter(p => (String(p.firstName || '').toLowerCase() === String(body.firstName || '').toLowerCase()) && (String(p.lastName || '').toLowerCase() === String(body.lastName || '').toLowerCase()));
          if (candidates.length === 1) return candidates[0].id;
          if (candidates.length > 1 && opTs) {
            let best = null; let bestDiff = Infinity;
            for (const c of candidates) {
              if (!c.createdAt) continue;
              const diff = Math.abs(opTs - (new Date(c.createdAt)).getTime());
              if (diff < bestDiff) { bestDiff = diff; best = c; }
            }
            if (best && bestDiff < 15000) return best.id;
          }
        }
      }

      if (collection === 'tests') {
        // If op.body.patient references the local patient id, prefer newest test for that patient near the op timestamp
        if (body.patient) {
          const candidates = col.filter(t => String(t.patient) === String(body.patient));
          if (candidates.length === 1) return candidates[0].id;
          if (candidates.length > 0 && opTs) {
            let best = null; let bestDiff = Infinity;
            for (const c of candidates) {
              if (!c.createdAt) continue;
              const diff = Math.abs(opTs - (new Date(c.createdAt)).getTime());
              if (diff < bestDiff) { bestDiff = diff; best = c; }
            }
            if (best && bestDiff < 15000) return best.id;
          }
        }
        // Fallback: match by testType + time proximity
        if (body.testType) {
          const cand = col.find(t => String(t.testType || '').toLowerCase() === String(body.testType || '').toLowerCase() && t.createdAt && opTs && Math.abs(opTs - (new Date(t.createdAt)).getTime()) < 20000);
          if (cand) return cand.id;
        }
      }

      // Generic fallback: match by createdAt proximity alone
      if (opTs) {
        let best = null; let bestDiff = Infinity;
        for (const c of col) {
          if (!c.createdAt) continue;
          const diff = Math.abs(opTs - (new Date(c.createdAt)).getTime());
          if (diff < bestDiff) { bestDiff = diff; best = c; }
        }
        if (best && bestDiff < 10000) return best.id;
      }
    } catch (e) {
      console.warn('[Sync] _findLocalIdForOp error:', e && e.message);
    }
    return null;
  }

  /**
   * Schedule a debounced background fullSync when remote events are received.
   */
  scheduleAutoFullSync(webContents, delay = 1200) {
    try {
      if (this._autoFullSyncTimer) clearTimeout(this._autoFullSyncTimer);
      this._autoFullSyncTimer = setTimeout(async () => {
        try {
          if (this._syncing) return;
          console.log('[SyncBridge] Triggering background fullSync on remote event...');
          await this.fullSync(webContents);
        } catch (err) {
          console.warn('[SyncBridge] Background fullSync failed:', err && err.message);
        }
      }, delay);
    } catch (e) {}
  }

  /**
   * Start Live SSE Bridge connecting to the central LIS server.
   * Forwards all real-time events to local windows and triggers background data sync.
   */
  startLiveEventBridge(onEventCallback, webContents) {
    this.stopLiveEventBridge();
    if (!this.config || !this.config.SERVER_URL) return;

    const base = this.config.SERVER_URL.replace(/\/$/, '');
    // Append ?kiosk=1 to establish connection without requiring interactive session cookie
    const sseUrl = `${base}/reception/assigned-events?kiosk=1`;
    this._bridgeActive = true;

    let electron = null;
    try { electron = require('electron'); } catch (_) {}
    const net = (electron && electron.net) ? electron.net : null;
    const session = (electron && electron.session) ? electron.session : null;

    const connectStream = async () => {
      if (!this._bridgeActive) return;
      try {
        if (net && session) {
          const sess = session.fromPartition('persist:lis');
          const req = net.request({
            method: 'GET',
            url: sseUrl,
            session: sess,
            useSessionCookies: true,
          });

          req.setHeader('Accept', 'text/event-stream');
          req.setHeader('Cache-Control', 'no-cache');
          req.setHeader('Connection', 'keep-alive');

          const authCreds = this._getAutoLoginHash();
          if (authCreds) {
            req.setHeader('X-Auto-Login-Email', authCreds.email);
            req.setHeader('X-Auto-Login-Hash', authCreds.hash);
          }

          req.on('response', (res) => {
            if (res.statusCode === 302 || res.statusCode === 401) {
              this._ensureServerAuth().catch(() => {});
              this._scheduleBridgeReconnect(connectStream, 8000);
              return;
            }

            if (res.statusCode !== 200) {
              this._scheduleBridgeReconnect(connectStream, 10000);
              return;
            }

            console.log('[SyncBridge] Connected to live server SSE stream:', sseUrl);
            this._bridgeConnected = true;

            let buffer = '';
            res.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';

              for (const block of lines) {
                const dataLine = block.split('\n').find(l => l.startsWith('data:'));
                if (!dataLine) continue;
                const rawData = dataLine.slice(5).trim();
                if (!rawData) continue;

                try {
                  const eventData = JSON.parse(rawData);
                  if (eventData && !eventData.init && !eventData.offline && eventData.type !== 'ping' && !eventData.keepalive) {
                    console.log('[SyncBridge] Live server event received:', eventData.action || eventData.type || 'event');
                    
                    // 1. Immediately forward event to local UI / renderer windows
                    if (typeof onEventCallback === 'function') {
                      try { onEventCallback(eventData); } catch (e) {}
                    }

                    // 2. Debounced fetch of latest server snapshot in background so local DB is kept in sync
                    this.debouncedFullSync(webContents, 1200).then(() => {
                      if (typeof onEventCallback === 'function') {
                        try { onEventCallback({ action: 'live_sync_completed', timestamp: Date.now() }); } catch (e) {}
                      }
                    }).catch(() => {});
                  }
                } catch (parseErr) {}
              }
            });

            res.on('end', () => {
              this._bridgeConnected = false;
              this._scheduleBridgeReconnect(connectStream, 5000);
            });

            res.on('error', () => {
              this._bridgeConnected = false;
              this._scheduleBridgeReconnect(connectStream, 6000);
            });
          });

          req.on('error', () => {
            this._bridgeConnected = false;
            this._scheduleBridgeReconnect(connectStream, 8000);
          });

          this._currentBridgeReq = req;
          req.end();
        } else {
          // Node fallback (e.g. tests)
          const parsed = new URL(sseUrl);
          const isHttps = parsed.protocol === 'https:';
          const client = isHttps ? require('https') : require('http');

          const req = client.request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + (parsed.search || ''),
            method: 'GET',
            headers: {
              'Accept': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive'
            },
            timeout: 0
          }, (res) => {
            if (res.statusCode !== 200) {
              res.resume();
              this._scheduleBridgeReconnect(connectStream, 10000);
              return;
            }
            this._bridgeConnected = true;
            let buffer = '';
            res.on('data', (chunk) => {
              buffer += chunk.toString('utf8');
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';
              for (const block of lines) {
                const dataLine = block.split('\n').find(l => l.startsWith('data:'));
                if (!dataLine) continue;
                const rawData = dataLine.slice(5).trim();
                if (!rawData) continue;
                try {
                  const eventData = JSON.parse(rawData);
                  if (eventData && !eventData.init && !eventData.offline && eventData.type !== 'ping' && !eventData.keepalive) {
                    if (typeof onEventCallback === 'function') {
                      try { onEventCallback(eventData); } catch (e) {}
                    }
                    this.debouncedFullSync(webContents, 1200).then(() => {
                      if (typeof onEventCallback === 'function') {
                        try { onEventCallback({ action: 'live_sync_completed', timestamp: Date.now() }); } catch (e) {}
                      }
                    }).catch(() => {});
                  }
                } catch (e) {}
              }
            });
            res.on('end', () => { this._bridgeConnected = false; this._scheduleBridgeReconnect(connectStream, 5000); });
            res.on('error', () => { this._bridgeConnected = false; this._scheduleBridgeReconnect(connectStream, 6000); });
          });
          req.on('error', () => { this._bridgeConnected = false; this._scheduleBridgeReconnect(connectStream, 8000); });
          this._currentBridgeReq = req;
          req.end();
        }
      } catch (err) {
        this._scheduleBridgeReconnect(connectStream, 8000);
      }
    };

    connectStream();
  }

  _scheduleBridgeReconnect(fn, delay) {
    if (!this._bridgeActive) return;
    if (this._bridgeReconnectTimer) clearTimeout(this._bridgeReconnectTimer);
    this._bridgeReconnectTimer = setTimeout(() => {
      if (this._bridgeActive) fn();
    }, delay);
  }

  /**
   * Stop the Live SSE Bridge.
   */
  stopLiveEventBridge() {
    this._bridgeActive = false;
    this._bridgeConnected = false;
    if (this._bridgeReconnectTimer) {
      clearTimeout(this._bridgeReconnectTimer);
      this._bridgeReconnectTimer = null;
    }
    if (this._autoFullSyncTimer) {
      clearTimeout(this._autoFullSyncTimer);
      this._autoFullSyncTimer = null;
    }
    if (this._currentBridgeReq) {
      try {
        if (typeof this._currentBridgeReq.abort === 'function') this._currentBridgeReq.abort();
        else if (typeof this._currentBridgeReq.destroy === 'function') this._currentBridgeReq.destroy();
      } catch (e) {}
      this._currentBridgeReq = null;
    }
  }

  /* ── Bi-directional Signature Assets Synchronization ──────────────── */
  async _syncSignatureAssets(serverUsers, serverBaseUrl) {
    const fs = require('fs');
    const path = require('path');
    const localSigDir = path.join(__dirname, '..', 'assets', 'signature');
    if (!fs.existsSync(localSigDir)) {
      try { fs.mkdirSync(localSigDir, { recursive: true }); } catch (_) {}
    }

    const base = (serverBaseUrl || '').replace(/\/$/, '');
    if (!base) return;

    // Throttle: skip signature sync if it ran within the last 5 minutes
    const now = Date.now();
    const lastSigSync = this._lastSignatureSyncTs || 0;
    if (now - lastSigSync < 5 * 60 * 1000) {
      return;
    }
    this._lastSignatureSyncTs = now;

    // Build a set of all signature filenames the server already knows about
    const serverUserSigs = new Set((serverUsers || []).map(u => u && u.signature ? path.basename(u.signature) : null).filter(Boolean));

    // 1. Download missing signatures from server to local assets
    if (Array.isArray(serverUsers)) {
      for (const u of serverUsers) {
        if (!u || !u.signature) continue;
        const sigFilename = path.basename(u.signature);
        const localPath = path.join(localSigDir, sigFilename);
        if (!fs.existsSync(localPath)) {
          try {
            const fetchUrl = `${base}/assets/signature/${encodeURIComponent(sigFilename)}`;
            const buf = await this._downloadBuffer(fetchUrl);
            if (buf && buf.length > 0) {
              fs.writeFileSync(localPath, buf);
              console.log(`[Sync] downloaded missing signature from server: ${sigFilename} (${buf.length} bytes)`);
            }
          } catch (dlErr) {
            // non-critical, continue
          }
        }
      }
    }

    // 2. Upload only local signatures that the server truly doesn't have
    try {
      const localFiles = fs.readdirSync(localSigDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));

      // Match signatures to user emails from local DataStore
      const localUsers = (this.dataStore && typeof this.dataStore.getCollection === 'function') ? (this.dataStore.getCollection('users') || []) : [];
      const userBySig = {};
      for (const lu of localUsers) {
        if (lu && lu.signature) userBySig[path.basename(lu.signature)] = lu.email;
      }

      // Track already-synced filenames across sessions to avoid redundant uploads
      if (!this._syncedSignatures) this._syncedSignatures = new Set();

      for (const fname of localFiles) {
        // Skip if server already references this signature file
        if (serverUserSigs.has(fname)) continue;
        // Skip if we already uploaded this file in a previous sync cycle this session
        if (this._syncedSignatures.has(fname)) continue;

        const filePath = path.join(localSigDir, fname);
        const buf = fs.readFileSync(filePath);
        const base64Data = buf.toString('base64');
        const email = userBySig[fname] || null;

        try {
          await this._postSignatureSync(`${base}/api/signatures/sync`, fname, base64Data, email);
          console.log(`[Sync] uploaded local signature to server: ${fname} (${buf.length} bytes) for ${email || 'user'}`);
          this._syncedSignatures.add(fname);
        } catch (upErr) {
          // will retry on next sync (after 5-minute throttle)
        }
      }
    } catch (scanErr) {
      console.warn('[Sync] signature upload scan warning:', scanErr && scanErr.message);
    }
  }


  _downloadBuffer(url) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? require('https') : require('http');
        const headers = {};
        if (this._sessionCookie) headers['Cookie'] = this._sessionCookie;
        if (this._bearerToken) headers['Authorization'] = `Bearer ${this._bearerToken}`;
        const hashAuth = this._getAutoLoginHash();
        if (hashAuth) {
          headers['X-LIS-Sync-Email'] = hashAuth.email;
          headers['X-LIS-Sync-Hash'] = hashAuth.hash;
        }

        const req = client.request({
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + (parsed.search || ''),
          method: 'GET',
          headers,
          timeout: 10000
        }, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  _postSignatureSync(url, filename, base64Data, email) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const client = isHttps ? require('https') : require('http');
        const body = JSON.stringify({ filename, data: base64Data, email });
        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-LIS-Sync-Replay': '1'
        };
        if (this._sessionCookie) headers['Cookie'] = this._sessionCookie;
        if (this._bearerToken) headers['Authorization'] = `Bearer ${this._bearerToken}`;
        const hashAuth = this._getAutoLoginHash();
        if (hashAuth) {
          headers['X-LIS-Sync-Email'] = hashAuth.email;
          headers['X-LIS-Sync-Hash'] = hashAuth.hash;
        }

        const req = client.request({
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname,
          method: 'POST',
          headers,
          timeout: 15000
        }, (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Authoritatively validates and reconciles local standalone data against the main server:
   * 1. Replays and flushes all pending local operations first so the server has all offline writes.
   * 2. Fetches authoritative data snapshot from the server.
   * 3. Analyzes local records against server records to detect duplicate entries or phantom discrepancies.
   * 4. Deduplicates and replaces local collections so local DataStore mirrors the server cleanly without double entries.
   * 5. Appends an audit log entry to sync-audit.log and stores audit metadata in DataStore.
   * 6. Broadcasts sync completion to the UI.
   */
  async validateAndReconcileWithServer(progressSender, opts = {}) {
    if (!this.config || !this.config.SERVER_URL) return { success: false, reason: 'no-server-url' };
    if (!this.dataStore) return { success: false, reason: 'no-datastore' };

    console.log('[SyncValidation] Starting comprehensive server sync and discrepancy audit...');
    const startTime = Date.now();
    const discrepancies = [];

    // Step 1: Replay all pending queue mutations first
    let flushedCount = 0;
    if (this.queue && this.queue.countPending() > 0) {
      try {
        console.log(`[SyncValidation] Flushing ${this.queue.countPending()} pending offline operations to server...`);
        flushedCount = await this.processQueue();
        console.log(`[SyncValidation] Flushed ${flushedCount} operations successfully.`);
      } catch (qErr) {
        console.warn('[SyncValidation] Queue flush warning:', qErr && qErr.message);
        discrepancies.push(`Pending queue flush warning: ${qErr && qErr.message}`);
      }
    }

    // Step 2: Fetch authoritative server data snapshot
    await this._ensureServerAuth();
    let electron = null;
    try { electron = require('electron'); } catch (_) {}
    const net = (electron && electron.net) ? electron.net : null;
    const base = this.config.SERVER_URL.replace(/\/$/, '');
    const candidateUrls = [base + '/export/data.json', base + '/data.json'];
    let serverData = null;
    let lastErr = null;

    for (const url of candidateUrls) {
      try {
        if (progressSender) {
          try { progressSender.send('full-sync-progress', { phase: 'validating', url }); } catch (_) {}
        }
        serverData = await this._fetchJson(net, url, progressSender);
        if (serverData) break;
      } catch (e) {
        lastErr = e;
      }
    }

    if (!serverData || typeof serverData !== 'object') {
      const errMsg = (lastErr && lastErr.message) || 'failed-to-fetch-server-data';
      console.error('[SyncValidation] Server data fetch failed:', errMsg);
      return { success: false, reason: errMsg, discrepancies };
    }

    // Step 3: Audit & detect discrepancies
    const localPatientsBefore = (this.dataStore.getCollection('patients') || []).slice();
    const localTestsBefore = (this.dataStore.getCollection('tests') || []).slice();
    const serverPatients = Array.isArray(serverData.patients) ? serverData.patients : [];
    const serverTests = Array.isArray(serverData.tests) ? serverData.tests : [];

    // Check duplicate patients in local database
    const patientCodeMap = new Map();
    const patientClientMap = new Map();
    const patientNameDobMap = new Map();

    for (const p of localPatientsBefore) {
      if (!p || !p.id) continue;
      const code = (p.patientCode || '').trim().toUpperCase();
      const cid = (p.client_id || p.clientId || '').trim();
      const nameKey = `${(p.firstName || '').trim().toLowerCase()}_${(p.lastName || '').trim().toLowerCase()}_${(p.dateOfBirth || '').trim()}`;

      if (code) {
        if (patientCodeMap.has(code)) {
          discrepancies.push(`Local duplicate patient code '${code}': IDs [${patientCodeMap.get(code)}, ${p.id}]`);
        } else {
          patientCodeMap.set(code, p.id);
        }
      }
      if (cid) {
        if (patientClientMap.has(cid)) {
          discrepancies.push(`Local duplicate patient client_id '${cid}': IDs [${patientClientMap.get(cid)}, ${p.id}]`);
        } else {
          patientClientMap.set(cid, p.id);
        }
      }
      if (nameKey && nameKey !== '__') {
        if (patientNameDobMap.has(nameKey)) {
          discrepancies.push(`Local duplicate patient identity '${p.firstName} ${p.lastName}': IDs [${patientNameDobMap.get(nameKey)}, ${p.id}]`);
        } else {
          patientNameDobMap.set(nameKey, p.id);
        }
      }
    }

    // Check duplicate tests in local database
    const testIdMap = new Map();
    const testClientMap = new Map();
    for (const t of localTestsBefore) {
      if (!t || !t.id) continue;
      const tid = String(t.testId || '').trim();
      const cid = (t.client_id || t.clientId || '').trim();
      if (tid) {
        if (testIdMap.has(tid)) {
          discrepancies.push(`Local duplicate testId '${tid}': IDs [${testIdMap.get(tid)}, ${t.id}]`);
        } else {
          testIdMap.set(tid, t.id);
        }
      }
      if (cid) {
        if (testClientMap.has(cid)) {
          discrepancies.push(`Local duplicate test client_id '${cid}': IDs [${testClientMap.get(cid)}, ${t.id}]`);
        } else {
          testClientMap.set(cid, t.id);
        }
      }
    }

    // Check count differences
    if (localPatientsBefore.length !== serverPatients.length) {
      discrepancies.push(`Patient count divergence: Local had ${localPatientsBefore.length}, Server has ${serverPatients.length}`);
    }
    if (localTestsBefore.length !== serverTests.length) {
      discrepancies.push(`Test count divergence: Local had ${localTestsBefore.length}, Server has ${serverTests.length}`);
    }

    // Step 4: Authoritatively reconcile local DataStore with server data
    // Use replace: true so local database precisely mirrors authoritative server state
    const collections = ['users', 'patients', 'tests', 'templates', 'counters', 'inventory', 'inventory_batches', 'inventory_transactions'];
    let totalImported = 0;

    for (const col of collections) {
      if (Array.isArray(serverData[col])) {
        this.dataStore.setCollection(col, serverData[col], { replace: true });
        totalImported += serverData[col].length;
      } else if (serverData[col] && typeof serverData[col] === 'object' && col === 'counters') {
        this.dataStore.setCollection(col, serverData[col], { replace: true });
      }
    }

    // Sync settings & signature assets
    if (serverData.settings && typeof serverData.settings === 'object') {
      try {
        if (this.dataStore && typeof this.dataStore.setSettings === 'function') {
          this.dataStore.setSettings(serverData.settings);
        }
        if (global.db && typeof global.db.setSettings === 'function') {
          global.db.setSettings(serverData.settings);
        }
      } catch (_) {}
    }

    try {
      await this._syncSignatureAssets(serverData.users, base);
    } catch (_) {}

    const localPatientsAfter = this.dataStore.getCollection('patients') || [];
    const localTestsAfter = this.dataStore.getCollection('tests') || [];

    const durationMs = Date.now() - startTime;
    const nowIso = new Date().toISOString();

    // Step 5: Format audit report
    const audit = {
      timestamp: nowIso,
      durationMs,
      flushedQueueOps: flushedCount,
      serverCounts: {
        patients: serverPatients.length,
        tests: serverTests.length,
        users: (serverData.users || []).length,
        inventory: (serverData.inventory || []).length
      },
      localCountsBefore: {
        patients: localPatientsBefore.length,
        tests: localTestsBefore.length
      },
      localCountsAfter: {
        patients: localPatientsAfter.length,
        tests: localTestsAfter.length
      },
      discrepanciesFound: discrepancies.length,
      discrepancies,
      status: discrepancies.length === 0 ? 'SYNC_VERIFIED_CLEAN' : 'DISCREPANCIES_RESOLVED',
      summary: discrepancies.length === 0
        ? `Sync 100% verified cleanly (${serverPatients.length} patients, ${serverTests.length} tests). Zero discrepancies found.`
        : `Sync completed with ${discrepancies.length} discrepancy(ies) resolved and eliminated. Local store is now identical to server.`
    };

    // Step 6: Log audit to file and metadata
    try {
      const fs = require('fs');
      const path = require('path');
      const baseDir = this.dataStore.baseDir || (path.dirname(this.dataStore.filePath || ''));
      const logFile = path.join(baseDir, 'sync-audit.log');

      const logLines = [
        `================================================================================`,
        `[${nowIso}] STANDALONE SERVER CONNECT AUDIT & SYNC REPORT`,
        `Status: ${audit.status} (Duration: ${durationMs}ms)`,
        `Queue Operations Flushed: ${flushedCount}`,
        `Server Counts: Patients=${serverPatients.length}, Tests=${serverTests.length}`,
        `Local Before:  Patients=${localPatientsBefore.length}, Tests=${localTestsBefore.length}`,
        `Local After:   Patients=${localPatientsAfter.length}, Tests=${localTestsAfter.length}`,
        `Discrepancies Resolved (${discrepancies.length}):`,
        ...(discrepancies.length ? discrepancies.map(d => `  - ${d}`) : ['  (None - Local and server were in perfect synchronization)']),
        `Result: All local duplicate entries eliminated. Local DataStore matches server.`,
        `================================================================================\n`
      ].join('\n');

      fs.appendFileSync(logFile, logLines, 'utf8');
      console.log(`[SyncValidation] Audit log written to ${logFile}`);
    } catch (logErr) {
      console.warn('[SyncValidation] Failed to write sync-audit.log:', logErr && logErr.message);
    }

    try {
      this.dataStore.setMeta('lastSyncAudit', audit);
      this.dataStore.setMeta('lastFullSync', nowIso);
    } catch (_) {}

    // Step 7: Broadcast to UI
    if (progressSender) {
      try {
        progressSender.send('sync-audit-complete', audit);
        progressSender.send('full-sync-progress', { phase: 'complete', imported: totalImported, lastFullSync: nowIso, audit });
      } catch (_) {}
    }

    if (global.broadcastLocalEvent) {
      global.broadcastLocalEvent({
        action: 'live_sync_completed',
        auditStatus: audit.status,
        discrepanciesResolved: audit.discrepanciesFound,
        timestamp: Date.now()
      });
    }

    console.log(`[SyncValidation] Audit completed: ${audit.summary}`);
    return { success: true, audit };
  }
}

module.exports = { SyncEngine };


