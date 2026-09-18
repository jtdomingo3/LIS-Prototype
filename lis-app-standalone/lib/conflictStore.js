/**
 * ConflictStore — Persistent storage and lifecycle manager for synchronization
 *                 conflicts, non-merging records, and push replay failures.
 *
 * Persists all conflict records to Documents/LIS/app-sync/sync-conflicts.json
 * so medical and technical personnel can investigate, retry, or reconcile
 * conflicting changes anytime.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class ConflictStore {
  constructor(baseDir) {
    const homedir = (os.homedir ? os.homedir() : process.env.USERPROFILE || '');
    const defaultDir = path.join(homedir, 'Documents', 'LIS', 'app-sync');
    this.baseDir = baseDir || defaultDir;
    this.filePath = path.join(this.baseDir, 'sync-conflicts.json');

    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
    } catch (_) {}

    this.conflicts = this._load();
    if (!fs.existsSync(this.filePath)) {
      this._save();
    }
  }

  /* ── Internal Persistence ────────────────────────────────────────── */
  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw || '[]');
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('[ConflictStore] Failed to load sync-conflicts.json:', e && e.message);
    }
    return [];
  }

  _save() {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.conflicts, null, 2), 'utf8');
    } catch (e) {
      console.error('[ConflictStore] Failed to save sync-conflicts.json:', e && e.message);
    }
  }

  /* ── Public API ─────────────────────────────────────────────────── */

  /**
   * Record a new sync conflict or failed mutation.
   *
   * @param {Object} entry
   * @param {string} entry.type - 'queue_failure' | 'merge_conflict' | 'validation_error' | 'sync_error'
   * @param {string} entry.entity - 'patients' | 'tests' | 'inventory' | etc.
   * @param {string} [entry.entityId] - Affected record ID or temporary ID
   * @param {string} [entry.operation] - HTTP method and path e.g. 'POST /patients'
   * @param {Object} [entry.payload] - The local mutation payload that failed
   * @param {string} entry.error - Error description or server message
   * @param {number} [entry.statusCode] - HTTP status code (409, 400, 500, etc.)
   * @param {Object} [entry.serverState] - Conflicting server state if available
   */
  recordConflict(entry = {}) {
    const id = 'cf_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
    const nowIso = new Date().toISOString();

    const record = {
      id,
      timestamp: nowIso,
      type: entry.type || 'queue_failure',
      entity: entry.entity || 'general',
      entityId: entry.entityId || (entry.payload && (entry.payload.id || entry.payload._id)) || null,
      operation: entry.operation || 'SYNC',
      payload: entry.payload || null,
      error: (entry.error && entry.error.message) ? entry.error.message : String(entry.error || 'Conflict or rejection'),
      statusCode: entry.statusCode || null,
      serverState: entry.serverState || null,
      status: 'unresolved', // 'unresolved' | 'resolved'
      resolutionNote: null,
      resolvedAt: null
    };

    // Avoid recording exact duplicate unresolved conflicts for the exact same operation & entityId
    const existingIndex = this.conflicts.findIndex(c =>
      c.status === 'unresolved' &&
      c.entityId &&
      c.entityId === record.entityId &&
      c.operation === record.operation
    );

    if (existingIndex !== -1) {
      // Update existing unresolved record with latest timestamp and error
      this.conflicts[existingIndex].timestamp = nowIso;
      this.conflicts[existingIndex].error = record.error;
      this.conflicts[existingIndex].statusCode = record.statusCode;
      this.conflicts[existingIndex].payload = record.payload || this.conflicts[existingIndex].payload;
      this.conflicts[existingIndex].retryCount = (this.conflicts[existingIndex].retryCount || 0) + 1;
    } else {
      this.conflicts.unshift(record);
    }

    this._save();
    console.log(`[ConflictStore] Recorded conflict [${record.id}] for ${record.operation} (${record.entity}): ${record.error}`);
    return record;
  }

  /**
   * Return all unresolved conflicts (active red badge items).
   */
  getUnresolved() {
    return this.conflicts.filter(c => c.status === 'unresolved');
  }

  /**
   * Count of active unresolved conflicts.
   */
  countUnresolved() {
    return this.getUnresolved().length;
  }

  /**
   * Return all recorded conflicts (unresolved + historical resolved).
   */
  getAll() {
    return [...this.conflicts];
  }

  /**
   * Get a specific conflict by ID.
   */
  getById(id) {
    return this.conflicts.find(c => c.id === id) || null;
  }

  /**
   * Mark a conflict as resolved / dismissed.
   */
  resolve(id, resolutionNote = 'Dismissed by user') {
    const conflict = this.conflicts.find(c => c.id === id);
    if (!conflict) return false;

    conflict.status = 'resolved';
    conflict.resolutionNote = resolutionNote;
    conflict.resolvedAt = new Date().toISOString();
    this._save();
    console.log(`[ConflictStore] Resolved conflict [${id}]: ${resolutionNote}`);
    return true;
  }

  /**
   * Remove all resolved conflicts from history.
   */
  clearResolved() {
    this.conflicts = this.conflicts.filter(c => c.status === 'unresolved');
    this._save();
    return true;
  }

  /**
   * Clear all conflicts completely.
   */
  clearAll() {
    this.conflicts = [];
    this._save();
    return true;
  }

  /**
   * Generate a human-readable and machine-parseable investigation report.
   */
  exportReport() {
    const unresolved = this.getUnresolved();
    const resolved = this.conflicts.filter(c => c.status === 'resolved');
    const nowIso = new Date().toISOString();

    const report = {
      generatedAt: nowIso,
      storageFile: this.filePath,
      summary: {
        totalConflicts: this.conflicts.length,
        totalRecords: this.conflicts.length,
        unresolvedCount: unresolved.length,
        resolvedCount: resolved.length
      },
      conflicts: this.conflicts,
      unresolvedConflicts: unresolved,
      resolvedConflicts: resolved
    };

    return JSON.stringify(report, null, 2);
  }
}

module.exports = { ConflictStore };
