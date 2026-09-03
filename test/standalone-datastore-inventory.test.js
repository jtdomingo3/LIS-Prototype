/**
 * Standalone DataStore & OfflineDb Inventory Test Suite
 * Verifies local offline storage and synchronization capabilities for Inventory in Standalone Electron App.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createOfflineDb } = require('../lis-app-standalone/lib/offlineDb');
const Inventory = require('../lis-app-standalone/models/Inventory');
const InventoryBatch = require('../lis-app-standalone/models/InventoryBatch');
const InventoryTransaction = require('../lis-app-standalone/models/InventoryTransaction');

console.log('\n=============================================================');
console.log('🧪 RUNNING UNIT TESTS: Standalone OfflineDb & DataStore Inventory');
console.log('=============================================================\n');

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    throw e;
  }
}

// In-memory mock data store for offlineDb unit verification
class MockDataStore {
  constructor() {
    this.collections = {
      users: [],
      patients: [],
      tests: [],
      templates: [],
      counters: {},
      inventory: [],
      inventory_batches: [],
      inventory_transactions: []
    };
    this.meta = {};
  }
  getCollection(name) {
    return this.collections[name] || [];
  }
  setCollection(name, data) {
    this.collections[name] = data;
  }
  getMeta(key) {
    return this.meta[key];
  }
  setMeta(key, val) {
    this.meta[key] = val;
  }
}

const mockStore = new MockDataStore();
const offlineDb = createOfflineDb(mockStore);

test('offlineDb should save and retrieve Inventory items', () => {
  const item = new Inventory({
    id: 'inv-item-1',
    sku: 'SKU-REAG-001',
    name: 'Creatinine Reagent Kit',
    category: 'Reagents',
    area: 'Clinical Chemistry',
    minThreshold: 4,
    criticalThreshold: 2
  });

  offlineDb.saveInventory(item);
  const items = offlineDb.getInventory();
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].sku, 'SKU-REAG-001');

  const fetched = offlineDb.getInventoryById('inv-item-1');
  assert.ok(fetched);
  assert.strictEqual(fetched.name, 'Creatinine Reagent Kit');
});

test('offlineDb should save and retrieve InventoryBatches by inventoryId', () => {
  const batch = new InventoryBatch({
    id: 'batch-101',
    inventoryId: 'inv-item-1',
    lotNumber: 'LOT-2026-A',
    quantityReceived: 10,
    quantityOnHand: 10,
    expirationDate: '2027-01-01T00:00:00.000Z'
  });

  offlineDb.saveBatch(batch);
  const batches = offlineDb.getInventoryBatchesByItemId('inv-item-1');
  assert.strictEqual(batches.length, 1);
  assert.strictEqual(batches[0].lotNumber, 'LOT-2026-A');
  assert.strictEqual(batches[0].quantityOnHand, 10);
});

test('offlineDb should log and query InventoryTransactions', () => {
  const tx = new InventoryTransaction({
    id: 'tx-501',
    inventoryId: 'inv-item-1',
    batchId: 'batch-101',
    transactionType: 'RECEIVE',
    quantity: 10,
    performedBy: 'MedTech Mary'
  });

  offlineDb.saveTransaction(tx);
  const txList = offlineDb.getInventoryTransactions('inv-item-1');
  assert.strictEqual(txList.length, 1);
  assert.strictEqual(txList[0].transactionType, 'RECEIVE');
  assert.strictEqual(txList[0].quantity, 10);
});

test('offlineDb should properly delete inventory item and batches', () => {
  offlineDb.deleteBatch('batch-101');
  assert.strictEqual(offlineDb.getInventoryBatchesByItemId('inv-item-1').length, 0);

  offlineDb.deleteInventory('inv-item-1');
  assert.strictEqual(offlineDb.getInventory().length, 0);
  assert.strictEqual(offlineDb.getInventoryById('inv-item-1'), null);
});

console.log('\n=============================================================');
console.log(`🎉 ALL STANDALONE OFFLINE INVENTORY TESTS PASSED: ${passed} of ${total} assertions verified!`);
console.log('=============================================================\n');
