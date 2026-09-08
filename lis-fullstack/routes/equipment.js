const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Equipment = require('../models/Equipment');
const EquipmentLog = require('../models/EquipmentLog');
const { QcControl, DEFAULT_CHEMISTRY_ANALYTES } = require('../models/QcControl');
const QcEntry = require('../models/QcEntry');
const NeqasRecord = require('../models/NeqasRecord');
const {
  evaluateWestgardRules,
  calculateQcStatistics,
  buildLeveyJenningsDataset,
  generateDohMonthlyReport
} = require('../lib/leveyJenningsService');
const { requireAuth } = require('../middleware/auth');

// Helper to extract actor from session
function getActor(req) {
  if (req.session && req.session.user) {
    return req.session.user.name || req.session.user.email || 'User';
  }
  return 'System';
}

// Helper to determine if JSON response is expected
function wantsJson(req) {
  return req.xhr ||
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    req.originalUrl.startsWith('/api/');
}

// ==========================================
// 1. EQUIPMENT REGISTRY & DASHBOARD
// ==========================================

// GET /equipment / GET /equipment/list / GET /api/equipment
router.get('/', requireAuth, (req, res) => {
  try {
    const rawList = (typeof global.db.getEquipment === 'function') ? global.db.getEquipment() : [];
    const equipmentList = rawList.map(item => new Equipment(item));

    // Filters
    const { department, category, status, search } = req.query;
    let filtered = equipmentList;

    if (department) {
      filtered = filtered.filter(e => (e.department || '').toLowerCase() === String(department).toLowerCase());
    }
    if (category) {
      filtered = filtered.filter(e => (e.category || '').toLowerCase() === String(category).toLowerCase());
    }
    if (status) {
      filtered = filtered.filter(e => (e.status || '').toLowerCase() === String(status).toLowerCase());
    }
    if (search) {
      const q = String(search).toLowerCase();
      filtered = filtered.filter(e =>
        (e.name || '').toLowerCase().includes(q) ||
        (e.equipmentCode || '').toLowerCase().includes(q) ||
        (e.serialNumber || '').toLowerCase().includes(q) ||
        (e.manufacturer || '').toLowerCase().includes(q)
      );
    }

    // KPI Metrics
    const kpi = {
      total: equipmentList.length,
      operational: equipmentList.filter(e => e.status === 'OPERATIONAL').length,
      calibrationDueSoon: equipmentList.filter(e => e.isCalibrationDueSoon).length,
      calibrationOverdue: equipmentList.filter(e => e.isCalibrationOverdue).length,
      pmDue: equipmentList.filter(e => e.isPmDueSoon || e.isPmOverdue).length,
      outOfService: equipmentList.filter(e => e.status === 'OUT_OF_SERVICE').length,
      xrayCount: equipmentList.filter(e => e.isXRay).length,
      chemistryCount: equipmentList.filter(e => e.isChemistry).length
    };

    if (wantsJson(req)) {
      return res.json({ success: true, kpi, count: filtered.length, equipment: filtered });
    }

    const users = (typeof global.db.getUsers === 'function') ? global.db.getUsers() : [];

    // If server views exist, render; otherwise fallback to JSON
    try {
      res.render('equipment/index', {
        title: 'Laboratory Equipment Management',
        kpi,
        equipment: filtered,
        users,
        query: req.query
      });
    } catch (_) {
      res.json({ success: true, kpi, count: filtered.length, equipment: filtered });
    }
  } catch (error) {
    console.error('[routes/equipment] GET / error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /equipment/alerts/upcoming - Calibration & Maintenance Due Alerts
router.get('/alerts/upcoming', requireAuth, (req, res) => {
  try {
    const rawList = (typeof global.db.getEquipment === 'function') ? global.db.getEquipment() : [];
    const equipmentList = rawList.map(item => new Equipment(item));

    const calibrationAlerts = equipmentList
      .filter(e => e.isCalibrationDueSoon || e.isCalibrationOverdue)
      .map(e => ({
        id: e.id,
        equipmentCode: e.equipmentCode,
        name: e.name,
        department: e.department,
        status: e.status,
        daysUntilCalibration: e.daysUntilCalibration,
        nextCalibrationDate: e.nextCalibrationDate,
        isOverdue: e.isCalibrationOverdue
      }));

    const pmAlerts = equipmentList
      .filter(e => e.isPmDueSoon || e.isPmOverdue)
      .map(e => ({
        id: e.id,
        equipmentCode: e.equipmentCode,
        name: e.name,
        department: e.department,
        daysUntilPm: e.daysUntilPm,
        nextPmDate: e.nextPmDate,
        isOverdue: e.isPmOverdue
      }));

    const radiationSurveyAlerts = equipmentList
      .filter(e => e.isRadiationSurveyOverdue)
      .map(e => ({
        id: e.id,
        equipmentCode: e.equipmentCode,
        name: e.name,
        department: e.department,
        nextRadiationSurveyDate: e.radiationSafetyDetails.nextRadiationSurveyDate,
        fdaCdrrhrRegNumber: e.radiationSafetyDetails.fdaCdrrhrRegNumber,
        rso: e.radiationSafetyDetails.radiationSafetyOfficer
      }));

    res.json({
      success: true,
      calibrationAlerts,
      pmAlerts,
      radiationSurveyAlerts,
      totalAlerts: calibrationAlerts.length + pmAlerts.length + radiationSurveyAlerts.length
    });
  } catch (error) {
    console.error('[routes/equipment] GET /alerts/upcoming error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /equipment/xray/compliance - Dedicated Radiation Safety & X-Ray Compliance
router.get('/xray/compliance', requireAuth, (req, res) => {
  try {
    const rawList = (typeof global.db.getEquipment === 'function') ? global.db.getEquipment() : [];
    const xrayUnits = rawList.map(item => new Equipment(item)).filter(e => e.isXRay);

    const complianceOverview = xrayUnits.map(unit => {
      const logs = (typeof global.db.getEquipmentLogs === 'function') ? global.db.getEquipmentLogs(unit.id) : [];
      const physicsSurveys = logs.filter(l => l.logType === 'RADIATION_SAFETY_SURVEY').map(l => new EquipmentLog(l));
      const latestSurvey = physicsSurveys.sort((a, b) => new Date(b.serviceDate) - new Date(a.serviceDate))[0] || null;

      return {
        id: unit.id,
        equipmentCode: unit.equipmentCode,
        name: unit.name,
        category: unit.category,
        location: unit.location,
        fdaCdrrhrRegNumber: unit.radiationSafetyDetails.fdaCdrrhrRegNumber,
        radiationSafetyOfficer: unit.radiationSafetyDetails.radiationSafetyOfficer,
        tubeModel: unit.radiationSafetyDetails.tubeModel,
        tubeSerialNumber: unit.radiationSafetyDetails.tubeSerialNumber,
        maxKvp: unit.radiationSafetyDetails.maxKvp,
        maxMa: unit.radiationSafetyDetails.maxMa,
        lastSurveyDate: latestSurvey ? latestSurvey.serviceDate : unit.radiationSafetyDetails.lastRadiationSurveyDate,
        nextSurveyDate: latestSurvey ? latestSurvey.nextDueDate : unit.radiationSafetyDetails.nextRadiationSurveyDate,
        latestSurveyResult: latestSurvey ? latestSurvey.resultStatus : 'NO_RECORD',
        latestPhysicsData: latestSurvey ? latestSurvey.xrayPhysicsResults : null,
        isSurveyOverdue: unit.isRadiationSurveyOverdue,
        status: unit.status
      };
    });

    res.json({
      success: true,
      standard: 'Philippine DOH AO 2020-0035 / FDA CDRRHR Radiation Safety Standards',
      totalXrayUnits: xrayUnits.length,
      complianceOverview
    });
  } catch (error) {
    console.error('[routes/equipment] GET /xray/compliance error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /equipment - Create new equipment
router.post('/', requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    body.createdBy = getActor(req);
    const item = new Equipment(body);

    const saved = global.db.saveEquipment(item);
    if (!saved) {
      return res.status(500).json({ success: false, error: 'Failed to persist equipment to database.' });
    }

    res.status(201).json({ success: true, message: 'Equipment registered successfully.', equipment: saved });
  } catch (error) {
    console.error('[routes/equipment] POST / error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /equipment/:id - Equipment Details & Timeline
router.get('/:id', requireAuth, (req, res) => {
  try {
    const raw = global.db.getEquipmentById(req.params.id);
    if (!raw) {
      return res.status(404).json({ success: false, error: 'Equipment not found.' });
    }
    const equipment = new Equipment(raw);
    const logs = (typeof global.db.getEquipmentLogs === 'function' ? global.db.getEquipmentLogs(equipment.id) : []).map(l => new EquipmentLog(l));
    const controls = (typeof global.db.getQcControls === 'function' ? global.db.getQcControls(equipment.id) : []).map(c => new QcControl(c));
    const neqas = (typeof global.db.getNeqasRecords === 'function' ? global.db.getNeqasRecords(equipment.id) : []).map(n => new NeqasRecord(n));

    res.json({
      success: true,
      equipment,
      logs,
      controls,
      neqas
    });
  } catch (error) {
    console.error('[routes/equipment] GET /:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /equipment/:id & POST /equipment/:id/edit - Update Equipment
router.all('/:id/edit', requireAuth, (req, res) => {
  try {
    const raw = global.db.getEquipmentById(req.params.id);
    if (!raw) {
      return res.status(404).json({ success: false, error: 'Equipment not found.' });
    }

    const updated = new Equipment({
      ...raw,
      ...req.body,
      id: raw.id,
      updatedAt: new Date().toISOString()
    });

    global.db.saveEquipment(updated);
    res.json({ success: true, message: 'Equipment updated successfully.', equipment: updated });
  } catch (error) {
    console.error('[routes/equipment] Update equipment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', requireAuth, (req, res) => {
  try {
    const raw = global.db.getEquipmentById(req.params.id);
    if (!raw) {
      return res.status(404).json({ success: false, error: 'Equipment not found.' });
    }

    const updated = new Equipment({
      ...raw,
      ...req.body,
      id: raw.id,
      updatedAt: new Date().toISOString()
    });

    global.db.saveEquipment(updated);
    res.json({ success: true, message: 'Equipment updated successfully.', equipment: updated });
  } catch (error) {
    console.error('[routes/equipment] PUT /:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /equipment/:id/status - Update Operational Status
router.post('/:id/status', requireAuth, (req, res) => {
  try {
    const raw = global.db.getEquipmentById(req.params.id);
    if (!raw) {
      return res.status(404).json({ success: false, error: 'Equipment not found.' });
    }

    const { status, notes } = req.body;
    const eq = new Equipment(raw);
    eq.status = status || eq.status;
    if (notes) eq.notes = (eq.notes ? eq.notes + '\n' : '') + `[${new Date().toLocaleDateString()}] ${notes}`;
    eq.updatedAt = new Date().toISOString();

    global.db.saveEquipment(eq);
    res.json({ success: true, message: `Status updated to ${eq.status}`, equipment: eq });
  } catch (error) {
    console.error('[routes/equipment] POST /:id/status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /equipment/:id & POST /equipment/:id/delete - Delete/Decommission
router.all('/:id/delete', requireAuth, (req, res) => {
  try {
    const success = global.db.deleteEquipment(req.params.id);
    res.json({ success, message: 'Equipment deleted from database.' });
  } catch (error) {
    console.error('[routes/equipment] Delete equipment error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  try {
    const success = global.db.deleteEquipment(req.params.id);
    res.json({ success, message: 'Equipment deleted from database.' });
  } catch (error) {
    console.error('[routes/equipment] DELETE /:id error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 2. CALIBRATION & MAINTENANCE LOGS
// ==========================================

// GET /equipment/:id/logs - List service logs
router.get('/:id/logs', requireAuth, (req, res) => {
  try {
    const raw = global.db.getEquipmentById(req.params.id);
    if (!raw) {
      return res.status(404).json({ success: false, error: 'Equipment not found.' });
    }
    const logs = (global.db.getEquipmentLogs(req.params.id) || []).map(l => new EquipmentLog(l));
    res.json({ success: true, logs });
  } catch (error) {
    console.error('[routes/equipment] GET /:id/logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /equipment/:id/logs - Record Calibration / Maintenance Report
// Automatically recalculates equipment's lastCalibrationDate, nextCalibrationDate, lastPmDate, nextPmDate!
router.post('/:id/logs', requireAuth, (req, res) => {
  try {
    const rawEq = global.db.getEquipmentById(req.params.id);
    if (!rawEq) {
      return res.status(404).json({ success: false, error: 'Equipment not found.' });
    }
    const equipment = new Equipment(rawEq);

    const logData = req.body || {};
    logData.equipmentId = equipment.id;
    logData.createdBy = getActor(req);
    const log = new EquipmentLog(logData);

    const savedLog = global.db.saveEquipmentLog(log);
    if (!savedLog) {
      return res.status(500).json({ success: false, error: 'Failed to record service log.' });
    }

    // Auto-update Equipment dates if service passed
    if (log.isPass || log.resultStatus === 'CONDITIONAL_PASS') {
      const serviceDate = log.serviceDate;

      if (log.isCalibration) {
        equipment.lastCalibrationDate = serviceDate;
        if (log.nextDueDate) {
          equipment.nextCalibrationDate = log.nextDueDate;
        } else {
          equipment.nextCalibrationDate = equipment.computeNextDate(serviceDate, equipment.calibrationCycleDays);
        }
      }

      if (log.isPm) {
        equipment.lastPmDate = serviceDate;
        if (log.nextDueDate) {
          equipment.nextPmDate = log.nextDueDate;
        } else {
          equipment.nextPmDate = equipment.computeNextDate(serviceDate, equipment.pmCycleDays);
        }
      }

      if (log.isXraySurvey) {
        equipment.radiationSafetyDetails.lastRadiationSurveyDate = serviceDate;
        if (log.nextDueDate) {
          equipment.radiationSafetyDetails.nextRadiationSurveyDate = log.nextDueDate;
        } else {
          equipment.radiationSafetyDetails.nextRadiationSurveyDate = equipment.computeNextDate(serviceDate, 365); // Annual survey per DOH
        }
      }

      // Re-evaluate operational status
      equipment.evaluateStatus();
      equipment.updatedAt = new Date().toISOString();
      global.db.saveEquipment(equipment);
    }

    res.status(201).json({
      success: true,
      message: 'Calibration / Service report recorded and next calibration date updated.',
      log: savedLog,
      equipment
    });
  } catch (error) {
    console.error('[routes/equipment] POST /:id/logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /equipment/logs/:logId - Single service report
router.get('/logs/:logId', requireAuth, (req, res) => {
  try {
    const raw = global.db.getEquipmentLogById(req.params.logId);
    if (!raw) return res.status(404).json({ success: false, error: 'Service log not found.' });
    res.json({ success: true, log: new EquipmentLog(raw) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /equipment/logs/:logId - Update service log or approve by Lab Manager / RSO
router.put('/logs/:logId', requireAuth, (req, res) => {
  try {
    const raw = global.db.getEquipmentLogById(req.params.logId);
    if (!raw) return res.status(404).json({ success: false, error: 'Service log not found.' });

    const updated = new EquipmentLog({
      ...raw,
      ...req.body,
      id: raw.id,
      updatedAt: new Date().toISOString()
    });

    global.db.saveEquipmentLog(updated);
    res.json({ success: true, message: 'Log updated successfully.', log: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /equipment/logs/:logId - Delete service log
router.delete('/logs/:logId', requireAuth, (req, res) => {
  try {
    const success = global.db.deleteEquipmentLog(req.params.logId);
    res.json({ success, message: 'Service log deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 3. QUALITY CONTROL STANDARDS & CONTROLS
// ==========================================

// GET /equipment/qc/analytes/default - Default standard chemistry analyte definitions
router.get('/qc/analytes/default', requireAuth, (req, res) => {
  res.json({ success: true, analytes: DEFAULT_CHEMISTRY_ANALYTES });
});

// GET /equipment/:id/qc/controls - List controls for equipment
router.get('/:id/qc/controls', requireAuth, (req, res) => {
  try {
    const controls = (global.db.getQcControls(req.params.id) || []).map(c => new QcControl(c));
    res.json({ success: true, controls });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /equipment/:id/qc/controls - Register new control material / lot
router.post('/:id/qc/controls', requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    body.equipmentId = req.params.id;
    body.createdBy = getActor(req);

    // If analytes empty, provide default clinical chemistry analytes
    if (!body.analytes || !body.analytes.length) {
      body.analytes = DEFAULT_CHEMISTRY_ANALYTES;
    }

    const ctrl = new QcControl(body);
    const saved = global.db.saveQcControl(ctrl);
    res.status(201).json({ success: true, message: 'QC Control material registered.', control: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /equipment/qc/controls/:controlId - Update control
router.put('/qc/controls/:controlId', requireAuth, (req, res) => {
  try {
    const raw = global.db.getQcControlById(req.params.controlId);
    if (!raw) return res.status(404).json({ success: false, error: 'Control not found.' });

    const updated = new QcControl({
      ...raw,
      ...req.body,
      id: raw.id,
      updatedAt: new Date().toISOString()
    });

    global.db.saveQcControl(updated);
    res.json({ success: true, message: 'Control updated.', control: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /equipment/qc/controls/:controlId - Delete control
router.delete('/qc/controls/:controlId', requireAuth, (req, res) => {
  try {
    const success = global.db.deleteQcControl(req.params.controlId);
    res.json({ success, message: 'Control deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 4. QC RUN PLOTTING & LEVEY-JENNINGS
// ==========================================

// GET /equipment/:id/qc/entries - List QC run entries
router.get('/:id/qc/entries', requireAuth, (req, res) => {
  try {
    const { analyteCode } = req.query;
    const entries = (global.db.getQcEntries(req.params.id, analyteCode) || []).map(e => new QcEntry(e));
    res.json({ success: true, count: entries.length, entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /equipment/:id/qc/entries - Record Standard / Control Run with Automated Westgard Multi-Rule Check
router.post('/:id/qc/entries', requireAuth, (req, res) => {
  try {
    const { controlId, analyteCode, measuredValue, runDate, runNumber, reagentLotNumber, notes } = req.body;

    if (!controlId || !analyteCode || measuredValue === undefined || measuredValue === null) {
      return res.status(400).json({ success: false, error: 'Missing required parameters: controlId, analyteCode, measuredValue.' });
    }

    const rawCtrl = global.db.getQcControlById(controlId);
    if (!rawCtrl) {
      return res.status(404).json({ success: false, error: 'QC Control lot not found.' });
    }
    const ctrl = new QcControl(rawCtrl);
    const analyteDef = ctrl.getAnalyte(analyteCode);

    if (!analyteDef) {
      return res.status(400).json({ success: false, error: `Analyte "${analyteCode}" not configured on this control lot.` });
    }

    // Retrieve previous runs for this equipment & analyte to evaluate Westgard rules
    const history = (global.db.getQcEntries(req.params.id, analyteCode) || [])
      .filter(e => e.controlId === controlId)
      .sort((a, b) => new Date(a.runDate) - new Date(b.runDate));

    // Run Westgard Multi-Rule Evaluator
    const evaluation = evaluateWestgardRules(
      { measuredValue, targetMean: analyteDef.targetMean, targetSd: analyteDef.targetSd },
      history
    );

    const entry = new QcEntry({
      equipmentId: req.params.id,
      controlId,
      controlLot: ctrl.lotNumber,
      controlLevel: ctrl.level,
      analyteCode: analyteDef.analyteCode,
      analyteName: analyteDef.analyteName,
      unit: analyteDef.unit,
      runDate: runDate || new Date().toISOString(),
      runNumber: runNumber || 1,
      measuredValue: Number(measuredValue),
      targetMean: analyteDef.targetMean,
      targetSd: analyteDef.targetSd,
      status: evaluation.status,
      rulesViolated: evaluation.rulesViolated,
      violationType: evaluation.violationType,
      reagentLotNumber: reagentLotNumber || '',
      operatorName: getActor(req),
      notes: notes || evaluation.explanation
    });

    const saved = global.db.saveQcEntry(entry);

    res.status(201).json({
      success: true,
      message: evaluation.status === 'ACCEPTED' ? 'Control run accepted.' : `Control flagged: ${evaluation.explanation}`,
      evaluation,
      entry: saved
    });
  } catch (error) {
    console.error('[routes/equipment] POST /:id/qc/entries error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /equipment/qc/entries/:entryId/corrective-action - Document corrective action for out-of-control run
router.post('/qc/entries/:entryId/corrective-action', requireAuth, (req, res) => {
  try {
    const raw = global.db.getQcEntryById(req.params.entryId);
    if (!raw) return res.status(404).json({ success: false, error: 'QC entry not found.' });

    const { actionTaken, notes } = req.body;
    const entry = new QcEntry(raw);

    entry.correctiveAction = {
      actionTaken: actionTaken || 'Investigated and resolved out-of-control measurement.',
      actionTakenBy: getActor(req),
      actionDate: new Date().toISOString(),
      resolved: true
    };
    if (notes) entry.notes = (entry.notes ? entry.notes + '\n' : '') + notes;
    entry.updatedAt = new Date().toISOString();

    global.db.saveQcEntry(entry);
    res.json({ success: true, message: 'Corrective action recorded for DOH compliance.', entry });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /equipment/:id/qc/levey-jennings - Complete Levey-Jennings Chart Dataset
router.get('/:id/qc/levey-jennings', requireAuth, (req, res) => {
  try {
    const { analyteCode, controlId, month } = req.query;

    if (!analyteCode) {
      return res.status(400).json({ success: false, error: 'Analyte code is required (e.g. ?analyteCode=fbs).' });
    }

    const rawEq = global.db.getEquipmentById(req.params.id);
    const equipment = rawEq ? new Equipment(rawEq) : null;

    let control = null;
    if (controlId) {
      const rawCtrl = global.db.getQcControlById(controlId);
      if (rawCtrl) control = new QcControl(rawCtrl);
    } else {
      const controls = (global.db.getQcControls(req.params.id) || []).map(c => new QcControl(c));
      control = controls.find(c => c.getAnalyte(analyteCode)) || controls[0] || null;
    }

    let entries = (global.db.getQcEntries(req.params.id, analyteCode) || []).map(e => new QcEntry(e));

    // Optional filter by month (YYYY-MM)
    if (month) {
      const [yr, mo] = month.split('-').map(Number);
      entries = entries.filter(e => {
        const d = new Date(e.runDate);
        return d.getFullYear() === yr && (d.getMonth() + 1) === mo;
      });
    }

    const chartDataset = buildLeveyJenningsDataset(control, analyteCode, entries, { equipment });
    res.json({ success: true, data: chartDataset });
  } catch (error) {
    console.error('[routes/equipment] Levey-Jennings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /equipment/:id/qc/doh-report - Generate Monthly Internal Quality Control Report for DOH inspection
router.get('/:id/qc/doh-report', requireAuth, (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM
    const rawEq = global.db.getEquipmentById(req.params.id);
    if (!rawEq) return res.status(404).json({ success: false, error: 'Equipment not found.' });

    const equipment = new Equipment(rawEq);
    const controls = (global.db.getQcControls(req.params.id) || []).map(c => new QcControl(c));
    const allEntries = (global.db.getQcEntries(req.params.id) || []).map(e => new QcEntry(e));

    const dohReport = generateDohMonthlyReport(equipment, month, controls, allEntries);
    res.json({ success: true, report: dohReport });
  } catch (error) {
    console.error('[routes/equipment] DOH report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /equipment/:id/qc/print - Official Printable Levey-Jennings QC Report (Letter Size)
router.get('/:id/qc/print', requireAuth, (req, res) => {
  try {
    const { analyteCode, controlId, month } = req.query;
    const targetAnalyte = analyteCode || 'fbs';
    const rawEq = global.db.getEquipmentById(req.params.id);
    if (!rawEq) return res.status(404).send('Equipment not found.');

    const equipment = new Equipment(rawEq);
    let control = null;
    if (controlId) {
      const rawCtrl = global.db.getQcControlById(controlId);
      if (rawCtrl) control = new QcControl(rawCtrl);
    } else {
      const controls = (global.db.getQcControls(req.params.id) || []).map(c => new QcControl(c));
      control = controls.find(c => c.getAnalyte(targetAnalyte)) || controls[0] || null;
    }

    let entries = (global.db.getQcEntries(req.params.id, targetAnalyte) || []).map(e => new QcEntry(e));

    if (month) {
      const [yr, mo] = month.split('-').map(Number);
      entries = entries.filter(e => {
        const d = new Date(e.runDate);
        return d.getFullYear() === yr && (d.getMonth() + 1) === mo;
      });
    }

    const dataset = buildLeveyJenningsDataset(control, targetAnalyte, entries, { equipment });

    const allUsers = (typeof global.db.getUsers === 'function') ? global.db.getUsers() : [];

    const isXray = Boolean(
      equipment.isXRay ||
      (equipment.department && (equipment.department.toLowerCase().includes('radiolog') || equipment.department.toLowerCase().includes('imaging') || equipment.department.toLowerCase().includes('x-ray'))) ||
      (equipment.category && (equipment.category.toLowerCase().includes('x-ray') || equipment.category.toLowerCase().includes('radiolog') || equipment.category.toLowerCase().includes('imaging')))
    );

    // Deduplicate and filter staff strictly by clinical role
    const uniqueUsersByName = [];
    const seenNames = new Set();
    allUsers.forEach(u => {
      const k = (u.name || '').trim().toLowerCase();
      if (k && !seenNames.has(k)) {
        seenNames.add(k);
        uniqueUsersByName.push(u);
      }
    });

    const medtechs = uniqueUsersByName.filter(u =>
      u.role === 'Medical Technologist' ||
      ((u.name && u.name.includes('RMT')) && u.role !== 'Admin' && u.role !== 'Receptionist')
    );
    const radTechs = uniqueUsersByName.filter(u =>
      u.role === 'X-Ray Technologist' ||
      ((u.name && (u.name.includes('RXT') || u.name.includes('RadTech'))) && u.role !== 'Admin')
    );
    const pathologists = uniqueUsersByName.filter(u =>
      u.role === 'Pathologist' || (u.name && u.name.includes('Espiritu'))
    );
    const radiologists = uniqueUsersByName.filter(u => u.role === 'Radiologist');
    const allDoctors = uniqueUsersByName.filter(u =>
      u.role === 'Pathologist' || u.role === 'Radiologist' || u.role === 'Doctor' || u.role === 'Internist' ||
      (u.name && (u.name.includes('MD') || u.name.includes('M.D.')))
    );

    // Operator Candidate pool based strictly on equipment type (clinical = MedTech only, radiology = RadTech only)
    const opPool = isXray
      ? (radTechs.length ? radTechs : [{ name: 'John Kevin R. Estanislao, RXT', licenseNumber: '' }])
      : (medtechs.length ? medtechs : [{ name: 'Gezyne M. Lopez, RMT', licenseNumber: '67820' }]);

    // Default Operator
    let defaultOperator;
    if (isXray) {
      defaultOperator = opPool[0];
    } else {
      const entryOp = entries.length > 0 ? entries[entries.length - 1].operatorName : null;
      const matchedMedtech = entryOp ? opPool.find(u => u.name && u.name.toLowerCase() === entryOp.toLowerCase()) : null;
      defaultOperator = matchedMedtech || opPool.find(u => u.licenseNumber) || opPool[0];
    }

    // Default Validator (QC Supervisor)
    const valPool = opPool;
    let defaultValidator;
    if (isXray) {
      defaultValidator = valPool.find(u => u.id !== defaultOperator.id) || valPool[0];
    } else {
      defaultValidator = valPool.find(u => u.name && u.name.includes('Domingo')) || valPool.find(u => u.id !== defaultOperator.id) || valPool[0];
    }

    // Default Pathologist / Approver
    const p1Pool = isXray
      ? (radiologists.length ? radiologists : allDoctors)
      : (pathologists.length ? pathologists : allDoctors);
    let defaultPathologist = p1Pool[0] || (isXray ? { name: 'Alberto J. Gabriel, MD, FPCR', licenseNumber: '' } : { name: 'Bernadette R. Espiritu, M.D.', licenseNumber: '75547' });

    // Validate query parameter overrides against allowed personnel
    const reqOp = req.query.operatorName ? opPool.find(u => u.name.toLowerCase() === req.query.operatorName.trim().toLowerCase()) : null;
    const reqVal = req.query.validatorName ? valPool.find(u => u.name.toLowerCase() === req.query.validatorName.trim().toLowerCase()) : null;
    const reqP1 = req.query.pathologistName ? (allDoctors.find(u => u.name.toLowerCase() === req.query.pathologistName.trim().toLowerCase()) || p1Pool.find(u => u.name.toLowerCase() === req.query.pathologistName.trim().toLowerCase())) : null;
    const reqP2 = req.query.pathologist2Name ? allDoctors.find(u => u.name.toLowerCase() === req.query.pathologist2Name.trim().toLowerCase()) : null;

    const chosenOp = reqOp || defaultOperator;
    const chosenVal = reqVal || defaultValidator;
    const chosenP1 = reqP1 || defaultPathologist;

    const hasPathologist2 = req.query.hasPathologist2 === '1' ||
      req.query.hasPathologist2 === 'true' ||
      Boolean(req.query.pathologist2Name && req.query.pathologist2Name.trim());

    const signatories = {
      operatorName: chosenOp.name,
      operatorTitle: isXray ? 'Performed By (X-Ray Technologist)' : 'Performed By (Medical Technologist)',
      operatorLicense: (req.query.operatorLicense !== undefined && req.query.operatorLicense !== '' && reqOp)
        ? req.query.operatorLicense
        : (chosenOp.licenseNumber || ''),

      validatorName: chosenVal.name,
      validatorTitle: isXray ? 'Reviewed & Verified By (Radiology Supervisor)' : 'Reviewed & Verified By (QC Supervisor)',
      validatorLicense: (req.query.validatorLicense !== undefined && req.query.validatorLicense !== '' && reqVal)
        ? req.query.validatorLicense
        : (chosenVal.licenseNumber || ''),

      pathologistName: chosenP1.name,
      pathologistTitle: isXray ? 'Approved By (Radiologist)' : 'Approved By (Head of Laboratory / Pathologist)',
      pathologistLicense: (req.query.pathologistLicense !== undefined && req.query.pathologistLicense !== '' && reqP1)
        ? req.query.pathologistLicense
        : (chosenP1.licenseNumber || (isXray ? '' : '75547')),

      hasPathologist2: hasPathologist2,
      pathologist2Name: reqP2 ? reqP2.name : (req.query.pathologist2Name || ''),
      pathologist2Title: isXray ? 'Approved By (Associate Radiologist)' : 'Approved By (Associate Pathologist)',
      pathologist2License: (req.query.pathologist2License !== undefined && req.query.pathologist2License !== '')
        ? req.query.pathologist2License
        : ((reqP2 && reqP2.licenseNumber) || '')
    };

    res.render('equipment/print_lj', {
      layout: false,
      title: `Levey-Jennings QC Report - ${dataset.analyteName} (${dataset.lotNumber})`,
      equipment,
      dataset,
      signatories,
      allUsers
    });
  } catch (error) {
    console.error('[routes/equipment] Print Levey-Jennings error:', error);
    res.status(500).send('Error generating printable QC report: ' + error.message);
  }
});

// GET /equipment/api/signatories - Real-time signatory users for dynamic auto-refresh
router.get('/api/signatories', requireAuth, (req, res) => {
  try {
    const rawUsers = (typeof global.db.getUsers === 'function') ? global.db.getUsers() : [];
    const users = rawUsers.map(u => ({
      id: u.id,
      name: u.name,
      role: u.role,
      license: u.licenseNumber || ''
    }));
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. NEQAS EXTERNAL QUALITY ASSESSMENT
// ==========================================

// GET /equipment/:id/neqas & GET /equipment/neqas/all - List NEQAS survey entries
router.get('/:id/neqas', requireAuth, (req, res) => {
  try {
    const records = (global.db.getNeqasRecords(req.params.id) || []).map(n => new NeqasRecord(n));
    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/neqas/all', requireAuth, (req, res) => {
  try {
    const records = (global.db.getNeqasRecords() || []).map(n => new NeqasRecord(n));
    res.json({ success: true, records });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /equipment/:id/neqas - Record NEQAS Proficiency Test Survey Submission
router.post('/:id/neqas', requireAuth, (req, res) => {
  try {
    const rawEq = global.db.getEquipmentById(req.params.id);
    const equipment = rawEq ? new Equipment(rawEq) : null;

    const body = req.body || {};
    body.equipmentId = req.params.id;
    body.equipmentName = equipment ? equipment.name : '';
    body.reportedBy = body.reportedBy || getActor(req);

    const record = new NeqasRecord(body);
    const saved = global.db.saveNeqasRecord(record);

    res.status(201).json({ success: true, message: 'NEQAS record saved.', record: saved });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /equipment/neqas/:recordId - Update NEQAS evaluation results, SDI, and corrective action
router.put('/neqas/:recordId', requireAuth, (req, res) => {
  try {
    const raw = global.db.getNeqasRecordById(req.params.recordId);
    if (!raw) return res.status(404).json({ success: false, error: 'NEQAS record not found.' });

    const updated = new NeqasRecord({
      ...raw,
      ...req.body,
      id: raw.id,
      updatedAt: new Date().toISOString()
    });

    global.db.saveNeqasRecord(updated);
    res.json({ success: true, message: 'NEQAS record updated.', record: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /equipment/neqas/:recordId - Delete NEQAS record
router.delete('/neqas/:recordId', requireAuth, (req, res) => {
  try {
    const success = global.db.deleteNeqasRecord(req.params.recordId);
    res.json({ success, message: 'NEQAS record deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /equipment/neqas/report - NEQAS DOH EQA Summary Report
router.get('/neqas/report', requireAuth, (req, res) => {
  try {
    const { cycleYear } = req.query;
    const year = cycleYear || String(new Date().getFullYear());
    const all = (global.db.getNeqasRecords() || []).map(n => new NeqasRecord(n));
    const yearRecords = all.filter(r => r.cycleYear === year);

    const acceptableCount = yearRecords.filter(r => r.isAcceptable).length;
    const questionableCount = yearRecords.filter(r => r.status === 'EVALUATED_QUESTIONABLE').length;
    const unsatisfactoryCount = yearRecords.filter(r => r.isUnsatisfactory).length;
    const pendingCount = yearRecords.filter(r => r.status === 'PENDING_RESULT' || r.status === 'SUBMITTED').length;

    res.json({
      success: true,
      cycleYear: year,
      facility: {
        name: 'GEZYNE CLINICAL LABORATORY',
        licenseNumber: '03-435-15CL-20'
      },
      summary: {
        totalSurveys: yearRecords.length,
        acceptableCount,
        questionableCount,
        unsatisfactoryCount,
        pendingCount,
        performanceRating: yearRecords.length > 0
          ? Number(((acceptableCount / (yearRecords.length - pendingCount || 1)) * 100).toFixed(1)) + '%'
          : 'N/A'
      },
      records: yearRecords
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
