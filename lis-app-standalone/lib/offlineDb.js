/**
 * offlineDb.js — A `global.db`-compatible shim backed by the DataStore.
 *
 * The lis-fullstack server uses `global.db` with methods like:
 *   read(), getPatients(), getTests(), getUsers(), getTemplates(), getCounters(),
 *   savePatients(), saveTests(), saveUsers(), saveTemplates(), saveCounters()
 *
 * This module creates an object with the same API but reads/writes to the
 * DataStore (Documents/LIS/app_sync/data.json) so the exact same route files
 * can run offline inside the standalone Electron app.
 */

function createOfflineDb(dataStore) {
  if (!dataStore) throw new Error('offlineDb requires a DataStore instance');

  const db = {
    /**
     * read() — return the full data object (patients, tests, templates, counters).
     * The real server reads from data.json; we read from DataStore's in-memory cache.
     */
    read() {
      const all = dataStore.getAll();
      return {
        patients: Array.isArray(all.patients) ? all.patients : [],
        tests: Array.isArray(all.tests) ? all.tests : [],
        templates: Array.isArray(all.templates) ? all.templates : [],
        counters: all.counters || {},
      };
    },

    /** write(data) — persist the full data blob (minus users, which are separate). */
    write(data) {
      if (data.patients) dataStore.setCollection('patients', data.patients);
      if (data.tests) dataStore.setCollection('tests', data.tests);
      if (data.templates) dataStore.setCollection('templates', data.templates);
      if (data.counters != null) {
        dataStore._data.counters = data.counters;
        dataStore._save();
      }
    },

    /* ── Collection getters ─────────────────────────────────────── */
    getPatients()  { return dataStore.getCollection('patients'); },
    getTests()     { return dataStore.getCollection('tests'); },
    getTemplates() { return dataStore.getCollection('templates'); },
    getCounters()  { return dataStore._data.counters || {}; },

    /**
     * getUsers() — return user accounts including hashed passwords.
     * The export endpoint now sends passwords so offline auth can work.
     */
    getUsers() { return dataStore.getCollection('users'); },

    /* ── Collection savers ──────────────────────────────────────── */
    savePatients(patients)   { dataStore.setCollection('patients', patients); },
    saveTemplates(templates) { dataStore.setCollection('templates', templates); },
    saveCounters(counters)   {
      dataStore._data.counters = counters;
      dataStore._save();
    },
    saveUsers(users) { dataStore.setCollection('users', users); },

    /**
     * saveTests — merge-aware save (mirrors server logic):
     * keeps the newer version when the same test ID exists on disk and in
     * the incoming payload.
     */
    saveTests(tests) {
      try {
        const existing = dataStore.getCollection('tests');
        const mergedMap = new Map();
        for (const t of existing) {
          if (t && t.id) mergedMap.set(t.id, t);
        }
        for (const t of (Array.isArray(tests) ? tests : [])) {
          if (!t || !t.id) continue;
          const cur = mergedMap.get(t.id);
          const curTs = cur && cur.updatedAt ? Date.parse(cur.updatedAt) : 0;
          const incomingTs = t.updatedAt ? Date.parse(t.updatedAt) : 0;
          if (!cur || incomingTs >= curTs) {
            mergedMap.set(t.id, t);
          }
        }
        const merged = Array.from(mergedMap.values());
        dataStore.setCollection('tests', merged);
      } catch (e) {
        console.error('[offlineDb] saveTests failed:', e && e.message);
        dataStore.setCollection('tests', tests);
      }
    },
  };

  return db;
}

module.exports = { createOfflineDb };
