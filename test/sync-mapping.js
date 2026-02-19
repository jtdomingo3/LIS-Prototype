// Simple integration check for SyncEngine ID-mapping behavior
// Run with: node test/sync-mapping.js
const path = require('path');
const fs = require('fs');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { SyncEngine } = require('../lis-app-standalone/lib/syncEngine');

(async () => {
  const tmpRoot = path.join(__dirname, 'tmp-sync-test');
  try { if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmpRoot, { recursive: true });

  const ds = new DataStore(path.join(tmpRoot, 'data'));
  const q = new OperationQueue(path.join(tmpRoot, 'queue'));
  q.dataStore = ds;
  const sync = new SyncEngine(q, { SERVER_URL: 'https://example.test' }, ds);

  // Create a local "temporary" patient record (as offline create would)
  const localPatient = { id: 'local-temp-123', firstName: 'Alice', lastName: 'Smith', phone: '09170001111', createdAt: new Date().toISOString() };
  ds.setCollection('patients', [localPatient]);

  // Queue a patient-create op (server-side will create a server id)
  const createOp = q.add({ method: 'POST', url: 'https://example.test/patients', body: { firstName: 'Alice', lastName: 'Smith', phone: '09170001111' }, timestamp: new Date().toISOString() });

  // Queue a dependent op that references the local patient id (e.g. assign test)
  const testOp = q.add({ method: 'POST', url: 'https://example.test/tests', body: { patient: 'local-temp-123', testType: 'CBC' }, timestamp: new Date().toISOString() });

  // Simulate server response for create -> redirected to server id
  const replayResult = { redirectTo: 'https://example.test/patients/server-999' };

  // Invoke the handler that should map temp -> server id
  await sync._handleReplayResult(createOp, replayResult);

  const patients = ds.getCollection('patients');
  const queued = q.getAll();

  const mappedPatient = patients.find(p => p.id === 'server-999');
  const stillLocal = patients.find(p => p.id === 'local-temp-123');
  const updatedTestOp = queued.find(o => o.url.endsWith('/tests'));

  const pass = !!mappedPatient && !stillLocal && updatedTestOp && updatedTestOp.body && updatedTestOp.body.patient === 'server-999';

  console.log('mapping result ->', pass ? 'PASS' : 'FAIL');
  console.log('patients in datastore:', patients);
  console.log('queued operations:', queued);

  process.exit(pass ? 0 : 2);
})();