const path = require('path');
const fs = require('fs');
const { DataStore } = require('./lib/dataStore');
const { OperationQueue } = require('./lib/operationQueue');
const { SyncEngine } = require('./lib/syncEngine');
const { createOfflineDb } = require('./lib/offlineDb');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

(async () => {
  console.log('=== Running Integrated SQLite & Sync Test Suite ===');
  const tmpRoot = path.join(__dirname, 'tmp-test-integrated');
  try { if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmpRoot, { recursive: true });

  const dataDir = path.join(tmpRoot, 'data');
  const ds = new DataStore(dataDir);
  const q = new OperationQueue(path.join(tmpRoot, 'queue'));
  q.dataStore = ds;
  const sync = new SyncEngine(q, { SERVER_URL: 'http://127.0.0.1:3000' }, ds);
  const db = createOfflineDb(ds);

  // 1. Initial State
  console.log('1. Verifying initial SQLite database state...');
  assert(ds.info().exists === true, 'SQLite database file should exist');
  assert(ds.getCollection('patients').length === 0, 'Initial patients should be empty');

  // 2. Full Sync Simulation (Simulate receiving export from server)
  console.log('2. Simulating full server sync import into SQLite...');
  const serverPayload = {
    users: [
      { id: 'usr-1', email: 'medtech@gezyne.com', role: 'MedTech', status: 'Active' },
      { id: 'usr-2', email: 'admin@gezyne.com', role: 'Admin', status: 'Active' }
    ],
    patients: [
      { id: 'pat-1', patientId: 'GCL-2026-0001', firstName: 'Juan', lastName: 'Dela Cruz', createdAt: '2026-08-30T10:00:00Z' },
      { id: 'pat-2', patientId: 'GCL-2026-0002', firstName: 'Maria', lastName: 'Clara', createdAt: '2026-08-30T11:00:00Z' }
    ],
    tests: [
      { id: 'tst-1', testId: 'T-001', patient: 'pat-1', testType: 'CBC', status: 'In Progress', updatedAt: '2026-08-30T10:15:00Z' },
      { id: 'tst-2', testId: 'T-002', patient: 'pat-2', testType: 'Urinalysis', status: 'Completed', updatedAt: '2026-08-30T11:30:00Z' }
    ],
    templates: [
      { id: 'tpl-1', name: 'Standard CBC', testType: 'CBC', isActive: 1 }
    ],
    counters: { patient: 2, test: 2 }
  };

  ds.setCollection('users', serverPayload.users);
  ds.setCollection('patients', serverPayload.patients);
  ds.setCollection('tests', serverPayload.tests);
  ds.setCollection('templates', serverPayload.templates);
  ds.setCollection('counters', serverPayload.counters);
  ds.setMeta('lastFullSync', '2026-08-30T12:00:00Z');

  assert(db.getPatients().length === 2, 'Should have 2 patients in SQLite');
  assert(db.getTests().length === 2, 'Should have 2 tests in SQLite');
  assert(db.getUsers().length === 2, 'Should have 2 users in SQLite');
  assert(db.getPatientById('pat-1').firstName === 'Juan', 'Patient 1 lookup by ID failed');
  console.log('✓ Full sync data loaded into SQLite database successfully');

  // 3. Offline Patient & Test Creation (Local Temp IDs)
  console.log('3. Simulating offline operations with temporary IDs...');
  const tempPatientId = 'temp-pat-999';
  const tempTestId = 'temp-tst-999';
  const clientPid = 'cid-pat-999';
  const clientTid = 'cid-tst-999';

  // Add local record to SQLite
  const localPatient = {
    id: tempPatientId,
    client_id: clientPid,
    patientId: 'GCL-2026-TEMP',
    firstName: 'Offline',
    lastName: 'Patient',
    createdAt: new Date().toISOString()
  };
  const localTest = {
    id: tempTestId,
    client_id: clientTid,
    patient: tempPatientId,
    testType: 'Blood Typing',
    status: 'Laboratory Area',
    createdAt: new Date().toISOString()
  };

  const currentPatients = ds.getCollection('patients');
  currentPatients.unshift(localPatient);
  ds.setCollection('patients', currentPatients);

  const currentTests = ds.getCollection('tests');
  currentTests.unshift(localTest);
  ds.setCollection('tests', currentTests);

  // Queue mutations
  const op1 = q.add({ method: 'POST', url: 'http://127.0.0.1:3000/patients', body: { firstName: 'Offline', lastName: 'Patient', client_id: clientPid } });
  const op2 = q.add({ method: 'POST', url: 'http://127.0.0.1:3000/tests', body: { patient: tempPatientId, testType: 'Blood Typing', client_id: clientTid } });
  const op3 = q.add({ method: 'POST', url: `http://127.0.0.1:3000/tests/${tempTestId}/results`, body: { result: 'O Positive', client_id: clientTid } });

  assert(q.countPending() === 3, 'Should have 3 pending operations');
  console.log('✓ Offline operations queued and local records saved to SQLite');

  // 4. Server Sync ID Mapping Simulation
  console.log('4. Testing ID mapping and resolution on server response...');
  const serverAssignedPatId = 'server-uuid-pat-777';
  const serverAssignedTstId = 'server-uuid-tst-888';

  // Simulate server reply with assigned patient id
  await sync._handleReplayResult(op1, { body: JSON.stringify({ success: true, id: serverAssignedPatId, client_id: clientPid }) });
  q.markSynced(op1.id);

  // Check that temporary patient id was updated across SQLite and queue
  const pCheck = ds.getCollection('patients').find(p => p.id === serverAssignedPatId);
  assert(pCheck && pCheck.firstName === 'Offline', 'Patient ID in SQLite was not updated to server ID');
  const queuedAssign = q.getAll().find(o => o.url.endsWith('/tests'));
  assert(queuedAssign.body.patient === serverAssignedPatId, 'Queued test assignment patient reference was not updated');

  // Simulate server reply with assigned test id
  await sync._handleReplayResult(op2, { body: JSON.stringify({ success: true, id: serverAssignedTstId, client_id: clientTid }) });
  q.markSynced(op2.id);

  // Check that temporary test id was updated in results op and SQLite
  const tCheck = ds.getCollection('tests').find(t => t.id === serverAssignedTstId);
  assert(tCheck && tCheck.testType === 'Blood Typing', 'Test ID in SQLite was not updated to server ID');
  const queuedResult = q.getAll().find(o => o.url.includes('/results'));
  assert(queuedResult.url.includes(serverAssignedTstId), 'Queued results operation URL was not updated with server test ID');

  q.clearSynced();
  assert(q.countPending() === 1, 'Only result operation should remain pending');
  console.log('✓ Server ID mapping across SQLite DataStore and OperationQueue passed');

  // Cleanup
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  console.log('=== ALL INTEGRATED TESTS PASSED SUCCESSFULLY ===');
  process.exit(0);
})();
