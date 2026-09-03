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
    const dest = this.getCollection(name).slice();
    const map = new Map(dest.map(i => [String(i[idKey]), i]));

    if (name === 'inventory') {
      // Deduplicate items that have the same (name + area + category) or same SKU
      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itName = (it.name || '').trim().toLowerCase();
        const itArea = (it.area || '').trim().toLowerCase();
        const itSku = (it.sku || '').trim().toUpperCase();

        for (const [existingId, existingItem] of map.entries()) {
          if (existingId !== String(it[idKey])) {
            const exName = (existingItem.name || '').trim().toLowerCase();
            const exArea = (existingItem.area || '').trim().toLowerCase();
            const exSku = (existingItem.sku || '').trim().toUpperCase();

            const isSameSku = itSku && exSku && itSku === exSku;
            const isSameNameAndDept = itName && itArea && exName === itName && exArea === itArea && existingItem.category === it.category;

            if (isSameSku || isSameNameAndDept) {
              map.delete(existingId);
              if (this.db && this.db.deleteInventory) {
                try { this.db.deleteInventory(existingId); } catch (_) {}
              }
            }
          }
        }
        map.set(String(it[idKey]), it);
      }
    } else if (name === 'inventory_batches') {
      // Deduplicate batches by (inventoryId + lotNumber)
      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itLot = (it.lotNumber || '').trim().toUpperCase();
        const itInvId = String(it.inventoryId || '');

        for (const [existingId, existingBatch] of map.entries()) {
          if (existingId !== String(it[idKey])) {
            const exLot = (existingBatch.lotNumber || '').trim().toUpperCase();
            const exInvId = String(existingBatch.inventoryId || '');

            if (itLot && exLot && itLot === exLot && itInvId && exInvId && itInvId === exInvId) {
              map.delete(existingId);
              if (this.db && this.db.deleteBatch) {
                try { this.db.deleteBatch(existingId); } catch (_) {}
              }
            }
          }
        }
        map.set(String(it[idKey]), it);
      }
    } else if (name === 'inventory_transactions') {
      // Deduplicate transactions by (inventoryId + batchId/lotNumber + type + quantity)
      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itInvId = String(it.inventoryId || '');
        const itLot = (it.lotNumber || '').trim().toUpperCase();
        const itType = String(it.transactionType || '');
        const itQty = Number(it.quantity || 0);

        for (const [existingId, existingTx] of map.entries()) {
          if (existingId !== String(it[idKey])) {
            const exInvId = String(existingTx.inventoryId || '');
            const exLot = (existingTx.lotNumber || '').trim().toUpperCase();
            const exType = String(existingTx.transactionType || '');
            const exQty = Number(existingTx.quantity || 0);

            if (itInvId === exInvId && itType === exType && itQty === exQty && (!itLot || !exLot || itLot === exLot)) {
              map.delete(existingId);
              if (this.db && this.db.deleteTransaction) {
                try { this.db.deleteTransaction(existingId); } catch (_) {}
              }
            }
          }
        }
        map.set(String(it[idKey]), it);
      }
    } else if (name === 'patients') {
      // Deduplicate patients by client_id, patientCode, patientId, or normalized name + DOB/phone
      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itClientId = (it.client_id || it.clientId || '').trim();
        const itCode = (it.patientCode || '').trim().toUpperCase();
        const itPid = (it.patientId || '').trim().toUpperCase();
        const itFirst = (it.firstName || '').trim().toLowerCase();
        const itLast = (it.lastName || '').trim().toLowerCase();
        const itDob = (it.dateOfBirth || '').trim();
        const itPhone = (it.phone || '').trim();

        for (const [existingId, existingPt] of map.entries()) {
          if (existingId !== String(it[idKey])) {
            const exClientId = (existingPt.client_id || existingPt.clientId || '').trim();
            const exCode = (existingPt.patientCode || '').trim().toUpperCase();
            const exPid = (existingPt.patientId || '').trim().toUpperCase();
            const exFirst = (existingPt.firstName || '').trim().toLowerCase();
            const exLast = (existingPt.lastName || '').trim().toLowerCase();
            const exDob = (existingPt.dateOfBirth || '').trim();
            const exPhone = (existingPt.phone || '').trim();

            const isSameClient = itClientId && exClientId && itClientId === exClientId;
            const isSameCode = itCode && exCode && itCode === exCode;
            const isSamePid = itPid && exPid && itPid === exPid;
            const isSameNameAndDob = itFirst && itLast && exFirst === itFirst && exLast === itLast && (itDob && exDob ? itDob === exDob : (itPhone && exPhone ? itPhone === exPhone : false));

            if (isSameClient || isSameCode || isSamePid || isSameNameAndDob) {
              console.log(`[DataStore] Deduplicated patient: replacing local duplicate ${existingId} with server ${it[idKey]} (${it.firstName || ''} ${it.lastName || ''})`);
              map.delete(existingId);
              if (this.db && this.db.deletePatient) {
                try { this.db.deletePatient(existingId); } catch (_) {}
              }
            }
          }
        }
        map.set(String(it[idKey]), it);
      }
    } else if (name === 'tests') {
      // Deduplicate tests by client_id, testId, or patient + testType
      for (const it of items) {
        if (!it || !it[idKey]) continue;
        const itClientId = (it.client_id || it.clientId || '').trim();
        const itTestId = String(it.testId || '').trim();
        const itPatient = String(it.patient || '').trim();
        const itType = String(it.testType || '').trim().toLowerCase();

        for (const [existingId, existingTest] of map.entries()) {
          if (existingId !== String(it[idKey])) {
            const exClientId = (existingTest.client_id || existingTest.clientId || '').trim();
            const exTestId = String(existingTest.testId || '').trim();
            const exPatient = String(existingTest.patient || '').trim();
            const exType = String(existingTest.testType || '').trim().toLowerCase();

            const isSameClient = itClientId && exClientId && itClientId === exClientId;
            const isSameTestId = itTestId && exTestId && itTestId === exTestId;
            const isSamePatientAndType = itPatient && exPatient && itType && exType && itPatient === exPatient && itType === exType;

            if (isSameClient || isSameTestId || isSamePatientAndType) {
              console.log(`[DataStore] Deduplicated test: replacing local duplicate ${existingId} with server ${it[idKey]} (Test #${it.testId || ''})`);
              map.delete(existingId);
              if (this.db && this.db.deleteTest) {
                try { this.db.deleteTest(existingId); } catch (_) {}
              }
            }
          }
        }
        map.set(String(it[idKey]), it);
      }
    } else {
      for (const it of items) {
        if (!it || !it[idKey]) continue;
        map.set(String(it[idKey]), it);
      }
    }

    const merged = Array.from(map.values());
    this.setCollection(name, merged, { replace: true });
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
