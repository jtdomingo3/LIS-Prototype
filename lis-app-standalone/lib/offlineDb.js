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
      }
    },

    /* ── Collection getters ─────────────────────────────────────── */
    getPatients()  { return sqliteAdapter ? sqliteAdapter.getPatients() : dataStore.getCollection('patients'); },
    getPatientById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getPatientById === 'function') {
        return sqliteAdapter.getPatientById(id);
      }
      const list = dataStore.getCollection('patients') || [];
      return list.find(p => p && (p.id === id || p._id === id || p.patientId === id)) || null;
    },

    getTests()     { return sqliteAdapter ? sqliteAdapter.getTests() : dataStore.getCollection('tests'); },
    getTestById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getTestById === 'function') {
        return sqliteAdapter.getTestById(id);
      }
      const list = dataStore.getCollection('tests') || [];
      return list.find(t => t && (t.id === id || t._id === id || t.testId === id)) || null;
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
    }
  };

  return db;
}

module.exports = { createOfflineDb };
