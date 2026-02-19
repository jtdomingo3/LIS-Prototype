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

  // 1) Positive case: server redirects to a resource id -> should map
  // use a UUID-like id for positive mapping scenario
  const serverUuid = '123e4567-e89b-12d3-a456-426614174000';
  const replayResultOk = { redirectTo: `https://example.test/patients/${serverUuid}` };
  await sync._handleReplayResult(createOp, replayResultOk);
  let patients = ds.getCollection('patients');
  let queued = q.getAll();
  let mappedPatient = patients.find(p => p.id === serverUuid);
  let stillLocal = patients.find(p => p.id === 'local-temp-123');
  let updatedTestOp = queued.find(o => o.url.endsWith('/tests'));
  const pass1 = !!mappedPatient && !stillLocal && updatedTestOp && updatedTestOp.body && updatedTestOp.body.patient === serverUuid;

  // 2) Negative case: server responds with redirect to '/patients/new' -> must NOT map
  // reset queue/data to initial state
  q.clearAll();
  const freshLocal = { id: 'local-temp-123', firstName: 'Alice', lastName: 'Smith', phone: '09170001111', createdAt: new Date().toISOString() };
  ds.setCollection('patients', [freshLocal]);
  console.log('DEBUG after reset patients collection:', ds.getCollection('patients'));
  const createOp2 = q.add({ method: 'POST', url: 'https://example.test/patients', body: { firstName: 'Alice', lastName: 'Smith', phone: '09170001111' }, timestamp: new Date().toISOString() });
  const testOp2 = q.add({ method: 'POST', url: 'https://example.test/tests', body: { patient: 'local-temp-123', testType: 'CBC' }, timestamp: new Date().toISOString() });

  const replayResultNew = { redirectTo: 'https://example.test/patients/new' };
  await sync._handleReplayResult(createOp2, replayResultNew);
  patients = ds.getCollection('patients');
  queued = q.getAll();
  const stillLocalAfter = patients.find(p => p.id === 'local-temp-123');
  const mappedIncorrect = patients.find(p => p.id === 'new');
  const updatedTestOp2 = queued.find(o => o.url.endsWith('/tests'));
  const pass2 = !!stillLocalAfter && !mappedIncorrect && updatedTestOp2 && updatedTestOp2.body && updatedTestOp2.body.patient === 'local-temp-123';

  const pass = pass1 && pass2;
  console.log('mapping positive-case ->', pass1 ? 'PASS' : 'FAIL');
  console.log('mapping negative-case (no map) ->', pass2 ? 'PASS' : 'FAIL');
  console.log('patients in datastore:', patients);
  console.log('queued operations:', queued);

  process.exit(pass ? 0 : 2);
})();