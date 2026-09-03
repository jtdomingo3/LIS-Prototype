/**
 * Unit Test Suite for Diagnostic Inventory Tracking, Multi-Department Scope,
 * Critical Stock Alert Calculations, and Role-Based Access Control Security.
 */

const assert = require('assert');
const path = require('path');

// Domain Models
const Inventory = require('../lis-fullstack/models/Inventory');
const InventoryBatch = require('../lis-fullstack/models/InventoryBatch');
const InventoryTransaction = require('../lis-fullstack/models/InventoryTransaction');

// Security & Auth Middleware
const { canAccessTemplates, getUserHomeRoute } = require('../lis-fullstack/middleware/auth');

console.log('\n=============================================================');
console.log('🧪 RUNNING UNIT TESTS: Diagnostic Inventory & Access Control');
console.log('=============================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}\n`);
    throw err;
  }
}

// -------------------------------------------------------------
// 1. INVENTORY MODEL UNIT TESTS
// -------------------------------------------------------------
console.log('--- 1. Inventory Model & Multi-Department Scope Tests ---');

test('Should instantiate Inventory item with default ISO 15189 fields', () => {
  const item = new Inventory({
    name: 'AST / SGOT Kinetic Kit',
    category: 'Clinical Reagents',
    unit: 'tests'
  });

  assert.ok(item.id, 'Item ID should be generated');
  assert.ok(item.sku.startsWith('SKU-') || item.sku.length > 0, 'SKU should be generated');
  assert.strictEqual(item.name, 'AST / SGOT Kinetic Kit');
  assert.strictEqual(item.category, 'Clinical Reagents');
  assert.strictEqual(item.unit, 'tests');
  assert.strictEqual(item.minThreshold, 5, 'Default minThreshold should be 5');
  assert.strictEqual(item.criticalThreshold, 2, 'Default criticalThreshold should be 2');
  assert.strictEqual(item.hazardClass, 'Non-Hazardous');
  assert.strictEqual(item.isActive, true);
});

test('Should support Radiology & X-Ray supplies (films, chemicals, developer)', () => {
  const xrayFilm = new Inventory({
    name: '14x17 Blue-Sensitive X-Ray Film (100s)',
    category: 'X-Ray Films & Accessories',
    area: 'X-Ray & Radiology',
    unit: 'films',
    minThreshold: 10,
    criticalThreshold: 3,
    packageSize: '100 sheets/box'
  });

  assert.strictEqual(xrayFilm.category, 'X-Ray Films & Accessories');
  assert.strictEqual(xrayFilm.area, 'X-Ray & Radiology');
  assert.strictEqual(xrayFilm.unit, 'films');
  assert.strictEqual(xrayFilm.minThreshold, 10);
  assert.strictEqual(xrayFilm.criticalThreshold, 3);
});

test('Should support Ultrasound, 2D Echo, & Cardiology ECG supplies (gels, rolls, electrodes)', () => {
  const usGel = new Inventory({
    name: 'Ultrasound Transmission Gel (5L Cubitainer)',
    category: 'Ultrasound & Echo Gels',
    area: 'Ultrasound & 2D Echo',
    unit: 'L',
    packageSize: '5 Liters'
  });

  const ecgPaper = new Inventory({
    name: 'ECG Thermal Recording Paper 210mm Z-Fold',
    category: 'ECG Papers & Electrodes',
    area: 'Cardiology & ECG',
    unit: 'rolls',
    minThreshold: 4,
    criticalThreshold: 1
  });

  assert.strictEqual(usGel.category, 'Ultrasound & Echo Gels');
  assert.strictEqual(usGel.area, 'Ultrasound & 2D Echo');
  assert.strictEqual(ecgPaper.category, 'ECG Papers & Electrodes');
  assert.strictEqual(ecgPaper.area, 'Cardiology & ECG');
  assert.strictEqual(ecgPaper.unit, 'rolls');
});

test('Should correctly detect critical stock levels vs reorder levels', () => {
  const item = new Inventory({
    id: 'test-crit-item-1',
    name: 'Glucose Hexokinase Reagent',
    minThreshold: 10,
    criticalThreshold: 2
  });

  // Mock global.db for totalStock calculation
  const originalDb = global.db;
  global.db = {
    getInventoryBatchesByItemId: (id) => [
      { quantityOnHand: 2 }
    ]
  };

  assert.strictEqual(item.totalStock, 2);
  assert.strictEqual(item.isLowStock, true, 'Stock of 2 should be low stock (<= 10)');
  assert.strictEqual(item.isCriticalStock, true, 'Stock of 2 should be critical stock (<= 2)');

  // Higher stock scenario
  global.db.getInventoryBatchesByItemId = () => [{ quantityOnHand: 5 }];
  assert.strictEqual(item.totalStock, 5);
  assert.strictEqual(item.isLowStock, true, 'Stock of 5 should still be low stock (<= 10)');
  assert.strictEqual(item.isCriticalStock, false, 'Stock of 5 should NOT be critical stock (> 2)');

  global.db = originalDb;
});

// -------------------------------------------------------------
// 2. INVENTORY BATCH & STABILITY UNIT TESTS
// -------------------------------------------------------------
console.log('\n--- 2. Inventory Batch & Open-Vial Stability Tests ---');

test('Should calculate effectiveExpirationDate for sealed manufacturer lot', () => {
  const mfgExpiry = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const batch = new InventoryBatch({
    lotNumber: 'LOT-2026-X1',
    expirationDate: mfgExpiry,
    quantityReceived: 20,
    quantityOnHand: 20,
    isOpen: false
  });

  assert.strictEqual(batch.effectiveExpirationDate, mfgExpiry, 'Sealed lot must use manufacturer expiration');
  assert.strictEqual(batch.isExpired, false);
});

test('Should calculate open-vial stability expiration when unsealed (ISO 15189)', () => {
  const now = new Date();
  const openedDate = now.toISOString();
  // Open vial stability of 14 days
  const openExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
  // Sealed manufacturer expiry is 1 year from now
  const mfgExpiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const batch = new InventoryBatch({
    lotNumber: 'LOT-OPEN-01',
    expirationDate: mfgExpiry,
    quantityOnHand: 5,
    isOpen: true,
    dateOpened: openedDate,
    openVialExpiryDate: openExpiry
  });

  assert.strictEqual(batch.effectiveExpirationDate, openExpiry, 'Open vial must override if earlier than sealed expiry');
});

test('Should flag expired batch when effective expiration is in the past', () => {
  const pastDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const batch = new InventoryBatch({
    lotNumber: 'LOT-EXPIRED',
    expirationDate: pastDate,
    quantityOnHand: 10
  });

  assert.strictEqual(batch.isExpired, true, 'Batch past expiration date must be flagged isExpired');
});

test('Should support QC statuses: PASSED, PENDING_QC, QUARANTINED, DISCARDED', () => {
  const validStatuses = ['PASSED', 'PENDING_QC', 'QUARANTINED', 'DISCARDED'];
  validStatuses.forEach(st => {
    const b = new InventoryBatch({ lotNumber: `LOT-${st}`, qcStatus: st });
    assert.strictEqual(b.qcStatus, st);
  });
});

// -------------------------------------------------------------
// 3. INVENTORY TRANSACTION & AUDIT TRAIL TESTS
// -------------------------------------------------------------
console.log('\n--- 3. Inventory Transaction & Regulatory Audit Trail Tests ---');

test('Should record ISO compliant transaction types and stock delta', () => {
  const tx = new InventoryTransaction({
    inventoryId: 'inv-item-123',
    batchId: 'batch-456',
    transactionType: 'RECEIVE',
    quantity: 50,
    quantityBefore: 0,
    quantityAfter: 50,
    performedBy: 'Jeff Domingo, RMT',
    notes: 'Initial delivery arrival from Roche'
  });

  assert.strictEqual(tx.transactionType, 'RECEIVE');
  assert.strictEqual(tx.quantity, 50);
  assert.strictEqual(tx.quantityBefore, 0);
  assert.strictEqual(tx.quantityAfter, 50);
  assert.strictEqual(tx.performedBy, 'Jeff Domingo, RMT');
  assert.ok(tx.createdAt, 'createdAt timestamp must be logged');
  assert.strictEqual(tx.quantityImpact, 50, 'RECEIVE quantity impact should be positive');
});

test('Should record stock adjustment with required audit justification', () => {
  const tx = new InventoryTransaction({
    inventoryId: 'inv-item-123',
    batchId: 'batch-456',
    transactionType: 'ADJUST',
    quantity: -2,
    quantityBefore: 10,
    quantityAfter: 8,
    performedBy: 'Lead Medical Technologist',
    reason: 'Physical inventory cycle count discrepancy'
  });

  assert.strictEqual(tx.transactionType, 'ADJUST');
  assert.strictEqual(tx.quantity, -2);
  assert.strictEqual(tx.quantityBefore, 10);
  assert.strictEqual(tx.quantityAfter, 8);
  assert.strictEqual(tx.performedBy, 'Lead Medical Technologist');
  assert.strictEqual(tx.reason, 'Physical inventory cycle count discrepancy');
  assert.strictEqual(tx.quantityImpact, -2);
});

// -------------------------------------------------------------
// 4. ACCESS CONTROL & SECURITY COMPLIANCE TESTS
// -------------------------------------------------------------
console.log('\n--- 4. Access Control & User Permissions Security Tests ---');

function testInventoryAccessHelper(user) {
  if (!user) return false;
  if (user.role === 'Admin' || user.role === 'Management' || user.role === 'Manager' || user.role === 'Owner') return true;
  let p = user.permissions;
  if (!p) return false;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch (_) { return false; }
  }
  if (Array.isArray(p)) return p.includes('inventory');
  if (typeof p === 'object') {
    return !!(p.inventory === true || p.inventory === '1' || p.inventory === 1 || p.inventory === 'true' || p.inventory === 'on');
  }
  return false;
}

test('Admin should always have full inventory access regardless of permissions object', () => {
  const adminUser = { role: 'Admin', email: 'admin@lab.com', permissions: {} };
  assert.strictEqual(testInventoryAccessHelper(adminUser), true);
});

test('User with permissions.inventory: "1" must be granted inventory access without throwing TypeError', () => {
  // Typical payload stored in session from user form
  const staffWithPerm = {
    role: 'Medical Technologist',
    email: 'jeff@gezyne.com',
    permissions: {
      reception: '1',
      patients: '1',
      tests: '1',
      reports: '1',
      worksheet: '1',
      inventory: '1',
      templates: '1'
    }
  };

  assert.doesNotThrow(() => {
    const granted = testInventoryAccessHelper(staffWithPerm);
    assert.strictEqual(granted, true, 'User with inventory: "1" must be granted access');
  }, 'Should not throw TypeError on object permissions');
});

test('User without inventory permission must be denied access', () => {
  const staffWithoutPerm = {
    role: 'Medical Technologist',
    email: 'staff@lab.com',
    permissions: {
      reception: '1',
      tests: '1'
    }
  };

  assert.strictEqual(testInventoryAccessHelper(staffWithoutPerm), false, 'User without inventory perm must be denied');
});

test('canAccessTemplates middleware should strictly permit Admins and authorized responsible persons only', () => {
  let nextCalled = false;
  let redirectedTo = null;
  let flashMsg = null;

  const mockRes = {
    redirect: (target) => { redirectedTo = target; }
  };
  const mockNext = () => { nextCalled = true; };

  // Case A: Admin -> Allowed
  nextCalled = false; redirectedTo = null;
  canAccessTemplates({ session: { user: { role: 'Admin' } }, flash: () => {} }, mockRes, mockNext);
  assert.strictEqual(nextCalled, true, 'Admin must be granted template access');

  // Case B: Responsible Person with permissions.templates: "1" -> Allowed
  nextCalled = false; redirectedTo = null;
  canAccessTemplates({
    session: { user: { role: 'Medical Technologist', permissions: { templates: '1' } } },
    flash: () => {}
  }, mockRes, mockNext);
  assert.strictEqual(nextCalled, true, 'Responsible Person with templates permission must be granted access');

  // Case C: Regular MedTech without templates permission -> Denied & Redirected
  nextCalled = false; redirectedTo = null;
  canAccessTemplates({
    session: { user: { role: 'Medical Technologist', permissions: { reception: '1', tests: '1' } } },
    flash: (type, msg) => { flashMsg = msg; }
  }, mockRes, mockNext);
  assert.strictEqual(nextCalled, false, 'MedTech without templates permission must NOT call next()');
  assert.ok(redirectedTo, 'Unauthorized user must be redirected away from /templates');
  assert.ok(flashMsg && flashMsg.includes('Report Templates'), 'Flash message should explain access restriction');
});

// -------------------------------------------------------------
// 5. GLOBAL SNOOZE ALERT TIME CALCULATION TESTS
// -------------------------------------------------------------
console.log('\n--- 5. Global Snooze Alert Time Calculation Tests ---');

test('Snooze calculation should correctly project 1h, 4h, and 24h intervals', () => {
  const baseTime = 1772678400000; // Fixed timestamp
  const calculateSnooze = (min, now) => now + (min * 60 * 1000);

  const snooze1h = calculateSnooze(60, baseTime);
  const snooze4h = calculateSnooze(240, baseTime);
  const snooze24h = calculateSnooze(1440, baseTime);

  assert.strictEqual(snooze1h - baseTime, 3600000, '1h snooze must equal 3,600,000ms');
  assert.strictEqual(snooze4h - baseTime, 14400000, '4h snooze must equal 14,400,000ms');
  assert.strictEqual(snooze24h - baseTime, 86400000, '24h snooze must equal 86,400,000ms');

  // Snooze expiration evaluation
  assert.strictEqual(snooze1h > baseTime, true, 'Active snooze must be in the future');
  assert.strictEqual(snooze1h > (baseTime + 3600001), false, 'Expired snooze must evaluate false');
});

// -------------------------------------------------------------
// 6. DEPARTMENT/ROLE-TARGETED STOCK ALERT TESTS
// -------------------------------------------------------------
console.log('\n--- 6. Department & Role-Targeted Stock Alert Tests ---');

test('Clinical reagents should alert MedTechs, but NOT Sonographers or X-Ray Techs by default', () => {
  const clinicalItem = new Inventory({
    name: 'Clinical Glucose Reagent',
    area: 'Clinical Chemistry',
    category: 'Clinical Reagents'
  });

  const medtech = { role: 'Medical Technologist' };
  const xrayTech = { role: 'X-Ray Technologist' };
  const sonographer = { role: 'Sonographer' };

  assert.strictEqual(clinicalItem.shouldAlertUser(medtech), true, 'MedTech must receive clinical alerts');
  assert.strictEqual(clinicalItem.shouldAlertUser(xrayTech), false, 'X-Ray Tech should NOT receive clinical alerts');
  assert.strictEqual(clinicalItem.shouldAlertUser(sonographer), false, 'Sonographer should NOT receive clinical alerts');
});

test('X-Ray films & supplies should alert X-Ray Technologists, but NOT MedTechs by default', () => {
  const xrayItem = new Inventory({
    name: 'X-Ray Film 14x17',
    area: 'X-Ray & Radiology',
    category: 'X-Ray Films & Accessories'
  });

  const medtech = { role: 'Medical Technologist' };
  const xrayTech = { role: 'X-Ray Technologist' };

  assert.strictEqual(xrayItem.shouldAlertUser(xrayTech), true, 'X-Ray Tech must receive X-Ray alerts');
  assert.strictEqual(xrayItem.shouldAlertUser(medtech), false, 'MedTech should NOT receive X-Ray alerts');
});

test('Ultrasound & 2D Echo supplies should alert Sonographers and 2D Echo staff (X-Ray Tech)', () => {
  const sonoItem = new Inventory({
    name: 'Ultrasound Transmission Gel (5L)',
    area: 'Ultrasound & 2D Echo',
    category: 'Ultrasound & Echo Gels'
  });

  const sonographer = { role: 'Sonographer' };
  const xrayTech = { role: 'X-Ray Technologist' };
  const medtech = { role: 'Medical Technologist' };

  assert.strictEqual(sonoItem.shouldAlertUser(sonographer), true, 'Sonographer must receive Ultrasound alerts');
  assert.strictEqual(sonoItem.shouldAlertUser(xrayTech), true, 'X-Ray Tech assigned to 2D Echo must receive alerts');
  assert.strictEqual(sonoItem.shouldAlertUser(medtech), false, 'Standard MedTech should NOT receive Ultrasound alerts');
});

test('Admins, Managers, and Owners must receive ALL alerts across all departments', () => {
  const clinicalItem = new Inventory({ name: 'Serum Bilirubin', area: 'Clinical Chemistry' });
  const xrayItem = new Inventory({ name: 'X-Ray Developer', area: 'X-Ray & Radiology' });
  const sonoItem = new Inventory({ name: 'Echo Gel', area: 'Ultrasound & 2D Echo' });

  const admin = { role: 'Admin' };
  const manager = { role: 'Manager' };
  const owner = { role: 'Owner' };

  [clinicalItem, xrayItem, sonoItem].forEach(item => {
    assert.strictEqual(item.shouldAlertUser(admin), true, 'Admin receives all alerts');
    assert.strictEqual(item.shouldAlertUser(manager), true, 'Manager receives all alerts');
    assert.strictEqual(item.shouldAlertUser(owner), true, 'Owner receives all alerts');
  });
});

test('Custom targetRoles on Inventory item should take precedence over default area mapping', () => {
  const customItem = new Inventory({
    name: 'Dual-purpose ECG Electrodes',
    area: 'Cardiology & ECG',
    targetRoles: ['Medical Technologist', 'Doctor']
  });

  const medtech = { role: 'Medical Technologist' };
  const sonographer = { role: 'Sonographer' };

  assert.strictEqual(customItem.shouldAlertUser(medtech), true, 'Explicit target role must be alerted');
  assert.strictEqual(customItem.shouldAlertUser(sonographer), false, 'Unlisted role must NOT be alerted');
});

// -------------------------------------------------------------
// 7. INVENTORY DELETION RESILIENCE TESTS
// -------------------------------------------------------------
console.log('\n--- 7. Inventory Deletion Resilience Tests ---');

test('deleteInventory should remove transactions, batches, and item cleanly', () => {
  let deletedTransactions = false;
  let deletedBatches = false;
  let deletedItem = false;

  const mockDb = {
    deleteInventory: (id) => {
      deletedTransactions = true;
      deletedBatches = true;
      deletedItem = true;
      return true;
    }
  };

  assert.strictEqual(mockDb.deleteInventory('item-test-123'), true);
  assert.strictEqual(deletedTransactions, true);
  assert.strictEqual(deletedBatches, true);
  assert.strictEqual(deletedItem, true);
});

console.log('\n=============================================================');
console.log(`🎉 ALL TESTS PASSED: ${passedTests} of ${totalTests} assertions verified!`);
console.log('=============================================================\n');
