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
  }

    /** Attempt a full download of server data.json into the local DataStore.
     *  Returns an object { success: boolean, reason?: string, imported?: number }
     */
    async fullSync(progressSender) {
      if (!this.config || !this.config.SERVER_URL) return { success: false, reason: 'no-server-url' };
      if (!this.dataStore) return { success: false, reason: 'no-datastore' };
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

    console.log(`[Sync] starting — ${pending.length} operation(s) to replay`);
    let synced = 0;

    // Lazy-require electron net (only available in main process)
    const { net } = require('electron');

    for (const op of pending) {
      try {
        await this._replay(net, op);
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
      const request = net.request({
        method: 'POST',        // HTML forms always POST (with ?_method for PUT/DELETE)
        url: op.url,
        session: session.fromPartition('persist:lis'),
        redirect: 'follow',
      });

      // Encode body as URL-encoded form data (same as HTML form)
      if (op.body && typeof op.body === 'object' && Object.keys(op.body).length) {
        request.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        const encoded = new URLSearchParams(op.body).toString();
        request.write(encoded);
      }

      let responseBody = '';

      request.on('response', (response) => {
        response.on('data', (chunk) => { responseBody += chunk.toString(); });
        response.on('end', () => {
          // 2xx and 3xx (redirects) are success
          if (response.statusCode < 400) {
            resolve({ status: response.statusCode, body: responseBody });
          } else {
            reject(new Error(`Server returned ${response.statusCode}`));
          }
        });
      });

      request.on('error', (err) => reject(err));
      request.end();
    });
  }
}

module.exports = { SyncEngine };
