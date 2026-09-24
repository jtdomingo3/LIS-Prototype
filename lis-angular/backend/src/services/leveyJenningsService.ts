/**
 * Levey-Jennings & Statistical Quality Control Engine
 * Compliant with CLSI C24-Ed4, ISO 15189:2022, and Philippine DOH / NEQAS internal QC reporting standards.
 */

export interface WestgardEvaluation {
  status: 'ACCEPTED' | 'WARNING' | 'REJECTED';
  rulesViolated: string[];
  violationType: string;
  zScore: number;
  explanation: string;
}

export interface QcStatistics {
  n: number;
  observedMean: number | null;
  observedSd: number | null;
  cvPercent: number | null;
  biasPercent: number | null;
  totalErrorObserved: number | null;
  teaPercent: number;
  inControl: boolean;
}

export interface LeveyJenningsDataset {
  analyteCode: string;
  analyteName: string;
  unit: string;
  controlName: string;
  lotNumber: string;
  level: string;
  expirationDate: string | null;
  targetMean: number;
  targetSd: number;
  teaPercent: number;
  referenceLines: {
    plus3Sd: number;
    plus2Sd: number;
    plus1Sd: number;
    mean: number;
    minus1Sd: number;
    minus2Sd: number;
    minus3Sd: number;
  };
  points: Array<{
    id: string;
    index: number;
    runDate: string;
    runDateFormatted: string;
    runNumber: number;
    measuredValue: number;
    zScore: number;
    status: string;
    rulesViolated: string[];
    violationType: string;
    operatorName: string;
    reagentLotNumber: string;
    correctiveAction: any;
  }>;
  statistics: QcStatistics;
  equipment: {
    id: string;
    name: string;
    code: string;
    model: string;
  } | null;
}

export interface ChemistryAnalyte {
  analyteCode: string;
  analyteName: string;
  unit: string;
  targetMean: number;
  targetSd: number;
  teaPercent: number;
  category: string;
  aliases: string[];
}

export const DEFAULT_CHEMISTRY_ANALYTES: ChemistryAnalyte[] = [
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

export const DEFAULT_CHEMISTRY_ANALYTES_LEVEL2: ChemistryAnalyte[] = [
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

export const ANALYTE_ALIASES: Record<string, string[]> = {
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

export function normalizeCode(code: string): string {
  return String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function areAnalyteAliases(codeA: string, codeB: string): boolean {
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

export function getAnalyteAliases(code: string): string[] {
  const norm = normalizeCode(code);
  const direct = ANALYTE_ALIASES[norm] || [];
  const set = new Set([code, norm, ...direct]);
  return Array.from(set);
}

/**
 * Evaluates Westgard Multi-Rules for a new QC entry given chronological historical runs.
 */
export function evaluateWestgardRules(
  currentEntry: { measuredValue: number; targetMean: number; targetSd: number },
  history: Array<{ measuredValue: number; zScore?: number }> = []
): WestgardEvaluation {
  const value = Number(currentEntry.measuredValue);
  const mean = Number(currentEntry.targetMean);
  const sd = Number(currentEntry.targetSd) > 0 ? Number(currentEntry.targetSd) : 1;
  const zScore = Number(((value - mean) / sd).toFixed(2));

  const rulesViolated: string[] = [];
  let status: 'ACCEPTED' | 'WARNING' | 'REJECTED' = 'ACCEPTED';
  let violationType = 'None';
  let explanation = 'Measurement within acceptable ±2SD limits.';

  // Gather previous Z-scores (most recent first in zPrev)
  const zPrev = history
    .map(h => Number(h.zScore !== undefined ? h.zScore : ((Number(h.measuredValue) - mean) / sd).toFixed(2)))
    .filter(z => !isNaN(z));

  // All recent Zs including current (index 0 = current, 1 = previous, ...)
  const allZ = [zScore, ...zPrev.slice().reverse()];

  // 1. Check 1_3s (Rejection - Random Error)
  if (Math.abs(zScore) > 3.0) {
    rulesViolated.push('1_3s');
    status = 'REJECTED';
    violationType = 'Random Error';
    explanation = `1_3s Rule Violated: Value (${value}) exceeds 3 standard deviations (Z = ${zScore}). Run must be rejected and investigated.`;
  }

  // 2. Check 2_2s (Rejection - Systematic Error)
  if (allZ.length >= 2) {
    const z0 = allZ[0];
    const z1 = allZ[1];
    if ((z0 > 2.0 && z1 > 2.0) || (z0 < -2.0 && z1 < -2.0)) {
      rulesViolated.push('2_2s');
      status = 'REJECTED';
      violationType = 'Systematic Error';
      explanation = `2_2s Rule Violated: 2 consecutive measurements exceeded 2 standard deviations on the same side (Z0 = ${z0}, Z1 = ${z1}). Indicates systematic error or calibration shift.`;
    }
  }

  // 3. Check R_4s (Rejection - Random Error across consecutive runs)
  if (allZ.length >= 2) {
    const z0 = allZ[0];
    const z1 = allZ[1];
    const range = Math.abs(z0 - z1);
    if (range >= 4.0 || (z0 > 2.0 && z1 < -2.0) || (z0 < -2.0 && z1 > 2.0)) {
      rulesViolated.push('R_4s');
      status = 'REJECTED';
      violationType = 'Random Error';
      explanation = `R_4s Rule Violated: Consecutive measurement range (${range.toFixed(2)} SD) exceeds 4 standard deviations. Indicates severe random error.`;
    }
  }

  // 4. Check 4_1s (Rejection - Systematic Error / Bias)
  if (allZ.length >= 4) {
    const last4 = allZ.slice(0, 4);
    const allHigh = last4.every(z => z > 1.0);
    const allLow = last4.every(z => z < -1.0);
    if (allHigh || allLow) {
      rulesViolated.push('4_1s');
      status = 'REJECTED';
      violationType = 'Systematic Error';
      explanation = `4_1s Rule Violated: 4 consecutive measurements exceeded 1 standard deviation on the same side of the mean. Indicates systematic bias.`;
    }
  }

  // 5. Check 10_x (Rejection - Systematic Shift)
  if (allZ.length >= 10) {
    const last10 = allZ.slice(0, 10);
    const allPositive = last10.every(z => z > 0);
    const allNegative = last10.every(z => z < 0);
    if (allPositive || allNegative) {
      rulesViolated.push('10_x');
      status = 'REJECTED';
      violationType = 'Systematic Error';
      explanation = `10_x Rule Violated: 10 consecutive measurements fell on the same side of the mean. Indicates instrument shift or reagent degradation.`;
    }
  }

  // 6. Check 1_2s (Warning Rule) if no rejection rule was triggered
  if (rulesViolated.length === 0 && Math.abs(zScore) > 2.0) {
    rulesViolated.push('1_2s');
    status = 'WARNING';
    violationType = 'Warning';
    explanation = `1_2s Warning: Measurement exceeds 2 standard deviations (Z = ${zScore}). Inspect other rules and monitor subsequent runs.`;
  }

  return {
    status,
    rulesViolated,
    violationType,
    zScore,
    explanation
  };
}

/**
 * Calculates statistical summary for a series of QC measurements.
 */
export function calculateQcStatistics(
  entries: Array<number | { measuredValue: number; measured_value?: number }> = [],
  targetMean = 0,
  targetSd = 1,
  teaPercent = 10.0
): QcStatistics {
  const nums = entries
    .map(e => (typeof e === 'object' ? Number((e as any).measuredValue || (e as any).measured_value) : Number(e)))
    .filter(n => Number.isFinite(n));
  const n = nums.length;

  if (n === 0) {
    return {
      n: 0,
      observedMean: null,
      observedSd: null,
      cvPercent: null,
      biasPercent: null,
      totalErrorObserved: null,
      teaPercent: Number(teaPercent) || 10.0,
      inControl: true
    };
  }

  const sum = nums.reduce((acc, val) => acc + val, 0);
  const observedMean = Number((sum / n).toFixed(3));

  let observedSd = 0;
  if (n > 1) {
    const variance = nums.reduce((acc, val) => acc + Math.pow(val - observedMean, 2), 0) / (n - 1);
    observedSd = Number(Math.sqrt(variance).toFixed(3));
  }

  // Coefficient of Variation: %CV = (SD / Mean) * 100
  const cvPercent = observedMean > 0 ? Number(((observedSd / observedMean) * 100).toFixed(2)) : 0;

  // Bias % = ((ObservedMean - TargetMean) / TargetMean) * 100
  const biasPercent = targetMean > 0 ? Number((((observedMean - targetMean) / targetMean) * 100).toFixed(2)) : 0;

  // Total Error Observed: TE_obs = |Bias%| + 2 * %CV
  const totalErrorObserved = Number((Math.abs(biasPercent) + (2 * cvPercent)).toFixed(2));

  const tea = Number(teaPercent) || 10.0;
  const inControl = totalErrorObserved <= tea;

  return {
    n,
    observedMean,
    observedSd,
    cvPercent,
    biasPercent,
    totalErrorObserved,
    teaPercent: tea,
    inControl
  };
}

/**
 * Builds ready-to-render Levey-Jennings chart dataset.
 */
export function buildLeveyJenningsDataset(
  control: any,
  analyteCode: string,
  entries: any[] = [],
  options: { startDate?: string; endDate?: string; equipment?: any } = {}
): LeveyJenningsDataset {
  const analytes = typeof control?.analytes === 'string' ? JSON.parse(control.analytes || '[]') : (control?.analytes || []);
  const analyteDef = analytes.find((a: any) =>
    (a.analyteCode || a.analyte_code || '').toLowerCase() === (analyteCode || '').toLowerCase()
  );

  const targetMean = analyteDef ? Number(analyteDef.targetMean || analyteDef.target_mean) : (entries[0] ? Number(entries[0].target_mean || entries[0].targetMean) : 100);
  const targetSd = analyteDef ? Number(analyteDef.targetSd || analyteDef.target_sd) : (entries[0] ? Number(entries[0].target_sd || entries[0].targetSd) : 5);
  const teaPercent = analyteDef ? Number(analyteDef.teaPercent || analyteDef.tea_percent) : 10.0;
  const unit = analyteDef ? (analyteDef.unit || '') : (entries[0] ? (entries[0].unit || 'mg/dL') : 'mg/dL');
  const analyteName = analyteDef ? (analyteDef.analyteName || analyteDef.analyte_name) : (entries[0] ? (entries[0].analyte_name || entries[0].analyteName) : analyteCode);

  // Standard Levey-Jennings horizontal reference lines
  const referenceLines = {
    plus3Sd: Number((targetMean + (3 * targetSd)).toFixed(3)),
    plus2Sd: Number((targetMean + (2 * targetSd)).toFixed(3)),
    plus1Sd: Number((targetMean + (1 * targetSd)).toFixed(3)),
    mean: Number(targetMean.toFixed(3)),
    minus1Sd: Number((targetMean - (1 * targetSd)).toFixed(3)),
    minus2Sd: Number((targetMean - (2 * targetSd)).toFixed(3)),
    minus3Sd: Number((targetMean - (3 * targetSd)).toFixed(3))
  };

  // Sort entries chronologically
  const sorted = entries.slice().sort((a, b) => new Date(a.run_date || a.runDate).getTime() - new Date(b.run_date || b.runDate).getTime());

  // Build points
  const points = sorted.map((e, index) => {
    const val = Number(e.measured_value !== undefined ? e.measured_value : e.measuredValue);
    const z = Number(e.z_score !== undefined ? e.z_score : (e.zScore !== undefined ? e.zScore : ((val - targetMean) / targetSd).toFixed(2)));
    const runDate = e.run_date || e.runDate || '';
    const rules = Array.isArray(e.rules_violated) ? e.rules_violated : (typeof e.rules_violated === 'string' ? JSON.parse(e.rules_violated || '[]') : (e.rulesViolated || []));
    const corrAction = typeof e.corrective_action === 'string' ? JSON.parse(e.corrective_action || '{}') : (e.corrective_action || e.correctiveAction || null);

    return {
      id: e.id,
      index: index + 1,
      runDate,
      runDateFormatted: runDate ? (new Date(runDate).toLocaleDateString() + ' ' + new Date(runDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '—',
      runNumber: e.run_number || e.runNumber || 1,
      measuredValue: val,
      zScore: z,
      status: e.status || (Math.abs(z) > 3 ? 'REJECTED' : (Math.abs(z) > 2 ? 'WARNING' : 'ACCEPTED')),
      rulesViolated: rules,
      violationType: e.violation_type || e.violationType || 'None',
      operatorName: e.operator_name || e.operatorName || e.performed_by || '',
      reagentLotNumber: e.reagent_lot_number || e.reagentLotNumber || '',
      correctiveAction: corrAction
    };
  });

  // Calculate statistics
  const stats = calculateQcStatistics(points.map(p => p.measuredValue), targetMean, targetSd, teaPercent);

  return {
    analyteCode,
    analyteName,
    unit,
    controlName: control ? (control.control_name || control.controlName || 'Chemistry Control') : 'Chemistry Control',
    lotNumber: control ? (control.lot_number || control.lotNumber || '') : '',
    level: control ? (control.level || 'Level 1') : 'Level 1',
    expirationDate: control ? (control.expiration_date || control.expirationDate || null) : null,
    targetMean,
    targetSd,
    teaPercent,
    referenceLines,
    points,
    statistics: stats,
    equipment: options.equipment ? {
      id: options.equipment.id,
      name: options.equipment.name,
      code: options.equipment.equipment_code || options.equipment.equipmentCode || '',
      model: options.equipment.model_number || options.equipment.modelNumber || ''
    } : null
  };
}

/**
 * Generates monthly Internal Quality Control report for Department of Health (DOH) licensing inspection.
 */
export function generateDohMonthlyReport(
  equipment: any,
  monthString: string,
  controlsList: any[] = [],
  allQcEntries: any[] = []
): any {
  // Parse month string (YYYY-MM)
  const targetMonth = monthString || new Date().toISOString().slice(0, 7);
  const [year, month] = targetMonth.split('-').map(n => parseInt(n, 10));

  // Filter entries in target month
  const monthEntries = allQcEntries.filter(e => {
    const rd = e.run_date || e.runDate;
    if (!rd) return false;
    const d = new Date(rd);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  // Group by analyte
  const analyteMap = new Map<string, any[]>();
  monthEntries.forEach(entry => {
    const code = entry.analyte_code || entry.analyteCode || 'UNKNOWN';
    if (!analyteMap.has(code)) {
      analyteMap.set(code, []);
    }
    analyteMap.get(code)!.push(entry);
  });

  const analyteReports: any[] = [];
  let totalRejections = 0;
  let totalWarnings = 0;
  let unaddressedRejections = 0;

  analyteMap.forEach((entries, analyteCode) => {
    const first = entries[0];
    const ctrl = controlsList.find(c => c.id === (first.control_id || first.controlId) || c.lot_number === (first.control_lot || first.controlLot));
    const dataset = buildLeveyJenningsDataset(ctrl, analyteCode, entries, { equipment });

    const rejections = entries.filter(e => e.status === 'REJECTED');
    const warnings = entries.filter(e => e.status === 'WARNING');
    const unresolved = rejections.filter(e => {
      const ca = typeof e.corrective_action === 'string' ? JSON.parse(e.corrective_action || '{}') : (e.corrective_action || e.correctiveAction);
      return !ca || !ca.resolved;
    });

    totalRejections += rejections.length;
    totalWarnings += warnings.length;
    unaddressedRejections += unresolved.length;

    analyteReports.push({
      analyteCode,
      analyteName: dataset.analyteName,
      unit: dataset.unit,
      targetMean: dataset.targetMean,
      targetSd: dataset.targetSd,
      stats: dataset.statistics,
      totalRuns: entries.length,
      rejectionCount: rejections.length,
      warningCount: warnings.length,
      unresolvedCount: unresolved.length,
      correctiveActions: rejections.map(r => {
        const ca = typeof r.corrective_action === 'string' ? JSON.parse(r.corrective_action || '{}') : (r.corrective_action || r.correctiveAction);
        return {
          date: r.run_date || r.runDate,
          value: r.measured_value || r.measuredValue,
          rules: Array.isArray(r.rules_violated) ? r.rules_violated : (r.rulesViolated || []),
          action: ca ? (ca.actionTaken || ca.action_taken || 'No corrective action recorded') : 'No corrective action recorded',
          actionBy: ca ? (ca.actionTakenBy || ca.action_taken_by || 'Pending') : 'Pending',
          resolved: ca ? !!ca.resolved : false
        };
      })
    });
  });

  return {
    facility: {
      name: 'GEZYNE CLINICAL LABORATORY',
      licenseNumber: '03-435-15CL-20',
      address: '0330 Vergel De Dios St., Poblacion, Plaridel, Bulacan'
    },
    reportPeriod: {
      year,
      month,
      monthName: new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    },
    equipment: {
      id: equipment ? equipment.id : '',
      name: equipment ? equipment.name : 'Clinical Chemistry Analyzer',
      equipmentCode: equipment ? (equipment.equipment_code || equipment.equipmentCode || '') : '',
      manufacturer: equipment ? equipment.manufacturer : '',
      modelNumber: equipment ? (equipment.model_number || equipment.modelNumber || '') : '',
      serialNumber: equipment ? (equipment.serial_number || equipment.serialNumber || '') : '',
      lastCalibrationDate: equipment ? (equipment.last_calibration_date || equipment.lastCalibrationDate) : null,
      nextCalibrationDate: equipment ? (equipment.next_calibration_date || equipment.nextCalibrationDate) : null
    },
    summary: {
      totalAnalytesTracked: analyteReports.length,
      totalQcRuns: monthEntries.length,
      totalRejections,
      totalWarnings,
      unaddressedRejections,
      overallCompliance: unaddressedRejections === 0 ? 'COMPLIANT' : 'ACTION_REQUIRED'
    },
    analyteReports,
    generatedAt: new Date().toISOString()
  };
}
