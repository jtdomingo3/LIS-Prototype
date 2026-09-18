const { v4: uuidv4 } = require('uuid');

/**
 * EquipmentLog Model
 * Tracks Calibration Reports, Preventive Maintenance (PM), Repairs, and X-Ray Radiation Safety Surveys.
 * Compliant with ISO 15189:2022 (Metrological Traceability) and Philippine DOH / FDA CDRRHR regulations.
 */
class EquipmentLog {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.equipmentId = data.equipmentId || '';
    this.logType = data.logType || 'CALIBRATION'; // CALIBRATION, PREVENTIVE_MAINTENANCE, CORRECTIVE_MAINTENANCE, ACCEPTANCE_TESTING, RADIATION_SAFETY_SURVEY, ELECTRICAL_SAFETY, RECALIBRATION_POST_REPAIR
    this.serviceDate = data.serviceDate ? new Date(data.serviceDate).toISOString() : new Date().toISOString();
    this.serviceProviderType = data.serviceProviderType || 'Authorized Service Provider'; // Internal Staff, Authorized Service Provider, Manufacturer Engineer, Accredited Metrology Body (ISO 17025), DOH / FDA Certified Physicist
    this.serviceProviderName = data.serviceProviderName || '';
    this.technicianName = data.technicianName || '';
    this.technicianLicenseNo = data.technicianLicenseNo || '';
    this.certificateNumber = data.certificateNumber || ''; // Calibration / Service Report #
    this.standardReferenceUsed = data.standardReferenceUsed || ''; // e.g. "NIST Traceable Multimeter SN: 9942, Fluke Calibrated Dosimeter"
    this.findings = data.findings || '';
    this.workPerformed = data.workPerformed || '';
    this.downtimeHours = Number.isFinite(Number(data.downtimeHours)) ? parseFloat(data.downtimeHours) : 0;
    this.partsReplaced = data.partsReplaced || '';
    this.cost = Number.isFinite(Number(data.cost)) ? Math.max(0, parseFloat(data.cost)) : 0;

    // Diagnostic X-Ray Specific Quality Assurance & Physics Survey Results
    const x = data.xrayPhysicsResults || {};
    this.xrayPhysicsResults = {
      kvpSet: x.kvpSet ? Number(x.kvpSet) : null,
      kvpMeasured: x.kvpMeasured ? Number(x.kvpMeasured) : null,
      kvpPercentError: x.kvpPercentError ? Number(x.kvpPercentError) : this.calcPercentError(x.kvpSet, x.kvpMeasured),
      timerSetMs: x.timerSetMs ? Number(x.timerSetMs) : null,
      timerMeasuredMs: x.timerMeasuredMs ? Number(x.timerMeasuredMs) : null,
      timerPercentError: x.timerPercentError ? Number(x.timerPercentError) : this.calcPercentError(x.timerSetMs, x.timerMeasuredMs),
      exposureLinearityCol: x.exposureLinearityCol ? Number(x.exposureLinearityCol) : null, // Coefficient of Linearity (AAPM/DOH limit: <= 0.10)
      halfValueLayerMmAl: x.halfValueLayerMmAl ? Number(x.halfValueLayerMmAl) : null, // Filtration HVL (mm Al)
      collimatorAlignmentPercentSid: x.collimatorAlignmentPercentSid ? Number(x.collimatorAlignmentPercentSid) : null, // <= 2% of SID
      radiationLeakageMrhAt1m: x.radiationLeakageMrhAt1m ? Number(x.radiationLeakageMrhAt1m) : null, // DOH Limit: < 100 mR/hr at 1 meter
      leadApronsInspected: !!x.leadApronsInspected,
      leadApronsCondition: x.leadApronsCondition || 'Pass - No Cracks or Tears'
    };

    this.resultStatus = data.resultStatus || 'PASS'; // PASS, FAIL, CONDITIONAL_PASS, PENDING
    this.nextDueDate = data.nextDueDate ? new Date(data.nextDueDate).toISOString() : null;
    this.performedBy = data.performedBy || 'Technician';
    this.approvedBy = data.approvedBy || ''; // Lab Manager / Radiation Safety Officer (RSO)
    this.approvalDate = data.approvalDate ? new Date(data.approvalDate).toISOString() : null;
    this.approvalNotes = data.approvalNotes || '';
    this.attachments = Array.isArray(data.attachments) ? data.attachments : [];
    this.notes = data.notes || '';
    this.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString();
    this.createdBy = data.createdBy || 'System';
  }

  calcPercentError(nominal, measured) {
    if (nominal === null || nominal === undefined || measured === null || measured === undefined) return null;
    const n = Number(nominal);
    const m = Number(measured);
    if (!n || isNaN(n) || isNaN(m)) return null;
    return Number((((m - n) / n) * 100).toFixed(2));
  }

  get isPass() {
    return this.resultStatus === 'PASS';
  }

  get isFail() {
    return this.resultStatus === 'FAIL';
  }

  get isCalibration() {
    return this.logType === 'CALIBRATION' || this.logType === 'RECALIBRATION_POST_REPAIR';
  }

  get isPm() {
    return this.logType === 'PREVENTIVE_MAINTENANCE';
  }

  get isXraySurvey() {
    return this.logType === 'RADIATION_SAFETY_SURVEY';
  }
}

module.exports = EquipmentLog;
