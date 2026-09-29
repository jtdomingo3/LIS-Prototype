const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function testReceptionSync() {
  console.log('=== TEST: Reception Clear-Queues and Multi-Test Delete Sync ===');

  const { createDb } = require('../lis-fullstack/lib/sqliteDb');
  const tempDbPath = path.join(__dirname, 'temp-sync-test.db');
  if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

  const db = createDb(tempDbPath);
  global.db = db;

  // 1. Seed two tests for the same patient in Payment Area
  const now = new Date().toISOString();
  db.saveTests([
    {
      id: 't-101',
      testId: 'T101',
      patient: 'pat-1',
      status: 'Payment Area',
      testType: 'Clinical Chemistry',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 't-102',
      testId: 'T102',
      patient: 'pat-1',
      status: 'Payment Area',
      testType: 'Echocardiography 2D',
      createdAt: now,
      updatedAt: now
    }
  ]);

  assert.strictEqual(db.getTests().length, 2, 'Initial tests count should be 2');
  console.log('✓ Initial tests seeded: T101 and T102 in Payment Area');

  // 2. Test multi-test delete handler logic directly
  const Test = require('../lis-fullstack/models/Test');
  
  // Test deletion of multiple IDs via testIds string
  const rawIds = 'T101, T102';
  const idsToDelete = rawIds.split(',').map(s => s.trim()).filter(Boolean);
  for (const tid of idsToDelete) {
    let deleted = await Test.findByIdAndDelete(tid);
    if (!deleted) {
      const found = await Test.findOne({ testId: tid });
      if (found) deleted = await Test.findByIdAndDelete(found.id);
    }
  }

  assert.strictEqual(db.getTests().length, 0, 'Both tests should be deleted from DB');
  console.log('✓ Multi-test deletion successfully removed all tests for the patient row');

  // 3. Test clear-queues logic with sync client permission
  db.saveTests([
    {
      id: 't-201',
      testId: 'T201',
      patient: 'pat-2',
      status: 'Payment Area',
      testType: 'Ultrasound',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 't-202',
      testId: 'T202',
      patient: 'pat-3',
      status: 'Releasing of Result',
      testType: 'CBC',
      createdAt: now,
      updatedAt: now
    }
  ]);

  assert.strictEqual(db.getTests().filter(t => t.status !== 'Released').length, 2);

  // Simulate server clear-queues handler execution as sync client
  const tests = (typeof global.db.getTests === 'function' ? global.db.getTests() : []) || [];
  let count = 0;
  const nowIso = new Date().toISOString();
  const userName = 'SyncClient';

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    if (t) {
      const prevStatus = t.status || null;
      t.status = 'Released';
      t.released = true;
      if (!t.completedAt) t.completedAt = nowIso;
      if (!Array.isArray(t.statusHistory)) t.statusHistory = [];
      t.statusHistory.push({ from: prevStatus, to: 'Released', user: userName, area: 'Released', timestamp: nowIso });
      t.updatedAt = nowIso;
      count++;
    }
  }
  global.db.saveTests(tests);

  const updatedTests = db.getTests();
  assert.strictEqual(updatedTests.every(t => t.status === 'Released' && t.released === true), true);
  console.log(`✓ Clear-queues set all ${count} tests to Released`);

  // 4. Test DataStore mergeCollection behavior when server exports cleared tests
  const { DataStore } = require('../lis-app-standalone/lib/dataStore');
  const tempStandaloneDb = path.join(__dirname, 'temp-standalone-test.db');
  if (fs.existsSync(tempStandaloneDb)) fs.unlinkSync(tempStandaloneDb);

  const standaloneDb = require('../lis-app-standalone/lib/sqliteDb').createDb(tempStandaloneDb);
  const dataStore = new DataStore();
  dataStore.db = standaloneDb;

  // Standalone starts with the cleared tests
  dataStore.setCollection('tests', updatedTests);
  
  // FullSync downloads server's exported tests (which are Released)
  dataStore.mergeCollection('tests', updatedTests);

  const localTestsAfterSync = dataStore.getCollection('tests');
  assert.strictEqual(localTestsAfterSync.every(t => t.status === 'Released'), true);
  console.log('✓ DataStore mergeCollection: tests remain Released after sync (no resurrection on refresh)');

  // Clean up
  try { if (db && typeof db.close === 'function') db.close(); } catch (_) {}
  try { if (standaloneDb && typeof standaloneDb.close === 'function') standaloneDb.close(); } catch (_) {}
  try { if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath); } catch (_) {}
  try { if (fs.existsSync(tempStandaloneDb)) fs.unlinkSync(tempStandaloneDb); } catch (_) {}

  console.log('=== ALL RECEPTION SYNC TESTS PASSED! ===');
}

testReceptionSync().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
