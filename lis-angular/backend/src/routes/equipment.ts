import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { EquipmentModel } from '../models/Equipment';

const router = Router();

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

// QC Controls listing
router.get('/qc/controls', requireAuth, (req: Request, res: Response) => {
  try {
    const { equipment_id } = req.query;
    const controls = EquipmentModel.findQcControls(equipment_id as string);
    res.json(controls);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// QC Entries for Levey-Jennings
router.get('/qc/entries/:controlId', requireAuth, (req: Request, res: Response) => {
  try {
    const { analyte_code } = req.query;
    const entries = EquipmentModel.findQcEntries(req.params.controlId, analyte_code as string);
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Record QC Entry
router.post('/qc/entries', requireAuth, (req: Request, res: Response) => {
  try {
    const performedBy = req.user ? req.user.email : 'System';
    const entry = EquipmentModel.addQcEntry({
      ...req.body,
      performed_by: performedBy,
    });
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// NEQAS records
router.get('/neqas/records', requireAuth, (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const records = EquipmentModel.findNeqasRecords(year as string);
    res.json(records);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get equipment by ID
router.get('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const eq = EquipmentModel.findById(req.params.id);
    if (!eq) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }
    const logs = EquipmentModel.findLogs(eq.id);
    const qcControls = EquipmentModel.findQcControls(eq.id);
    res.json({ ...eq, logs, qc_controls: qcControls });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create equipment
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

// Update equipment
router.put('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const updated = EquipmentModel.update(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete equipment
router.delete('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const ok = EquipmentModel.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }
    res.json({ message: 'Equipment deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get equipment service logs
router.get('/:id/logs', requireAuth, (req: Request, res: Response) => {
  try {
    const logs = EquipmentModel.findLogs(req.params.id);
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add equipment log (Calibration, PM, etc.)
router.post('/:id/logs', requireAuth, (req: Request, res: Response) => {
  try {
    const eq = EquipmentModel.findById(req.params.id);
    if (!eq) {
      res.status(404).json({ error: 'Equipment not found' });
      return;
    }
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

export default router;
