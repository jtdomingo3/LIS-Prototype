import { Router, Request, Response } from 'express';
import { PatientModel } from '../models/Patient';
import { TestModel } from '../models/Test';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/patients - List patients with pagination, search, filters
 */
router.get('/', requirePermission('patients'), (req: Request, res: Response) => {
  try {
    const { page, limit, search, date, company, sortBy, sortOrder } = req.query;

    const result = PatientModel.findAll({
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
      search: search as string,
      date: date as string,
      company: company as string,
      sortBy: sortBy as string,
      sortOrder: (sortOrder as 'ASC' | 'DESC') || 'DESC',
    });

    return res.json({
      patients: result.patients,
      total: result.total,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
    });
  } catch (err: any) {
    console.error('[patients] list error:', err);
    return res.status(500).json({ error: 'Failed to list patients' });
  }
});

/**
 * GET /api/patients/:id - Get patient with their tests
 */
router.get('/:id', requirePermission('patients'), (req: Request, res: Response) => {
  try {
    const patient = PatientModel.findById(req.params.id);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    const tests = TestModel.findByPatientId(patient.id);

    return res.json({ patient, tests });
  } catch (err: any) {
    console.error('[patients] get error:', err);
    return res.status(500).json({ error: 'Failed to get patient' });
  }
});

/**
 * POST /api/patients - Create new patient
 */
router.post('/', requirePermission('patients'), (req: Request, res: Response) => {
  try {
    const data = req.body;

    if (!data.first_name || !data.last_name) {
      return res.status(400).json({ error: 'First name and last name are required' });
    }

    // Generate IDs
    data.patient_id = PatientModel.getNextPatientId();
    data.patient_code = PatientModel.generatePatientCode();
    data.created_by = req.user?.userId;

    const patient = PatientModel.create(data);
    return res.status(201).json({ patient });
  } catch (err: any) {
    console.error('[patients] create error:', err);
    return res.status(500).json({ error: 'Failed to create patient' });
  }
});

/**
 * PUT /api/patients/:id - Update patient
 */
router.put('/:id', requirePermission('patients'), (req: Request, res: Response) => {
  try {
    const patient = PatientModel.update(req.params.id, req.body);
    if (!patient) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    return res.json({ patient });
  } catch (err: any) {
    console.error('[patients] update error:', err);
    return res.status(500).json({ error: 'Failed to update patient' });
  }
});

/**
 * DELETE /api/patients/:id - Delete patient
 */
router.delete('/:id', requirePermission('patients', 'delete'), (req: Request, res: Response) => {
  try {
    // Check if patient has tests
    const tests = TestModel.findByPatientId(req.params.id);
    if (tests.length > 0) {
      return res.status(400).json({ error: 'Cannot delete patient with existing tests. Delete tests first.' });
    }

    const deleted = PatientModel.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Patient not found' });
    }

    return res.json({ message: 'Patient deleted' });
  } catch (err: any) {
    console.error('[patients] delete error:', err);
    return res.status(500).json({ error: 'Failed to delete patient' });
  }
});

export default router;
