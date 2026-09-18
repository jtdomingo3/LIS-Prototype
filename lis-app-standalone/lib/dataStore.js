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

      const existingPatients = (this.db && typeof this.db.getPatients === 'function') ? this.db.getPatients() : [];
      if (existingPatients.length > 0) {
        return; // DB already has clinical records
      }

      console.log('[DataStore] Detected legacy data.json with empty patient records, performing automatic migration to SQLite...');
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
      equipment: this.db.getEquipment ? this.db.getEquipment() : [],
      equipment_logs: this.db.getEquipmentLogs ? this.db.getEquipmentLogs() : [],
      qc_controls: this.db.getQcControls ? this.db.getQcControls() : [],
      qc_entries: this.db.getQcEntries ? this.db.getQcEntries() : [],
      neqas_records: this.db.getNeqasRecords ? this.db.getNeqasRecords() : [],
      consultations: this.db.getConsultations ? this.db.getConsultations() : [],
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
    if (name === 'consultations') return this.db.getConsultations ? this.db.getConsultations() : [];
    if (name === 'inventory') return this.db.getInventory ? this.db.getInventory() : [];
    if (name === 'inventory_batches') return this.db.getAllInventoryBatches ? this.db.getAllInventoryBatches() : [];
    if (name === 'inventory_transactions') return this.db.getAllInventoryTransactions ? this.db.getAllInventoryTransactions() : (this.db.getInventoryTransactions ? this.db.getInventoryTransactions() : []);
    if (name === 'equipment') return this.db.getEquipment ? this.db.getEquipment() : [];
    if (name === 'equipment_logs') return this.db.getEquipmentLogs ? this.db.getEquipmentLogs() : [];
    if (name === 'qc_controls') return this.db.getQcControls ? this.db.getQcControls() : [];
    if (name === 'qc_entries') return this.db.getQcEntries ? this.db.getQcEntries() : [];
    if (name === 'neqas_records') return this.db.getNeqasRecords ? this.db.getNeqasRecords() : [];
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
    else if (name === 'equipment' && Array.isArray(items)) {
      if (opts && opts.replace && this.db.getEquipment) {
        const incomingIds = new Set(items.map(i => i && (i.id || i._id)).filter(Boolean));
        const current = this.db.getEquipment() || [];
        for (const it of current) {
          if (it && it.id && !incomingIds.has(it.id) && this.db.deleteEquipment) {
            this.db.deleteEquipment(it.id);
          }
        }
      }
      items.forEach(it => this.db.saveEquipment && this.db.saveEquipment(it));
    }
    else if (name === 'equipment_logs' && Array.isArray(items)) {
      if (opts && opts.replace && this.db.getEquipmentLogs) {
        const incomingIds = new Set(items.map(i => i && (i.id || i._id)).filter(Boolean));
        const current = this.db.getEquipmentLogs() || [];
        for (const it of current) {
          if (it && it.id && !incomingIds.has(it.id) && this.db.deleteEquipmentLog) {
            this.db.deleteEquipmentLog(it.id);
          }
        }
      }
      items.forEach(it => this.db.saveEquipmentLog && this.db.saveEquipmentLog(it));
    }
    else if (name === 'qc_controls' && Array.isArray(items)) {
      if (opts && opts.replace && this.db.getQcControls) {
        const incomingIds = new Set(items.map(i => i && (i.id || i._id)).filter(Boolean));
        const current = this.db.getQcControls() || [];
        for (const it of current) {
          if (it && it.id && !incomingIds.has(it.id) && this.db.deleteQcControl) {
            this.db.deleteQcControl(it.id);
          }
        }
      }
      items.forEach(it => this.db.saveQcControl && this.db.saveQcControl(it));
    }
    else if (name === 'qc_entries' && Array.isArray(items)) {
      if (opts && opts.replace && this.db.getQcEntries) {
        const incomingIds = new Set(items.map(i => i && (i.id || i._id)).filter(Boolean));
        const current = this.db.getQcEntries() || [];
        for (const it of current) {
          if (it && it.id && !incomingIds.has(it.id) && this.db.deleteQcEntry) {
            this.db.deleteQcEntry(it.id);
          }
        }
      }
      items.forEach(it => this.db.saveQcEntry && this.db.saveQcEntry(it));
    }
    else if (name === 'neqas_records' && Array.isArray(items)) {
      if (opts && opts.replace && this.db.getNeqasRecords) {
        const incomingIds = new Set(items.map(i => i && (i.id || i._id)).filter(Boolean));
        const current = this.db.getNeqasRecords() || [];
        for (const it of current) {
          if (it && it.id && !incomingIds.has(it.id) && this.db.deleteNeqasRecord) {
            this.db.deleteNeqasRecord(it.id);
          }
        }
      }
      items.forEach(it => this.db.saveNeqasRecord && this.db.saveNeqasRecord(it));
    }
    else if (name === 'consultations' && Array.isArray(items)) {
      if (opts && opts.replace && this.db.getConsultations) {
        const incomingIds = new Set(items.map(i => i && (i.id || i._id)).filter(Boolean));
        const current = this.db.getConsultations() || [];
        for (const it of current) {
          if (it && it.id && !incomingIds.has(it.id) && this.db.deleteConsultation) {
            this.db.deleteConsultation(it.id);
          }
        }
      }
      items.forEach(it => this.db.saveConsultation && this.db.saveConsultation(it));
    }
  }

  mergeCollection(name, items, idKey = 'id') {
    if (!Array.isArray(items)) return;
    const startMs = Date.now();
    const dest = this.getCollection(name).slice();
    const map = new Map(dest.map(i => [String(i[idKey]), i]));
    const deletedIds = []; // Batch deletions for temporary offline IDs replaced by server records

    // Index local items by client_id to reconcile offline-created records
    const localByClientId = new Map();
    for (const [id, item] of map.entries()) {
      const cid = item && (item.client_id || item.clientId);
      if (cid && String(cid) !== id) {
        localByClientId.set(String(cid), id);
      }
    }

    for (const it of items) {
      if (!it || !it[idKey]) continue;
      const itId = String(it[idKey]);

      // If the incoming server item carries a client_id that matches a local record with a different temp ID,
      // reconcile and remove the old local temp record so we don't end up with duplicate rows
      const incomingClientId = it.client_id || it.clientId;
      if (incomingClientId && map.has(String(incomingClientId)) && String(incomingClientId) !== itId) {
        const tempId = String(incomingClientId);
        console.log(`[DataStore] Reconciled ${name}: replacing local temporary ${tempId} with server ${itId}`);
        map.delete(tempId);
        deletedIds.push(tempId);
      } else if (localByClientId.has(itId)) {
        const tempId = localByClientId.get(itId);
        if (tempId && tempId !== itId) {
          console.log(`[DataStore] Reconciled ${name}: replacing local temporary ${tempId} with server ${itId}`);
          map.delete(tempId);
          deletedIds.push(tempId);
        }
      }

      // Authoritatively upsert the server record
      map.set(itId, it);
    }

    // Delete any replaced temp IDs from SQLite adapter
    if (this.db && deletedIds.length > 0) {
      const deleteFn =
        name === 'patients' ? this.db.deletePatient :
        name === 'tests' ? this.db.deleteTest :
        name === 'users' ? this.db.deleteUser :
        name === 'templates' ? this.db.deleteTemplate :
        name === 'inventory' ? this.db.deleteInventory :
        name === 'inventory_batches' ? this.db.deleteBatch :
        name === 'inventory_transactions' ? this.db.deleteTransaction :
        name === 'equipment' ? this.db.deleteEquipment :
        name === 'equipment_logs' ? this.db.deleteEquipmentLog :
        name === 'qc_controls' ? this.db.deleteQcControl :
        name === 'qc_entries' ? this.db.deleteQcEntry :
        name === 'neqas_records' ? this.db.deleteNeqasRecord : null;

      if (deleteFn) {
        for (const id of deletedIds) {
          try { deleteFn.call(this.db, id); } catch (_) {}
        }
      }
    }

    const merged = Array.from(map.values());
    this.setCollection(name, merged, { replace: true });
    const elapsed = Date.now() - startMs;
    if (elapsed > 50) {
      console.log(`[DataStore] mergeCollection ${name}: ${items.length} items merged in ${elapsed}ms (${deletedIds.length} temp records reconciled)`);
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
