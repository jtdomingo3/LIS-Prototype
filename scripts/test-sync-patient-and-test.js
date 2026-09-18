/**
 * Diagnostics & Test: Create Patient & Test, Queue Mutation, Replay to Server
 * File: scripts/test-sync-patient-and-test.js
 */
const http = require('http');
const path = require('path');
const fs = require('fs');

const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { SyncEngine } = require('../lis-app-standalone/lib/syncEngine');
const Patient = require('../lis-app-standalone/models/Patient');
const Test = require('../lis-app-standalone/models/Test');

async function testSyncPatientAndTest() {
  console.log('====================================================');
  console.log('🔍 TESTING PATIENT & TEST CREATION + REPLAY SYNC');
  console.log('====================================================\n');

  const ds = new DataStore();
  const queue = new OperationQueue(path.dirname(ds.filePath));
  const config = { SERVER_URL: 'http://127.0.0.1:3000', MAX_SYNC_RETRIES: 3 };
  const engine = new SyncEngine(queue, config, ds);

  // Check pending queue
  const pending = queue.getPending();
  console.log(`Current pending operations in queue: ${pending.length}`);
  pending.forEach((p, idx) => {
    console.log(`  [${idx+1}] ${p.method} ${p.url} (retries: ${p.retries || 0}, error: ${p.lastError || 'none'})`);
    if (p.body) console.log('       body:', JSON.stringify(p.body).slice(0, 150));
  });

  // Test server connectivity
  console.log('\nChecking if server http://127.0.0.1:3000 is online...');
  const isServerOnline = await new Promise(resolve => {
    const req = http.get('http://127.0.0.1:3000/export/data.json', { timeout: 3000 }, (res) => {
      console.log(`  Server responded with status: ${res.statusCode}`);
      resolve(true);
    });
    req.on('error', (err) => {
      console.log(`  Server error: ${err.message}`);
      resolve(false);
    });
  });

  if (!isServerOnline) {
    console.log('\nServer is offline or not running at http://127.0.0.1:3000');
    return;
  }

  // If there are pending operations, let's test replaying them!
  if (pending.length > 0) {
    console.log('\nReplaying pending operations through SyncEngine...');
    engine.setAutoLoginEmail('admin@lab.com');
    const synced = await engine.processQueue();
    console.log(`Replay finished. Operations synced: ${synced}`);
  }
}

testSyncPatientAndTest().catch(console.error);
