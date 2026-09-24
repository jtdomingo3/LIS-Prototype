import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { EquipmentModel, Equipment, QcControl, QcEntry, NeqasRecord } from '../models/Equipment';
import { UserModel } from '../models/User';
import {
  evaluateWestgardRules,
  buildLeveyJenningsDataset,
  generateDohMonthlyReport,
  DEFAULT_CHEMISTRY_ANALYTES,
  DEFAULT_CHEMISTRY_ANALYTES_LEVEL2,
  areAnalyteAliases
} from '../services/leveyJenningsService';

const router = Router();

// Standard Philippine National Reference Laboratories
const DEFAULT_NRL_LIST = [
  { id: 'nrl-1', code: 'NKTI', name: 'National Kidney and Transplant Institute (NKTI)', program: 'Hematology, Clinical Microscopy, Urinalysis', contact: 'nrl@nkti.gov.ph' },
  { id: 'nrl-2', code: 'LCP', name: 'Lung Center of the Philippines (LCP)', program: 'Clinical Chemistry (Blood Chem, Electrolytes)', contact: 'nrl@lcp.gov.ph' },
  { id: 'nrl-3', code: 'RITM', name: 'Research Institute for Tropical Medicine (RITM)', program: 'Infectious Diseases, Serology, Dengue, HIV/AIDS', contact: 'nrl@ritm.gov.ph' },
  { id: 'nrl-4', code: 'SLH', name: 'San Lazaro Hospital / SACCL', program: 'HIV/AIDS, Hepatitis, STIs Confirmatory', contact: 'saccl@slh.gov.ph' },
  { id: 'nrl-5', code: 'EAMC', name: 'East Avenue Medical Center (EAMC)', program: 'Toxicology, Drug Testing, Micronutrients', contact: 'nrl@eamc.gov.ph' },
];

let inMemoryNrlList = [...DEFAULT_NRL_LIST];

// ==========================================
// 1. SPECIFIC GET ENDPOINTS (BEFORE /:id)
// ==========================================

// List equipment
router.get('/', requireAuth, (req: Request, res: Response) => {
  try {
    const { department, status, search } = req.query;
    const items = EquipmentModel.findAll({
      department: department as string,
      status: status as string,
      search: search as string,
    });
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/lj-analyzers - Filtered instruments suitable for Levey-Jennings QC
router.get('/api/lj-analyzers', requireAuth, (_req: Request, res: Response) => {
  try {
    const all = EquipmentModel.findAll({});
    const analyzers = all.filter(e => {
      const cat = (e.category || '').toLowerCase();
      const dep = (e.department || '').toLowerCase();
      const name = (e.name || '').toLowerCase();
      return cat.includes('analyzer') ||
             ['hematology', 'clinical chemistry', 'immunology', 'urinalysis'].some(d => dep.includes(d)) ||
             name.includes('analyzer');
    });
    res.json(analyzers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /alerts/upcoming - Calibrations & PM Due Alerts
router.get('/alerts/upcoming', requireAuth, (_req: Request, res: Response) => {
  try {
    const alerts = EquipmentModel.getUpcomingAlerts();
    res.json(alerts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /xray/compliance - Radiation Safety & CDRRHR Compliance
router.get('/xray/compliance', requireAuth, (_req: Request, res: Response) => {
  try {
    const compliance = EquipmentModel.getXrayCompliance();
    res.json(compliance);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/signatories - Registered Pathologists & MedTechs for QC reports
router.get('/api/signatories', requireAuth, (_req: Request, res: Response) => {
  try {
    const users = UserModel.findAll();
    const signatories = users
      .filter(u => u.status === 'active' && ['Pathologist', 'Medical Technologist', 'Admin'].includes(u.role))
      .map(u => ({
        id: u.id,
        name: u.name,
        role: u.role,
        designation: (u as any).designation || (u.role === 'Pathologist' ? 'Pathologist' : 'Medical Technologist'),
        licenseNumber: u.license_number,
        hasSignature: !!u.signature,
      }));
    res.json({ success: true, signatories });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /qc/analytes/default - Default Clinical Chemistry Analytes (21 official analytes)
router.get('/qc/analytes/default', requireAuth, (_req: Request, res: Response) => {
  res.json({ success: true, analytes: DEFAULT_CHEMISTRY_ANALYTES });
});

// GET /qc/controls - Legacy/global QC controls listing
router.get('/qc/controls', requireAuth, (req: Request, res: Response) => {
  try {
    const { equipment_id } = req.query;
    const controls = EquipmentModel.findQcControls(equipment_id as string);
    res.json(controls);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /neqas/nrl-list - List Philippine National Reference Laboratories
router.get('/neqas/nrl-list', requireAuth, (_req: Request, res: Response) => {
  res.json({ success: true, list: inMemoryNrlList });
});

router.post('/neqas/nrl-list', requireAuth, (req: Request, res: Response) => {
  const { code, name, program, contact } = req.body || {};
  if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
  const newNrl = { id: `nrl-${Date.now()}`, code: code || 'NRL', name, program: program || '', contact: contact || '' };
  inMemoryNrlList.push(newNrl);
  res.json({ success: true, list: inMemoryNrlList });
});

router.delete('/neqas/nrl-list/:id', requireAuth, (req: Request, res: Response) => {
  inMemoryNrlList = inMemoryNrlList.filter(n => n.id !== req.params.id);
  res.json({ success: true, list: inMemoryNrlList });
});

// GET /neqas/all or /neqas/records - Global NEQAS records
router.get('/neqas/all', requireAuth, (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const records = EquipmentModel.findNeqasRecords(year as string);
    res.json({ success: true, records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/neqas/records', requireAuth, (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const records = EquipmentModel.findNeqasRecords(year as string);
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /neqas/report - Aggregate NEQAS performance report
router.get('/neqas/report', requireAuth, (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const records = EquipmentModel.findNeqasRecords(year as string);
    const total = records.length;
    const excellent = records.filter(r => r.status === 'EXCELLENT' || (r.achieved_score !== null && r.achieved_score >= 90)).length;
    const acceptable = records.filter(r => r.status === 'ACCEPTABLE' || (r.achieved_score !== null && r.achieved_score >= 80 && r.achieved_score < 90)).length;
    const actionRequired = records.filter(r => r.status === 'ACTION_REQUIRED' || (r.achieved_score !== null && r.achieved_score < 80)).length;

    res.json({
      success: true,
      year: year || String(new Date().getFullYear()),
      summary: { total, excellent, acceptable, actionRequired },
      records
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. LOG & QC CONTROL SPECIFIC ROUTES
// ==========================================

// GET /logs/:logId - Get specific service log
router.get('/logs/:logId', requireAuth, (req: Request, res: Response) => {
  try {
    const log = EquipmentModel.findLogById(req.params.logId);
    if (!log) return res.status(404).json({ error: 'Log not found' });
    res.json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /logs/:logId - Update service log
router.put('/logs/:logId', requireAuth, (req: Request, res: Response) => {
  try {
    const updated = EquipmentModel.updateLog(req.params.logId, req.body);
    if (!updated) return res.status(404).json({ error: 'Log not found' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /logs/:logId - Delete service log
router.delete('/logs/:logId', requireAuth, (req: Request, res: Response) => {
  try {
    const ok = EquipmentModel.deleteLog(req.params.logId);
    if (!ok) return res.status(404).json({ error: 'Log not found' });
    res.json({ success: true, message: 'Log deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /qc/controls/:controlId - Update QC control material
router.put('/qc/controls/:controlId', requireAuth, (req: Request, res: Response) => {
  try {
    const updated = EquipmentModel.updateQcControl(req.params.controlId, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'Control not found' });
    res.json({ success: true, message: 'Control updated', control: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /qc/controls/:controlId - Delete QC control material
router.delete('/qc/controls/:controlId', requireAuth, (req: Request, res: Response) => {
  try {
    const ok = EquipmentModel.deleteQcControl(req.params.controlId);
    if (!ok) return res.status(404).json({ success: false, error: 'Control not found' });
    res.json({ success: true, message: 'Control deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /qc/entries/:entryId/corrective-action - Log corrective action on QC failure
router.post('/qc/entries/:entryId/corrective-action', requireAuth, (req: Request, res: Response) => {
  try {
    const { actionTaken, resolved, notes } = req.body;
    if (!actionTaken) return res.status(400).json({ success: false, error: 'actionTaken is required' });

    const user = req.user ? req.user.email : 'System';
    const correctiveAction = {
      actionTaken,
      actionTakenBy: user,
      date: new Date().toISOString(),
      resolved: resolved !== undefined ? !!resolved : true,
      notes: notes || '',
    };

    const updated = EquipmentModel.updateQcEntry(req.params.entryId, {
      corrective_action: correctiveAction,
    });
    if (!updated) return res.status(404).json({ success: false, error: 'QC entry not found' });

    res.json({
      success: true,
      message: 'Corrective action recorded per ISO 15189 compliance.',
      entry: updated,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /qc/entries/:entryId - Delete specific QC entry
router.delete('/qc/entries/:entryId', requireAuth, (req: Request, res: Response) => {
  try {
    const ok = EquipmentModel.deleteQcEntry(req.params.entryId);
    if (!ok) return res.status(404).json({ success: false, error: 'QC entry not found' });
    res.json({ success: true, message: 'QC entry deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /neqas/:recordId - Update NEQAS record
router.put('/neqas/:recordId', requireAuth, (req: Request, res: Response) => {
  try {
    const updated = EquipmentModel.updateNeqasRecord(req.params.recordId, req.body);
    if (!updated) return res.status(404).json({ success: false, error: 'NEQAS record not found' });
    res.json({ success: true, message: 'NEQAS record updated', record: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /neqas/:recordId - Delete NEQAS record
router.delete('/neqas/:recordId', requireAuth, (req: Request, res: Response) => {
  try {
    const ok = EquipmentModel.deleteNeqasRecord(req.params.recordId);
    if (!ok) return res.status(404).json({ success: false, error: 'NEQAS record not found' });
    res.json({ success: true, message: 'NEQAS record deleted' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. PARAMETERIZED ROUTES (/:id/...)
// ==========================================

// GET /:id - Equipment details
router.get('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const eq = EquipmentModel.findById(req.params.id);
    if (!eq) return res.status(404).json({ error: 'Equipment not found' });
    const logs = EquipmentModel.findLogs(eq.id);
    const qcControls = EquipmentModel.findQcControls(eq.id);
    res.json({ ...eq, logs, qc_controls: qcControls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - Create equipment
router.post('/', requireAuth, (req: Request, res: Response) => {
  try {
    const createdBy = req.user ? req.user.email : 'System';
    const eq = EquipmentModel.create({
      ...req.body,
      created_by: createdBy,
    });
    res.status(201).json(eq);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id - Update equipment
router.put('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const updated = EquipmentModel.update(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Equipment not found' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/status - Update equipment status
router.post('/:id/status', requireAuth, (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    const updated = EquipmentModel.update(req.params.id, { status });
    if (!updated) return res.status(404).json({ error: 'Equipment not found' });
    res.json({ success: true, message: `Status updated to ${status}`, equipment: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id - Delete equipment
router.delete('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const ok = EquipmentModel.delete(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Equipment not found' });
    res.json({ message: 'Equipment deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/logs - List equipment logs
router.get('/:id/logs', requireAuth, (req: Request, res: Response) => {
  try {
    const logs = EquipmentModel.findLogs(req.params.id);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/logs - Add equipment log
router.post('/:id/logs', requireAuth, (req: Request, res: Response) => {
  try {
    const eq = EquipmentModel.findById(req.params.id);
    if (!eq) return res.status(404).json({ error: 'Equipment not found' });
    const performedBy = req.user ? req.user.email : 'System';
    const log = EquipmentModel.addLog({
      ...req.body,
      equipment_id: eq.id,
      performed_by: performedBy,
    });
    res.status(201).json(log);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/qc/controls - Controls for equipment
router.get('/:id/qc/controls', requireAuth, (req: Request, res: Response) => {
  try {
    const controls = EquipmentModel.findQcControls(req.params.id);
    res.json({ success: true, controls });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/qc/controls - Register new control material
router.post('/:id/qc/controls', requireAuth, (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    body.equipment_id = req.params.id;

    if (!body.analytes || !body.analytes.length) {
      const isL2 = String(body.level || '').includes('2') ||
                   String(body.control_name || '').includes('Level 2') ||
                   String(body.level || '').toLowerCase().includes('high');
      body.analytes = isL2 ? DEFAULT_CHEMISTRY_ANALYTES_LEVEL2 : DEFAULT_CHEMISTRY_ANALYTES;
    }

    const saved = EquipmentModel.addQcControl(body);
    res.status(201).json({ success: true, message: 'QC Control material registered.', control: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/qc/analytes/preload-blood-chemistry - Preload all 21 Blood Chemistry Analytes
router.post('/:id/qc/analytes/preload-blood-chemistry', requireAuth, (req: Request, res: Response) => {
  try {
    const eq = EquipmentModel.findById(req.params.id);
    if (!eq) return res.status(404).json({ success: false, error: 'Equipment not found' });

    const { controlName, lotNumber, level } = req.body || {};
    const controls = EquipmentModel.findQcControls(req.params.id);
    let ctrl = controls[0];

    const isL2 = String(level || '').includes('2') || String(level || '').toLowerCase().includes('high');
    const templateAnalytes = isL2 ? DEFAULT_CHEMISTRY_ANALYTES_LEVEL2 : DEFAULT_CHEMISTRY_ANALYTES;

    if (!ctrl) {
      ctrl = EquipmentModel.addQcControl({
        equipment_id: req.params.id,
        control_name: controlName || `${eq.name} Control Lot Level 1 (Normal)`,
        lot_number: lotNumber || `LOT-BR-${new Date().getFullYear()}-N1`,
        level: level || 'Level 1 (Normal)',
        expiration_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        analytes: templateAnalytes,
      });
    } else {
      const existingAnalytes = ctrl.analytes || [];
      const updatedAnalytes = [...existingAnalytes];
      for (const item of templateAnalytes) {
        const exists = updatedAnalytes.some((a: any) => areAnalyteAliases(a.analyteCode || a.analyte_code, item.analyteCode));
        if (!exists) {
          updatedAnalytes.push({ ...item });
        }
      }
      ctrl = EquipmentModel.updateQcControl(ctrl.id, {
        control_name: controlName || ctrl.control_name,
        lot_number: lotNumber || ctrl.lot_number,
        level: level || ctrl.level,
        analytes: updatedAnalytes,
      })!;
    }

    res.json({
      success: true,
      message: `Pre-loaded all 21 Blood Chemistry analytes on "${ctrl.control_name}" for ${eq.name}.`,
      control: ctrl,
      analytesCount: (ctrl.analytes || []).length
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/qc/analytes - Add or update a QC analyte on this equipment's control
router.post('/:id/qc/analytes', requireAuth, (req: Request, res: Response) => {
  try {
    const { controlId, analyteCode, analyteName, unit, targetMean, targetSd, teaPercent, category } = req.body;
    if (!analyteCode || targetMean === undefined || targetSd === undefined) {
      return res.status(400).json({ success: false, error: 'analyteCode, targetMean, and targetSd are required' });
    }

    const controls = EquipmentModel.findQcControls(req.params.id);
    const targetCtrl = controlId ? controls.find(c => c.id === controlId) : controls[0];
    if (!targetCtrl) {
      return res.status(404).json({ success: false, error: 'Control not found for this equipment' });
    }

    const existingAnalytes = targetCtrl.analytes || [];
    const idx = existingAnalytes.findIndex((a: any) => areAnalyteAliases(a.analyteCode || a.analyte_code, analyteCode));

    const newAnalyte = {
      analyteCode,
      analyteName: analyteName || analyteCode.toUpperCase(),
      unit: unit || 'mg/dL',
      targetMean: Number(targetMean),
      targetSd: Number(targetSd),
      teaPercent: Number(teaPercent) || 10.0,
      category: category || 'General',
      aliases: [analyteCode.toLowerCase()]
    };

    if (idx >= 0) {
      existingAnalytes[idx] = { ...existingAnalytes[idx], ...newAnalyte };
    } else {
      existingAnalytes.push(newAnalyte);
    }

    const updated = EquipmentModel.updateQcControl(targetCtrl.id, { analytes: existingAnalytes });
    res.json({ success: true, message: `Analyte ${analyteCode} saved on control ${targetCtrl.control_name}`, control: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id/qc/entries - List QC entries for equipment
router.get('/:id/qc/entries', requireAuth, (req: Request, res: Response) => {
  try {
    const { controlId, analyteCode } = req.query;
    const entries = EquipmentModel.findQcEntries(controlId as string, analyteCode as string, req.params.id);
    res.json({ success: true, entries });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/qc/entries - Record QC entry with automated Westgard multi-rule check
router.post('/:id/qc/entries', requireAuth, (req: Request, res: Response) => {
  try {
    const eq = EquipmentModel.findById(req.params.id);
    if (!eq) return res.status(404).json({ success: false, error: 'Equipment not found' });

    const {
      controlId,
      analyteCode,
      analyteName,
      measuredValue,
      targetMean,
      targetSd,
      runDate,
      runNumber,
      reagentLotNumber,
      notes
    } = req.body;

    if (!controlId || !analyteCode || measuredValue === undefined) {
      return res.status(400).json({ success: false, error: 'controlId, analyteCode, and measuredValue are required' });
    }

    const val = Number(measuredValue);
    let mean = Number(targetMean);
    let sd = Number(targetSd);

    // Resolve mean and SD from control if not provided
    if (isNaN(mean) || isNaN(sd) || sd <= 0) {
      const ctrl = EquipmentModel.findQcControlById(controlId);
      const analytes = ctrl?.analytes || [];
      const found = analytes.find((a: any) => areAnalyteAliases(a.analyteCode || a.analyte_code, analyteCode));
      if (found) {
        mean = Number(found.targetMean || found.target_mean);
        sd = Number(found.targetSd || found.target_sd);
      }
    }

    if (isNaN(mean) || isNaN(sd) || sd <= 0) {
      return res.status(400).json({ success: false, error: 'A valid targetMean and positive targetSd are required' });
    }

    // Retrieve previous runs for this analyte on this control to evaluate Westgard rules
    const history = EquipmentModel.findQcEntries(controlId, analyteCode, req.params.id);

    // Run Westgard Multi-Rule Evaluator
    const evaluation = evaluateWestgardRules(
      { measuredValue: val, targetMean: mean, targetSd: sd },
      history.map(h => ({ measuredValue: h.measured_value, zScore: h.z_score !== null ? h.z_score : undefined }))
    );

    const user = req.user ? req.user.email : 'System';

    const entry = EquipmentModel.addQcEntry({
      equipment_id: req.params.id,
      control_id: controlId,
      analyte_code: analyteCode,
      analyte_name: analyteName || analyteCode.toUpperCase(),
      measured_value: val,
      mean_target: mean,
      sd_target: sd,
      z_score: evaluation.zScore,
      status: evaluation.status,
      violated_rules: evaluation.rulesViolated,
      violation_type: evaluation.violationType,
      run_number: runNumber ? Number(runNumber) : (history.length + 1),
      reagent_lot_number: reagentLotNumber || null,
      performed_by: user,
      notes: notes || evaluation.explanation,
      run_date: runDate || new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      message: `QC Entry recorded. Status: ${evaluation.status}`,
      entry,
      evaluation
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:id/qc/entries/last - Undo / remove last recorded QC run
router.delete('/:id/qc/entries/last', requireAuth, (req: Request, res: Response) => {
  try {
    const { controlId, analyteCode } = req.query;
    const ok = EquipmentModel.deleteLastQcEntry(req.params.id, controlId as string, analyteCode as string);
    if (!ok) return res.status(404).json({ success: false, error: 'No recent QC entry found to remove' });
    res.json({ success: true, message: 'Last QC entry removed successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:id/qc/entries - Clear all entries for equipment (Admin only)
router.delete('/:id/qc/entries', requireAuth, (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'Admin') {
      return res.status(403).json({ success: false, error: 'Admin permission required to clear all QC entries' });
    }
    const ok = EquipmentModel.deleteAllQcEntries(req.params.id);
    res.json({ success: true, message: 'All QC entries cleared for this equipment' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id/qc/levey-jennings - Complete Levey-Jennings Chart Dataset
router.get('/:id/qc/levey-jennings', requireAuth, (req: Request, res: Response) => {
  try {
    const eq = EquipmentModel.findById(req.params.id);
    if (!eq) return res.status(404).json({ success: false, error: 'Equipment not found' });

    const { controlId, analyteCode, startDate, endDate } = req.query;
    if (!analyteCode) {
      return res.status(400).json({ success: false, error: 'analyteCode is required' });
    }

    const controls = EquipmentModel.findQcControls(eq.id);
    const targetCtrl = controlId ? controls.find(c => c.id === controlId) : controls[0];

    const entries = EquipmentModel.findQcEntries(targetCtrl ? targetCtrl.id : undefined, analyteCode as string, eq.id);

    const dataset = buildLeveyJenningsDataset(targetCtrl, analyteCode as string, entries, {
      startDate: startDate as string,
      endDate: endDate as string,
      equipment: eq
    });

    res.json({ success: true, dataset });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id/qc/doh-report - Generate Monthly DOH Internal QC Compliance Report
router.get('/:id/qc/doh-report', requireAuth, (req: Request, res: Response) => {
  try {
    const eq = EquipmentModel.findById(req.params.id);
    if (!eq) return res.status(404).json({ success: false, error: 'Equipment not found' });

    const { month } = req.query; // YYYY-MM
    const controls = EquipmentModel.findQcControls(eq.id);
    const entries = EquipmentModel.findQcEntries(undefined, undefined, eq.id);

    const report = generateDohMonthlyReport(eq, month as string, controls, entries);
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id/neqas - NEQAS records for equipment
router.get('/:id/neqas', requireAuth, (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const records = EquipmentModel.findNeqasRecords(year as string, req.params.id);
    res.json({ success: true, records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /:id/neqas - Record NEQAS evaluation
router.post('/:id/neqas', requireAuth, (req: Request, res: Response) => {
  try {
    const eq = EquipmentModel.findById(req.params.id);
    if (!eq) return res.status(404).json({ success: false, error: 'Equipment not found' });

    const record = EquipmentModel.addNeqasRecord({
      ...req.body,
      equipment_id: eq.id,
    });
    res.status(201).json({ success: true, message: 'NEQAS record saved', record });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
