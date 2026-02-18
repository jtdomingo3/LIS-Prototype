/**
 * OperationQueue — Persists pending POST / PUT / DELETE operations to a
 *                  JSON file so they survive app restarts and can be
 *                  replayed to the server when connectivity returns.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class OperationQueue {
  constructor(dataDir) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, 'pending-operations.json');
    this.operations = this._load();
  }

  /* ── persistence ──────────────────────────────────────────────── */
  _load() {
    try {
      if (fs.existsSync(this.filePath))
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (e) { console.error('[Queue] load error:', e); }
    return [];
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.operations, null, 2));
    } catch (e) { console.error('[Queue] save error:', e); }
  }

  /* ── public API ───────────────────────────────────────────────── */

  /** Enqueue a new mutation.  Fields expected:
   *   method, url, body, timestamp
   */
  add(op) {
    // NEVER queue authentication operations — these must always go to the server directly
    try {
      const urlPath = new URL(op.url).pathname;
      if (urlPath === '/login' || urlPath === '/logout' || urlPath === '/') {
        console.log(`[Queue] skipping auth route: ${op.method} ${urlPath}`);
        return null;
      }
    } catch { /* if URL parse fails, queue it anyway */ }

    const entry = {
      id: crypto.randomUUID(),
      ...op,
      status: 'pending',
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    this.operations.push(entry);
    this._save();
    console.log(`[Queue] added ${entry.method} ${entry.url}  (total pending: ${this.countPending()})`);
    return entry;
  }

  /** Return all operations with status === 'pending' (in time order). */
  getPending() {
    return this.operations.filter(o => o.status === 'pending');
  }

  countPending() {
    return this.getPending().length;
  }

  getAll() {
    return [...this.operations];
  }

  markSynced(id) {
    const op = this.operations.find(o => o.id === id);
    if (op) {
      op.status = 'synced';
      op.syncedAt = new Date().toISOString();
      this._save();
    }
  }

  markFailed(id, error, maxRetries = 3) {
    const op = this.operations.find(o => o.id === id);
    if (op) {
      op.attempts = (op.attempts || 0) + 1;
      op.lastError = error;
      op.status = op.attempts >= maxRetries ? 'failed' : 'pending';
      this._save();
    }
  }

  /** Remove synced entries (keep failed & pending for inspection). */
  clearSynced() {
    this.operations = this.operations.filter(o => o.status !== 'synced');
    this._save();
  }

  /** Remove ALL entries. */
  clearAll() {
    this.operations = [];
    this._save();
  }
}

module.exports = { OperationQueue };
