// End-to-end offline sync flow test
// Steps:
// 1) Create local patient (temp id) and local test (temp id) with a locally-entered result
// 2) Queue operations: POST /patients, POST /tests, POST /tests/:tempTestId/results
// 3) Simulate server replies for patient + test creation (redirect -> server IDs)
// 4) Verify DataStore and OperationQueue were updated (temp -> server ids), and
//    the results operation references the server test id so it can be replayed successfully.

const path = require('path');
const fs = require('fs');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { SyncEngine } = require('../lis-app-standalone/lib/syncEngine');

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(2);
}

(async () => {
  const tmpRoot = path.join(__dirname, 'tmp-e2e-offline');
  try { if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmpRoot, { recursive: true });

  const ds = new DataStore(path.join(tmpRoot, 'data'));
  const q = new OperationQueue(path.join(tmpRoot, 'queue'));
  q.dataStore = ds;
  const sync = new SyncEngine(q, { SERVER_URL: 'https://example.test' }, ds);

  // Local (offline) temporary IDs
  const tmpPatientId = 'tmp-p-1';
  const tmpTestId = 'tmp-t-1';

  // 1) Create local patient & test (with locally-entered result)
  const clientPatientId = 'cid-p-1';
  const clientTestId = 'cid-t-1';

  const localPatient = {
    id: tmpPatientId,
    client_id: clientPatientId,
    firstName: 'Gally',
    lastName: 'Morales',
    phone: '09170001111',
    createdAt: new Date().toISOString(),
  };
  const localTest = {
    id: tmpTestId,
    client_id: clientTestId,
    patient: tmpPatientId,
    testType: 'Blood Typing',
    status: 'Payment Area',
    createdAt: new Date().toISOString(),
    // user entered result while offline
    results: { specimen: 'Whole Blood', result: 'B+' }
  };

  ds.setCollection('patients', [localPatient]);
  ds.setCollection('tests', [localTest]);

  // 2) Queue offline operations (the same way LocalServer / request interceptor does)
  const opPatient = q.add({ method: 'POST', url: 'https://example.test/patients', body: { firstName: localPatient.firstName, lastName: localPatient.lastName, phone: localPatient.phone, client_id: clientPatientId }, timestamp: new Date().toISOString() });
  const opAssignTest = q.add({ method: 'POST', url: 'https://example.test/tests', body: { patient: tmpPatientId, testType: localTest.testType, client_id: clientTestId }, timestamp: new Date().toISOString() });
  const opEnterResult = q.add({ method: 'POST', url: `https://example.test/tests/${tmpTestId}/results`, body: { specimen: localTest.results.specimen, result: localTest.results.result, client_id: clientTestId }, timestamp: new Date().toISOString() });

  // Sanity checks before mapping
  if (q.countPending() !== 3) fail('expected 3 pending ops after queuing');
  const dsPatients0 = ds.getCollection('patients');
  const dsTests0 = ds.getCollection('tests');
  if (!dsPatients0.find(p => p.id === tmpPatientId)) fail('local patient missing in datastore');
  if (!dsTests0.find(t => t.id === tmpTestId)) fail('local test missing in datastore');

  // 3) Simulate server create responses and run ID mapping in same order as processQueue
  const serverPatientId = '123e4567-e89b-12d3-a456-426614174100';
  // Simulate server echoed JSON with client_id for deterministic mapping
  await sync._handleReplayResult(opPatient, { body: JSON.stringify({ success: true, id: serverPatientId, client_id: clientPatientId }) });

  // After patient mapping: DataStore patient id should be updated and queued test body should point to serverPatientId
  const patientsAfterPatientMap = ds.getCollection('patients');
  const mappedPatient = patientsAfterPatientMap.find(p => p.id === serverPatientId);
  if (!mappedPatient) fail('patient id was not mapped to server id');
  if (patientsAfterPatientMap.find(p => p.id === tmpPatientId)) fail('temporary patient id still present after mapping');

  const queuedAfterPatientMap = q.getAll();
  const assignOpAfterPatientMap = queuedAfterPatientMap.find(o => o.url.endsWith('/tests'));
  if (!assignOpAfterPatientMap) fail('assign test op missing after patient mapping');
  if (assignOpAfterPatientMap.body.patient !== serverPatientId) fail('assign test op.patient was not updated to server patient id');

  // Also ensure local test object patient reference was updated
  const testsAfterPatientMap = ds.getCollection('tests');
  const updatedLocalTest = testsAfterPatientMap.find(t => t.id === tmpTestId || t.patient === serverPatientId);
  if (!updatedLocalTest) fail('local test was not present or not updated after patient mapping');
  if (updatedLocalTest.patient !== serverPatientId) fail('local test.patient was not updated to server patient id');

  // 4) Simulate server assign-test response -> map test temp id -> server id
  const serverTestId = '123e4567-e89b-12d3-a456-426614174200';
  await sync._handleReplayResult(opAssignTest, { redirectTo: `https://example.test/tests/${serverTestId}` });

  // After test mapping: DataStore test id should be serverTestId and should still contain the locally-entered result
  const testsAfterTestMap = ds.getCollection('tests');
  const mappedTest = testsAfterTestMap.find(t => t.id === serverTestId);
  if (!mappedTest) fail('test id was not mapped to server id');
  if (testsAfterTestMap.find(t => t.id === tmpTestId)) fail('temporary test id still present after mapping');
  if (!mappedTest.results || mappedTest.results.result !== 'B+') fail('local result was lost during mapping');

  // The queued results operation URL must now reference the serverTestId
  const queuedAfterTestMap = q.getAll();
  const resultsOp = queuedAfterTestMap.find(o => o.url.includes('/results'));
  if (!resultsOp) fail('results op not found in queue after mappings');
  if (!resultsOp.url.includes(serverTestId)) fail(`results op URL was not updated to use server test id (url=${resultsOp.url})`);

  // 5) Simulate results successfully replayed to server and mark synced
  q.markSynced(resultsOp.id);
  q.clearSynced();

  // Final consistency checks
  if (q.countPending() !== 2) fail('expected 2 pending ops remaining (patient + assign should still be pending if not processed)');
  // Ensure DataStore contains server ids and result preserved
  const finalPatients = ds.getCollection('patients');
  const finalTests = ds.getCollection('tests');
  if (!finalPatients.find(p => p.id === serverPatientId)) fail('final: server patient missing in datastore');
  if (!finalTests.find(t => t.id === serverTestId)) fail('final: server test missing in datastore');
  if (!finalTests.find(t => t.id === serverTestId).results || finalTests.find(t => t.id === serverTestId).results.result !== 'B+') fail('final: result missing or incorrect in datastore');

  console.log('E2E offline-sync test: PASS');
  process.exit(0);
})();