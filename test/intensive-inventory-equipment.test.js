/**
 * test/intensive-inventory-equipment.test.js
 *
 * Intensive Functional & Print Layout Verification Suite for:
 * 1. Diagnostic Inventory & Reagents (ISO 15189 Audit Trail, FEFO, Open-Vial Stability)
 * 2. Equipment Monitoring & Maintenance (DOH AO 2021-0037, FDA CDRRHR X-Ray Radiation Safety)
 * 3. Statistical Quality Control (CLSI C24-Ed4, Westgard Multi-Rules, Levey-Jennings, NEQAS)
 * 4. Regulatory Print Layouts (Landscape Inventory Registry, Stock Card, Equipment Registry, LJ Charts)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let ejs;
try {
  ejs = require('../lis-fullstack/node_modules/ejs');
} catch (e) {
  ejs = require('ejs');
}

const Inventory = require('../lis-fullstack/models/Inventory');
const InventoryBatch = require('../lis-fullstack/models/InventoryBatch');
const InventoryTransaction = require('../lis-fullstack/models/InventoryTransaction');
const Equipment = require('../lis-fullstack/models/Equipment');
const EquipmentLog = require('../lis-fullstack/models/EquipmentLog');
const { QcControl, DEFAULT_CHEMISTRY_ANALYTES, DEFAULT_CHEMISTRY_ANALYTES_LEVEL2 } = require('../lis-fullstack/models/QcControl');
const QcEntry = require('../lis-fullstack/models/QcEntry');
const NeqasRecord = require('../lis-fullstack/models/NeqasRecord');
const {
  evaluateWestgardRules,
  calculateQcStatistics,
  buildLeveyJenningsDataset,
  generateDohMonthlyReport
} = require('../lis-fullstack/lib/leveyJenningsService');

const viewsDir = path.join(__dirname, '..', 'lis-fullstack', 'views');

function renderView(viewRelativePath, data) {
  const fullPath = path.join(viewsDir, viewRelativePath + '.ejs');
  assert.ok(fs.existsSync(fullPath), `View template file must exist: ${fullPath}`);
  const template = fs.readFileSync(fullPath, 'utf8');
  return ejs.render(template, {
    ...data,
    filename: fullPath,
    sessionUser: data.sessionUser || { id: 1, name: 'Admin User', role: 'Admin' },
    user: data.sessionUser || { id: 1, name: 'Admin User', role: 'Admin' },
    messages: data.messages || {},
    csrfToken: 'test-csrf-token'
  });
}

async function runIntensiveInventoryEquipmentSuite() {
  console.log('\n========================================================================');
  console.log('🧪 RUNNING INTENSIVE INVENTORY, REAGENT & EQUIPMENT MONITORING SUITE');
  console.log('========================================================================\n');

  // ========================================================================
  // SECTION 1: Diagnostic Inventory & Reagents Lifecycle (ISO 15189)
  // ========================================================================
  console.log('--- SECTION 1: Diagnostic Inventory & Reagents Lifecycle ---');

  // 1.1 Item Classification (Reagents vs Supplies)
  const reagentItem = new Inventory({
    name: 'ALT / SGPT Enzymatic Kinetic Reagent Kit',
    category: 'Clinical Reagents',
    area: 'Clinical Chemistry',
    unit: 'tests',
    cost: 45.0,
    minThreshold: 100,
    criticalThreshold: 30,
    storageTemp: '2-8°C Refrigerated',
    requiresRefrigeration: true,
    openVialStabilityDays: 28,
    hazardClass: 'Irritant'
  });
  assert.strictEqual(reagentItem.isReagent, true, 'ALT reagent must be classified as reagent');
  assert.strictEqual(reagentItem.isSupply, false);
  assert.strictEqual(reagentItem.requiresRefrigeration, true);
  assert.strictEqual(reagentItem.openVialStabilityDays, 28);

  const supplyItem = new Inventory({
    name: '14x17 Blue Medical X-Ray Film (100 sheets)',
    category: 'X-Ray Films & Accessories',
    area: 'Radiology / X-Ray',
    unit: 'sheets',
    cost: 120.0,
    minThreshold: 50,
    criticalThreshold: 15,
    storageTemp: '18-25°C Room Temp',
    requiresRefrigeration: false
  });
  assert.strictEqual(supplyItem.isSupply, true, 'X-Ray film must be classified as supply');
  assert.strictEqual(supplyItem.isReagent, false);
  console.log('  ✓ 1.1 Reagent vs Consumable Supply classification verified');

  // 1.2 Multi-department stock coverage
  const usGel = new Inventory({
    name: 'Acoustic Ultrasound Gel 5L Cubitainer',
    category: 'Ultrasound & Echo Gels',
    area: 'Ultrasound & 2D Echo',
    unit: 'L'
  });
  const ecgRoll = new Inventory({
    name: 'Cardiology ECG Recording Thermal Paper Z-Fold',
    category: 'ECG Papers & Electrodes',
    area: 'Cardiology & ECG',
    unit: 'rolls'
  });
  assert.strictEqual(usGel.area, 'Ultrasound & 2D Echo');
  assert.strictEqual(ecgRoll.area, 'Cardiology & ECG');
  console.log('  ✓ 1.2 Multi-department coverage (Clinical Lab, X-Ray, Ultrasound, ECG) verified');

  // 1.3 Batch Traceability, Cold-Chain & QC Release
  const batch1 = new InventoryBatch({
    inventoryId: reagentItem.id,
    lotNumber: 'LOT-ALT-202611A',
    quantityReceived: 500,
    quantityOnHand: 500,
    receiptCondition: 'ACCEPTABLE',
    receivedTemperature: '4.2°C Cold Chain OK',
    expirationDate: '2027-11-30T00:00:00.000Z',
    qcStatus: 'PASSED'
  });
  assert.strictEqual(batch1.lotNumber, 'LOT-ALT-202611A');
  assert.strictEqual(batch1.stockStatus, 'OK');
  assert.strictEqual(batch1.isExpired, false);
  assert.ok(batch1.daysUntilExpiration > 300);

  // 1.4 Open-Vial In-Use Stability (ISO 15189 Rule: earlier of sealed vs in-use)
  const openDate = new Date();
  const stabilityMs = 28 * 24 * 60 * 60 * 1000;
  const expectedOpenExpiry = new Date(openDate.getTime() + stabilityMs);

  batch1.isOpen = true;
  batch1.dateOpened = openDate.toISOString();
  batch1.openVialExpiryDate = expectedOpenExpiry.toISOString();

  assert.strictEqual(batch1.effectiveExpirationDate, batch1.openVialExpiryDate, 'Effective expiry must enforce open-vial limit when opened');
  assert.strictEqual(batch1.isExpired, false);

  // Expired open vial simulation
  const expiredBatch = new InventoryBatch({
    inventoryId: reagentItem.id,
    lotNumber: 'LOT-ALT-EXPIRED',
    quantityReceived: 100,
    quantityOnHand: 40,
    expirationDate: '2028-01-01T00:00:00.000Z', // sealed date in future
    isOpen: true,
    dateOpened: '2026-09-01T00:00:00.000Z',
    openVialExpiryDate: '2026-09-29T00:00:00.000Z' // 28 days stability expired in September
  });
  assert.strictEqual(expiredBatch.isExpired, true, 'Batch with expired open-vial date must report isExpired = true');
  assert.strictEqual(expiredBatch.stockStatus, 'EXPIRED');
  console.log('  ✓ 1.3 - 1.4 Lot traceability & ISO 15189 Open-Vial Stability verified');

  // 1.5 Immutable Inventory Transaction Audit Trail
  const txReceive = new InventoryTransaction({
    inventoryId: reagentItem.id,
    batchId: batch1.id,
    lotNumber: batch1.lotNumber,
    transactionType: 'RECEIVE',
    quantity: 500,
    quantityBefore: 0,
    quantityAfter: 500,
    reason: 'Initial Lot Stocking'
  });
  assert.strictEqual(txReceive.quantityImpact, 500);

  const txOpen = new InventoryTransaction({
    inventoryId: reagentItem.id,
    batchId: batch1.id,
    lotNumber: batch1.lotNumber,
    transactionType: 'OPEN_VIAL',
    quantity: 0,
    quantityBefore: 500,
    quantityAfter: 500,
    reason: 'Vial unsealed for routine testing'
  });
  assert.strictEqual(txOpen.quantityImpact, 0);

  const txConsume = new InventoryTransaction({
    inventoryId: reagentItem.id,
    batchId: batch1.id,
    lotNumber: batch1.lotNumber,
    transactionType: 'CONSUME',
    quantity: 25,
    quantityBefore: 500,
    quantityAfter: 475,
    reason: 'Patient specimen runs'
  });
  assert.strictEqual(txConsume.quantityImpact, -25);
  console.log('  ✓ 1.5 ISO 15189 Immutable Transaction audit trail (RECEIVE, OPEN_VIAL, CONSUME) verified');

  // 1.6 Role-based Stock Alert Targeting
  const medTechUser = { role: 'Medical Technologist', permissions: {} };
  const radTechUser = { role: 'X-Ray Technologist', permissions: {} };
  const adminUser = { role: 'Admin', permissions: { admin: true } };

  assert.strictEqual(reagentItem.shouldAlertUser(medTechUser), true, 'MedTech should receive clinical chemistry alerts');
  assert.strictEqual(reagentItem.shouldAlertUser(radTechUser), false, 'RadTech should not receive clinical chemistry alerts');
  assert.strictEqual(supplyItem.shouldAlertUser(radTechUser), true, 'RadTech should receive X-ray supply alerts');
  assert.strictEqual(reagentItem.shouldAlertUser(adminUser), true, 'Admin receives all alerts');
  console.log('  ✓ 1.6 Role-based department stock alert targeting verified');

  // ========================================================================
  // SECTION 2: Equipment Monitoring, Calibration & Radiation Safety
  // ========================================================================
  console.log('\n--- SECTION 2: Equipment Monitoring & Maintenance ---');

  // 2.1 Equipment Directory Instantiation
  const chemAnalyzer = new Equipment({
    equipmentCode: 'EQ-CHEM-001',
    name: 'Mindray BS-240 Clinical Chemistry Analyzer',
    category: 'Clinical Chemistry Analyzer',
    department: 'Clinical Chemistry',
    manufacturer: 'Mindray',
    modelNumber: 'BS-240',
    serialNumber: 'SN-BS240-9841',
    location: 'Chemistry Section - Bench 1',
    calibrationCycleDays: 365,
    lastCalibrationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
    pmCycleDays: 180,
    lastPmDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  });
  assert.strictEqual(chemAnalyzer.isChemistry, true);
  assert.strictEqual(chemAnalyzer.isXRay, false);
  assert.strictEqual(chemAnalyzer.status, 'OPERATIONAL');
  assert.ok(chemAnalyzer.daysUntilCalibration > 300);

  // 2.2 Radiation Safety Details & FDA CDRRHR Specifications
  const xrayUnit = new Equipment({
    equipmentCode: 'EQ-RAD-001',
    name: 'Shimadzu MobileDaRt Evolution MX7',
    category: 'Diagnostic X-Ray Unit (Mobile/Portable)',
    department: 'Radiology / X-Ray',
    manufacturer: 'Shimadzu',
    modelNumber: 'MX7',
    serialNumber: 'SN-SHIMADZU-5510',
    location: 'X-Ray Room A',
    calibrationCycleDays: 365,
    lastCalibrationDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(), // 400 days ago -> OVERDUE
    pmCycleDays: 180,
    radiationSafetyDetails: {
      isRadiationEmitter: true,
      fdaCdrrhrRegNumber: 'FDA-CDRRHR-XR-2026-0419',
      radiationSafetyOfficer: 'Engr. J. Santos, RSO',
      tubeModel: 'Varian Rad-14',
      tubeSerialNumber: 'TB-884102',
      maxKvp: 150,
      maxMa: 500,
      totalFiltrationHvl: '2.5 mm Al eq.'
    }
  });
  assert.strictEqual(xrayUnit.isXRay, true);
  assert.strictEqual(xrayUnit.radiationSafetyDetails.fdaCdrrhrRegNumber, 'FDA-CDRRHR-XR-2026-0419');
  assert.strictEqual(xrayUnit.radiationSafetyDetails.maxKvp, 150);
  assert.strictEqual(xrayUnit.isCalibrationOverdue, true, '400 days since last cal must trigger overdue');
  assert.strictEqual(xrayUnit.status, 'CALIBRATION_OVERDUE');
  console.log('  ✓ 2.1 - 2.2 Equipment registry, FDA CDRRHR X-Ray radiation safety & overdue detection verified');

  // 2.3 Equipment Maintenance Log Lifecycle
  const pmLog = new EquipmentLog({
    equipmentId: chemAnalyzer.id,
    logType: 'PREVENTIVE_MAINTENANCE',
    serviceProviderName: 'Mindray Philippines Medical Corp.',
    technicianName: 'Service Engineer Mark Reyes',
    cost: 15000.0,
    resultStatus: 'PASS',
    workPerformed: 'Semi-Annual PM & Optical Lamp Alignment',
    findings: 'All optical photometer channels clean. Peristaltic pump tubing replaced.'
  });
  assert.strictEqual(pmLog.logType, 'PREVENTIVE_MAINTENANCE');
  assert.strictEqual(pmLog.resultStatus, 'PASS');
  assert.strictEqual(pmLog.cost, 15000.0);
  console.log('  ✓ 2.3 Equipment preventive maintenance log verified');

  // ========================================================================
  // SECTION 3: Internal QC, Levey-Jennings & Westgard Multi-Rules
  // ========================================================================
  console.log('\n--- SECTION 3: Statistical Quality Control & Westgard Rules ---');

  // 3.1 Pre-loaded Chemistry Analytes
  assert.ok(DEFAULT_CHEMISTRY_ANALYTES.length >= 21, 'Must include at least 21 standard chemistry analytes');
  const fbsDef = DEFAULT_CHEMISTRY_ANALYTES.find(a => a.analyteCode === 'fbs');
  assert.ok(fbsDef, 'FBS analyte defined');
  assert.strictEqual(fbsDef.targetMean, 95.0);
  assert.strictEqual(fbsDef.targetSd, 3.5);

  // 3.2 Westgard Multirule Evaluation (CLSI C24-Ed4)
  const targetMean = 100.0;
  const targetSd = 5.0;

  // A. In-control run (Z = 0.4)
  const resAccept = evaluateWestgardRules(
    { measuredValue: 102.0, targetMean, targetSd },
    []
  );
  assert.strictEqual(resAccept.status, 'ACCEPTED');
  assert.strictEqual(resAccept.rulesViolated.length, 0);

  // B. Warning 1_2s (Z = 2.4)
  const res1_2s = evaluateWestgardRules(
    { measuredValue: 112.0, targetMean, targetSd },
    []
  );
  assert.strictEqual(res1_2s.status, 'WARNING');
  assert.ok(res1_2s.rulesViolated.includes('1_2s'));

  // C. Rejection 1_3s (Z = 3.4)
  const res1_3s = evaluateWestgardRules(
    { measuredValue: 117.0, targetMean, targetSd },
    []
  );
  assert.strictEqual(res1_3s.status, 'REJECTED');
  assert.ok(res1_3s.rulesViolated.includes('1_3s'));
  assert.strictEqual(res1_3s.violationType, 'Random Error');

  // D. Rejection 2_2s (2 consecutive > +2SD)
  const res2_2s = evaluateWestgardRules(
    { measuredValue: 111.0, targetMean, targetSd }, // Z = +2.2
    [{ measuredValue: 112.0, zScore: 2.4 }]        // previous Z = +2.4
  );
  assert.strictEqual(res2_2s.status, 'REJECTED');
  assert.ok(res2_2s.rulesViolated.includes('2_2s'));
  assert.strictEqual(res2_2s.violationType, 'Systematic Error');

  // E. Rejection R_4s (Range >= 4.0 SD across consecutive runs)
  const resR_4s = evaluateWestgardRules(
    { measuredValue: 111.0, targetMean, targetSd }, // Z = +2.2
    [{ measuredValue: 89.0, zScore: -2.2 }]         // previous Z = -2.2 (Range = 4.4 SD)
  );
  assert.strictEqual(resR_4s.status, 'REJECTED');
  assert.ok(resR_4s.rulesViolated.includes('R_4s'));
  assert.strictEqual(resR_4s.violationType, 'Random Error');

  // F. Rejection 4_1s (4 consecutive > +1SD)
  const res4_1s = evaluateWestgardRules(
    { measuredValue: 106.0, targetMean, targetSd }, // Z = +1.2
    [
      { measuredValue: 107.0, zScore: 1.4 },
      { measuredValue: 106.5, zScore: 1.3 },
      { measuredValue: 106.0, zScore: 1.2 }
    ]
  );
  assert.strictEqual(res4_1s.status, 'REJECTED');
  assert.ok(res4_1s.rulesViolated.includes('4_1s'));
  assert.strictEqual(res4_1s.violationType, 'Systematic Error');

  // G. Rejection 10_x (10 consecutive on same side of mean)
  const prev9Positive = Array(9).fill({ measuredValue: 101.5, zScore: 0.3 });
  const res10_x = evaluateWestgardRules(
    { measuredValue: 102.0, targetMean, targetSd }, // 10th positive
    prev9Positive
  );
  assert.strictEqual(res10_x.status, 'REJECTED');
  assert.ok(res10_x.rulesViolated.includes('10_x'));
  assert.strictEqual(res10_x.violationType, 'Systematic Error');
  console.log('  ✓ 3.2 Westgard Multi-Rules Engine verified (In-Control, 1_2s, 1_3s, 2_2s, R_4s, 4_1s, 10_x)');

  // 3.3 Statistical Aggregations (Mean, SD, CV%)
  const sampleValues = [98.5, 99.2, 101.0, 100.5, 99.8, 100.2, 101.1, 99.7];
  const stats = calculateQcStatistics(sampleValues, 100.0, 1.0, 10.0);
  assert.ok(stats.observedMean > 99.0 && stats.observedMean < 101.0);
  assert.ok(stats.observedSd > 0.5 && stats.observedSd < 1.5);
  assert.ok(stats.cvPercent > 0.5 && stats.cvPercent < 2.0);
  console.log(`  ✓ 3.3 Levey-Jennings Statistics verified: Mean=${stats.observedMean}, SD=${stats.observedSd}, CV=${stats.cvPercent}%`);

  // 3.4 NEQAS External Quality Assessment Record
  const neqas = new NeqasRecord({
    equipmentId: chemAnalyzer.id,
    equipmentName: chemAnalyzer.name,
    nrlName: 'Lung Center of the Philippines (LCP - Clinical Chemistry)',
    cycleYear: '2026',
    sampleId: 'NEQAS-CC-2026-03',
    analyteCode: 'fbs',
    analyteName: 'Glucose / Fasting Blood Sugar',
    reportedValue: 96.2,
    peerMean: 95.5,
    peerSd: 3.2
  });
  assert.strictEqual(neqas.nrlEvaluation.evaluationGrade, 'ACCEPTABLE');
  assert.strictEqual(neqas.status, 'EVALUATED_ACCEPTABLE');
  assert.ok(neqas.nrlEvaluation.sdi !== null && Math.abs(neqas.nrlEvaluation.sdi) < 1.0);
  console.log(`  ✓ 3.4 NEQAS / EQA Proficiency Record verified: SDI=${neqas.nrlEvaluation.sdi}, Grade=${neqas.nrlEvaluation.evaluationGrade}`);

  // ========================================================================
  // SECTION 4: Print Layouts & Regulatory Compliance Rendering
  // ========================================================================
  console.log('\n--- SECTION 4: Regulatory Print Layouts & View Rendering ---');

  // 4.1 Inventory Index (Landscape Print Layout)
  const invIndexHtml = renderView('inventory/index', {
    title: 'Diagnostic Supplies & Reagent Inventory',
    totalItems: 42,
    criticalStockCount: 2,
    lowStockCount: 5,
    expiringCount: 3,
    expiredCount: 0,
    categories: ['Clinical Reagents', 'X-Ray Films & Accessories', 'Ultrasound & Echo Gels'],
    areas: ['Clinical Chemistry', 'Hematology', 'Radiology / X-Ray', 'Ultrasound & 2D Echo'],
    items: [reagentItem, supplyItem],
    isEditable: true,
    sessionUser: adminUser
  });
  assert.ok(invIndexHtml.includes('size: letter landscape'), 'Inventory index must enforce landscape print layout');
  assert.ok(invIndexHtml.includes('inventory-print-header'), 'Inventory index must include regulatory print header');
  assert.ok(invIndexHtml.includes('Print Inventory'), 'Inventory index must provide Print Inventory button');
  console.log('  ✓ 4.1 Inventory Registry renders with Landscape @media print layout & header');

  // 4.2 Inventory Details (Stock Card Portrait Print Layout)
  const invDetailsHtml = renderView('inventory/details', {
    title: `Item Details: ${reagentItem.name}`,
    item: {
      ...reagentItem,
      totalStock: 500
    },
    batches: [batch1],
    activeBatches: [batch1],
    transactions: [txReceive, txOpen, txConsume],
    canEdit: true,
    sessionUser: adminUser
  });
  assert.ok(invDetailsHtml.includes('size: letter portrait'), 'Inventory details must enforce portrait stock card print layout');
  assert.ok(invDetailsHtml.includes('stockcard-print-header'), 'Inventory details must include stock card print header');
  assert.ok(invDetailsHtml.includes('Print Stock Card'), 'Inventory details must provide Print Stock Card button');
  console.log('  ✓ 4.2 Item Stock Card renders with Portrait @media print layout & audit trail');

  // 4.3 Equipment Index (Landscape Master Registry Print Layout)
  const eqIndexHtml = renderView('equipment/index', {
    title: 'Equipment & Analyzer Management',
    equipment: [chemAnalyzer, xrayUnit],
    kpi: {
      total: 2,
      operational: 1,
      calibrationDueSoon: 0,
      calibrationOverdue: 1,
      xrayCount: 1
    },
    sessionUser: adminUser
  });
  assert.ok(eqIndexHtml.includes('size: letter landscape'), 'Equipment index must enforce landscape print layout');
  assert.ok(eqIndexHtml.includes('equipment-print-header'), 'Equipment index must include regulatory equipment print header');
  assert.ok(eqIndexHtml.includes('Print Registry'), 'Equipment index must provide Print Registry button');
  console.log('  ✓ 4.3 Equipment Master Registry renders with Landscape @media print layout');

  // 4.4 Levey-Jennings Chart Print View (Fidelity with Print Color Adjust)
  const qcControl = new QcControl({
    equipmentId: chemAnalyzer.id,
    lotNumber: 'QC-LOT-2026A',
    controlLevel: 'Level 1 Normal',
    analytes: [fbsDef]
  });
  const qcEntries = [
    new QcEntry({ equipmentId: chemAnalyzer.id, controlId: qcControl.id, analyteCode: 'fbs', runDate: '2026-11-01T08:00:00.000Z', measuredValue: 95.2 }),
    new QcEntry({ equipmentId: chemAnalyzer.id, controlId: qcControl.id, analyteCode: 'fbs', runDate: '2026-11-02T08:00:00.000Z', measuredValue: 96.0 }),
    new QcEntry({ equipmentId: chemAnalyzer.id, controlId: qcControl.id, analyteCode: 'fbs', runDate: '2026-11-03T08:00:00.000Z', measuredValue: 94.8 })
  ];
  const dataset = buildLeveyJenningsDataset(qcControl, 'fbs', qcEntries, { equipment: chemAnalyzer });
  dataset.filterRange = { startDate: null, endDate: null };

  const ljPrintHtml = renderView('equipment/print_lj', {
    title: 'Levey-Jennings Quality Control Report',
    equipment: chemAnalyzer,
    dataset,
    signatories: {
      operatorName: 'Gezyne M. Lopez, RMT',
      operatorTitle: 'Performed By (Medical Technologist)',
      operatorLicense: '67820',
      validatorName: 'QC Supervisor',
      validatorTitle: 'Reviewed & Verified By (QC Supervisor)',
      validatorLicense: '12345',
      pathologistName: 'Bernadette R. Espiritu, M.D.',
      pathologistTitle: 'Approved By (Head of Laboratory / Pathologist)',
      pathologistLicense: '75547'
    },
    allUsers: [],
    sessionUser: adminUser
  });
  assert.ok(ljPrintHtml.includes('print-color-adjust: exact'), 'LJ print view must enforce exact color adjust for colored SD bands');
  assert.ok(ljPrintHtml.includes('no-print-bar no-print'), 'LJ print view must include no-print bar');
  console.log('  ✓ 4.4 Levey-Jennings single-analyte chart print view verified with high-fidelity color adjust');

  // 4.5 DOH AO 2020-0035 Monthly Multi-Analyte QC Consolidated Report
  const monthlyQcHtml = renderView('equipment/print_monthly_qc', {
    title: 'Monthly Multi-Analyte Internal QC Consolidated Report',
    equipment: chemAnalyzer,
    control: new QcControl({
      equipmentId: chemAnalyzer.id,
      lotNumber: 'QC-LOT-2026A',
      controlLevel: 'Level 1 Normal'
    }),
    month: '2026-11',
    summaryData: [
      {
        analyteCode: 'fbs',
        analyteName: 'Glucose / Fasting Blood Sugar',
        unit: 'mg/dL',
        targetMean: 95.0,
        targetSd: 3.5,
        targetCv: 3.68,
        measuredMean: 95.4,
        measuredSd: 3.4,
        measuredCv: 3.56,
        biasPercent: 0.42,
        teaPercent: 10.0,
        totalRuns: 30,
        acceptedRuns: 29,
        warningRuns: 1,
        rejectedRuns: 0,
        status: 'PASSED'
      }
    ],
    sessionUser: adminUser
  });
  assert.ok(monthlyQcHtml.includes('size: letter portrait'), 'Monthly QC must enforce portrait letter size');
  assert.ok(monthlyQcHtml.includes('DOH AO 2020-0035') || monthlyQcHtml.includes('INTERNAL QC') || monthlyQcHtml.includes('Internal QC'), 'Must reference Internal QC standards');
  console.log('  ✓ 4.5 Monthly Multi-Analyte QC Consolidated report verified');

  // 4.6 NEQAS EQA Proficiency Testing Certificate Print View
  const neqasPrintHtml = renderView('equipment/print_neqas', {
    title: 'NEQAS Proficiency Testing Evaluation Certificate',
    record: neqas,
    equipment: chemAnalyzer,
    sessionUser: adminUser
  });
  assert.ok(neqasPrintHtml.includes('NEQAS') || neqasPrintHtml.includes('Proficiency Testing'), 'NEQAS print certificate rendered');
  console.log('  ✓ 4.6 NEQAS EQA Proficiency Testing Certificate print view verified');

  console.log('\n========================================================================');
  console.log('🎉 ALL INTENSIVE TESTS PASSED: INVENTORY, REAGENT & EQUIPMENT (100%)');
  console.log('========================================================================\n');
}

runIntensiveInventoryEquipmentSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ INTENSIVE SUITE FAILURE:', err);
    process.exit(1);
  });
