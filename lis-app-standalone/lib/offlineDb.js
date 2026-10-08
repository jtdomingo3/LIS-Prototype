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
        if (data.equipment) dataStore.setCollection('equipment', data.equipment);
        if (data.equipment_logs) dataStore.setCollection('equipment_logs', data.equipment_logs);
        if (data.qc_controls) dataStore.setCollection('qc_controls', data.qc_controls);
        if (data.qc_entries) dataStore.setCollection('qc_entries', data.qc_entries);
        if (data.neqas_records) dataStore.setCollection('neqas_records', data.neqas_records);
        if (data.consultations) dataStore.setCollection('consultations', data.consultations);
        if (data.expenses) dataStore.setCollection('expenses', data.expenses);
        if (data.revenue_entries) dataStore.setCollection('revenue_entries', data.revenue_entries);
        if (data.cost_per_test) dataStore.setCollection('cost_per_test', data.cost_per_test);
        if (data.employees) dataStore.setCollection('employees', data.employees);
        if (data.payroll_records) dataStore.setCollection('payroll_records', data.payroll_records);
        if (data.hr_documents) dataStore.setCollection('hr_documents', data.hr_documents);
        if (data.leave_records) dataStore.setCollection('leave_records', data.leave_records);
        if (data.dtr_records) dataStore.setCollection('dtr_records', data.dtr_records);
        if (data.philhealth_records) dataStore.setCollection('philhealth_records', data.philhealth_records);
        if (data.healthcard_records) dataStore.setCollection('healthcard_records', data.healthcard_records);
        if (data.settings && this.setSettings) this.setSettings(data.settings);
      }
    },

    getSettings() {
      if (sqliteAdapter && typeof sqliteAdapter.getSettings === 'function') {
        return sqliteAdapter.getSettings();
      }
      if (dataStore && typeof dataStore.getSettings === 'function') {
        return dataStore.getSettings();
      }
      return {};
    },

    setSettings(settings) {
      if (sqliteAdapter && typeof sqliteAdapter.setSettings === 'function') {
        sqliteAdapter.setSettings(settings);
      }
      if (dataStore && typeof dataStore.setSettings === 'function') {
        dataStore.setSettings(settings);
      }
      return settings;
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
    },

    /* ── Equipment & QC Methods ────────────────────────────────── */
    getEquipment() {
      if (sqliteAdapter && typeof sqliteAdapter.getEquipment === 'function') {
        return sqliteAdapter.getEquipment();
      }
      return dataStore.getCollection('equipment') || [];
    },
    getEquipmentById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getEquipmentById === 'function') {
        return sqliteAdapter.getEquipmentById(id);
      }
      const list = dataStore.getCollection('equipment') || [];
      return list.find(e => e && e.id === id) || null;
    },
    getEquipmentByCode(code) {
      if (sqliteAdapter && typeof sqliteAdapter.getEquipmentByCode === 'function') {
        return sqliteAdapter.getEquipmentByCode(code);
      }
      const list = dataStore.getCollection('equipment') || [];
      return list.find(e => e && (e.equipmentCode === code || e.code === code)) || null;
    },
    getEquipmentByDepartment(dept) {
      if (sqliteAdapter && typeof sqliteAdapter.getEquipmentByDepartment === 'function') {
        return sqliteAdapter.getEquipmentByDepartment(dept);
      }
      const list = dataStore.getCollection('equipment') || [];
      return list.filter(e => e && (e.department || '').toLowerCase() === String(dept).toLowerCase());
    },
    getEquipmentByCategory(cat) {
      if (sqliteAdapter && typeof sqliteAdapter.getEquipmentByCategory === 'function') {
        return sqliteAdapter.getEquipmentByCategory(cat);
      }
      const list = dataStore.getCollection('equipment') || [];
      return list.filter(e => e && (e.category || '').toLowerCase() === String(cat).toLowerCase());
    },
    saveEquipment(item) {
      if (sqliteAdapter && typeof sqliteAdapter.saveEquipment === 'function') {
        return sqliteAdapter.saveEquipment(item);
      }
      let list = dataStore.getCollection('equipment') || [];
      const idx = list.findIndex(e => e && e.id === item.id);
      if (idx >= 0) list[idx] = item;
      else list.push(item);
      dataStore.setCollection('equipment', list);
      return item;
    },
    deleteEquipment(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteEquipment === 'function') {
        return sqliteAdapter.deleteEquipment(id);
      }
      let list = dataStore.getCollection('equipment') || [];
      list = list.filter(e => e && e.id !== id);
      dataStore.setCollection('equipment', list);
      return true;
    },

    getEquipmentLogs(equipmentId) {
      if (sqliteAdapter && typeof sqliteAdapter.getEquipmentLogs === 'function') {
        return sqliteAdapter.getEquipmentLogs(equipmentId);
      }
      const list = dataStore.getCollection('equipment_logs') || [];
      return equipmentId ? list.filter(l => l && l.equipmentId === equipmentId) : list;
    },
    getEquipmentLogById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getEquipmentLogById === 'function') {
        return sqliteAdapter.getEquipmentLogById(id);
      }
      const list = dataStore.getCollection('equipment_logs') || [];
      return list.find(l => l && l.id === id) || null;
    },
    saveEquipmentLog(log) {
      if (sqliteAdapter && typeof sqliteAdapter.saveEquipmentLog === 'function') {
        return sqliteAdapter.saveEquipmentLog(log);
      }
      let list = dataStore.getCollection('equipment_logs') || [];
      const idx = list.findIndex(l => l && l.id === log.id);
      if (idx >= 0) list[idx] = log;
      else list.push(log);
      dataStore.setCollection('equipment_logs', list);
      return log;
    },
    deleteEquipmentLog(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteEquipmentLog === 'function') {
        return sqliteAdapter.deleteEquipmentLog(id);
      }
      let list = dataStore.getCollection('equipment_logs') || [];
      list = list.filter(l => l && l.id !== id);
      dataStore.setCollection('equipment_logs', list);
      return true;
    },

    getQcControls(equipmentId) {
      if (sqliteAdapter && typeof sqliteAdapter.getQcControls === 'function') {
        return sqliteAdapter.getQcControls(equipmentId);
      }
      const list = dataStore.getCollection('qc_controls') || [];
      return equipmentId ? list.filter(c => c && c.equipmentId === equipmentId) : list;
    },
    getQcControlById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getQcControlById === 'function') {
        return sqliteAdapter.getQcControlById(id);
      }
      const list = dataStore.getCollection('qc_controls') || [];
      return list.find(c => c && c.id === id) || null;
    },
    saveQcControl(ctrl) {
      if (sqliteAdapter && typeof sqliteAdapter.saveQcControl === 'function') {
        return sqliteAdapter.saveQcControl(ctrl);
      }
      let list = dataStore.getCollection('qc_controls') || [];
      const idx = list.findIndex(c => c && c.id === ctrl.id);
      if (idx >= 0) list[idx] = ctrl;
      else list.push(ctrl);
      dataStore.setCollection('qc_controls', list);
      return ctrl;
    },
    deleteQcControl(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteQcControl === 'function') {
        return sqliteAdapter.deleteQcControl(id);
      }
      let list = dataStore.getCollection('qc_controls') || [];
      list = list.filter(c => c && c.id !== id);
      dataStore.setCollection('qc_controls', list);
      return true;
    },

    getQcEntries(equipmentId, analyteCode) {
      if (sqliteAdapter && typeof sqliteAdapter.getQcEntries === 'function') {
        return sqliteAdapter.getQcEntries(equipmentId, analyteCode);
      }
      let list = dataStore.getCollection('qc_entries') || [];
      if (equipmentId && analyteCode) {
        list = list.filter(e => e && e.equipmentId === equipmentId && e.analyteCode === analyteCode);
      } else if (equipmentId) {
        list = list.filter(e => e && e.equipmentId === equipmentId);
      }
      return list;
    },
    getQcEntryById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getQcEntryById === 'function') {
        return sqliteAdapter.getQcEntryById(id);
      }
      const list = dataStore.getCollection('qc_entries') || [];
      return list.find(e => e && e.id === id) || null;
    },
    saveQcEntry(entry) {
      if (sqliteAdapter && typeof sqliteAdapter.saveQcEntry === 'function') {
        return sqliteAdapter.saveQcEntry(entry);
      }
      let list = dataStore.getCollection('qc_entries') || [];
      const idx = list.findIndex(e => e && e.id === entry.id);
      if (idx >= 0) list[idx] = entry;
      else list.push(entry);
      dataStore.setCollection('qc_entries', list);
      return entry;
    },
    deleteQcEntry(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteQcEntry === 'function') {
        return sqliteAdapter.deleteQcEntry(id);
      }
      let list = dataStore.getCollection('qc_entries') || [];
      list = list.filter(e => e && e.id !== id);
      dataStore.setCollection('qc_entries', list);
      return true;
    },
    deleteQcEntries(equipmentId, analyteCode) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteQcEntries === 'function') {
        return sqliteAdapter.deleteQcEntries(equipmentId, analyteCode);
      }
      let list = dataStore.getCollection('qc_entries') || [];
      if (equipmentId && analyteCode) {
        list = list.filter(e => !(e && e.equipmentId === equipmentId && e.analyteCode === analyteCode));
      } else if (equipmentId) {
        list = list.filter(e => !(e && e.equipmentId === equipmentId));
      }
      dataStore.setCollection('qc_entries', list);
      return true;
    },

    getNeqasRecords(equipmentId) {
      if (sqliteAdapter && typeof sqliteAdapter.getNeqasRecords === 'function') {
        return sqliteAdapter.getNeqasRecords(equipmentId);
      }
      const list = dataStore.getCollection('neqas_records') || [];
      return equipmentId ? list.filter(r => r && r.equipmentId === equipmentId) : list;
    },
    getNeqasRecordById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getNeqasRecordById === 'function') {
        return sqliteAdapter.getNeqasRecordById(id);
      }
      const list = dataStore.getCollection('neqas_records') || [];
      return list.find(r => r && r.id === id) || null;
    },
    saveNeqasRecord(rec) {
      if (sqliteAdapter && typeof sqliteAdapter.saveNeqasRecord === 'function') {
        return sqliteAdapter.saveNeqasRecord(rec);
      }
      let list = dataStore.getCollection('neqas_records') || [];
      const idx = list.findIndex(r => r && r.id === rec.id);
      if (idx >= 0) list[idx] = rec;
      else list.push(rec);
      dataStore.setCollection('neqas_records', list);
      return rec;
    },
    deleteNeqasRecord(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteNeqasRecord === 'function') {
        return sqliteAdapter.deleteNeqasRecord(id);
      }
      let list = dataStore.getCollection('neqas_records') || [];
      list = list.filter(r => !(r && r.id === id));
      dataStore.setCollection('neqas_records', list);
      return true;
    },
    getCustomNrls() {
      if (sqliteAdapter && typeof sqliteAdapter.getCustomNrls === 'function') {
        return sqliteAdapter.getCustomNrls();
      }
      return dataStore.getCollection('custom_nrls') || [];
    },
    saveCustomNrls(list) {
      if (sqliteAdapter && typeof sqliteAdapter.saveCustomNrls === 'function') {
        return sqliteAdapter.saveCustomNrls(list);
      }
      dataStore.setCollection('custom_nrls', list || []);
      return true;
    },

    /* ── Consultations ─────────────────────────────────────────── */
    getConsultations() {
      if (sqliteAdapter && typeof sqliteAdapter.getConsultations === 'function') {
        return sqliteAdapter.getConsultations();
      }
      return dataStore.getCollection('consultations') || [];
    },
    getConsultationById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getConsultationById === 'function') {
        return sqliteAdapter.getConsultationById(id);
      }
      const list = dataStore.getCollection('consultations') || [];
      return list.find(c => c && (c.id === id || c._id === id)) || null;
    },
    getConsultationByTestId(testId) {
      if (sqliteAdapter && typeof sqliteAdapter.getConsultationByTestId === 'function') {
        return sqliteAdapter.getConsultationByTestId(testId);
      }
      const list = dataStore.getCollection('consultations') || [];
      return list.find(c => c && (c.testId === testId || c.test === testId)) || null;
    },
    getConsultationsByPatientId(patientId) {
      if (sqliteAdapter && typeof sqliteAdapter.getConsultationsByPatientId === 'function') {
        return sqliteAdapter.getConsultationsByPatientId(patientId);
      }
      const list = dataStore.getCollection('consultations') || [];
      return list.filter(c => c && (c.patientId === patientId || c.patient === patientId));
    },
    saveConsultation(c) {
      if (sqliteAdapter && typeof sqliteAdapter.saveConsultation === 'function') {
        return sqliteAdapter.saveConsultation(c);
      }
      if (!c || !c.id) return null;
      let list = dataStore.getCollection('consultations') || [];
      const idx = list.findIndex(item => item && item.id === c.id);
      if (idx >= 0) list[idx] = c;
      else list.push(c);
      dataStore.setCollection('consultations', list);
      return c;
    },
    deleteConsultation(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteConsultation === 'function') {
        return sqliteAdapter.deleteConsultation(id);
      }
      let list = dataStore.getCollection('consultations') || [];
      list = list.filter(c => !(c && c.id === id));
      dataStore.setCollection('consultations', list);
      return true;
    },

    /* ── Expenses ──────────────────────────────────────────────── */
    getExpenses(month, category) {
      if (sqliteAdapter && typeof sqliteAdapter.getExpenses === 'function') {
        return sqliteAdapter.getExpenses(month, category);
      }
      let list = dataStore.getCollection('expenses') || [];
      if (month) list = list.filter(e => e && e.month === month);
      if (category) list = list.filter(e => e && e.category === category);
      return list;
    },
    getExpenseById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getExpenseById === 'function') {
        return sqliteAdapter.getExpenseById(id);
      }
      const list = dataStore.getCollection('expenses') || [];
      return list.find(e => e && (e.id === id || e._id === id)) || null;
    },
    saveExpense(exp) {
      if (sqliteAdapter && typeof sqliteAdapter.saveExpense === 'function') {
        return sqliteAdapter.saveExpense(exp);
      }
      if (!exp || !exp.id) return null;
      let list = dataStore.getCollection('expenses') || [];
      const idx = list.findIndex(e => e && e.id === exp.id);
      if (idx >= 0) list[idx] = exp;
      else list.push(exp);
      dataStore.setCollection('expenses', list);
      return exp;
    },
    deleteExpense(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteExpense === 'function') {
        return sqliteAdapter.deleteExpense(id);
      }
      let list = dataStore.getCollection('expenses') || [];
      list = list.filter(e => !(e && e.id === id));
      dataStore.setCollection('expenses', list);
      return true;
    },

    /* ── Revenue Entries ───────────────────────────────────────── */
    getRevenueEntries(month) {
      if (sqliteAdapter && typeof sqliteAdapter.getRevenueEntries === 'function') {
        return sqliteAdapter.getRevenueEntries(month);
      }
      let list = dataStore.getCollection('revenue_entries') || [];
      if (month) list = list.filter(r => r && r.month === month);
      return list;
    },
    getRevenueEntryById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getRevenueEntryById === 'function') {
        return sqliteAdapter.getRevenueEntryById(id);
      }
      const list = dataStore.getCollection('revenue_entries') || [];
      return list.find(r => r && (r.id === id || r._id === id)) || null;
    },
    saveRevenueEntry(rev) {
      if (sqliteAdapter && typeof sqliteAdapter.saveRevenueEntry === 'function') {
        return sqliteAdapter.saveRevenueEntry(rev);
      }
      if (!rev || !rev.id) return null;
      let list = dataStore.getCollection('revenue_entries') || [];
      const idx = list.findIndex(r => r && r.id === rev.id);
      if (idx >= 0) list[idx] = rev;
      else list.push(rev);
      dataStore.setCollection('revenue_entries', list);
      return rev;
    },
    deleteRevenueEntry(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteRevenueEntry === 'function') {
        return sqliteAdapter.deleteRevenueEntry(id);
      }
      let list = dataStore.getCollection('revenue_entries') || [];
      list = list.filter(r => !(r && r.id === id));
      dataStore.setCollection('revenue_entries', list);
      return true;
    },

    /* ── Cost Per Test ─────────────────────────────────────────── */
    getCostPerTests() {
      if (sqliteAdapter && typeof sqliteAdapter.getCostPerTests === 'function') {
        return sqliteAdapter.getCostPerTests();
      }
      return dataStore.getCollection('cost_per_test') || [];
    },
    getCostPerTestById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getCostPerTestById === 'function') {
        return sqliteAdapter.getCostPerTestById(id);
      }
      const list = dataStore.getCollection('cost_per_test') || [];
      return list.find(c => c && (c.id === id || c._id === id)) || null;
    },
    getCostPerTestByType(type) {
      if (sqliteAdapter && typeof sqliteAdapter.getCostPerTestByType === 'function') {
        return sqliteAdapter.getCostPerTestByType(type);
      }
      const list = dataStore.getCollection('cost_per_test') || [];
      return list.find(c => c && c.testType === type) || null;
    },
    saveCostPerTest(cpt) {
      if (sqliteAdapter && typeof sqliteAdapter.saveCostPerTest === 'function') {
        return sqliteAdapter.saveCostPerTest(cpt);
      }
      if (!cpt || !cpt.id) return null;
      let list = dataStore.getCollection('cost_per_test') || [];
      const idx = list.findIndex(c => c && c.id === cpt.id);
      if (idx >= 0) list[idx] = cpt;
      else list.push(cpt);
      dataStore.setCollection('cost_per_test', list);
      return cpt;
    },
    deleteCostPerTest(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteCostPerTest === 'function') {
        return sqliteAdapter.deleteCostPerTest(id);
      }
      let list = dataStore.getCollection('cost_per_test') || [];
      list = list.filter(c => !(c && c.id === id));
      dataStore.setCollection('cost_per_test', list);
      return true;
    },

    /* ── Employees ─────────────────────────────────────────────── */
    getEmployees() {
      if (sqliteAdapter && typeof sqliteAdapter.getEmployees === 'function') {
        return sqliteAdapter.getEmployees();
      }
      return dataStore.getCollection('employees') || [];
    },
    getEmployeeById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getEmployeeById === 'function') {
        return sqliteAdapter.getEmployeeById(id);
      }
      const list = dataStore.getCollection('employees') || [];
      return list.find(e => e && (e.id === id || e._id === id)) || null;
    },
    getEmployeeByUserId(userId) {
      if (sqliteAdapter && typeof sqliteAdapter.getEmployeeByUserId === 'function') {
        return sqliteAdapter.getEmployeeByUserId(userId);
      }
      const list = dataStore.getCollection('employees') || [];
      return list.find(e => e && (e.userId === userId || e.id === userId)) || null;
    },
    getEmployeeByCode(code) {
      if (sqliteAdapter && typeof sqliteAdapter.getEmployeeByCode === 'function') {
        return sqliteAdapter.getEmployeeByCode(code);
      }
      const list = dataStore.getCollection('employees') || [];
      return list.find(e => e && e.employeeCode === code) || null;
    },
    saveEmployee(emp) {
      if (sqliteAdapter && typeof sqliteAdapter.saveEmployee === 'function') {
        return sqliteAdapter.saveEmployee(emp);
      }
      if (!emp || !emp.id) return null;
      let list = dataStore.getCollection('employees') || [];
      const idx = list.findIndex(e => e && e.id === emp.id);
      if (idx >= 0) list[idx] = emp;
      else list.push(emp);
      dataStore.setCollection('employees', list);
      return emp;
    },
    deleteEmployee(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteEmployee === 'function') {
        return sqliteAdapter.deleteEmployee(id);
      }
      let list = dataStore.getCollection('employees') || [];
      list = list.filter(e => !(e && e.id === id));
      dataStore.setCollection('employees', list);
      return true;
    },

    /* ── Payroll Records ───────────────────────────────────────── */
    getPayrollRecords(month, employeeId) {
      if (sqliteAdapter && typeof sqliteAdapter.getPayrollRecords === 'function') {
        return sqliteAdapter.getPayrollRecords(month, employeeId);
      }
      let list = dataStore.getCollection('payroll_records') || [];
      if (month && month !== 'all') list = list.filter(p => p && p.month === month);
      if (employeeId) list = list.filter(p => p && p.employeeId === employeeId);
      return list;
    },
    getPayrollRecordById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getPayrollRecordById === 'function') {
        return sqliteAdapter.getPayrollRecordById(id);
      }
      const list = dataStore.getCollection('payroll_records') || [];
      return list.find(p => p && (p.id === id || p._id === id)) || null;
    },
    getPayrollRecordsByEmployee(employeeId) {
      return this.getPayrollRecords(null, employeeId);
    },
    savePayrollRecord(p) {
      if (sqliteAdapter && typeof sqliteAdapter.savePayrollRecord === 'function') {
        return sqliteAdapter.savePayrollRecord(p);
      }
      if (!p || !p.id) return null;
      let list = dataStore.getCollection('payroll_records') || [];
      const idx = list.findIndex(item => item && item.id === p.id);
      if (idx >= 0) list[idx] = p;
      else list.push(p);
      dataStore.setCollection('payroll_records', list);
      return p;
    },
    deletePayrollRecord(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deletePayrollRecord === 'function') {
        return sqliteAdapter.deletePayrollRecord(id);
      }
      let list = dataStore.getCollection('payroll_records') || [];
      list = list.filter(p => !(p && p.id === id));
      dataStore.setCollection('payroll_records', list);
      return true;
    },

    /* ── HR Documents ──────────────────────────────────────────── */
    getHrDocuments(employeeId) {
      if (sqliteAdapter && typeof sqliteAdapter.getHrDocuments === 'function') {
        return sqliteAdapter.getHrDocuments(employeeId);
      }
      let list = dataStore.getCollection('hr_documents') || [];
      if (employeeId) list = list.filter(d => d && d.employeeId === employeeId);
      return list;
    },
    getHrDocumentById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getHrDocumentById === 'function') {
        return sqliteAdapter.getHrDocumentById(id);
      }
      const list = dataStore.getCollection('hr_documents') || [];
      return list.find(d => d && (d.id === id || d._id === id)) || null;
    },
    saveHrDocument(doc) {
      if (sqliteAdapter && typeof sqliteAdapter.saveHrDocument === 'function') {
        return sqliteAdapter.saveHrDocument(doc);
      }
      if (!doc || !doc.id) return null;
      let list = dataStore.getCollection('hr_documents') || [];
      const idx = list.findIndex(d => d && d.id === doc.id);
      if (idx >= 0) list[idx] = doc;
      else list.push(doc);
      dataStore.setCollection('hr_documents', list);
      return doc;
    },
    deleteHrDocument(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteHrDocument === 'function') {
        return sqliteAdapter.deleteHrDocument(id);
      }
      let list = dataStore.getCollection('hr_documents') || [];
      list = list.filter(d => !(d && d.id === id));
      dataStore.setCollection('hr_documents', list);
      return true;
    },

    /* ── Leave Records ─────────────────────────────────────────── */
    getLeaveRecords(employeeId) {
      if (sqliteAdapter && typeof sqliteAdapter.getLeaveRecords === 'function') {
        return sqliteAdapter.getLeaveRecords(employeeId);
      }
      let list = dataStore.getCollection('leave_records') || [];
      if (employeeId) list = list.filter(l => l && l.employeeId === employeeId);
      return list;
    },
    getLeaveRecordsByEmployee(employeeId) {
      return this.getLeaveRecords(employeeId);
    },
    getLeaveRecordById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getLeaveRecordById === 'function') {
        return sqliteAdapter.getLeaveRecordById(id);
      }
      const list = dataStore.getCollection('leave_records') || [];
      return list.find(l => l && (l.id === id || l._id === id)) || null;
    },
    saveLeaveRecord(lr) {
      if (sqliteAdapter && typeof sqliteAdapter.saveLeaveRecord === 'function') {
        return sqliteAdapter.saveLeaveRecord(lr);
      }
      if (!lr || !lr.id) return null;
      let list = dataStore.getCollection('leave_records') || [];
      const idx = list.findIndex(l => l && l.id === lr.id);
      if (idx >= 0) list[idx] = lr;
      else list.push(lr);
      dataStore.setCollection('leave_records', list);
      return lr;
    },
    deleteLeaveRecord(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteLeaveRecord === 'function') {
        return sqliteAdapter.deleteLeaveRecord(id);
      }
      let list = dataStore.getCollection('leave_records') || [];
      list = list.filter(l => !(l && l.id === id));
      dataStore.setCollection('leave_records', list);
      return true;
    },

    /* ── DTR Records ───────────────────────────────────────────── */
    getDtrRecords(employeeId, yearMonth) {
      if (sqliteAdapter && typeof sqliteAdapter.getDtrRecords === 'function') {
        return sqliteAdapter.getDtrRecords(employeeId, yearMonth);
      }
      let list = dataStore.getCollection('dtr_records') || [];
      if (employeeId) list = list.filter(d => d && d.employeeId === employeeId);
      if (yearMonth) list = list.filter(d => d && d.date && d.date.startsWith(yearMonth));
      return list;
    },
    getDtrRecordByDate(employeeId, date) {
      if (sqliteAdapter && typeof sqliteAdapter.getDtrRecordByDate === 'function') {
        return sqliteAdapter.getDtrRecordByDate(employeeId, date);
      }
      const list = dataStore.getCollection('dtr_records') || [];
      return list.find(d => d && d.employeeId === employeeId && d.date === date) || null;
    },
    saveDtrRecord(dtr) {
      if (sqliteAdapter && typeof sqliteAdapter.saveDtrRecord === 'function') {
        return sqliteAdapter.saveDtrRecord(dtr);
      }
      if (!dtr || !dtr.id) return null;
      let list = dataStore.getCollection('dtr_records') || [];
      const idx = list.findIndex(d => d && d.id === dtr.id);
      if (idx >= 0) list[idx] = dtr;
      else list.push(dtr);
      dataStore.setCollection('dtr_records', list);
      return dtr;
    },
    deleteDtrRecord(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteDtrRecord === 'function') {
        return sqliteAdapter.deleteDtrRecord(id);
      }
      let list = dataStore.getCollection('dtr_records') || [];
      list = list.filter(d => !(d && d.id === id));
      dataStore.setCollection('dtr_records', list);
      return true;
    },

    /* ── PhilHealth Records ─────────────────────────────────────── */
    getPhilhealthRecords(filters) {
      if (sqliteAdapter && typeof sqliteAdapter.getPhilhealthRecords === 'function') {
        return sqliteAdapter.getPhilhealthRecords(filters);
      }
      let list = dataStore.getCollection('philhealth_records') || [];
      if (filters) {
        if (filters.status && filters.status !== 'all') list = list.filter(r => r && r.status === filters.status);
        if (filters.search) {
          const s = String(filters.search).toLowerCase();
          list = list.filter(r => r && (
            (r.controlNo && r.controlNo.toLowerCase().includes(s)) ||
            (r.firstName && r.firstName.toLowerCase().includes(s)) ||
            (r.lastName && r.lastName.toLowerCase().includes(s)) ||
            (r.pinNo && r.pinNo.toLowerCase().includes(s))
          ));
        }
      }
      return list;
    },
    getPhilhealthRecordById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getPhilhealthRecordById === 'function') {
        return sqliteAdapter.getPhilhealthRecordById(id);
      }
      const list = dataStore.getCollection('philhealth_records') || [];
      return list.find(r => r && (r.id === id || r._id === id)) || null;
    },
    getPhilhealthRecordByControlNo(controlNo) {
      if (sqliteAdapter && typeof sqliteAdapter.getPhilhealthRecordByControlNo === 'function') {
        return sqliteAdapter.getPhilhealthRecordByControlNo(controlNo);
      }
      const list = dataStore.getCollection('philhealth_records') || [];
      return list.find(r => r && r.controlNo === controlNo) || null;
    },
    getPhilhealthRecordsByPatientId(patientId) {
      if (sqliteAdapter && typeof sqliteAdapter.getPhilhealthRecordsByPatientId === 'function') {
        return sqliteAdapter.getPhilhealthRecordsByPatientId(patientId);
      }
      const list = dataStore.getCollection('philhealth_records') || [];
      return list.filter(r => r && (r.patientId === patientId || r.patient === patientId));
    },
    savePhilhealthRecord(record) {
      if (sqliteAdapter && typeof sqliteAdapter.savePhilhealthRecord === 'function') {
        return sqliteAdapter.savePhilhealthRecord(record);
      }
      if (!record || !record.id) return null;
      let list = dataStore.getCollection('philhealth_records') || [];
      const idx = list.findIndex(r => r && r.id === record.id);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      dataStore.setCollection('philhealth_records', list);
      return record;
    },
    deletePhilhealthRecord(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deletePhilhealthRecord === 'function') {
        return sqliteAdapter.deletePhilhealthRecord(id);
      }
      let list = dataStore.getCollection('philhealth_records') || [];
      list = list.filter(r => !(r && r.id === id));
      dataStore.setCollection('philhealth_records', list);
      return true;
    },

    /* ── Health Card (HMO) Records ───────────────────────────────── */
    getHealthCardRecords(filters) {
      if (sqliteAdapter && typeof sqliteAdapter.getHealthCardRecords === 'function') {
        return sqliteAdapter.getHealthCardRecords(filters);
      }
      let list = dataStore.getCollection('healthcard_records') || [];
      if (filters) {
        if (filters.status && filters.status !== 'all') list = list.filter(r => r && r.status === filters.status);
        if (filters.hmoProvider && filters.hmoProvider !== 'all') list = list.filter(r => r && r.hmoProvider === filters.hmoProvider);
        if (filters.search) {
          const s = String(filters.search).toLowerCase();
          list = list.filter(r => r && (
            (r.controlNo && r.controlNo.toLowerCase().includes(s)) ||
            (r.firstName && r.firstName.toLowerCase().includes(s)) ||
            (r.lastName && r.lastName.toLowerCase().includes(s)) ||
            (r.cardNumber && r.cardNumber.toLowerCase().includes(s)) ||
            (r.loaNumber && r.loaNumber.toLowerCase().includes(s))
          ));
        }
      }
      return list;
    },
    getHealthCardRecordById(id) {
      if (sqliteAdapter && typeof sqliteAdapter.getHealthCardRecordById === 'function') {
        return sqliteAdapter.getHealthCardRecordById(id);
      }
      const list = dataStore.getCollection('healthcard_records') || [];
      return list.find(r => r && (r.id === id || r._id === id)) || null;
    },
    getHealthCardRecordByControlNo(controlNo) {
      if (sqliteAdapter && typeof sqliteAdapter.getHealthCardRecordByControlNo === 'function') {
        return sqliteAdapter.getHealthCardRecordByControlNo(controlNo);
      }
      const list = dataStore.getCollection('healthcard_records') || [];
      return list.find(r => r && r.controlNo === controlNo) || null;
    },
    getHealthCardRecordsByPatientId(patientId) {
      if (sqliteAdapter && typeof sqliteAdapter.getHealthCardRecordsByPatientId === 'function') {
        return sqliteAdapter.getHealthCardRecordsByPatientId(patientId);
      }
      const list = dataStore.getCollection('healthcard_records') || [];
      return list.filter(r => r && (r.patientId === patientId || r.patient === patientId));
    },
    saveHealthCardRecord(record) {
      if (sqliteAdapter && typeof sqliteAdapter.saveHealthCardRecord === 'function') {
        return sqliteAdapter.saveHealthCardRecord(record);
      }
      if (!record || !record.id) return null;
      let list = dataStore.getCollection('healthcard_records') || [];
      const idx = list.findIndex(r => r && r.id === record.id);
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      dataStore.setCollection('healthcard_records', list);
      return record;
    },
    deleteHealthCardRecord(id) {
      if (sqliteAdapter && typeof sqliteAdapter.deleteHealthCardRecord === 'function') {
        return sqliteAdapter.deleteHealthCardRecord(id);
      }
      let list = dataStore.getCollection('healthcard_records') || [];
      list = list.filter(r => !(r && r.id === id));
      dataStore.setCollection('healthcard_records', list);
      return true;
    },
  };

  return new Proxy(db, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (sqliteAdapter && typeof sqliteAdapter[prop] === 'function') {
        return sqliteAdapter[prop].bind(sqliteAdapter);
      }
      if (sqliteAdapter && prop in sqliteAdapter) {
        return sqliteAdapter[prop];
      }
      return undefined;
    }
  });

}

module.exports = { createOfflineDb };
