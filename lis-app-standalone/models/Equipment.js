const { v4: uuidv4 } = require('uuid');

/**
 * Equipment Model
 * Represents a diagnostic analyzer, X-ray unit, or laboratory instrument.
 * Compliant with ISO 15189:2022 (Clause 6.4), CLSI QMS13, and Philippine DOH AO 2020-0035 / FDA CDRRHR standards.
 */
class Equipment {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.equipmentCode = data.equipmentCode || data.code || `EQ-${Date.now().toString().slice(-6)}`;
    this.name = data.name || '';
    this.category = data.category || 'General Equipment';
    this.department = data.department || 'General Laboratory';
    this.manufacturer = data.manufacturer || data.brand || '';
    this.modelNumber = data.modelNumber || '';
    this.serialNumber = data.serialNumber || '';
    this.location = data.location || '';
    this.status = data.status || 'OPERATIONAL'; // OPERATIONAL, CALIBRATION_DUE, CALIBRATION_OVERDUE, MAINTENANCE_DUE, OUT_OF_SERVICE, DECOMMISSIONED
    this.criticality = data.criticality || 'High'; // High, Medium, Low
    this.acquisitionDate = data.acquisitionDate ? new Date(data.acquisitionDate).toISOString() : null;
    this.installationDate = data.installationDate ? new Date(data.installationDate).toISOString() : null;
    this.warrantyExpiryDate = data.warrantyExpiryDate ? new Date(data.warrantyExpiryDate).toISOString() : null;
    this.supplierVendor = data.supplierVendor || '';
    this.serviceEngineer = data.serviceEngineer || '';
    this.serviceContact = data.serviceContact || '';

    // Calibration Schedules (ISO 15189 requirement)
    this.calibrationCycleDays = Number.isFinite(Number(data.calibrationCycleDays)) ? parseInt(data.calibrationCycleDays, 10) : 365; // Default 1 year
    this.lastCalibrationDate = data.lastCalibrationDate ? new Date(data.lastCalibrationDate).toISOString() : null;
    this.nextCalibrationDate = data.nextCalibrationDate ? new Date(data.nextCalibrationDate).toISOString() : this.computeNextDate(this.lastCalibrationDate, this.calibrationCycleDays);

    // Preventive Maintenance Schedules (PM)
    this.pmCycleDays = Number.isFinite(Number(data.pmCycleDays)) ? parseInt(data.pmCycleDays, 10) : 180; // Default 6 months
    this.lastPmDate = data.lastPmDate ? new Date(data.lastPmDate).toISOString() : null;
    this.nextPmDate = data.nextPmDate ? new Date(data.nextPmDate).toISOString() : this.computeNextDate(this.lastPmDate, this.pmCycleDays);

    // Diagnostic X-Ray & Radiation Safety Details (DOH AO 2020-0035 / FDA CDRRHR compliance)
    const rad = data.radiationSafetyDetails || {};
    this.radiationSafetyDetails = {
      isRadiationEmitter: !!(data.isRadiationEmitter || rad.isRadiationEmitter || this.checkIfRadiationEmitter(this.category, this.department)),
      fdaCdrrhrRegNumber: rad.fdaCdrrhrRegNumber || data.fdaCdrrhrRegNumber || '', // Machine License/Permit to Operate
      radiationSafetyOfficer: rad.radiationSafetyOfficer || data.radiationSafetyOfficer || '',
      tubeModel: rad.tubeModel || data.tubeModel || '',
      tubeSerialNumber: rad.tubeSerialNumber || data.tubeSerialNumber || '',
      maxKvp: rad.maxKvp ? Number(rad.maxKvp) : (data.maxKvp ? Number(data.maxKvp) : null),
      maxMa: rad.maxMa ? Number(rad.maxMa) : (data.maxMa ? Number(data.maxMa) : null),
      totalFiltrationHvl: rad.totalFiltrationHvl || data.totalFiltrationHvl || '', // e.g. 2.5 mm Al eq.
      lastRadiationSurveyDate: rad.lastRadiationSurveyDate ? new Date(rad.lastRadiationSurveyDate).toISOString() : null,
      nextRadiationSurveyDate: rad.nextRadiationSurveyDate ? new Date(rad.nextRadiationSurveyDate).toISOString() : null,
      leadApronCheckDate: rad.leadApronCheckDate ? new Date(rad.leadApronCheckDate).toISOString() : null
    };

    this.documents = Array.isArray(data.documents) ? data.documents : [];
    this.notes = data.notes || '';
    this.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString();
    this.createdBy = data.createdBy || 'System';

    // Automatically synchronize status based on calibration/PM overdue state if not manually decommissioned or out of service
    this.evaluateStatus();
  }

  computeNextDate(baseDate, days) {
    if (!baseDate || !days) return null;
    const d = new Date(baseDate);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + Number(days));
    return d.toISOString();
  }

  checkIfRadiationEmitter(category = '', dept = '') {
    const text = `${category} ${dept}`.toLowerCase();
    return text.includes('x-ray') || text.includes('radiolog') || text.includes('fluoroscop') || text.includes('ct scan');
  }

  get isXRay() {
    return !!this.radiationSafetyDetails.isRadiationEmitter || this.checkIfRadiationEmitter(this.category, this.department);
  }

  get isChemistry() {
    const text = `${this.category} ${this.department} ${this.name}`.toLowerCase();
    return text.includes('chemistry') || text.includes('biochem') || text.includes('bs-240') || text.includes('photometer');
  }

  get daysUntilCalibration() {
    if (!this.nextCalibrationDate) return null;
    const now = new Date();
    const target = new Date(this.nextCalibrationDate);
    const diffTime = target.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get isCalibrationOverdue() {
    const days = this.daysUntilCalibration;
    return days !== null && days < 0;
  }

  get isCalibrationDueSoon() {
    const days = this.daysUntilCalibration;
    return days !== null && days >= 0 && days <= 30;
  }

  get daysUntilPm() {
    if (!this.nextPmDate) return null;
    const now = new Date();
    const target = new Date(this.nextPmDate);
    const diffTime = target.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get isPmOverdue() {
    const days = this.daysUntilPm;
    return days !== null && days < 0;
  }

  get isPmDueSoon() {
    const days = this.daysUntilPm;
    return days !== null && days >= 0 && days <= 30;
  }

  get isRadiationSurveyOverdue() {
    if (!this.isXRay || !this.radiationSafetyDetails.nextRadiationSurveyDate) return false;
    const target = new Date(this.radiationSafetyDetails.nextRadiationSurveyDate);
    return target.getTime() < Date.now();
  }

  evaluateStatus() {
    if (this.status === 'OUT_OF_SERVICE' || this.status === 'DECOMMISSIONED') {
      return this.status;
    }
    if (this.isCalibrationOverdue) {
      this.status = 'CALIBRATION_OVERDUE';
    } else if (this.isCalibrationDueSoon) {
      this.status = 'CALIBRATION_DUE';
    } else if (this.isPmOverdue) {
      this.status = 'MAINTENANCE_DUE';
    } else {
      this.status = 'OPERATIONAL';
    }
    return this.status;
  }

  formatStatusBadge() {
    switch (this.status) {
      case 'OPERATIONAL':
        return { label: 'Operational / In Service', color: 'green', code: 'OPERATIONAL' };
      case 'CALIBRATION_DUE':
        return { label: 'Calibration Due Soon', color: 'orange', code: 'CALIBRATION_DUE' };
      case 'CALIBRATION_OVERDUE':
        return { label: 'Calibration OVERDUE', color: 'red', code: 'CALIBRATION_OVERDUE' };
      case 'MAINTENANCE_DUE':
        return { label: 'Maintenance Due', color: 'orange', code: 'MAINTENANCE_DUE' };
      case 'OUT_OF_SERVICE':
        return { label: 'Out of Service / Quarantined', color: 'red', code: 'OUT_OF_SERVICE' };
      case 'DECOMMISSIONED':
        return { label: 'Decommissioned', color: 'gray', code: 'DECOMMISSIONED' };
      default:
        return { label: this.status, color: 'blue', code: this.status };
    }
  }
}

module.exports = Equipment;
