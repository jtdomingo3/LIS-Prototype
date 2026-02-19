/**
 * OperationQueue — Persists pending POST / PUT / DELETE operations to a
 *                  JSON file so they survive app restarts and can be
 *                  replayed to the server when connectivity returns.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

class OperationQueue {
  constructor(dataDir) {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    this.filePath = path.join(dataDir, 'pending-operations.json');

    // Mirror pending operations to Documents/LIS/offline_changes/ for visibility.
    // If this file exists, there are unsynced changes. When empty, file is removed.
    const homedir = os.homedir();
    this.mirrorDir = path.join(homedir, 'Documents', 'LIS', 'offline_changes');
    this.mirrorPath = path.join(this.mirrorDir, 'pending.json');

    this.operations = this._load();
    this._syncMirror(); // ensure mirror reflects current state on startup
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
    this._syncMirror();
  }

  /**
   * Mirror pending operations to Documents/LIS/offline_changes/pending.json.
   * If there are pending ops, the file is written; if all synced, the file
   * is removed. Presence of this file = unsynced changes exist.
   */
  _syncMirror() {
    try {
      const pending = this.getPending();
      if (pending.length > 0) {
        if (!fs.existsSync(this.mirrorDir)) fs.mkdirSync(this.mirrorDir, { recursive: true });
        const mirrorData = {
          lastUpdated: new Date().toISOString(),
          count: pending.length,
          operations: pending.map(op => ({
            id: op.id,
            method: op.method,
            url: op.url,
            createdAt: op.createdAt,
            status: op.status,
          })),
        };
        fs.writeFileSync(this.mirrorPath, JSON.stringify(mirrorData, null, 2), 'utf8');
      } else {
        // All synced — remove the mirror file
        try { if (fs.existsSync(this.mirrorPath)) fs.unlinkSync(this.mirrorPath); } catch (e) {}
        // Remove directory if empty
        try {
          if (fs.existsSync(this.mirrorDir) && fs.readdirSync(this.mirrorDir).length === 0) {
            fs.rmdirSync(this.mirrorDir);
          }
        } catch (e) {}
      }
    } catch (e) {
      console.error('[Queue] mirror sync error:', e && e.message);
    }
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

  /** Replace occurrences of a temporary id with a server id across all pending operations.
   *  Performs deep replacement in `op.body` (objects/arrays/strings) and in `op.url`.
   *  Returns true if any replacement was made.
   */
  replaceTempId(oldId, newId) {
    if (!oldId || !newId) return false;
    let changed = false;
    const replaceInValue = (val) => {
      if (val == null) return val;
      // convert to string and replace occurrences when primitive
      if (typeof val === 'string') {
        if (val.indexOf(oldId) !== -1) {
          changed = true;
          return val.split(oldId).join(newId);
        }
        return val;
      }
      if (typeof val === 'number' || typeof val === 'boolean') return val;
      if (Array.isArray(val)) {
        return val.map(v => replaceInValue(v));
      }
      if (typeof val === 'object') {
        const out = {};
        Object.keys(val).forEach(k => { out[k] = replaceInValue(val[k]); });
        return out;
      }
      return val;
    };

    for (let i = 0; i < this.operations.length; i++) {
      const op = this.operations[i];
      // url replacement
      if (op && op.url && typeof op.url === 'string' && op.url.indexOf(oldId) !== -1) {
        op.url = op.url.split(oldId).join(newId);
        changed = true;
      }
      // body replacement (deep)
      try {
        if (op && op.body) {
          const newBody = replaceInValue(op.body);
          // Only assign if changed to avoid extra saves
          op.body = newBody;
        }
      } catch (e) {
        // ignore
      }
    }

    if (changed) this._save();
    // If a DataStore is attached, attempt to update stored records that
    // were created locally with the temporary id so they map to the
    // server-assigned id. This prevents duplicates after full-sync.
    try {
      if (this.dataStore && typeof this.dataStore.getCollection === 'function') {
        const ds = this.dataStore;
        const updateColl = (name) => {
          const items = ds.getCollection(name) || [];
          let collChanged = false;
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!it) continue;
            try {
              if (it.id === oldId) { it.id = newId; collChanged = true; }
              // For tests, update patient references
              if (name === 'tests' && it.patient === oldId) { it.patient = newId; collChanged = true; }
              // For patients, there may be fields referencing patientCode — leave as is
            } catch (e) {}
          }
          if (collChanged) {
            try { ds.setCollection(name, items); } catch (e) {}
            changed = true;
          }
        };
        ['patients', 'tests', 'templates', 'users'].forEach(updateColl);
        if (changed) {
          try { if (typeof ds._save === 'function') ds._save(); } catch (e) {}
        }
      }
    } catch (e) {}
    return changed;
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
