const path = require('path');
const fs = require('fs');
const { ConflictStore } = require('../lis-app-standalone/lib/conflictStore');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { SyncEngine } = require('../lis-app-standalone/lib/syncEngine');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

(async () => {
  console.log('=== Running Standalone ConflictStore & Sync Diagnostics Test Suite ===');
  const tmpRoot = path.join(__dirname, 'tmp-conflict-test');
  try { if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmpRoot, { recursive: true });

  const conflictDir = path.join(tmpRoot, 'sync-data');
  const conflictStore = new ConflictStore(conflictDir);

  // 1. Initial State
  console.log('1. Verifying initial ConflictStore state...');
  assert(conflictStore.countUnresolved() === 0, 'Initial unresolved count should be 0');
  assert(conflictStore.getAll().length === 0, 'Initial list should be empty');
  assert(fs.existsSync(conflictStore.filePath), 'Conflict store JSON file should be created');

  // 2. Record conflicts
  console.log('2. Recording conflict items...');
  const c1 = conflictStore.recordConflict({
    operation: 'POST /patients',
    entity: 'patient',
    entityId: 'client-pat-100',
    payload: { firstName: 'Maria', lastName: 'Santos', dob: '1985-04-12' },
    error: 'HTTP 409 Conflict: Patient with national ID already exists on server',
    statusCode: 409
  });
  assert(c1 && c1.id, 'Conflict record should have unique ID');
  assert(c1.status === 'unresolved', 'Conflict status should be unresolved');
  assert(conflictStore.countUnresolved() === 1, 'Unresolved count should be 1');

  const c2 = conflictStore.recordConflict({
    operation: 'PUT /tests/tst-999',
    entity: 'test',
    entityId: 'tst-999',
    payload: { status: 'Completed', result: 'Reactive' },
    error: 'HTTP 500 Internal Server Error: Database constraint violation',
    statusCode: 500
  });
  assert(conflictStore.countUnresolved() === 2, 'Unresolved count should be 2');
  assert(conflictStore.getAll().length === 2, 'Total conflicts should be 2');

  // 3. Persistence verification across instances
  console.log('3. Verifying persistence across separate ConflictStore instances...');
  const store2 = new ConflictStore(conflictDir);
  assert(store2.countUnresolved() === 2, 'Persisted unresolved count should be 2');
  const unresolvedItems = store2.getUnresolved();
  assert(unresolvedItems.length === 2, 'Persisted unresolved list length should be 2');
  assert(unresolvedItems[0].id === c2.id, 'Newest item ID should match c2');
  assert(unresolvedItems[1].id === c1.id, 'Second item ID should match c1');

  // 4. Resolve conflict
  console.log('4. Testing conflict resolution...');
  const resolved = store2.resolve(c1.id, 'Manually harmonized with patient P-1234 on central server');
  assert(resolved === true, 'Resolve should return true');
  assert(store2.countUnresolved() === 1, 'Unresolved count should now be 1');

  const item1 = store2.getById(c1.id);
  assert(item1.status === 'resolved', 'Status should be updated to resolved');
  assert(item1.resolutionNote.includes('Manually harmonized'), 'Resolution note should be stored');
  assert(item1.resolvedAt, 'resolvedAt timestamp should be set');

  // 5. Diagnostics report export
  console.log('5. Testing diagnostics report generation...');
  const reportStr = store2.exportReport();
  const report = JSON.parse(reportStr);
  assert(report.summary.unresolvedCount === 1, 'Report unresolvedCount should be 1');
  assert(report.summary.totalRecords === 2, 'Report totalRecords should be 2');
  assert(Array.isArray(report.conflicts), 'Report should contain conflicts array');
  assert(report.conflicts.length === 2, 'Report should list 2 conflict records');

  // 6. Test SyncEngine recording conflicts on replay failure
  console.log('6. Testing SyncEngine integration with ConflictStore...');
  const q = new OperationQueue(path.join(tmpRoot, 'queue'));
  const ds = await new DataStore(path.join(tmpRoot, 'ds')).ready();
  q.dataStore = ds;
  const syncEngine = new SyncEngine(q, { SERVER_URL: 'http://127.0.0.1:39999' }, ds, conflictStore);

  // Mock server response to simulate 409 Conflict
  syncEngine._postOperation = async (op) => {
    const err = new Error('HTTP 409 Conflict: Server rejected modification');
    err.status = 409;
    err.response = { status: 409, data: { message: 'Version conflict' } };
    throw err;
  };

  q.add({
    method: 'POST',
    url: 'http://127.0.0.1:39999/patients',
    body: { firstName: 'Test', lastName: 'Conflict', client_id: 'client-999' }
  });

  const processed = await syncEngine.processQueue();
  assert(processed === 0, 'Processed operations should be 0 due to error');
  // ConflictStore should now have recorded the 409 Conflict
  assert(conflictStore.countUnresolved() === 2, 'Unresolved count should be 2 after SyncEngine caught 409');
  const latestConflict = conflictStore.getUnresolved().find(c => c.operation.includes('/patients') && c.statusCode === 409);
  assert(latestConflict !== undefined, 'ConflictStore should contain newly recorded 409 conflict from SyncEngine');

  // 7. Clear resolved conflicts
  console.log('7. Testing clearResolved...');
  conflictStore.clearResolved();
  assert(conflictStore.countUnresolved() === 2, 'Unresolved items should remain after clearResolved');
  assert(conflictStore.getAll().length === 2, 'Resolved items should have been purged');

  // Cleanup
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) {}

  console.log('\n✅ ALL CONFLICT STORE & SYNC DIAGNOSTICS TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
})().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
