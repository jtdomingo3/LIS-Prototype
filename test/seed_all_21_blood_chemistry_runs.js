const path = require('path');
const { dataFile } = require('../lis-fullstack/lib/dataPath');
const { createDb } = require('../lis-fullstack/lib/sqliteDb');
const { QcControl } = require('../lis-fullstack/models/QcControl');
const QcEntry = require('../lis-fullstack/models/QcEntry');
const { evaluateWestgardRules } = require('../lis-fullstack/lib/leveyJenningsService');

async function seedAllAnalytes() {
  const dbFile = dataFile('lis-data.db');
  console.log('Opening database:', dbFile);
  const db = createDb(dbFile);

  const eqId = 'cc2c0b6e-eee1-4cd5-9a6b-02274cd90740'; // Mindray BS-240
  const controls = db.getQcControls(eqId) || [];
  console.log(`Found ${controls.length} controls for Mindray BS-240.`);

  // 1. Correct Control Records
  let ctrlL1 = controls.find(c => c.id === 'b2adef91-3b27-46ee-9bd0-745800f0a494');
  let ctrlL2 = controls.find(c => c.id === '23cac19e-23c2-4464-994d-32d0fbad5405');

  if (ctrlL2) {
    ctrlL2.controlName = 'Bio-Rad Lyphochek Assayed Chemistry Control Level 2 (Pathological / High)';
    ctrlL2.lotNumber = 'LOT-BR-2026-H2';
    ctrlL2.level = 'Level 2 (High)';
    ctrlL2.updatedAt = new Date().toISOString();
    db.saveQcControl(ctrlL2);
    console.log('✓ Fixed Level 2 Control metadata (LOT-BR-2026-H2).');
  }

  if (!ctrlL1) {
    ctrlL1 = controls.find(c => (c.level || '').includes('1')) || controls[0];
  }
  ctrlL1.controlName = 'Bio-Rad Lyphochek Assayed Chemistry Control Level 1 (Normal)';
  ctrlL1.lotNumber = 'LOT-BR-2026-N1';
  ctrlL1.level = 'Level 1 (Normal)';
  ctrlL1.updatedAt = new Date().toISOString();
  db.saveQcControl(ctrlL1);
  console.log(`✓ Level 1 Control active: ${ctrlL1.controlName} (${ctrlL1.lotNumber}, id: ${ctrlL1.id})`);

  // 2. Map of all 21 Blood Chemistry Analytes with Target Mean & SD
  const bloodChemAnalytes = [
    { code: 'fbs', name: 'Glucose / Fasting Blood Sugar (FBS)', unit: 'mg/dL', mean: 95.0, sd: 3.5, tea: 10.0, rgt: 'RGT-GLU-2026-04' },
    { code: 'rbs', name: 'Random Blood Sugar (RBS)', unit: 'mg/dL', mean: 105.0, sd: 4.0, tea: 10.0, rgt: 'RGT-GLU-2026-04' },
    { code: 'firstHour', name: '1st Hour (OGTT)', unit: 'mg/dL', mean: 115.0, sd: 4.5, tea: 10.0, rgt: 'RGT-GLU-2026-04' },
    { code: 'secondHour', name: '2nd Hour (OGTT)', unit: 'mg/dL', mean: 100.0, sd: 4.0, tea: 10.0, rgt: 'RGT-GLU-2026-04' },
    { code: 'hba1c', name: 'Hemoglobin A1c (HbA1c)', unit: '%', mean: 5.5, sd: 0.20, tea: 6.0, rgt: 'RGT-A1C-2026-01' },
    { code: 'chol', name: 'Total Cholesterol (CHOL)', unit: 'mg/dL', mean: 150.0, sd: 6.0, tea: 10.0, rgt: 'RGT-CHOL-2026-02' },
    { code: 'tg', name: 'Triglycerides (TG)', unit: 'mg/dL', mean: 115.0, sd: 5.5, tea: 15.0, rgt: 'RGT-TG-2026-02' },
    { code: 'hdl', name: 'HDL Cholesterol (HDL-C)', unit: 'mg/dL', mean: 50.0, sd: 2.5, tea: 12.0, rgt: 'RGT-HDL-2026-01' },
    { code: 'ldl', name: 'LDL Cholesterol (LDL)', unit: 'mg/dL', mean: 110.0, sd: 4.5, tea: 12.0, rgt: 'RGT-LDL-2026-01' },
    { code: 'vldl', name: 'VLDL Cholesterol (VLDL)', unit: 'mg/dL', mean: 22.0, sd: 1.5, tea: 15.0, rgt: 'RGT-VLDL-2026-01' },
    { code: 'bun', name: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', mean: 14.5, sd: 0.85, tea: 12.0, rgt: 'RGT-BUN-2026-03' },
    { code: 'crea', name: 'Creatinine (CREA)', unit: 'mg/dL', mean: 1.10, sd: 0.05, tea: 10.0, rgt: 'RGT-CREA-2026-03' },
    { code: 'urea', name: 'Blood Urea (UREA)', unit: 'mg/dL', mean: 28.0, sd: 1.8, tea: 15.0, rgt: 'RGT-UREA-2026-02' },
    { code: 'uric', name: 'Uric Acid (URIC)', unit: 'mg/dL', mean: 5.20, sd: 0.20, tea: 12.0, rgt: 'RGT-URIC-2026-02' },
    { code: 'alt', name: 'SGPT / ALT', unit: 'U/L', mean: 35.0, sd: 2.0, tea: 15.0, rgt: 'RGT-ALT-2026-02' },
    { code: 'ast', name: 'SGOT / AST', unit: 'U/L', mean: 32.0, sd: 2.0, tea: 15.0, rgt: 'RGT-AST-2026-02' },
    { code: 'alb', name: 'Albumin (ALB)', unit: 'g/L', mean: 4.50, sd: 0.22, tea: 8.0, rgt: 'RGT-ALB-2026-01' },
    { code: 'sodium', name: 'Sodium (Na+)', unit: 'mmol/L', mean: 140.0, sd: 1.8, tea: 4.0, rgt: 'RGT-NA-2026-01' },
    { code: 'potassium', name: 'Potassium (K+)', unit: 'mmol/L', mean: 4.20, sd: 0.15, tea: 6.0, rgt: 'RGT-K-2026-01' },
    { code: 'chloride', name: 'Chloride (Cl-)', unit: 'mmol/L', mean: 102.0, sd: 1.8, tea: 5.0, rgt: 'RGT-CL-2026-01' },
    { code: 'calcium', name: 'Total Calcium (Ca2+)', unit: 'mg/dL', mean: 9.40, sd: 0.30, tea: 6.0, rgt: 'RGT-CA-2026-01' }
  ];

  // Update analytes array in ctrlL1 so it has clean updated names
  ctrlL1.analytes = bloodChemAnalytes.map(a => ({
    analyteCode: a.code,
    analyteName: a.name,
    unit: a.unit,
    targetMean: a.mean,
    targetSd: a.sd,
    teaPercent: a.tea
  }));
  db.saveQcControl(ctrlL1);
  console.log('✓ Updated Level 1 Control analytes list with clean names.');

  // Check existing entries
  const existingEntries = db.getQcEntries(eqId) || [];
  console.log(`Current total QC entries for Mindray BS-240: ${existingEntries.length}`);

  // Base dates: 25 days up to today (Sept 8, 2026)
  const now = new Date('2026-09-08T12:00:00.000Z');
  const daysAgo = (d) => new Date(now.getTime() - (d * 24 * 60 * 60 * 1000)).toISOString();

  // Pseudo-random Gaussian offset helper for realistic in-control clinical variation
  // Deterministic seed offsets for consistent repeatable data
  const offsets = [
    -0.12, 0.25, -0.35, 0.18, -0.05, 0.42, -0.28, 0.10, -0.45, 0.32,
    2.15, // Day 11 warning (1:2s rule violation demonstration)
    -0.15, 0.08, -0.22, 0.30, -0.18, 0.05, -0.32, 0.28, -0.10,
    0.15, -0.08, 0.22, -0.14, 0.02
  ];

  let totalSeeded = 0;
  for (const a of bloodChemAnalytes) {
    // Check if entries already exist for this analyte
    const currentForAnalyte = existingEntries.filter(e => e.analyteCode === a.code || e.analyteCode === a.code.toLowerCase());
    
    if (currentForAnalyte.length >= 20) {
      // Just update analyteName to clean updated name if needed
      for (const ent of currentForAnalyte) {
        if (ent.analyteName !== a.name) {
          ent.analyteName = a.name;
          ent.controlId = ctrlL1.id;
          db.saveQcEntry(ent);
        }
      }
      console.log(`  - [${a.code}] already has ${currentForAnalyte.length} runs. Updated names.`);
      continue;
    }

    // Generate 25 daily runs
    const historyEntries = [];
    for (let dayIdx = 24; dayIdx >= 0; dayIdx--) {
      const runDate = daysAgo(dayIdx);
      const zSim = offsets[24 - dayIdx] || 0;
      let rawVal = a.mean + (zSim * a.sd);

      // Format decimal precision realistically
      if (a.sd < 0.1) rawVal = Number(rawVal.toFixed(3));
      else if (a.sd < 1.0) rawVal = Number(rawVal.toFixed(2));
      else rawVal = Number(rawVal.toFixed(1));

      const evaluation = evaluateWestgardRules(
        { measuredValue: rawVal, targetMean: a.mean, targetSd: a.sd },
        historyEntries
      );

      const entry = new QcEntry({
        equipmentId: eqId,
        controlId: ctrlL1.id,
        controlLot: ctrlL1.lotNumber,
        controlLevel: ctrlL1.level,
        analyteCode: a.code,
        analyteName: a.name,
        unit: a.unit,
        runDate,
        runNumber: 1,
        measuredValue: rawVal,
        targetMean: a.mean,
        targetSd: a.sd,
        status: evaluation.status,
        rulesViolated: evaluation.rulesViolated,
        violationType: evaluation.violationType,
        reagentLotNumber: a.rgt,
        operatorName: (dayIdx % 2 === 0) ? 'J. Domingo, RMT' : 'M. Santos, RMT',
        notes: (evaluation.status === 'WARNING')
          ? `1:2s Warning (Z = ${evaluation.zScore}). Standard within acceptable clinical limits.`
          : 'Routine morning daily QC calibration check. In-control.'
      });

      db.saveQcEntry(entry);
      historyEntries.push(entry);
      totalSeeded++;
    }
    console.log(`  ✓ Seeded 25 runs for [${a.code}] "${a.name}"`);
  }

  console.log(`\nDone! Total new runs seeded: ${totalSeeded}`);
  const finalEntries = db.getQcEntries(eqId) || [];
  console.log(`Total QC entries for Mindray BS-240 now: ${finalEntries.length}`);
}

seedAllAnalytes().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
