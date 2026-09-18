/**
 * Test Suite: Standalone App Sync Validation, Deduplication & First-Connect Audit
 *
 * Verifies:
 * 1. Deduplication in DataStore.mergeCollection for patients (by patientCode, client_id, name+DOB)
 * 2. Deduplication in DataStore.mergeCollection for tests (by testId, client_id, patient+testType)
 * 3. Re-keying of local records in DataStore during SyncEngine._handleReplayResult
 * 4. Comprehensive audit & discrepancy resolution in validateAndReconcileWithServer
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { SyncEngine } = require('../lis-app-standalone/lib/syncEngine');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');

console.log('========================================================================');
console.log('🧪 RUNNING STANDALONE SYNC VALIDATION & DEDUPLICATION TESTS');
console.log('========================================================================\n');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-sync-val-test-'));

  try {
    // --- 1. Deduplication for Patients in mergeCollection ---
    console.log('--- 1. Patient Deduplication in DataStore.mergeCollection ---');
    const dataStore = new DataStore(tmpDir);
    await dataStore.ready();

    // Seed local database with a temporary local patient created while offline
    const localPatientTemp = {
      id: 'local-temp-patient-111',
      patientCode: 'PT-20260904-001',
      firstName: 'Maria',
      lastName: 'Santos',
      dateOfBirth: '1990-05-15',
      gender: 'Female',
      client_id: 'local-temp-patient-111'
    };
    dataStore.setCollection('patients', [localPatientTemp]);

    let ptsBefore = dataStore.getCollection('patients');
    assert.strictEqual(ptsBefore.length, 1, 'Should initially have 1 local patient');
    assert.strictEqual(ptsBefore[0].id, 'local-temp-patient-111');

    // Server sends canonical record with same patientCode & client_id but server ID
    const serverPatient = {
      id: 'server-canonical-999',
      patientCode: 'PT-20260904-001',
      firstName: 'Maria',
      lastName: 'Santos',
      dateOfBirth: '1990-05-15',
      gender: 'Female',
      client_id: 'local-temp-patient-111',
      createdAt: new Date().toISOString()
    };

    dataStore.mergeCollection('patients', [serverPatient]);

    const ptsAfter = dataStore.getCollection('patients');
    assert.strictEqual(ptsAfter.length, 1, 'Must NOT produce duplicate entries for same patient!');
    assert.strictEqual(ptsAfter[0].id, 'server-canonical-999', 'Should replace local temp ID with server ID');
    assert.strictEqual(ptsAfter[0].patientCode, 'PT-20260904-001');
    console.log('  ✓ Verified: Local temporary duplicate patient successfully eliminated on server merge');

    // --- 2. Deduplication for Tests in mergeCollection ---
    console.log('\n--- 2. Test Deduplication in DataStore.mergeCollection ---');
    const localTestTemp = {
      id: 'local-temp-test-222',
      testId: 'T-20260904-005',
      patient: 'server-canonical-999',
      testType: 'Complete Blood Count',
      status: 'Pending',
      client_id: 'local-temp-test-222'
    };
    dataStore.setCollection('tests', [localTestTemp]);

    let testsBefore = dataStore.getCollection('tests');
    assert.strictEqual(testsBefore.length, 1, 'Should initially have 1 local test');
    assert.strictEqual(testsBefore[0].id, 'local-temp-test-222');

    // Server sends canonical test record
    const serverTest = {
      id: 'server-test-888',
      testId: 'T-20260904-005',
      patient: 'server-canonical-999',
      testType: 'Complete Blood Count',
      status: 'In Progress',
      client_id: 'local-temp-test-222',
      createdAt: new Date().toISOString()
    };

    dataStore.mergeCollection('tests', [serverTest]);

    const testsAfter = dataStore.getCollection('tests');
    assert.strictEqual(testsAfter.length, 1, 'Must NOT produce duplicate entries for same test!');
    assert.strictEqual(testsAfter[0].id, 'server-test-888', 'Should replace local temp ID with server ID');
    assert.strictEqual(testsAfter[0].status, 'In Progress');
    console.log('  ✓ Verified: Local temporary duplicate test successfully eliminated on server merge');

    // --- 3. Immediate Local Re-Keying during _handleReplayResult ---
    console.log('\n--- 3. Immediate Local Re-Keying during _handleReplayResult ---');
    const queueFile = path.join(tmpDir, 'test-op-queue.json');
    const queue = new OperationQueue(queueFile);
    const syncEngine = new SyncEngine(queue, { SERVER_URL: 'http://127.0.0.1:3999' }, dataStore);

    // Seed another offline patient in local store
    const offlinePt = {
      id: 'local-offline-pt-333',
      patientCode: 'PT-20260904-002',
      firstName: 'Carlos',
      lastName: 'Dela Cruz'
    };
    dataStore.setCollection('patients', [offlinePt]);

    // Mock operation and server replay result
    const mockOp = {
      id: 'op-1',
      method: 'POST',
      url: 'http://127.0.0.1:3999/patients',
      body: JSON.stringify(offlinePt)
    };
    queue.add(mockOp);

    const mockReplayResult = {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: 'server-assigned-777', client_id: 'local-offline-pt-333' })
    };

    await syncEngine._handleReplayResult(mockOp, mockReplayResult);

    const ptsRekeyed = dataStore.getCollection('patients');
    assert.strictEqual(ptsRekeyed.length, 1, 'Should still have exactly 1 patient');
    assert.strictEqual(ptsRekeyed[0].id, 'server-assigned-777', 'Database should immediately reflect server ID');
    console.log('  ✓ Verified: Local database immediately re-keyed from temp ID to server ID on replay');

    // --- 4. Comprehensive validateAndReconcileWithServer Audit ---
    console.log('\n--- 4. validateAndReconcileWithServer First-Connect Audit ---');

    // Create a mock server that serves /export/data.json
    const serverPayload = {
      patients: [
        { id: 'server-canonical-999', patientCode: 'PT-20260904-001', firstName: 'Maria', lastName: 'Santos' },
        { id: 'server-assigned-777', patientCode: 'PT-20260904-002', firstName: 'Carlos', lastName: 'Dela Cruz' }
      ],
      tests: [
        { id: 'server-test-888', testId: 'T-20260904-005', patient: 'server-canonical-999', testType: 'Complete Blood Count' }
      ],
      users: [{ id: 'u1', email: 'admin@lab.com', role: 'Admin' }],
      templates: [],
      counters: { patient: 2, test: 1 }
    };

    const server = http.createServer((req, res) => {
      if (req.url.includes('/export/data.json') || req.url.includes('/data.json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(serverPayload));
      }
      if (req.url.includes('/login')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ success: true }));
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    syncEngine.config.SERVER_URL = `http://127.0.0.1:${port}`;

    // Seed the 2 existing patients first, then add an intentional duplicate
    const duplicateLocalPt = {
      id: 'phantom-local-dup',
      patientCode: 'PT-20260904-001', // duplicate code of Maria Santos!
      firstName: 'Maria',
      lastName: 'Santos'
    };
    dataStore.setCollection('patients', [
      { id: 'server-canonical-999', patientCode: 'PT-20260904-001', firstName: 'Maria', lastName: 'Santos' },
      { id: 'server-assigned-777', patientCode: 'PT-20260904-002', firstName: 'Carlos', lastName: 'Dela Cruz' },
      duplicateLocalPt
    ]);

    assert.strictEqual(dataStore.getCollection('patients').length, 3, 'Pre-condition: 3 patients locally including duplicate');

    // Run reconciliation & audit
    const auditRes = await syncEngine.validateAndReconcileWithServer();
    assert.strictEqual(auditRes.success, true, 'Audit should succeed');
    assert(auditRes.audit, 'Audit object should be returned');
    assert.strictEqual(auditRes.audit.discrepanciesFound > 0, true, 'Should have detected the duplicate discrepancy');
    assert.strictEqual(auditRes.audit.status, 'DISCREPANCIES_RESOLVED');

    // Verify local DataStore now exactly mirrors server with zero duplicates
    const finalPts = dataStore.getCollection('patients');
    assert.strictEqual(finalPts.length, 2, 'Must have exactly 2 patients matching server payload');
    assert.strictEqual(finalPts.some(p => p.id === 'phantom-local-dup'), false, 'Phantom duplicate must be eliminated!');

    // Verify sync-audit.log file was written
    const auditLogPath = path.join(dataStore.baseDir, 'sync-audit.log');
    assert(fs.existsSync(auditLogPath), 'sync-audit.log must exist on disk');
    const auditLogContent = fs.readFileSync(auditLogPath, 'utf8');
    assert(auditLogContent.includes('STANDALONE SERVER CONNECT AUDIT'), 'Log must contain audit header');
    assert(auditLogContent.includes('Result: All local duplicate entries eliminated'), 'Log must verify duplicate elimination');
    console.log('  ✓ Verified: Discrepancies detected, logged to sync-audit.log, and eliminated cleanly');

    server.close();

    console.log('\n========================================================================');
    console.log('🎉 ALL 4 SYNC VALIDATION & DEDUPLICATION TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
})();
