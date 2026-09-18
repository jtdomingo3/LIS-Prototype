/**
 * Levey-Jennings & Statistical Quality Control Engine
 * Compliant with CLSI C24-Ed4, ISO 15189:2022, and Philippine DOH / NEQAS internal QC reporting standards.
 */

/**
 * Evaluates Westgard Multi-Rules for a new QC entry given chronological historical runs.
 * 
 * Rules evaluated:
 * - 1_2s (Warning): |Z| > 2.0
 * - 1_3s (Reject): |Z| > 3.0 (Random Error)
 * - 2_2s (Reject): 2 consecutive runs > +2SD or 2 consecutive runs < -2SD (Systematic Error)
 * - R_4s (Reject): Difference between consecutive runs >= 4.0 SD (Random Error)
 * - 4_1s (Reject): 4 consecutive runs > +1SD or 4 consecutive runs < -1SD (Systematic Error)
 * - 10_x (Reject): 10 consecutive runs on the same side of the mean (Systematic Drift)
 * 
 * @param {Object} currentEntry - { measuredValue, targetMean, targetSd }
 * @param {Array<Object>} history - Chronologically sorted previous entries for same analyte & lot (earliest to latest)
 * @returns {Object} { status: 'ACCEPTED'|'WARNING'|'REJECTED', rulesViolated: string[], violationType: string, zScore: number, explanation: string }
 */
function evaluateWestgardRules(currentEntry, history = []) {
  const value = Number(currentEntry.measuredValue);
  const mean = Number(currentEntry.targetMean);
  const sd = Number(currentEntry.targetSd) > 0 ? Number(currentEntry.targetSd) : 1;
  const zScore = Number(((value - mean) / sd).toFixed(2));

  const rulesViolated = [];
  let status = 'ACCEPTED';
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
 * 
 * @param {Array<number|Object>} values - Array of numeric values or entry objects
 * @param {number} targetMean - Assigned package insert mean
 * @param {number} targetSd - Assigned package insert standard deviation
 * @param {number} teaPercent - Allowable Total Error % (e.g. 10.0%)
 * @returns {Object} Statistical aggregates
 */
function calculateQcStatistics(entries = [], targetMean = 0, targetSd = 1, teaPercent = 10.0) {
  const nums = entries.map(e => (typeof e === 'object' ? Number(e.measuredValue) : Number(e))).filter(n => Number.isFinite(n));
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
 * 
 * @param {Object} control - QcControl object
 * @param {string} analyteCode - Code of analyte to plot (e.g. 'fbs')
 * @param {Array<Object>} entries - Filtered chronological QC entries
 * @param {Object} options - { startDate, endDate, equipment }
 * @returns {Object} Chart-ready JSON payload
 */
function buildLeveyJenningsDataset(control, analyteCode, entries = [], options = {}) {
  const analyteDef = control && typeof control.getAnalyte === 'function'
    ? control.getAnalyte(analyteCode)
    : (control && control.analytes ? control.analytes.find(a => (a.analyteCode || '').toLowerCase() === (analyteCode || '').toLowerCase()) : null);

  const targetMean = analyteDef ? Number(analyteDef.targetMean) : (entries[0] ? Number(entries[0].targetMean) : 100);
  const targetSd = analyteDef ? Number(analyteDef.targetSd) : (entries[0] ? Number(entries[0].targetSd) : 5);
  const teaPercent = analyteDef ? Number(analyteDef.teaPercent) : 10.0;
  const unit = analyteDef ? analyteDef.unit : (entries[0] ? entries[0].unit : 'mg/dL');
  const analyteName = analyteDef ? analyteDef.analyteName : (entries[0] ? entries[0].analyteName : analyteCode);

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
  const sorted = entries.slice().sort((a, b) => new Date(a.runDate) - new Date(b.runDate));

  // Build points
  const points = sorted.map((e, index) => {
    const val = Number(e.measuredValue);
    const z = Number(e.zScore !== undefined ? e.zScore : ((val - targetMean) / targetSd).toFixed(2));
    return {
      id: e.id,
      index: index + 1,
      runDate: e.runDate,
      runDateFormatted: new Date(e.runDate).toLocaleDateString() + ' ' + new Date(e.runDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      runNumber: e.runNumber || 1,
      measuredValue: val,
      zScore: z,
      status: e.status || (Math.abs(z) > 3 ? 'REJECTED' : (Math.abs(z) > 2 ? 'WARNING' : 'ACCEPTED')),
      rulesViolated: e.rulesViolated || [],
      violationType: e.violationType || 'None',
      operatorName: e.operatorName || '',
      reagentLotNumber: e.reagentLotNumber || '',
      correctiveAction: e.correctiveAction || null
    };
  });

  // Calculate statistics
  const stats = calculateQcStatistics(points.map(p => p.measuredValue), targetMean, targetSd, teaPercent);

  return {
    analyteCode,
    analyteName,
    unit,
    controlName: control ? control.controlName : 'Chemistry Control',
    lotNumber: control ? control.lotNumber : '',
    level: control ? control.level : 'Level 1',
    expirationDate: control ? control.expirationDate : null,
    targetMean,
    targetSd,
    teaPercent,
    referenceLines,
    points,
    statistics: stats,
    equipment: options.equipment ? {
      id: options.equipment.id,
      name: options.equipment.name,
      code: options.equipment.equipmentCode,
      model: options.equipment.modelNumber
    } : null
  };
}

/**
 * Generates monthly Internal Quality Control report for Department of Health (DOH) licensing inspection.
 */
function generateDohMonthlyReport(equipment, monthString, controlsList = [], allQcEntries = []) {
  // Parse month string (YYYY-MM)
  const targetMonth = monthString || new Date().toISOString().slice(0, 7);
  const [year, month] = targetMonth.split('-').map(n => parseInt(n, 10));

  // Filter entries in target month
  const monthEntries = allQcEntries.filter(e => {
    if (!e.runDate) return false;
    const d = new Date(e.runDate);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  // Group by analyte
  const analyteMap = new Map();
  monthEntries.forEach(entry => {
    const code = entry.analyteCode || 'UNKNOWN';
    if (!analyteMap.has(code)) {
      analyteMap.set(code, []);
    }
    analyteMap.get(code).push(entry);
  });

  const analyteReports = [];
  let totalRejections = 0;
  let totalWarnings = 0;
  let unaddressedRejections = 0;

  analyteMap.forEach((entries, analyteCode) => {
    const first = entries[0];
    const ctrl = controlsList.find(c => c.id === first.controlId || c.lotNumber === first.controlLot);
    const dataset = buildLeveyJenningsDataset(ctrl, analyteCode, entries, { equipment });

    const rejections = entries.filter(e => e.status === 'REJECTED');
    const warnings = entries.filter(e => e.status === 'WARNING');
    const unresolved = rejections.filter(e => !e.correctiveAction || !e.correctiveAction.resolved);

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
      correctiveActions: rejections.map(r => ({
        date: r.runDate,
        value: r.measuredValue,
        rules: r.rulesViolated,
        action: r.correctiveAction ? r.correctiveAction.actionTaken : 'No corrective action recorded',
        actionBy: r.correctiveAction ? r.correctiveAction.actionTakenBy : 'Pending',
        resolved: r.correctiveAction ? !!r.correctiveAction.resolved : false
      }))
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
      equipmentCode: equipment ? equipment.equipmentCode : '',
      manufacturer: equipment ? equipment.manufacturer : '',
      modelNumber: equipment ? equipment.modelNumber : '',
      serialNumber: equipment ? equipment.serialNumber : '',
      lastCalibrationDate: equipment ? equipment.lastCalibrationDate : null,
      nextCalibrationDate: equipment ? equipment.nextCalibrationDate : null
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

module.exports = {
  evaluateWestgardRules,
  calculateQcStatistics,
  buildLeveyJenningsDataset,
  generateDohMonthlyReport
};
