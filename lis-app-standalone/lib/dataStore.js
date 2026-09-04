const fs = require('fs');
const path = require('path');
const os = require('os');
const { createDb } = require('./sqliteDb');
const { migrateJsonToSqlite } = require('./migrateJsonToSqlite');

class DataStore {
  constructor(baseDir) {
    const homedir = (os.homedir ? os.homedir() : process.env.USERPROFILE || '');
    const preferred = path.join(homedir, 'Documents', 'LIS', 'app-sync');
    const alt = path.join(homedir, 'Documents', 'LIS', 'app_sync');
    if (!baseDir) {
      if (fs.existsSync(preferred)) baseDir = preferred;
      else if (fs.existsSync(alt)) baseDir = alt;
      else baseDir = preferred;
    }
    this.baseDir = baseDir;
    this.sqlitePath = path.join(this.baseDir, 'lis-data.db');
    this.legacyJsonPath = path.join(this.baseDir, 'data.json');
    this.filePath = this.sqlitePath; // primary storage path

    try { if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true }); } catch (e) {}
    try { if (!fs.existsSync(alt)) fs.mkdirSync(alt, { recursive: true }); } catch (e) {}

    // Initialize SQLite Database Adapter
    this.db = createDb(this.sqlitePath);

    // Auto-migrate from legacy data.json if present
    this._autoMigrate();
  }

  async ready() {
    if (this.db && this.db._readyPromise) {
      await this.db._readyPromise;
    }
    this._autoMigrate();
    return this;
  }

  _autoMigrate() {
    try {
      const hasJson = fs.existsSync(this.legacyJsonPath);
      if (!hasJson) return;

      if (this.db && this.db._readyPromise && !this.db._isReady) {
        this.db._readyPromise.then(() => this._autoMigrate()).catch(() => {});
        return;
      }

      const existingPatients = this.db.getPatients();
      const existingUsers = this.db.getUsers();
      if (existingPatients.length > 0 || existingUsers.length > 0) {
        return; // DB already has records
      }

      console.log('[DataStore] Detected legacy data.json, performing automatic migration to SQLite...');
      migrateJsonToSqlite(this.db, {
        dataJsonPath: this.legacyJsonPath,
        renameAfter: true,
        log: console.log
      });
    } catch (e) {
      console.error('[DataStore] Auto-migration error:', e && e.message);
    }
  }

  // Dynamic _data view for backward compatibility
  get _data() {
    return this.getAll();
  }

  set _data(val) {
    if (val && typeof val === 'object') {
      this.db.write(val);
    }
  }

  _save() {
    // No-op for SQLite as all writes persist immediately, kept for API compatibility
  }

  getAll() {
    const readData = this.db.read() || {};
    return {
      __meta: this.db.getAllMeta ? this.db.getAllMeta() : (readData.__meta || {}),
      users: this.db.getUsers(),
      patients: this.db.getPatients(),
      tests: this.db.getTests(),
      templates: this.db.getTemplates(),
      counters: this.db.getCounters(),
      inventory: this.db.getInventory ? this.db.getInventory() : [],
      inventory_batches: this.db.getAllInventoryBatches ? this.db.getAllInventoryBatches() : [],
      inventory_transactions: this.db.getInventoryTransactions ? this.db.getInventoryTransactions() : [],
      settings: readData.settings || {}
    };
  }

  getCollection(name) {
    if (!name) return [];
    if (name === 'patients') return this.db.getPatients();
    if (name === 'tests') return this.db.getTests();
    if (name === 'users') return this.db.getUsers();
    if (name === 'templates') return this.db.getTemplates();
    if (name === 'counters') return this.db.getCounters();
    if (name === 'inventory') return this.db.getInventory ? this.db.getInventory() : [];
    if (name === 'inventory_batches') return this.db.getAllInventoryBatches ? this.db.getAllInventoryBatches() : [];
    if (name === 'inventory_transactions') return this.db.getAllInventoryTransactions ? this.db.getAllInventoryTransactions() : (this.db.getInventoryTransactions ? this.db.getInventoryTransactions() : []);
    return [];
  }

  setCollection(name, items, opts = {}) {
    if (!name) return;
    if (name === 'patients') this.db.savePatients(items);
    else if (name === 'tests') this.db.saveTests(items);
    else if (name === 'users') this.db.saveUsers(items);
    else if (name === 'templates') this.db.saveTemplates(items);
    else if (name === 'counters') this.db.saveCounters(items);
    else if (name === 'inventory' && Array.isArray(items)) {
      if (opts && opts.replace && this.db.getInventory) {
        const incomingIds = new Set(items.map(i => i && (i.id || i._id)).filter(Boolean));
        const current = this.db.getInventory() || [];
        for (const it of current) {
          if (it && it.id && !incomingIds.has(it.id) && this.db.deleteInventory) {
            this.db.deleteInventory(it.id);
          }
        }
      }
      items.forEach(it => this.db.saveInventory && this.db.saveInventory(it));
    }
    else if (name === 'inventory_batches' && Array.isArray(items)) {
      if (opts && opts.replace && this.db.getAllInventoryBatches) {
        const incomingIds = new Set(items.map(b => b && (b.id || b._id)).filter(Boolean));
        const current = this.db.getAllInventoryBatches() || [];
        for (const b of current) {
          if (b && b.id && !incomingIds.has(b.id) && this.db.deleteBatch) {
            this.db.deleteBatch(b.id);
          }
        }
      }
      items.forEach(b => this.db.saveBatch && this.db.saveBatch(b));
    }
    else if (name === 'inventory_transactions' && Array.isArray(items)) {
      if (opts && opts.replace && (this.db.getAllInventoryTransactions || this.db.getInventoryTransactions)) {
        const incomingIds = new Set(items.map(t => t && (t.id || t._id)).filter(Boolean));
        const current = (this.db.getAllInventoryTransactions ? this.db.getAllInventoryTransactions() : this.db.getInventoryTransactions()) || [];
        for (const t of current) {
          if (t && t.id && !incomingIds.has(t.id) && this.db.deleteTransaction) {
            this.db.deleteTransaction(t.id);
          }
        }
      }
      items.forEach(t => this.db.saveTransaction && this.db.saveTransaction(t));
    }
  }

  mergeCollection(name, items, idKey = 'id') {
    if (!Array.isArray(items)) return;
    const startMs = Date.now();
    const dest = this.getCollection(name).slice();
    const map = new Map(dest.map(i => [String(i[idKey]), i]));
    const deletedIds = []; // Batch deletions for performance

    if (name === 'inventory') {
      // Build O(1) lookup indexes from existing records
      const skuIndex = new Map();   // SKU → existingId
      const nameAreaIndex = new Map(); // "name|area|category" → existingId
      for (const [id, it] of map.entries()) {
        const sku = (it.sku || '').trim().toUpperCase();
        if (sku) skuIndex.set(sku, id);
        const nameKey = `${(it.name || '').trim().toLowerCase()}|${(it.area || '').trim().toLowerCase()}|${it.category || ''}`;
        nameAreaIndex.set(nameKey, id);
      }

      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itId = String(it[idKey]);
        const itSku = (it.sku || '').trim().toUpperCase();
        const itNameKey = `${(it.name || '').trim().toLowerCase()}|${(it.area || '').trim().toLowerCase()}|${it.category || ''}`;

        // Check for duplicate by SKU or name+area+category
        const dupBySku = itSku ? skuIndex.get(itSku) : undefined;
        const dupByName = nameAreaIndex.get(itNameKey);
        const dupId = (dupBySku && dupBySku !== itId) ? dupBySku : ((dupByName && dupByName !== itId) ? dupByName : null);

        if (dupId) {
          map.delete(dupId);
          deletedIds.push(dupId);
          // Remove from indexes so future items don't match stale entries
          const old = dest.find(d => String(d[idKey]) === dupId);
          if (old) {
            const oldSku = (old.sku || '').trim().toUpperCase();
            if (oldSku && skuIndex.get(oldSku) === dupId) skuIndex.delete(oldSku);
            const oldNameKey = `${(old.name || '').trim().toLowerCase()}|${(old.area || '').trim().toLowerCase()}|${old.category || ''}`;
            if (nameAreaIndex.get(oldNameKey) === dupId) nameAreaIndex.delete(oldNameKey);
          }
        }

        map.set(itId, it);
        // Update indexes with new record
        if (itSku) skuIndex.set(itSku, itId);
        nameAreaIndex.set(itNameKey, itId);
      }

      // Batch delete removed duplicates
      if (this.db && this.db.deleteInventory) {
        for (const id of deletedIds) { try { this.db.deleteInventory(id); } catch (_) {} }
      }
    } else if (name === 'inventory_batches') {
      // Build O(1) lookup: "inventoryId|lotNumber" → existingId
      const lotIndex = new Map();
      for (const [id, b] of map.entries()) {
        const key = `${String(b.inventoryId || '')}|${(b.lotNumber || '').trim().toUpperCase()}`;
        if (b.inventoryId && b.lotNumber) lotIndex.set(key, id);
      }

      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itId = String(it[idKey]);
        const itKey = `${String(it.inventoryId || '')}|${(it.lotNumber || '').trim().toUpperCase()}`;
        const dupId = (it.inventoryId && it.lotNumber) ? lotIndex.get(itKey) : undefined;

        if (dupId && dupId !== itId) {
          map.delete(dupId);
          deletedIds.push(dupId);
          lotIndex.delete(itKey);
        }

        map.set(itId, it);
        if (it.inventoryId && it.lotNumber) lotIndex.set(itKey, itId);
      }

      if (this.db && this.db.deleteBatch) {
        for (const id of deletedIds) { try { this.db.deleteBatch(id); } catch (_) {} }
      }
    } else if (name === 'inventory_transactions') {
      // Build O(1) lookup: "inventoryId|type|quantity|lotNumber" → existingId
      const txIndex = new Map();
      for (const [id, tx] of map.entries()) {
        const key = `${String(tx.inventoryId || '')}|${String(tx.transactionType || '')}|${Number(tx.quantity || 0)}|${(tx.lotNumber || '').trim().toUpperCase()}`;
        txIndex.set(key, id);
      }

      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itId = String(it[idKey]);
        const itKey = `${String(it.inventoryId || '')}|${String(it.transactionType || '')}|${Number(it.quantity || 0)}|${(it.lotNumber || '').trim().toUpperCase()}`;
        const dupId = txIndex.get(itKey);

        if (dupId && dupId !== itId) {
          map.delete(dupId);
          deletedIds.push(dupId);
          txIndex.delete(itKey);
        }

        map.set(itId, it);
        txIndex.set(itKey, itId);
      }

      if (this.db && this.db.deleteTransaction) {
        for (const id of deletedIds) { try { this.db.deleteTransaction(id); } catch (_) {} }
      }
    } else if (name === 'patients') {
      // Build O(1) lookup indexes from existing patients
      const clientIdIndex = new Map();  // client_id → existingId
      const codeIndex = new Map();      // patientCode → existingId
      const pidIndex = new Map();       // patientId → existingId
      const nameIndex = new Map();      // "first|last|dob" or "first|last|phone" → existingId

      for (const [id, pt] of map.entries()) {
        const cid = (pt.client_id || pt.clientId || '').trim();
        if (cid) clientIdIndex.set(cid, id);
        const code = (pt.patientCode || '').trim().toUpperCase();
        if (code) codeIndex.set(code, id);
        const pid = (pt.patientId || '').trim().toUpperCase();
        if (pid) pidIndex.set(pid, id);
        const first = (pt.firstName || '').trim().toLowerCase();
        const last = (pt.lastName || '').trim().toLowerCase();
        const dob = (pt.dateOfBirth || '').trim();
        const phone = (pt.phone || '').trim();
        if (first && last) {
          if (dob) nameIndex.set(`${first}|${last}|dob:${dob}`, id);
          if (phone) nameIndex.set(`${first}|${last}|ph:${phone}`, id);
        }
      }

      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itId = String(it[idKey]);
        const itClientId = (it.client_id || it.clientId || '').trim();
        const itCode = (it.patientCode || '').trim().toUpperCase();
        const itPid = (it.patientId || '').trim().toUpperCase();
        const itFirst = (it.firstName || '').trim().toLowerCase();
        const itLast = (it.lastName || '').trim().toLowerCase();
        const itDob = (it.dateOfBirth || '').trim();
        const itPhone = (it.phone || '').trim();

        // O(1) duplicate lookup via indexes
        let dupId = null;
        if (!dupId && itClientId) { const d = clientIdIndex.get(itClientId); if (d && d !== itId) dupId = d; }
        if (!dupId && itCode) { const d = codeIndex.get(itCode); if (d && d !== itId) dupId = d; }
        if (!dupId && itPid) { const d = pidIndex.get(itPid); if (d && d !== itId) dupId = d; }
        if (!dupId && itFirst && itLast) {
          if (itDob) { const d = nameIndex.get(`${itFirst}|${itLast}|dob:${itDob}`); if (d && d !== itId) dupId = d; }
          if (!dupId && itPhone) { const d = nameIndex.get(`${itFirst}|${itLast}|ph:${itPhone}`); if (d && d !== itId) dupId = d; }
        }

        if (dupId) {
          console.log(`[DataStore] Deduplicated patient: replacing local duplicate ${dupId} with server ${itId} (${it.firstName || ''} ${it.lastName || ''})`);
          map.delete(dupId);
          deletedIds.push(dupId);
        }

        map.set(itId, it);
        // Update indexes
        if (itClientId) clientIdIndex.set(itClientId, itId);
        if (itCode) codeIndex.set(itCode, itId);
        if (itPid) pidIndex.set(itPid, itId);
        if (itFirst && itLast) {
          if (itDob) nameIndex.set(`${itFirst}|${itLast}|dob:${itDob}`, itId);
          if (itPhone) nameIndex.set(`${itFirst}|${itLast}|ph:${itPhone}`, itId);
        }
      }

      // Batch delete all collected duplicates at the end
      if (this.db && this.db.deletePatient) {
        for (const id of deletedIds) { try { this.db.deletePatient(id); } catch (_) {} }
      }
    } else if (name === 'tests') {
      // Build O(1) lookup indexes from existing tests
      const clientIdIndex = new Map();   // client_id → existingId
      const testIdIndex = new Map();     // testId → existingId
      const patTypeIndex = new Map();    // "patient|testType" → existingId

      for (const [id, t] of map.entries()) {
        const cid = (t.client_id || t.clientId || '').trim();
        if (cid) clientIdIndex.set(cid, id);
        const tid = String(t.testId || '').trim();
        if (tid) testIdIndex.set(tid, id);
        const pat = String(t.patient || '').trim();
        const type = String(t.testType || '').trim().toLowerCase();
        if (pat && type) patTypeIndex.set(`${pat}|${type}`, id);
      }

      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itId = String(it[idKey]);
        const itClientId = (it.client_id || it.clientId || '').trim();
        const itTestId = String(it.testId || '').trim();
        const itPatient = String(it.patient || '').trim();
        const itType = String(it.testType || '').trim().toLowerCase();

        // O(1) duplicate lookup
        let dupId = null;
        if (!dupId && itClientId) { const d = clientIdIndex.get(itClientId); if (d && d !== itId) dupId = d; }
        if (!dupId && itTestId) { const d = testIdIndex.get(itTestId); if (d && d !== itId) dupId = d; }
        if (!dupId && itPatient && itType) { const d = patTypeIndex.get(`${itPatient}|${itType}`); if (d && d !== itId) dupId = d; }

        if (dupId) {
          console.log(`[DataStore] Deduplicated test: replacing local duplicate ${dupId} with server ${itId} (Test #${it.testId || ''})`);
          map.delete(dupId);
          deletedIds.push(dupId);
        }

        map.set(itId, it);
        // Update indexes
        if (itClientId) clientIdIndex.set(itClientId, itId);
        if (itTestId) testIdIndex.set(itTestId, itId);
        if (itPatient && itType) patTypeIndex.set(`${itPatient}|${itType}`, itId);
      }

      // Batch delete all collected duplicates
      if (this.db && this.db.deleteTest) {
        for (const id of deletedIds) { try { this.db.deleteTest(id); } catch (_) {} }
      }
    } else {
      for (const it of items) {
        if (!it || !it[idKey]) continue;
        map.set(String(it[idKey]), it);
      }
    }

    const merged = Array.from(map.values());
    this.setCollection(name, merged, { replace: true });
    const elapsed = Date.now() - startMs;
    if (elapsed > 50) {
      console.log(`[DataStore] mergeCollection ${name}: ${items.length} items merged in ${elapsed}ms (${deletedIds.length} duplicates removed)`);
    }
  }


  setMeta(key, val) {
    if (this.db && this.db.setMeta) {
      this.db.setMeta(key, val);
    } else {
      const s = (this.db && this.db.getSettings) ? (this.db.getSettings() || {}) : {};
      s.__meta = s.__meta || {};
      s.__meta[key] = val;
      if (this.db && this.db.setSettings) {
        this.db.setSettings(s);
      }
      if (!this._inMemoryMeta) this._inMemoryMeta = {};
      this._inMemoryMeta[key] = val;
    }
  }

  getMeta(key) {
    if (this.db && this.db.getMeta) {
      return this.db.getMeta(key);
    }
    if (this._inMemoryMeta && this._inMemoryMeta[key] !== undefined) {
      return this._inMemoryMeta[key];
    }
    const s = (this.db && this.db.getSettings) ? (this.db.getSettings() || {}) : {};
    return (s.__meta && s.__meta[key] !== undefined) ? s.__meta[key] : undefined;
  }

  getSettings() {
    if (this.db && typeof this.db.getSettings === 'function') {
      return this.db.getSettings() || {};
    }
    return {};
  }

  setSettings(settings) {
    if (this.db && typeof this.db.setSettings === 'function') {
      this.db.setSettings(settings);
    }
  }

  info() {
    try {
      const existsOnDisk = fs.existsSync(this.sqlitePath);
      const stat = existsOnDisk ? fs.statSync(this.sqlitePath) : null;
      const counts = {
        patients: this.db.getPatients().length,
        tests: this.db.getTests().length,
        users: this.db.getUsers().length,
        templates: this.db.getTemplates().length,
        inventory: this.db.getInventory ? this.db.getInventory().length : 0,
        counters: Object.keys(this.db.getCounters()).length
      };
      return {
        baseDir: this.baseDir,
        filePath: this.sqlitePath,
        legacyJsonPath: this.legacyJsonPath,
        exists: existsOnDisk || (this.db && !!this.db._engine),
        existsOnDisk,
        size: stat ? stat.size : 0,
        engine: this.db._engine || 'sqlite',
        counts,
        lastFullSync: this.getMeta('lastFullSync')
      };
    } catch (e) {
      return {
        baseDir: this.baseDir,
        filePath: this.sqlitePath,
        exists: false,
        size: 0,
        error: e && e.message
      };
    }
  }
}

module.exports = { DataStore };
