const { v4: uuidv4 } = require('uuid');

/**
 * NeqasRecord Model
 * Represents National External Quality Assessment Scheme (NEQAS) / Proficiency Testing survey events.
 * Compliant with Philippine DOH guidelines and ISO 15189:2022 (Clause 7.3.7.3).
 */
class NeqasRecord {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.equipmentId = data.equipmentId || '';
    this.equipmentName = data.equipmentName || '';
    this.cycleYear = data.cycleYear || String(new Date().getFullYear());
    this.eventNumber = data.eventNumber || 'Event 1';
    this.nrlName = data.nrlName || 'Lung Center of the Philippines (LCP - Clinical Chemistry)';
    this.sampleId = data.sampleId || '';
    this.analyteCode = data.analyteCode || '';
    this.analyteName = data.analyteName || '';
    this.unit = data.unit || 'mg/dL';
    this.methodInstrument = data.methodInstrument || '';
    this.reagentLot = data.reagentLot || '';
    this.reportedValue = Number.isFinite(Number(data.reportedValue)) ? Number(data.reportedValue) : null;
    this.submissionDate = data.submissionDate ? new Date(data.submissionDate).toISOString() : new Date().toISOString();
    this.reportedBy = data.reportedBy || 'Medical Technologist';

    // Official Evaluation from National Reference Laboratory (NRL)
    const evalData = data.nrlEvaluation || {};
    const peerMean = Number.isFinite(Number(evalData.peerMean)) ? Number(evalData.peerMean) : (Number.isFinite(Number(data.peerMean)) ? Number(data.peerMean) : null);
    const peerSd = Number.isFinite(Number(evalData.peerSd)) && Number(evalData.peerSd) > 0 ? Number(evalData.peerSd) : (Number.isFinite(Number(data.peerSd)) ? Number(data.peerSd) : null);
    
    // Standard Deviation Index: SDI = (Reported - PeerMean) / PeerSD
    let sdi = null;
    if (this.reportedValue !== null && peerMean !== null && peerSd !== null && peerSd > 0) {
      sdi = Number(((this.reportedValue - peerMean) / peerSd).toFixed(2));
    } else if (Number.isFinite(Number(evalData.sdi))) {
      sdi = Number(evalData.sdi);
    }

    let grade = evalData.evaluationGrade || data.evaluationGrade || 'PENDING';
    if (sdi !== null && grade === 'PENDING') {
      const absSdi = Math.abs(sdi);
      if (absSdi <= 2.0) {
        grade = 'ACCEPTABLE';
      } else if (absSdi < 3.0) {
        grade = 'QUESTIONABLE';
      } else {
        grade = 'UNSATISFACTORY';
      }
    }

    this.nrlEvaluation = {
      peerMean,
      peerSd,
      peerCount: evalData.peerCount ? parseInt(evalData.peerCount, 10) : null,
      sdi,
      evaluationGrade: grade, // ACCEPTABLE (|SDI| <= 2.0), QUESTIONABLE (2.0 < |SDI| < 3.0), UNSATISFACTORY (|SDI| >= 3.0), PENDING
      evaluationDate: evalData.evaluationDate ? new Date(evalData.evaluationDate).toISOString() : null,
      certificateNumber: evalData.certificateNumber || data.certificateNumber || ''
    };

    // Overall Status
    if (this.nrlEvaluation.evaluationGrade === 'ACCEPTABLE') {
      this.status = 'EVALUATED_ACCEPTABLE';
    } else if (this.nrlEvaluation.evaluationGrade === 'QUESTIONABLE') {
      this.status = 'EVALUATED_QUESTIONABLE';
    } else if (this.nrlEvaluation.evaluationGrade === 'UNSATISFACTORY') {
      this.status = 'EVALUATED_UNSATISFACTORY';
    } else if (this.reportedValue !== null) {
      this.status = 'SUBMITTED';
    } else {
      this.status = data.status || 'PENDING_RESULT';
    }

    // Corrective Action (Required by DOH for Questionable/Unsatisfactory survey results)
    const corr = data.correctiveAction || {};
    const isRequired = this.nrlEvaluation.evaluationGrade === 'QUESTIONABLE' || this.nrlEvaluation.evaluationGrade === 'UNSATISFACTORY';
    this.correctiveAction = {
      required: isRequired || !!corr.required,
      investigation: corr.investigation || '',
      actionTaken: corr.actionTaken || '',
      actionTakenBy: corr.actionTakenBy || '',
      actionDate: corr.actionDate ? new Date(corr.actionDate).toISOString() : null,
      closed: !!corr.closed
    };

    this.notes = data.notes || '';
    this.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString();
  }

  get isAcceptable() {
    return this.nrlEvaluation.evaluationGrade === 'ACCEPTABLE';
  }

  get isUnsatisfactory() {
    return this.nrlEvaluation.evaluationGrade === 'UNSATISFACTORY';
  }
}

module.exports = NeqasRecord;
