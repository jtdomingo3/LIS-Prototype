const { v4: uuidv4 } = require('uuid');

/**
 * Standard Clinical Chemistry Analytes Default Directory
 * Matches the laboratory's blood chemistry panel specifications
 */
const DEFAULT_CHEMISTRY_ANALYTES = [
  { analyteCode: 'fbs', analyteName: 'Glucose / Fasting Blood Sugar', unit: 'mg/dL', targetMean: 95.0, targetSd: 3.5, teaPercent: 10.0 },
  { analyteCode: 'rbs', analyteName: 'Random Blood Sugar', unit: 'mg/dL', targetMean: 105.0, targetSd: 4.0, teaPercent: 10.0 },
  { analyteCode: 'cholesterol', analyteName: 'Total Cholesterol', unit: 'mg/dL', targetMean: 175.0, targetSd: 5.5, teaPercent: 10.0 },
  { analyteCode: 'tg', analyteName: 'Triglycerides', unit: 'mg/dL', targetMean: 120.0, targetSd: 6.0, teaPercent: 15.0 },
  { analyteCode: 'hdl', analyteName: 'HDL Cholesterol', unit: 'mg/dL', targetMean: 50.0, targetSd: 2.8, teaPercent: 15.0 },
  { analyteCode: 'ldl', analyteName: 'LDL Cholesterol', unit: 'mg/dL', targetMean: 110.0, targetSd: 4.5, teaPercent: 12.0 },
  { analyteCode: 'uricAcid', analyteName: 'Uric Acid', unit: 'mg/dL', targetMean: 5.0, targetSd: 0.25, teaPercent: 12.0 },
  { analyteCode: 'creatinine', analyteName: 'Creatinine', unit: 'mg/dL', targetMean: 1.10, targetSd: 0.06, teaPercent: 12.0 },
  { analyteCode: 'bun', analyteName: 'Blood Urea Nitrogen', unit: 'mg/dL', targetMean: 15.0, targetSd: 0.9, teaPercent: 12.0 },
  { analyteCode: 'sgpt', analyteName: 'ALT / SGPT', unit: 'U/L', targetMean: 35.0, targetSd: 2.5, teaPercent: 15.0 },
  { analyteCode: 'sgot', analyteName: 'AST / SGOT', unit: 'U/L', targetMean: 32.0, targetSd: 2.2, teaPercent: 15.0 },
  { analyteCode: 'sodium', analyteName: 'Sodium (Na+)', unit: 'mmol/L', targetMean: 140.0, targetSd: 2.0, teaPercent: 4.0 },
  { analyteCode: 'potassium', analyteName: 'Potassium (K+)', unit: 'mmol/L', targetMean: 4.2, targetSd: 0.15, teaPercent: 5.8 },
  { analyteCode: 'chloride', analyteName: 'Chloride (Cl-)', unit: 'mmol/L', targetMean: 102.0, targetSd: 2.0, teaPercent: 5.0 },
  { analyteCode: 'hbA1c', analyteName: 'Hemoglobin A1c', unit: '%', targetMean: 5.8, targetSd: 0.2, teaPercent: 6.0 }
];

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
          teaPercent: Number(a.teaPercent) || 10.0
        }))
      : [];

    this.notes = data.notes || '';
    this.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString();
    this.createdBy = data.createdBy || 'System';
  }

  getAnalyte(code) {
    if (!code) return null;
    const clean = String(code).toLowerCase();
    return this.analytes.find(a => a.analyteCode.toLowerCase() === clean) || null;
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
  DEFAULT_CHEMISTRY_ANALYTES
};
