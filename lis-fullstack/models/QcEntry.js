const { v4: uuidv4 } = require('uuid');

/**
 * QcEntry Model
 * Represents a single quantitative Quality Control measurement plotted on a Levey-Jennings chart.
 */
class QcEntry {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.equipmentId = data.equipmentId || '';
    this.controlId = data.controlId || '';
    this.controlLot = data.controlLot || '';
    this.controlLevel = data.controlLevel || 'Level 1';
    this.analyteCode = data.analyteCode || '';
    this.analyteName = data.analyteName || '';
    this.unit = data.unit || 'mg/dL';
    this.runDate = data.runDate ? new Date(data.runDate).toISOString() : new Date().toISOString();
    this.runNumber = Number.isFinite(Number(data.runNumber)) ? parseInt(data.runNumber, 10) : 1;
    this.measuredValue = Number.isFinite(Number(data.measuredValue)) ? Number(data.measuredValue) : 0;
    this.targetMean = Number.isFinite(Number(data.targetMean)) ? Number(data.targetMean) : 0;
    this.targetSd = Number.isFinite(Number(data.targetSd)) && Number(data.targetSd) > 0 ? Number(data.targetSd) : 1;
    
    // Deviation & Z-Score: Z = (x - mean) / SD
    this.deviation = Number((this.measuredValue - this.targetMean).toFixed(4));
    this.zScore = Number(((this.measuredValue - this.targetMean) / this.targetSd).toFixed(2));

    this.status = data.status || 'ACCEPTED'; // ACCEPTED, WARNING, REJECTED
    this.rulesViolated = Array.isArray(data.rulesViolated) ? data.rulesViolated : [];
    this.violationType = data.violationType || (this.rulesViolated.length ? 'Rule Triggered' : 'None');
    
    this.reagentLotNumber = data.reagentLotNumber || '';
    this.operatorName = data.operatorName || 'MedTech';
    this.notes = data.notes || '';

    // Corrective Action (Mandatory per DOH standards when a Westgard rejection rule triggers)
    const act = data.correctiveAction || {};
    this.correctiveAction = {
      actionTaken: act.actionTaken || (typeof data.correctiveAction === 'string' ? data.correctiveAction : ''),
      actionTakenBy: act.actionTakenBy || data.actionTakenBy || '',
      actionDate: act.actionDate ? new Date(act.actionDate).toISOString() : (data.actionDate ? new Date(data.actionDate).toISOString() : null),
      resolved: !!(act.resolved || data.resolved)
    };

    this.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString();
  }

  get isWarning() {
    return this.status === 'WARNING';
  }

  get isRejected() {
    return this.status === 'REJECTED';
  }

  get isAccepted() {
    return this.status === 'ACCEPTED';
  }
}

module.exports = QcEntry;
