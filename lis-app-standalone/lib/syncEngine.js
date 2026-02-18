/**
 * SyncEngine — Replays queued offline operations to the remote LIS server
 *              using Electron's `net` module so that session cookies from
 *              the BrowserWindow partition are included automatically.
 */

class SyncEngine {
  constructor(operationQueue, config) {
    this.queue = operationQueue;
    this.config = config;
    this._syncing = false;
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
      const request = net.request({
        method: 'POST',        // HTML forms always POST (with ?_method for PUT/DELETE)
        url: op.url,
        partition: 'persist:lis',
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
