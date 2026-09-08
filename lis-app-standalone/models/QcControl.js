const { v4: uuidv4 } = require('uuid');

/**
 * Standard Clinical Chemistry Analytes Default Directory
 * Matches the laboratory's blood chemistry panel specifications (21 official analytes)
 */
const DEFAULT_CHEMISTRY_ANALYTES = [
  // 1. Glycemic Control & Blood Sugar
  { analyteCode: 'fbs', analyteName: 'Glucose / Fasting Blood Sugar (FBS)', unit: 'mg/dL', targetMean: 95.0, targetSd: 3.5, teaPercent: 10.0, category: 'Glycemic', aliases: ['fbs', 'glucose'] },
  { analyteCode: 'rbs', analyteName: 'Random Blood Sugar (RBS)', unit: 'mg/dL', targetMean: 105.0, targetSd: 4.0, teaPercent: 10.0, category: 'Glycemic', aliases: ['rbs'] },
  { analyteCode: 'firstHour', analyteName: '1st Hour (OGTT)', unit: 'mg/dL', targetMean: 115.0, targetSd: 4.5, teaPercent: 10.0, category: 'Glycemic', aliases: ['firstHour', '1sthour', 'first_hour'] },
  { analyteCode: 'secondHour', analyteName: '2nd Hour (OGTT)', unit: 'mg/dL', targetMean: 100.0, targetSd: 4.0, teaPercent: 10.0, category: 'Glycemic', aliases: ['secondHour', '2ndhour', 'second_hour'] },
  { analyteCode: 'hba1c', analyteName: 'Hemoglobin A1c (HbA1c)', unit: '%', targetMean: 5.5, targetSd: 0.20, teaPercent: 6.0, category: 'Glycemic', aliases: ['hba1c', 'hbA1c', 'a1c'] },

  // 2. Lipid Profile
  { analyteCode: 'chol', analyteName: 'Total Cholesterol', unit: 'mg/dL', targetMean: 150.0, targetSd: 6.0, teaPercent: 10.0, category: 'Lipid', aliases: ['chol', 'cholesterol'] },
  { analyteCode: 'tg', analyteName: 'Triglycerides', unit: 'mg/dL', targetMean: 115.0, targetSd: 5.5, teaPercent: 15.0, category: 'Lipid', aliases: ['tg', 'trig', 'triglycerides'] },
  { analyteCode: 'hdl', analyteName: 'HDL Cholesterol (HDL-C)', unit: 'mg/dL', targetMean: 50.0, targetSd: 2.5, teaPercent: 12.0, category: 'Lipid', aliases: ['hdl', 'hdlc', 'hdl-c'] },
  { analyteCode: 'ldl', analyteName: 'LDL Cholesterol', unit: 'mg/dL', targetMean: 110.0, targetSd: 4.5, teaPercent: 12.0, category: 'Lipid', aliases: ['ldl', 'ldlc', 'ldl-c'] },
  { analyteCode: 'vldl', analyteName: 'VLDL Cholesterol', unit: 'mg/dL', targetMean: 22.0, targetSd: 1.5, teaPercent: 15.0, category: 'Lipid', aliases: ['vldl', 'vldlc', 'vldl-c'] },

  // 3. Renal & Kidney Function
  { analyteCode: 'bun', analyteName: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', targetMean: 14.5, targetSd: 0.85, teaPercent: 12.0, category: 'Renal', aliases: ['bun', 'blood_urea_nitrogen'] },
  { analyteCode: 'crea', analyteName: 'Creatinine', unit: 'mg/dL', targetMean: 1.10, targetSd: 0.05, teaPercent: 10.0, category: 'Renal', aliases: ['crea', 'creatinine'] },
  { analyteCode: 'urea', analyteName: 'Blood Urea', unit: 'mg/dL', targetMean: 28.0, targetSd: 1.8, teaPercent: 15.0, category: 'Renal', aliases: ['urea', 'blood_urea'] },
  { analyteCode: 'uric', analyteName: 'Uric Acid', unit: 'mg/dL', targetMean: 5.20, targetSd: 0.20, teaPercent: 12.0, category: 'Renal', aliases: ['uric', 'uricAcid', 'uric_acid'] },

  // 4. Liver Function & Proteins
  { analyteCode: 'alt', analyteName: 'SGPT / ALT', unit: 'U/L', targetMean: 35.0, targetSd: 2.0, teaPercent: 15.0, category: 'Hepatic', aliases: ['alt', 'sgpt', 'sgpt_alt'] },
  { analyteCode: 'ast', analyteName: 'SGOT / AST', unit: 'U/L', targetMean: 32.0, targetSd: 2.0, teaPercent: 15.0, category: 'Hepatic', aliases: ['ast', 'sgot', 'sgot_ast'] },
  { analyteCode: 'alb', analyteName: 'Albumin (ALB)', unit: 'g/L', targetMean: 4.50, targetSd: 0.22, teaPercent: 8.0, category: 'Hepatic', aliases: ['alb', 'albumin'] },

  // 5. Electrolytes & Minerals
  { analyteCode: 'sodium', analyteName: 'Sodium (Na+)', unit: 'mmol/L', targetMean: 140.0, targetSd: 1.8, teaPercent: 4.0, category: 'Electrolytes', aliases: ['sodium', 'na', 'na+'] },
  { analyteCode: 'potassium', analyteName: 'Potassium (K+)', unit: 'mmol/L', targetMean: 4.20, targetSd: 0.15, teaPercent: 6.0, category: 'Electrolytes', aliases: ['potassium', 'k', 'k+'] },
  { analyteCode: 'chloride', analyteName: 'Chloride (Cl-)', unit: 'mmol/L', targetMean: 102.0, targetSd: 1.8, teaPercent: 5.0, category: 'Electrolytes', aliases: ['chloride', 'cl', 'cl-'] },
  { analyteCode: 'calcium', analyteName: 'Total Calcium (Ca2+)', unit: 'mg/dL', targetMean: 9.40, targetSd: 0.30, teaPercent: 6.0, category: 'Electrolytes', aliases: ['calcium', 'ca', 'ca2+'] }
];

const DEFAULT_CHEMISTRY_ANALYTES_LEVEL2 = [
  // 1. Glycemic Control & Blood Sugar
  { analyteCode: 'fbs', analyteName: 'Glucose / Fasting Blood Sugar (FBS)', unit: 'mg/dL', targetMean: 240.0, targetSd: 8.0, teaPercent: 10.0, category: 'Glycemic', aliases: ['fbs', 'glucose'] },
  { analyteCode: 'rbs', analyteName: 'Random Blood Sugar (RBS)', unit: 'mg/dL', targetMean: 260.0, targetSd: 9.0, teaPercent: 10.0, category: 'Glycemic', aliases: ['rbs'] },
  { analyteCode: 'firstHour', analyteName: '1st Hour (OGTT)', unit: 'mg/dL', targetMean: 220.0, targetSd: 8.0, teaPercent: 10.0, category: 'Glycemic', aliases: ['firstHour', '1sthour', 'first_hour'] },
  { analyteCode: 'secondHour', analyteName: '2nd Hour (OGTT)', unit: 'mg/dL', targetMean: 200.0, targetSd: 7.5, teaPercent: 10.0, category: 'Glycemic', aliases: ['secondHour', '2ndhour', 'second_hour'] },
  { analyteCode: 'hba1c', analyteName: 'Hemoglobin A1c (HbA1c)', unit: '%', targetMean: 9.2, targetSd: 0.35, teaPercent: 6.0, category: 'Glycemic', aliases: ['hba1c', 'hbA1c', 'a1c'] },

  // 2. Lipid Profile
  { analyteCode: 'chol', analyteName: 'Total Cholesterol', unit: 'mg/dL', targetMean: 260.0, targetSd: 10.0, teaPercent: 10.0, category: 'Lipid', aliases: ['chol', 'cholesterol'] },
  { analyteCode: 'tg', analyteName: 'Triglycerides', unit: 'mg/dL', targetMean: 225.0, targetSd: 9.0, teaPercent: 15.0, category: 'Lipid', aliases: ['tg', 'trig', 'triglycerides'] },
  { analyteCode: 'hdl', analyteName: 'HDL Cholesterol (HDL-C)', unit: 'mg/dL', targetMean: 30.0, targetSd: 1.8, teaPercent: 12.0, category: 'Lipid', aliases: ['hdl', 'hdlc', 'hdl-c'] },
  { analyteCode: 'ldl', analyteName: 'LDL Cholesterol', unit: 'mg/dL', targetMean: 185.0, targetSd: 7.0, teaPercent: 12.0, category: 'Lipid', aliases: ['ldl', 'ldlc', 'ldl-c'] },
  { analyteCode: 'vldl', analyteName: 'VLDL Cholesterol', unit: 'mg/dL', targetMean: 45.0, targetSd: 3.0, teaPercent: 15.0, category: 'Lipid', aliases: ['vldl', 'vldlc', 'vldl-c'] },

  // 3. Renal & Kidney Function
  { analyteCode: 'bun', analyteName: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', targetMean: 45.0, targetSd: 2.2, teaPercent: 12.0, category: 'Renal', aliases: ['bun', 'blood_urea_nitrogen'] },
  { analyteCode: 'crea', analyteName: 'Creatinine', unit: 'mg/dL', targetMean: 4.50, targetSd: 0.18, teaPercent: 10.0, category: 'Renal', aliases: ['crea', 'creatinine'] },
  { analyteCode: 'urea', analyteName: 'Blood Urea', unit: 'mg/dL', targetMean: 85.0, targetSd: 4.5, teaPercent: 15.0, category: 'Renal', aliases: ['urea', 'blood_urea'] },
  { analyteCode: 'uric', analyteName: 'Uric Acid', unit: 'mg/dL', targetMean: 9.80, targetSd: 0.45, teaPercent: 12.0, category: 'Renal', aliases: ['uric', 'uricAcid', 'uric_acid'] },

  // 4. Liver Function & Proteins
  { analyteCode: 'alt', analyteName: 'SGPT / ALT', unit: 'U/L', targetMean: 125.0, targetSd: 6.0, teaPercent: 15.0, category: 'Hepatic', aliases: ['alt', 'sgpt', 'sgpt_alt'] },
  { analyteCode: 'ast', analyteName: 'SGOT / AST', unit: 'U/L', targetMean: 110.0, targetSd: 5.5, teaPercent: 15.0, category: 'Hepatic', aliases: ['ast', 'sgot', 'sgot_ast'] },
  { analyteCode: 'alb', analyteName: 'Albumin (ALB)', unit: 'g/L', targetMean: 2.50, targetSd: 0.15, teaPercent: 8.0, category: 'Hepatic', aliases: ['alb', 'albumin'] },

  // 5. Electrolytes & Minerals
  { analyteCode: 'sodium', analyteName: 'Sodium (Na+)', unit: 'mmol/L', targetMean: 158.0, targetSd: 2.2, teaPercent: 4.0, category: 'Electrolytes', aliases: ['sodium', 'na', 'na+'] },
  { analyteCode: 'potassium', analyteName: 'Potassium (K+)', unit: 'mmol/L', targetMean: 6.50, targetSd: 0.22, teaPercent: 6.0, category: 'Electrolytes', aliases: ['potassium', 'k', 'k+'] },
  { analyteCode: 'chloride', analyteName: 'Chloride (Cl-)', unit: 'mmol/L', targetMean: 118.0, targetSd: 2.2, teaPercent: 5.0, category: 'Electrolytes', aliases: ['chloride', 'cl', 'cl-'] },
  { analyteCode: 'calcium', analyteName: 'Total Calcium (Ca2+)', unit: 'mg/dL', targetMean: 13.0, targetSd: 0.45, teaPercent: 6.0, category: 'Electrolytes', aliases: ['calcium', 'ca', 'ca2+'] }
];

/**
 * Common synonyms and bidirectional alias groupings for laboratory analytes
 */
const ANALYTE_ALIASES = {
  fbs: ['fbs', 'glucose', 'fasting_blood_sugar'],
  glucose: ['fbs', 'glucose', 'fasting_blood_sugar'],
  rbs: ['rbs', 'random_blood_sugar'],
  firsthour: ['firsthour', 'first_hour', '1sthour', '1st_hour', 'ogtt_1'],
  '1sthour': ['firsthour', 'first_hour', '1sthour', '1st_hour', 'ogtt_1'],
  secondhour: ['secondhour', 'second_hour', '2ndhour', '2nd_hour', 'ogtt_2'],
  '2ndhour': ['secondhour', 'second_hour', '2ndhour', '2nd_hour', 'ogtt_2'],
  hba1c: ['hba1c', 'hb_a1c', 'a1c'],
  chol: ['chol', 'cholesterol', 'total_cholesterol'],
  cholesterol: ['chol', 'cholesterol', 'total_cholesterol'],
  tg: ['tg', 'trig', 'triglyceride', 'triglycerides'],
  trig: ['tg', 'trig', 'triglyceride', 'triglycerides'],
  hdl: ['hdl', 'hdlc', 'hdl-c', 'hdl_c'],
  ldl: ['ldl', 'ldlc', 'ldl-c', 'ldl_c'],
  vldl: ['vldl', 'vldlc', 'vldl-c', 'vldl_c'],
  bun: ['bun', 'blood_urea_nitrogen'],
  crea: ['crea', 'creatinine'],
  creatinine: ['crea', 'creatinine'],
  urea: ['urea', 'blood_urea'],
  uric: ['uric', 'uricacid', 'uric_acid'],
  uricacid: ['uric', 'uricacid', 'uric_acid'],
  alt: ['alt', 'sgpt', 'sgpt_alt', 'alanine_aminotransferase'],
  sgpt: ['alt', 'sgpt', 'sgpt_alt', 'alanine_aminotransferase'],
  ast: ['ast', 'sgot', 'sgot_ast', 'aspartate_aminotransferase'],
  sgot: ['ast', 'sgot', 'sgot_ast', 'aspartate_aminotransferase'],
  alb: ['alb', 'albumin'],
  albumin: ['alb', 'albumin'],
  sodium: ['sodium', 'na', 'na+'],
  na: ['sodium', 'na', 'na+'],
  potassium: ['potassium', 'k', 'k+'],
  k: ['potassium', 'k', 'k+'],
  chloride: ['chloride', 'cl', 'cl-'],
  cl: ['chloride', 'cl', 'cl-'],
  calcium: ['calcium', 'ca', 'ca2+'],
  ca: ['calcium', 'ca', 'ca2+']
};

function normalizeCode(code) {
  return String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function areAnalyteAliases(codeA, codeB) {
  const normA = normalizeCode(codeA);
  const normB = normalizeCode(codeB);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  const listA = ANALYTE_ALIASES[normA] || [];
  if (listA.some(x => normalizeCode(x) === normB)) return true;
  const listB = ANALYTE_ALIASES[normB] || [];
  if (listB.some(x => normalizeCode(x) === normA)) return true;
  return false;
}

function getAnalyteAliases(code) {
  const norm = normalizeCode(code);
  const direct = ANALYTE_ALIASES[norm] || [];
  const set = new Set([code, norm, ...direct]);
  return Array.from(set);
}

/**
 * QcControl Model
 * Represents a Quality Control standard material / lot used to calibrate and monitor instruments.
 */
class QcControl {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.equipmentId = data.equipmentId || '';
    this.controlName = data.controlName || '';
    this.manufacturer = data.manufacturer || 'Bio-Rad';
    this.lotNumber = data.lotNumber || '';
    this.level = data.level || 'Level 1 (Normal)'; // Level 1 (Normal), Level 2 (High / Pathological), Level 3 (Low)
    this.expirationDate = data.expirationDate ? new Date(data.expirationDate).toISOString() : null;
    this.openVialExpirationDate = data.openVialExpirationDate ? new Date(data.openVialExpirationDate).toISOString() : null;
    this.storageCondition = data.storageCondition || '2-8°C Refrigerated';
    this.isActive = data.isActive !== false && data.isActive !== 0 && data.isActive !== '0';
    
    // Analytes mapped on this control lot
    this.analytes = Array.isArray(data.analytes) && data.analytes.length > 0
      ? data.analytes.map(a => ({
          analyteCode: a.analyteCode || a.code || '',
          analyteName: a.analyteName || a.name || a.analyteCode || '',
          unit: a.unit || 'mg/dL',
          targetMean: Number(a.targetMean) || 0,
          targetSd: Number(a.targetSd) || 1,
          teaPercent: Number(a.teaPercent) || 10.0,
          category: a.category || ''
        }))
      : [];

    this.notes = data.notes || '';
    this.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString();
    this.createdBy = data.createdBy || 'System';
  }

  getAnalyte(code) {
    if (!code) return null;
    const clean = String(code).trim();
    const cleanLower = clean.toLowerCase();

    // 1. Direct exact or case-insensitive match on analyteCode
    let found = this.analytes.find(a => (a.analyteCode || '').toLowerCase() === cleanLower);
    if (found) return found;

    // 2. Alias resolution
    found = this.analytes.find(a => areAnalyteAliases(a.analyteCode, clean));
    if (found) return found;

    // 3. Substring match in analyteName fallback
    const normClean = normalizeCode(clean);
    if (normClean.length >= 2) {
      found = this.analytes.find(a => normalizeCode(a.analyteName).includes(normClean));
      if (found) return found;
    }

    return null;
  }

  get isExpired() {
    if (!this.expirationDate) return false;
    return new Date(this.expirationDate).getTime() < Date.now();
  }

  get daysUntilExpiration() {
    if (!this.expirationDate) return null;
    const diff = new Date(this.expirationDate).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}

module.exports = {
  QcControl,
  DEFAULT_CHEMISTRY_ANALYTES,
  DEFAULT_CHEMISTRY_ANALYTES_LEVEL2,
  ANALYTE_ALIASES,
  areAnalyteAliases,
  getAnalyteAliases
};
