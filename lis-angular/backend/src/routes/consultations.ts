import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { ConsultationModel } from '../models/Consultation';
import { PatientModel } from '../models/Patient';
import { TestModel } from '../models/Test';
import { UserModel } from '../models/User';

const router = Router();

// List all consultations
router.get('/', requireAuth, (req: Request, res: Response) => {
  try {
    const { patient_id, test_id, status, limit, offset, q } = req.query;
    const result = ConsultationModel.findAll({
      patient_id: patient_id as string,
      test_id: test_id as string,
      status: status as string,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    
    // Enrich each consultation with patient info
    const enriched = result.consultations.map(c => {
      const patient = PatientModel.findById(c.patient_id);
      return { ...c, patient };
    });

    // Optional text filter on patient name or diagnosis or chief complaint
    let filtered = enriched;
    if (q && typeof q === 'string' && q.trim()) {
      const query = q.trim().toLowerCase();
      filtered = enriched.filter(c => {
        const pName = c.patient ? `${c.patient.first_name} ${c.patient.last_name}`.toLowerCase() : '';
        const pCode = c.patient?.patient_code?.toLowerCase() || '';
        const diag = (c.primary_diagnosis || '').toLowerCase();
        const cc = (c.chief_complaint || '').toLowerCase();
        const doc = (c.doctor_name || '').toLowerCase();
        return pName.includes(query) || pCode.includes(query) || diag.includes(query) || cc.includes(query) || doc.includes(query);
      });
    }

    res.json({ consultations: filtered, total: result.total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get consultation by ID
router.get('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const consult = ConsultationModel.findById(req.params.id);
    if (!consult) {
      res.status(404).json({ error: 'Consultation not found' });
      return;
    }
    const patient = PatientModel.findById(consult.patient_id);
    const test = consult.test_id ? TestModel.findById(consult.test_id) : null;
    res.json({ ...consult, patient, test });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get consultation by Test ID
router.get('/by-test/:testId', requireAuth, (req: Request, res: Response) => {
  try {
    const consult = ConsultationModel.findByTestId(req.params.testId);
    if (!consult) {
      res.status(404).json({ error: 'No consultation found for this test' });
      return;
    }
    const patient = PatientModel.findById(consult.patient_id);
    const test = TestModel.findById(req.params.testId);
    res.json({ ...consult, patient, test });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get consultations by Patient ID
router.get('/by-patient/:patientId', requireAuth, (req: Request, res: Response) => {
  try {
    const consults = ConsultationModel.findByPatientId(req.params.patientId);
    res.json(consults);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new consultation
router.post('/', requireAuth, (req: Request, res: Response) => {
  try {
    const { patient_id } = req.body;
    if (!patient_id) {
      res.status(400).json({ error: 'Patient ID is required' });
      return;
    }

    // Auto capture doctor details if logged in user is physician/doctor
    let doctorName = req.body.doctor_name;
    let doctorLicense = req.body.doctor_license_number;
    let doctorDesignation = req.body.doctor_designation;
    let doctorId = req.body.doctor_id;

    if (req.user) {
      const user = UserModel.findById(req.user.userId);
      if (user) {
        const isDocRole = ['Doctor', 'Physician', 'Internist', 'Cardiologist', 'Pathologist'].includes(user.role) ||
          (user.name && (user.name.includes('Dr.') || user.name.includes('MD')));
        if (isDocRole && !doctorName) {
          doctorId = user.id;
          doctorName = user.name;
          doctorLicense = user.license_number || doctorLicense;
          doctorDesignation = user.designation || user.role || 'Physician';
        }
      }
    }

    const created = ConsultationModel.create({
      ...req.body,
      doctor_id: doctorId,
      doctor_name: doctorName,
      doctor_license_number: doctorLicense,
      doctor_designation: doctorDesignation,
    });

    // If linked to a test, optionally mark test status as 'In Progress' or 'Checked'
    if (created.test_id) {
      const test = TestModel.findById(created.test_id);
      if (test && test.status === 'Pending') {
        TestModel.update(test.id, { status: 'In Progress' });
      }
    }

    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update consultation
router.put('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const updated = ConsultationModel.update(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Consultation not found' });
      return;
    }

    // If consultation marked as 'Completed', transition linked test to 'Checked'
    if (updated.status === 'Completed' && updated.test_id) {
      const test = TestModel.findById(updated.test_id);
      if (test && test.status !== 'Checked' && test.status !== 'Released') {
        TestModel.update(test.id, {
          status: 'Checked',
          completed_at: new Date().toISOString(),
        });
      }
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete consultation
router.delete('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const ok = ConsultationModel.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Consultation not found' });
      return;
    }
    res.json({ message: 'Consultation deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Print data payload endpoints (for rendering printable templates on client)
router.get('/:id/print-data', requireAuth, (req: Request, res: Response) => {
  try {
    const consult = ConsultationModel.findById(req.params.id);
    if (!consult) {
      res.status(404).json({ error: 'Consultation not found' });
      return;
    }
    const patient = PatientModel.findById(consult.patient_id);
    const test = consult.test_id ? TestModel.findById(consult.test_id) : null;
    res.json({
      consultation: consult,
      patient,
      test,
      clinic: {
        name: 'Gezyne Clinical Laboratory & Medical Clinic',
        address: 'Bacolod City, Negros Occidental, Philippines',
        phone: '+63 (34) 434-0000',
        email: 'info@gezynelab.com',
        accreditation: 'DOH Accredited Clinical Laboratory',
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
