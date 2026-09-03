/**
 * offlineDb.js — A `global.db`-compatible shim backed by SQLite / DataStore.
 *
 * The lis-fullstack server uses `global.db` with methods like:
 *   read(), getPatients(), getTests(), getUsers(), getTemplates(), getCounters(),
 *   savePatients(), saveTests(), saveUsers(), saveTemplates(), saveCounters(),
 *   getPatientById(id), getTestById(id), getUserById(id), getUserByEmail(email).
 *
 * This module wraps the underlying SQLite adapter and DataStore so the exact
 * same route files and models can run offline inside the standalone Electron app.
 */

function createOfflineDb(dataStore) {
  if (!dataStore) throw new Error('offlineDb requires a DataStore instance');

  // If dataStore has the underlying SQLite database adapter, proxy directly to it
  const sqliteAdapter = dataStore.db;

  const db = {
    _engine: sqliteAdapter ? sqliteAdapter._engine : 'sqlite-datastore',
    _dataStore: dataStore,

    read() {
      if (sqliteAdapter && typeof sqliteAdapter.read === 'function') {
        return sqliteAdapter.read();
      }
      return dataStore.getAll();
    },

    write(data) {
      if (sqliteAdapter && typeof sqliteAdapter.write === 'function') {
        sqliteAdapter.write(data);
      } else {
        if (data.patients) dataStore.setCollection('patients', data.patients);
        if (data.tests) dataStore.setCollection('tests', data.tests);
        if (data.templates) dataStore.setCollection('templates', data.templates);
        if (data.users) dataStore.setCollection('users', data.users);
        if (data.counters != null) dataStore.setCollection('counters', data.counters);
        if (data.inventory) dataStore.setCollection('inventory', data.inventory);
        if (data.inventory_batches) dataStore.setCollection('inventory_batches', data.inventory_batches);
        if (data.inventory_transactions) dataStore.setCollection('inventory_transactions', data.inventory_transactions);
      }
    },

    /* ── Collection getters ─────────────────────────────────────── */
    getPatients()  { return sqliteAdapter ? sqliteAdapter.getPatients() : dataStore.getCollection('patients'); },
    getPatientById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getPatientById === 'function') {
        return sqliteAdapter.getPatientById(id);
      }
      const list = dataStore.getCollection('patients') || [];
      return list.find(p => p && (p.id === id || p._id === id || p.patientId === id || p.patientCode === id)) || null;
    },
    getPatientByCode(code) {
      if (sqliteAdapter && typeof sqliteAdapter.getPatientByCode === 'function') {
        return sqliteAdapter.getPatientByCode(code);
      }
      const list = dataStore.getCollection('patients') || [];
      return list.find(p => p && (p.patientCode === code || p.id === code)) || null;
    },
    getPatientByPatientId(patientId) {
      if (sqliteAdapter && typeof sqliteAdapter.getPatientByPatientId === 'function') {
        return sqliteAdapter.getPatientByPatientId(patientId);
      }
      const list = dataStore.getCollection('patients') || [];
      return list.find(p => p && (p.patientId === patientId || p.id === patientId)) || null;
    },
    queryPatients(filter = {}, opts = {}) {
      if (sqliteAdapter && typeof sqliteAdapter.queryPatients === 'function') {
        return sqliteAdapter.queryPatients(filter, opts);
      }
      let list = dataStore.getCollection('patients') || [];
      if (filter.id) list = list.filter(p => p.id === filter.id);
      if (filter.patientId) list = list.filter(p => p.patientId === filter.patientId);
      if (filter.patientCode) list = list.filter(p => p.patientCode === filter.patientCode);
      if (filter.search) {
        const s = String(filter.search).toLowerCase();
        list = list.filter(p => (p.firstName && p.firstName.toLowerCase().includes(s)) ||
                                (p.lastName && p.lastName.toLowerCase().includes(s)) ||
                                (p.patientId && p.patientId.toLowerCase().includes(s)) ||
                                (p.patientCode && p.patientCode.toLowerCase().includes(s)));
      }
      if (opts.limit) {
        const offset = opts.offset || 0;
        list = list.slice(offset, offset + Number(opts.limit));
      }
      return list;
    },
    countPatients(filter = {}) {
      if (sqliteAdapter && typeof sqliteAdapter.countPatients === 'function') {
        return sqliteAdapter.countPatients(filter);
      }
      return (dataStore.getCollection('patients') || []).length;
    },

    getTests()     { return sqliteAdapter ? sqliteAdapter.getTests() : dataStore.getCollection('tests'); },
    getTestById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getTestById === 'function') {
        return sqliteAdapter.getTestById(id);
      }
      const list = dataStore.getCollection('tests') || [];
      return list.find(t => t && (t.id === id || t._id === id || t.testId === id)) || null;
    },
    getTestByTestId(testId) {
      if (sqliteAdapter && typeof sqliteAdapter.getTestByTestId === 'function') {
        return sqliteAdapter.getTestByTestId(testId);
      }
      const list = dataStore.getCollection('tests') || [];
      return list.find(t => t && (t.testId === testId || t.id === testId)) || null;
    },
    queryTests(filter = {}, opts = {}) {
      if (sqliteAdapter && typeof sqliteAdapter.queryTests === 'function') {
        return sqliteAdapter.queryTests(filter, opts);
      }
      let list = dataStore.getCollection('tests') || [];
      if (filter.id) list = list.filter(t => t.id === filter.id);
      if (filter.testId) list = list.filter(t => t.testId === filter.testId);
      if (filter.patient) list = list.filter(t => t.patient === filter.patient);
      if (filter.status) list = list.filter(t => t.status === filter.status);
      if (filter.testType) list = list.filter(t => t.testType === filter.testType);
      if (opts.limit) {
        const offset = opts.offset || 0;
        list = list.slice(offset, offset + Number(opts.limit));
      }
      return list;
    },
    countTests(filter = {}) {
      if (sqliteAdapter && typeof sqliteAdapter.countTests === 'function') {
        return sqliteAdapter.countTests(filter);
      }
      return (dataStore.getCollection('tests') || []).length;
    },

    getTemplates() { return sqliteAdapter ? sqliteAdapter.getTemplates() : dataStore.getCollection('templates'); },
    getCounters()  { return sqliteAdapter ? sqliteAdapter.getCounters() : dataStore.getCollection('counters'); },

    getUsers()     { return sqliteAdapter ? sqliteAdapter.getUsers() : dataStore.getCollection('users'); },
    getUserById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getUserById === 'function') {
        return sqliteAdapter.getUserById(id);
      }
      const list = dataStore.getCollection('users') || [];
      return list.find(u => u && (u.id === id || u._id === id)) || null;
    },
    getUserByEmail(email) {
      if (sqliteAdapter && typeof sqliteAdapter.getUserByEmail === 'function') {
        return sqliteAdapter.getUserByEmail(email);
      }
      if (!email) return null;
      const list = dataStore.getCollection('users') || [];
      return list.find(u => u && u.email && u.email.toLowerCase() === String(email).toLowerCase()) || null;
    },

    /* ── Single-record mutations ────────────────────────────────── */
    upsertPatient(p) {
      if (sqliteAdapter && typeof sqliteAdapter.upsertPatient === 'function') {
        sqliteAdapter.upsertPatient(p);
      } else if (p && p.id) {
        const list = dataStore.getCollection('patients') || [];
        const idx = list.findIndex(x => x.id === p.id);
        if (idx >= 0) list[idx] = p; else list.push(p);
        dataStore.setCollection('patients', list);
      }
    },
    deletePatient(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deletePatient === 'function') {
        sqliteAdapter.deletePatient(id);
      } else if (id) {
        let list = dataStore.getCollection('patients') || [];
        list = list.filter(p => p && p.id !== id);
        dataStore.setCollection('patients', list);
      }
    },
    upsertTest(t) {
      if (sqliteAdapter && typeof sqliteAdapter.upsertTest === 'function') {
        sqliteAdapter.upsertTest(t);
      } else if (t && t.id) {
        const list = dataStore.getCollection('tests') || [];
        const idx = list.findIndex(x => x.id === t.id);
        if (idx >= 0) list[idx] = t; else list.push(t);
        dataStore.setCollection('tests', list);
      }
    },
    deleteTest(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteTest === 'function') {
        sqliteAdapter.deleteTest(id);
      } else if (id) {
        let list = dataStore.getCollection('tests') || [];
        list = list.filter(t => t && t.id !== id);
        dataStore.setCollection('tests', list);
      }
    },
    upsertUser(u) {
      if (sqliteAdapter && typeof sqliteAdapter.upsertUser === 'function') {
        sqliteAdapter.upsertUser(u);
      } else if (u && u.id) {
        const list = dataStore.getCollection('users') || [];
        const idx = list.findIndex(x => x.id === u.id);
        if (idx >= 0) list[idx] = u; else list.push(u);
        dataStore.setCollection('users', list);
      }
    },
    deleteUser(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteUser === 'function') {
        sqliteAdapter.deleteUser(id);
      } else if (id) {
        let list = dataStore.getCollection('users') || [];
        list = list.filter(u => u && u.id !== id);
        dataStore.setCollection('users', list);
      }
    },

    /* ── Collection savers ──────────────────────────────────────── */
    savePatients(patients)   {
      if (sqliteAdapter) sqliteAdapter.savePatients(patients);
      else dataStore.setCollection('patients', patients);
    },
    saveTests(tests) {
      if (sqliteAdapter) sqliteAdapter.saveTests(tests);
      else dataStore.setCollection('tests', tests);
    },
    saveTemplates(templates) {
      if (sqliteAdapter) sqliteAdapter.saveTemplates(templates);
      else dataStore.setCollection('templates', templates);
    },
    saveCounters(counters)   {
      if (sqliteAdapter) sqliteAdapter.saveCounters(counters);
      else dataStore.setCollection('counters', counters);
    },
    saveUsers(users) {
      if (sqliteAdapter) sqliteAdapter.saveUsers(users);
      else dataStore.setCollection('users', users);
    },

    getMeta(key) {
      return dataStore.getMeta(key);
    },
    setMeta(key, val) {
      dataStore.setMeta(key, val);
    },

    /* ── Inventory Management ─────────────────────────────────────── */
    getInventory() {
      if (sqliteAdapter && typeof sqliteAdapter.getInventory === 'function') {
        return sqliteAdapter.getInventory();
      }
      return dataStore.getCollection('inventory') || [];
    },
    getInventoryById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getInventoryById === 'function') {
        return sqliteAdapter.getInventoryById(id);
      }
      const list = dataStore.getCollection('inventory') || [];
      return list.find(i => i && (i.id === id || i._id === id || i.sku === id)) || null;
    },
    saveInventory(item) {
      if (sqliteAdapter && typeof sqliteAdapter.saveInventory === 'function') {
        return sqliteAdapter.saveInventory(item);
      }
      let list = dataStore.getCollection('inventory') || [];
      const idx = list.findIndex(i => i && i.id === item.id);
      if (idx >= 0) list[idx] = item;
      else list.push(item);
      dataStore.setCollection('inventory', list);
      return item;
    },
    deleteInventory(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteInventory === 'function') {
        return sqliteAdapter.deleteInventory(id);
      }
      let list = dataStore.getCollection('inventory') || [];
      list = list.filter(i => i && i.id !== id);
      dataStore.setCollection('inventory', list);
      return true;
    },
    getAllInventoryBatches() {
      if (sqliteAdapter && typeof sqliteAdapter.getAllInventoryBatches === 'function') {
        return sqliteAdapter.getAllInventoryBatches();
      }
      return dataStore.getCollection('inventory_batches') || [];
    },
    getInventoryBatchesByItemId(inventoryId) {
      if (sqliteAdapter && typeof sqliteAdapter.getInventoryBatchesByItemId === 'function') {
        return sqliteAdapter.getInventoryBatchesByItemId(inventoryId);
      }
      const list = dataStore.getCollection('inventory_batches') || [];
      return list.filter(b => b && b.inventoryId === inventoryId);
    },
    getInventoryBatchById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getInventoryBatchById === 'function') {
        return sqliteAdapter.getInventoryBatchById(id);
      }
      const list = dataStore.getCollection('inventory_batches') || [];
      return list.find(b => b && b.id === id) || null;
    },
    saveBatch(batch) {
      if (sqliteAdapter && typeof sqliteAdapter.saveBatch === 'function') {
        return sqliteAdapter.saveBatch(batch);
      }
      let list = dataStore.getCollection('inventory_batches') || [];
      const idx = list.findIndex(b => b && b.id === batch.id);
      if (idx >= 0) list[idx] = batch;
      else list.push(batch);
      dataStore.setCollection('inventory_batches', list);
      return batch;
    },
    deleteBatch(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteBatch === 'function') {
        return sqliteAdapter.deleteBatch(id);
      }
      let list = dataStore.getCollection('inventory_batches') || [];
      list = list.filter(b => b && b.id !== id);
      dataStore.setCollection('inventory_batches', list);
      return true;
    },
    getInventoryTransactions(inventoryId) {
      if (sqliteAdapter && typeof sqliteAdapter.getInventoryTransactions === 'function') {
        return sqliteAdapter.getInventoryTransactions(inventoryId);
      }
      const list = dataStore.getCollection('inventory_transactions') || [];
      return list.filter(t => t && t.inventoryId === inventoryId);
    },
    saveTransaction(tx) {
      if (sqliteAdapter && typeof sqliteAdapter.saveTransaction === 'function') {
        return sqliteAdapter.saveTransaction(tx);
      }
      let list = dataStore.getCollection('inventory_transactions') || [];
      list.unshift(tx);
      dataStore.setCollection('inventory_transactions', list);
      return tx;
    },
    deleteTransaction(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteTransaction === 'function') {
        return sqliteAdapter.deleteTransaction(id);
      }
      let list = dataStore.getCollection('inventory_transactions') || [];
      list = list.filter(t => t && t.id !== id);
      dataStore.setCollection('inventory_transactions', list);
      return true;
    }
  };

  return db;
}

module.exports = { createOfflineDb };
