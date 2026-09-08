const path = require('path');
const { initDb } = require('../lis-fullstack/lib/sqliteDb');
const DATA_DIR = require('../lis-fullstack/lib/dataPath').getDataDir();

const BLOOD_CHEM_ANALYTES_L1 = [
  { analyteCode: 'fbs', analyteName: 'Glucose / Fasting Blood Sugar (FBS)', unit: 'mg/dL', targetMean: 95.0, targetSd: 3.5, teaPercent: 10.0, category: 'Glycemic' },
  { analyteCode: 'rbs', analyteName: 'Random Blood Sugar (RBS)', unit: 'mg/dL', targetMean: 105.0, targetSd: 4.0, teaPercent: 10.0, category: 'Glycemic' },
  { analyteCode: 'firstHour', analyteName: '1st Hour (OGTT)', unit: 'mg/dL', targetMean: 115.0, targetSd: 4.5, teaPercent: 10.0, category: 'Glycemic' },
  { analyteCode: 'secondHour', analyteName: '2nd Hour (OGTT)', unit: 'mg/dL', targetMean: 100.0, targetSd: 4.0, teaPercent: 10.0, category: 'Glycemic' },
  { analyteCode: 'hba1c', analyteName: 'Hemoglobin A1c (HbA1c)', unit: '%', targetMean: 5.5, targetSd: 0.20, teaPercent: 6.0, category: 'Glycemic' },
  { analyteCode: 'chol', analyteName: 'Total Cholesterol', unit: 'mg/dL', targetMean: 150.0, targetSd: 6.0, teaPercent: 10.0, category: 'Lipid' },
  { analyteCode: 'tg', analyteName: 'Triglycerides', unit: 'mg/dL', targetMean: 115.0, targetSd: 5.5, teaPercent: 15.0, category: 'Lipid' },
  { analyteCode: 'hdl', analyteName: 'HDL Cholesterol (HDL-C)', unit: 'mg/dL', targetMean: 50.0, targetSd: 2.5, teaPercent: 12.0, category: 'Lipid' },
  { analyteCode: 'ldl', analyteName: 'LDL Cholesterol', unit: 'mg/dL', targetMean: 110.0, targetSd: 4.5, teaPercent: 12.0, category: 'Lipid' },
  { analyteCode: 'vldl', analyteName: 'VLDL Cholesterol', unit: 'mg/dL', targetMean: 22.0, targetSd: 1.5, teaPercent: 15.0, category: 'Lipid' },
  { analyteCode: 'bun', analyteName: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', targetMean: 14.5, targetSd: 0.85, teaPercent: 12.0, category: 'Renal' },
  { analyteCode: 'crea', analyteName: 'Creatinine', unit: 'mg/dL', targetMean: 1.10, targetSd: 0.05, teaPercent: 10.0, category: 'Renal' },
  { analyteCode: 'urea', analyteName: 'Blood Urea', unit: 'mg/dL', targetMean: 28.0, targetSd: 1.8, teaPercent: 15.0, category: 'Renal' },
  { analyteCode: 'uric', analyteName: 'Uric Acid', unit: 'mg/dL', targetMean: 5.20, targetSd: 0.20, teaPercent: 12.0, category: 'Renal' },
  { analyteCode: 'alt', analyteName: 'SGPT / ALT', unit: 'U/L', targetMean: 35.0, targetSd: 2.0, teaPercent: 15.0, category: 'Hepatic' },
  { analyteCode: 'ast', analyteName: 'SGOT / AST', unit: 'U/L', targetMean: 32.0, targetSd: 2.0, teaPercent: 15.0, category: 'Hepatic' },
  { analyteCode: 'alb', analyteName: 'Albumin (ALB)', unit: 'g/L', targetMean: 4.50, targetSd: 0.22, teaPercent: 8.0, category: 'Hepatic' },
  { analyteCode: 'sodium', analyteName: 'Sodium (Na+)', unit: 'mmol/L', targetMean: 140.0, targetSd: 1.8, teaPercent: 4.0, category: 'Electrolytes' },
  { analyteCode: 'potassium', analyteName: 'Potassium (K+)', unit: 'mmol/L', targetMean: 4.20, targetSd: 0.15, teaPercent: 6.0, category: 'Electrolytes' },
  { analyteCode: 'chloride', analyteName: 'Chloride (Cl-)', unit: 'mmol/L', targetMean: 102.0, targetSd: 1.8, teaPercent: 5.0, category: 'Electrolytes' },
  { analyteCode: 'calcium', analyteName: 'Total Calcium (Ca2+)', unit: 'mg/dL', targetMean: 9.40, targetSd: 0.30, teaPercent: 6.0, category: 'Electrolytes' }
];

const BLOOD_CHEM_ANALYTES_L2 = [
  { analyteCode: 'fbs', analyteName: 'Glucose / Fasting Blood Sugar (FBS)', unit: 'mg/dL', targetMean: 240.0, targetSd: 8.0, teaPercent: 10.0, category: 'Glycemic' },
  { analyteCode: 'rbs', analyteName: 'Random Blood Sugar (RBS)', unit: 'mg/dL', targetMean: 260.0, targetSd: 9.0, teaPercent: 10.0, category: 'Glycemic' },
  { analyteCode: 'firstHour', analyteName: '1st Hour (OGTT)', unit: 'mg/dL', targetMean: 220.0, targetSd: 8.0, teaPercent: 10.0, category: 'Glycemic' },
  { analyteCode: 'secondHour', analyteName: '2nd Hour (OGTT)', unit: 'mg/dL', targetMean: 200.0, targetSd: 7.5, teaPercent: 10.0, category: 'Glycemic' },
  { analyteCode: 'hba1c', analyteName: 'Hemoglobin A1c (HbA1c)', unit: '%', targetMean: 9.2, targetSd: 0.35, teaPercent: 6.0, category: 'Glycemic' },
  { analyteCode: 'chol', analyteName: 'Total Cholesterol', unit: 'mg/dL', targetMean: 260.0, targetSd: 10.0, teaPercent: 10.0, category: 'Lipid' },
  { analyteCode: 'tg', analyteName: 'Triglycerides', unit: 'mg/dL', targetMean: 225.0, targetSd: 9.0, teaPercent: 15.0, category: 'Lipid' },
  { analyteCode: 'hdl', analyteName: 'HDL Cholesterol (HDL-C)', unit: 'mg/dL', targetMean: 30.0, targetSd: 1.8, teaPercent: 12.0, category: 'Lipid' },
  { analyteCode: 'ldl', analyteName: 'LDL Cholesterol', unit: 'mg/dL', targetMean: 185.0, targetSd: 7.0, teaPercent: 12.0, category: 'Lipid' },
  { analyteCode: 'vldl', analyteName: 'VLDL Cholesterol', unit: 'mg/dL', targetMean: 45.0, targetSd: 3.0, teaPercent: 15.0, category: 'Lipid' },
  { analyteCode: 'bun', analyteName: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', targetMean: 45.0, targetSd: 2.2, teaPercent: 12.0, category: 'Renal' },
  { analyteCode: 'crea', analyteName: 'Creatinine', unit: 'mg/dL', targetMean: 4.50, targetSd: 0.18, teaPercent: 10.0, category: 'Renal' },
  { analyteCode: 'urea', analyteName: 'Blood Urea', unit: 'mg/dL', targetMean: 85.0, targetSd: 4.5, teaPercent: 15.0, category: 'Renal' },
  { analyteCode: 'uric', analyteName: 'Uric Acid', unit: 'mg/dL', targetMean: 9.80, targetSd: 0.45, teaPercent: 12.0, category: 'Renal' },
  { analyteCode: 'alt', analyteName: 'SGPT / ALT', unit: 'U/L', targetMean: 125.0, targetSd: 6.0, teaPercent: 15.0, category: 'Hepatic' },
  { analyteCode: 'ast', analyteName: 'SGOT / AST', unit: 'U/L', targetMean: 110.0, targetSd: 5.5, teaPercent: 15.0, category: 'Hepatic' },
  { analyteCode: 'alb', analyteName: 'Albumin (ALB)', unit: 'g/L', targetMean: 2.50, targetSd: 0.15, teaPercent: 8.0, category: 'Hepatic' },
  { analyteCode: 'sodium', analyteName: 'Sodium (Na+)', unit: 'mmol/L', targetMean: 158.0, targetSd: 2.2, teaPercent: 4.0, category: 'Electrolytes' },
  { analyteCode: 'potassium', analyteName: 'Potassium (K+)', unit: 'mmol/L', targetMean: 6.50, targetSd: 0.22, teaPercent: 6.0, category: 'Electrolytes' },
  { analyteCode: 'chloride', analyteName: 'Chloride (Cl-)', unit: 'mmol/L', targetMean: 118.0, targetSd: 2.2, teaPercent: 5.0, category: 'Electrolytes' },
  { analyteCode: 'calcium', analyteName: 'Total Calcium (Ca2+)', unit: 'mg/dL', targetMean: 13.0, targetSd: 0.45, teaPercent: 6.0, category: 'Electrolytes' }
];

async function migrate() {
  const dbPath = path.join(DATA_DIR, 'lis-data.db');
  const db = await initDb(dbPath);

  const eqId = 'cc2c0b6e-eee1-4cd5-9a6b-02274cd90740'; // Mindray BS-240
  const controls = db.getQcControls(eqId) || [];
  console.log(`Found ${controls.length} controls for Mindray BS-240.`);

  for (const ctrl of controls) {
    const isLevel2 = String(ctrl.level || '').includes('2') || String(ctrl.controlName || '').includes('Level 2');
    const sourceAnalytes = isLevel2 ? BLOOD_CHEM_ANALYTES_L2 : BLOOD_CHEM_ANALYTES_L1;
    
    if (!Array.isArray(ctrl.analytes)) ctrl.analytes = [];
    
    // Check existing analyte codes
    const existingCodes = new Set(ctrl.analytes.map(a => a.analyteCode.toLowerCase()));

    let addedCount = 0;
    for (const item of sourceAnalytes) {
      if (!existingCodes.has(item.analyteCode.toLowerCase())) {
        ctrl.analytes.push({ ...item });
        existingCodes.add(item.analyteCode.toLowerCase());
        addedCount++;
      }
    }

    ctrl.updatedAt = new Date().toISOString();
    db.saveQcControl(ctrl);
    console.log(`Updated Control "${ctrl.controlName}" (${ctrl.id}): added ${addedCount} analytes. Total now: ${ctrl.analytes.length}`);
  }

  // Also check Medica EasyLyte Plus Electrolyte Analyzer (f82dd370-13f3-4adc-b9e8-7c093adbe686)
  // If it has 0 controls, create an Electrolyte control with Na, K, Cl!
  const easyLyteId = 'f82dd370-13f3-4adc-b9e8-7c093adbe686';
  const easyLyteControls = db.getQcControls(easyLyteId) || [];
  if (easyLyteControls.length === 0) {
    const easyLyteCtrl = {
      id: require('crypto').randomUUID(),
      equipmentId: easyLyteId,
      controlName: 'Medica EasyQC Electrolyte Tri-Level Control Level 1',
      lotNumber: 'LOT-ELEC-2026-N1',
      level: 'Level 1 (Normal)',
      expirationDate: new Date(Date.now() + 365*24*60*60*1000).toISOString(),
      isActive: true,
      analytes: [
        { analyteCode: 'sodium', analyteName: 'Sodium (Na+)', unit: 'mmol/L', targetMean: 140.0, targetSd: 1.8, teaPercent: 4.0 },
        { analyteCode: 'potassium', analyteName: 'Potassium (K+)', unit: 'mmol/L', targetMean: 4.20, targetSd: 0.15, teaPercent: 6.0 },
        { analyteCode: 'chloride', analyteName: 'Chloride (Cl-)', unit: 'mmol/L', targetMean: 102.0, targetSd: 1.8, teaPercent: 5.0 }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'System'
    };
    db.saveQcControl(easyLyteCtrl);
    console.log(`Created default Electrolyte control for EasyLyte Analyzer.`);
  }

  // Also check Sysmex XN-550 (561d5c17-d5a1-4a96-811d-03b4c5c554e0)
  const sysmexId = '561d5c17-d5a1-4a96-811d-03b4c5c554e0';
  const sysmexControls = db.getQcControls(sysmexId) || [];
  if (sysmexControls.length === 0) {
    const sysmexCtrl = {
      id: require('crypto').randomUUID(),
      equipmentId: sysmexId,
      controlName: 'Sysmex e-CHECK Hematology Control Level 1 (Normal)',
      lotNumber: 'LOT-HEMA-2026-N1',
      level: 'Level 1 (Normal)',
      expirationDate: new Date(Date.now() + 180*24*60*60*1000).toISOString(),
      isActive: true,
      analytes: [
        { analyteCode: 'wbc', analyteName: 'White Blood Cells (WBC)', unit: '10^3/uL', targetMean: 7.50, targetSd: 0.40, teaPercent: 15.0 },
        { analyteCode: 'rbc', analyteName: 'Red Blood Cells (RBC)', unit: '10^6/uL', targetMean: 4.60, targetSd: 0.15, teaPercent: 6.0 },
        { analyteCode: 'hgb', analyteName: 'Hemoglobin (HGB)', unit: 'g/dL', targetMean: 14.0, targetSd: 0.50, teaPercent: 7.0 },
        { analyteCode: 'hct', analyteName: 'Hematocrit (HCT)', unit: '%', targetMean: 42.0, targetSd: 1.5, teaPercent: 6.0 },
        { analyteCode: 'plt', analyteName: 'Platelet Count (PLT)', unit: '10^3/uL', targetMean: 250, targetSd: 15.0, teaPercent: 25.0 }
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: 'System'
    };
    db.saveQcControl(sysmexCtrl);
    console.log(`Created default Hematology control for Sysmex XN-550.`);
  }

  // Also check Diagnostica Stago (053f69c1-9cf1-4095-8d3d-815735b71088)
  const stagoId = '053f69c1-9cf1-4095-8d3d-815735b71088';
  const stagoControls = db.getQcControls(stagoId) || [];
  if (stagoControls.length > 0 && stagoControls[0].controlName.includes('Chemistry')) {
    // Correct it to Coagulation Control
    const ctrl = stagoControls[0];
    ctrl.controlName = 'Stago Coag Control N (Normal Control Plasma)';
    ctrl.lotNumber = 'LOT-COAG-2026-N1';
    ctrl.analytes = [
      { analyteCode: 'pt', analyteName: 'Prothrombin Time (PT)', unit: 'seconds', targetMean: 12.5, targetSd: 0.60, teaPercent: 15.0 },
      { analyteCode: 'inr', analyteName: 'International Normalized Ratio (INR)', unit: 'INR', targetMean: 1.05, targetSd: 0.05, teaPercent: 15.0 },
      { analyteCode: 'aptt', analyteName: 'Activated Partial Thromboplastin Time (APTT)', unit: 'seconds', targetMean: 31.0, targetSd: 1.5, teaPercent: 15.0 }
    ];
    db.saveQcControl(ctrl);
    console.log(`Corrected Stago Coagulation controls.`);
  }

  db.close();
  console.log('Migration completed successfully!');
}

migrate().catch(console.error);
