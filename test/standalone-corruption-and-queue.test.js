const path = require('path');
const fs = require('fs');
const { createDb } = require('../lis-app-standalone/lib/sqliteDb');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

(async () => {
  const tmpDir = path.join(__dirname, 'tmp-corruption-test');
  try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log('=== TEST 1: Zero-byte database file self-healing ===');
  const zeroDbPath = path.join(tmpDir, 'zero-db.db');
  fs.writeFileSync(zeroDbPath, Buffer.alloc(0)); // 0-byte file

  const db1 = createDb(zeroDbPath);
  if (db1 && db1._readyPromise) await db1._readyPromise;
  
  // Verify it self-healed, quarantined the 0-byte file, and initialized a fresh working database
  db1.upsertPatient({ id: 'p1', firstName: 'Alice', lastName: 'Guenter' });
  const p1 = db1.getPatientById('p1');
  assert(p1 && p1.firstName === 'Alice', 'Self-healed DB failed to save/read patient');
  
  const files = fs.readdirSync(tmpDir);
  const quarantined0 = files.find(f => f.startsWith('zero-db.db.corrupt'));
  assert(quarantined0, '0-byte corrupt file was not quarantined');
  console.log('✓ 0-byte database file successfully quarantined and self-healed:', quarantined0);

  console.log('=== TEST 2: All-zero (NULL bytes) 33MB corrupted database file self-healing ===');
  const nullDbPath = path.join(tmpDir, 'null-db.db');
  fs.writeFileSync(nullDbPath, Buffer.alloc(1024 * 64, 0)); // 64KB of pure zeros (same as the 33.6MB user bug)

  const db2 = createDb(nullDbPath);
  if (db2 && db2._readyPromise) await db2._readyPromise;

  db2.upsertPatient({ id: 'p2', firstName: 'Bob', lastName: 'Santos' });
  const p2 = db2.getPatientById('p2');
  assert(p2 && p2.firstName === 'Bob', 'Self-healed NULL bytes DB failed to save/read patient');

  const files2 = fs.readdirSync(tmpDir);
  const quarantinedNull = files2.find(f => f.startsWith('null-db.db.corrupt'));
  assert(quarantinedNull, 'NULL-bytes corrupt file was not quarantined');
  console.log('✓ Corrupt NULL bytes database successfully quarantined and self-healed:', quarantinedNull);

  console.log('=== TEST 3: OperationQueue SQLite sync_queue table persistence ===');
  const queueDir = path.join(tmpDir, 'queue-test');
  fs.mkdirSync(queueDir, { recursive: true });

  const queue = new OperationQueue(queueDir, db2);
  const op1 = queue.add({
    method: 'POST',
    url: 'http://localhost:3000/patients',
    body: { id: 'temp-123', firstName: 'Charlie' }
  });
  assert(op1 && op1.id, 'Queue add failed');
  assert(queue.countPending() === 1, 'Queue countPending should be 1');

  // Verify it exists in SQLite sync_queue table
  const inDb = db2.getSyncQueue();
  assert(inDb.length === 1 && inDb[0].id === op1.id, 'sync_queue table did not persist operation');
  console.log('✓ Operation persisted into SQLite sync_queue table');

  // Restart queue and verify persistence without pending-operations.json
  const queue2 = new OperationQueue(queueDir, db2);
  assert(queue2.countPending() === 1, 'Restarted queue failed to load from SQLite sync_queue table');
  console.log('✓ OperationQueue successfully reloaded from SQLite sync_queue table across restart');

  // Mark synced and verify deletion/status
  queue2.markSynced(op1.id);
  assert(queue2.countPending() === 0, 'markSynced failed to clear pending status');
  console.log('✓ markSynced updated status');

  console.log('\n🎉 ALL CORRUPTION SELF-HEALING & SYNC QUEUE TESTS PASSED 100%!');
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
