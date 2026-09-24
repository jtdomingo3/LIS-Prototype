"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const Consultation_1 = require("../models/Consultation");
const Patient_1 = require("../models/Patient");
const Test_1 = require("../models/Test");
const User_1 = require("../models/User");
const router = (0, express_1.Router)();
// List all consultations
router.get('/', auth_1.requireAuth, (req, res) => {
    try {
        const { patient_id, test_id, status, limit, offset, q } = req.query;
        const result = Consultation_1.ConsultationModel.findAll({
            patient_id: patient_id,
            test_id: test_id,
            status: status,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
        });
        // Enrich each consultation with patient info
        const enriched = result.consultations.map(c => {
            const patient = Patient_1.PatientModel.findById(c.patient_id);
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get consultation by ID
router.get('/:id', auth_1.requireAuth, (req, res) => {
    try {
        const consult = Consultation_1.ConsultationModel.findById(req.params.id);
        if (!consult) {
            res.status(404).json({ error: 'Consultation not found' });
            return;
        }
        const patient = Patient_1.PatientModel.findById(consult.patient_id);
        const test = consult.test_id ? Test_1.TestModel.findById(consult.test_id) : null;
        res.json({ ...consult, patient, test });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get consultation by Test ID
router.get('/by-test/:testId', auth_1.requireAuth, (req, res) => {
    try {
        const consult = Consultation_1.ConsultationModel.findByTestId(req.params.testId);
        if (!consult) {
            res.status(404).json({ error: 'No consultation found for this test' });
            return;
        }
        const patient = Patient_1.PatientModel.findById(consult.patient_id);
        const test = Test_1.TestModel.findById(req.params.testId);
        res.json({ ...consult, patient, test });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get consultations by Patient ID
router.get('/by-patient/:patientId', auth_1.requireAuth, (req, res) => {
    try {
        const consults = Consultation_1.ConsultationModel.findByPatientId(req.params.patientId);
        res.json(consults);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Create new consultation
router.post('/', auth_1.requireAuth, (req, res) => {
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
            const user = User_1.UserModel.findById(req.user.userId);
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
        const created = Consultation_1.ConsultationModel.create({
            ...req.body,
            doctor_id: doctorId,
            doctor_name: doctorName,
            doctor_license_number: doctorLicense,
            doctor_designation: doctorDesignation,
        });
        // If linked to a test, optionally mark test status as 'In Progress' or 'Checked'
        if (created.test_id) {
            const test = Test_1.TestModel.findById(created.test_id);
            if (test && test.status === 'Pending') {
                Test_1.TestModel.update(test.id, { status: 'In Progress' });
            }
        }
        res.status(201).json(created);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Update consultation
router.put('/:id', auth_1.requireAuth, (req, res) => {
    try {
        const updated = Consultation_1.ConsultationModel.update(req.params.id, req.body);
        if (!updated) {
            res.status(404).json({ error: 'Consultation not found' });
            return;
        }
        // If consultation marked as 'Completed', transition linked test to 'Checked'
        if (updated.status === 'Completed' && updated.test_id) {
            const test = Test_1.TestModel.findById(updated.test_id);
            if (test && test.status !== 'Checked' && test.status !== 'Released') {
                Test_1.TestModel.update(test.id, {
                    status: 'Checked',
                    completed_at: new Date().toISOString(),
                });
            }
        }
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Delete consultation
router.delete('/:id', auth_1.requireAuth, (req, res) => {
    try {
        const ok = Consultation_1.ConsultationModel.delete(req.params.id);
        if (!ok) {
            res.status(404).json({ error: 'Consultation not found' });
            return;
        }
        res.json({ message: 'Consultation deleted successfully' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Print data payload endpoints (for rendering printable templates on client)
router.get('/:id/print-data', auth_1.requireAuth, (req, res) => {
    try {
        const consult = Consultation_1.ConsultationModel.findById(req.params.id);
        if (!consult) {
            res.status(404).json({ error: 'Consultation not found' });
            return;
        }
        const patient = Patient_1.PatientModel.findById(consult.patient_id);
        const test = consult.test_id ? Test_1.TestModel.findById(consult.test_id) : null;
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
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=consultations.js.map