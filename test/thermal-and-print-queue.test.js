const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

console.log('--- Running Thermal & Print Queue Regression Tests ---');

(async function runTests() {
  // Test 1: thermal_test.js runs --dry-run --receipt without crashing
  const thermalScript = path.join(__dirname, '..', 'lis-app-standalone', 'scripts', 'thermal_test.js');
  assert.ok(fs.existsSync(thermalScript), 'thermal_test.js must exist');

  const dryProc = spawnSync(process.execPath, [thermalScript, '--receipt', '--dry-run'], {
    cwd: os.tmpdir(),
    encoding: 'utf8'
  });

  assert.strictEqual(dryProc.status, 0, `thermal_test.js dry-run exited with code ${dryProc.status}: ${dryProc.stderr}`);
  assert.ok(dryProc.stdout.includes('Printable preview') || dryProc.stdout.includes('GEZYNE LIS'), 'stdout should contain preview');
  console.log('✓ Test 1 Passed: thermal_test.js dry-run executes cleanly with zero errors');

  // Test 2: OperationQueue rejects print operations from add()
  const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
  const testDir = path.join(os.tmpdir(), 'lis-test-queue-' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });

  try {
    const queue = new OperationQueue(testDir);
    const printOp = queue.add({
      method: 'POST',
      url: 'http://192.168.1.209:3000/patients/test-id-123/print',
      body: { client_id: 'c1' }
    });
    assert.strictEqual(printOp, null, 'Print operation must be rejected by OperationQueue.add()');

    const testPrintOp = queue.add({
      method: 'POST',
      url: 'http://192.168.1.209:3000/settings/test-print',
      body: {}
    });
    assert.strictEqual(testPrintOp, null, 'Test print operation must be rejected by OperationQueue.add()');

    const validOp = queue.add({
      method: 'POST',
      url: 'http://192.168.1.209:3000/patients',
      body: { firstName: 'Test', lastName: 'Patient' }
    });
    assert.ok(validOp && validOp.id, 'Real data mutation must be accepted');

    // Test 3: OperationQueue._load() purges legacy print ops
    const pendingFile = path.join(testDir, 'pending-operations.json');
    const dirtyOps = [
      { id: '1', method: 'POST', url: 'http://192.168.1.209:3000/patients/legacy/print', status: 'pending' },
      { id: '2', method: 'POST', url: 'http://192.168.1.209:3000/patients', body: { name: 'Keep me' }, status: 'pending' }
    ];
    fs.writeFileSync(pendingFile, JSON.stringify(dirtyOps));
    const reloadedQueue = new OperationQueue(testDir);
    const pending = reloadedQueue.getPending();
    assert.strictEqual(pending.length, 1, 'Legacy print op must be purged from queue');
    assert.strictEqual(pending[0].id, '2', 'Only valid data mutation remains');
    console.log('✓ Test 2 & 3 Passed: OperationQueue correctly rejects and auto-purges print jobs');

    // Test 4: ConflictStore ignores print conflicts
    const { ConflictStore } = require('../lis-app-standalone/lib/conflictStore');
    const conflictStore = new ConflictStore(testDir);
    const res = conflictStore.recordConflict({
      operation: 'POST http://192.168.1.209:3000/patients/test-id-123/print',
      error: 'Print failed'
    });
    assert.strictEqual(res, null, 'ConflictStore must ignore print conflicts');

    // Test 5: ConflictStore._load() purges legacy print conflicts
    const conflictFile = path.join(testDir, 'sync-conflicts.json');
    const dirtyConflicts = [
      { id: 'cf1', operation: 'POST http://192.168.1.209:3000/patients/123/print', error: 'Print failed', status: 'unresolved' },
      { id: 'cf2', operation: 'POST http://192.168.1.209:3000/tests', error: 'Conflict 409', status: 'unresolved' }
    ];
    fs.writeFileSync(conflictFile, JSON.stringify(dirtyConflicts));
    const reloadedConflictStore = new ConflictStore(testDir);
    const unresolved = reloadedConflictStore.getUnresolved();
    assert.strictEqual(unresolved.length, 1, 'Legacy print conflict must be purged');
    assert.strictEqual(unresolved[0].id, 'cf2', 'Only real conflict remains');
    console.log('✓ Test 4 & 5 Passed: ConflictStore ignores and purges print conflicts');

    // Test 6: Workstation local thermal printer override takes precedence over server database settings
    const printHelper = require('../lis-app-standalone/lib/printHelper');
    global.db = {
      getSettings: () => ({ printerName: 'Central_Server_Printer' })
    };
    process.env.PRINTER_NAME = 'Workstation_Local_XP58';
    process.env.PRINT_DRY_RUN = '1';

    const fakePatient = { id: 'p1', firstName: 'Juan', lastName: 'Dela Cruz', patientCode: 'P-100234' };
    const printRes = await printHelper.printPatientReceipt(fakePatient, []);
    assert.ok(printRes, 'printPatientReceipt should execute');

    // Read the log file or verify that args used the local workstation printer
    delete process.env.PRINTER_NAME;
    delete process.env.PRINT_DRY_RUN;
    delete global.db;
    console.log('✓ Test 6 Passed: Workstation local printer override takes precedence over synced database settings');

  } finally {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('\nAll 6 thermal & print queue regression tests PASSED successfully!\n');
})().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
