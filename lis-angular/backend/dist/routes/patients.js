"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Patient_1 = require("../models/Patient");
const Test_1 = require("../models/Test");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
/**
 * GET /api/patients - List patients with pagination, search, filters
 */
router.get('/', (0, auth_1.requirePermission)('patients'), (req, res) => {
    try {
        const { page, limit, search, date, company, philhealth, sortBy, sortOrder } = req.query;
        let patientsData = Patient_1.PatientModel.findAll({
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 50,
            search: search,
            date: date,
            company: company,
            philhealth: philhealth,
            sortBy: sortBy,
            sortOrder: sortOrder || 'DESC',
        });
        // mark whether each patient already has tests
        const patientsWithFlag = patientsData.patients.map(p => {
            const tests = Test_1.TestModel.findByPatientId(p.id);
            return { ...p, hasTests: tests.length > 0 };
        });
        const result = { ...patientsData, patients: patientsWithFlag };
        const pg = page ? parseInt(page) : 1;
        const lim = limit ? parseInt(limit) : 50;
        const totalPages = Math.max(1, Math.ceil(result.total / lim));
        // Get available companies for filter dropdown
        let availableCompanies = [];
        try {
            const { getDb } = require('../db/connection');
            const db = getDb();
            const rows = db.prepare("SELECT DISTINCT company FROM patients WHERE company IS NOT NULL AND company != '' ORDER BY company").all();
            availableCompanies = rows.map((r) => r.company);
        }
        catch (e) { /* ignore */ }
        return res.json({
            patients: result.patients,
            total: result.total,
            page: pg,
            limit: lim,
            availableCompanies,
            pagination: {
                totalPages,
                page: pg,
                limit: lim,
                total: result.total,
            },
        });
    }
    catch (err) {
        console.error('[patients] list error:', err);
        return res.status(500).json({ error: 'Failed to list patients' });
    }
});
/**
 * GET /api/patients/:id - Get patient with their tests
 */
router.get('/:id', (0, auth_1.requirePermission)('patients'), (req, res) => {
    try {
        const patient = Patient_1.PatientModel.findById(req.params.id);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        const tests = Test_1.TestModel.findByPatientId(patient.id);
        return res.json({ patient, tests });
    }
    catch (err) {
        console.error('[patients] get error:', err);
        return res.status(500).json({ error: 'Failed to get patient' });
    }
});
/**
 * POST /api/patients - Create new patient
 */
router.post('/', (0, auth_1.requirePermission)('patients'), (req, res) => {
    try {
        const data = req.body;
        if (!data.first_name || !data.last_name) {
            return res.status(400).json({ error: 'First name and last name are required' });
        }
        // Generate IDs
        data.patient_id = Patient_1.PatientModel.getNextPatientId();
        data.patient_code = Patient_1.PatientModel.generatePatientCode();
        data.created_by = req.user?.userId;
        const patient = Patient_1.PatientModel.create(data);
        return res.status(201).json({ patient });
    }
    catch (err) {
        console.error('[patients] create error:', err);
        return res.status(500).json({ error: 'Failed to create patient' });
    }
});
/**
 * PUT /api/patients/:id - Update patient
 */
router.put('/:id', (0, auth_1.requirePermission)('patients'), (req, res) => {
    try {
        const patient = Patient_1.PatientModel.update(req.params.id, req.body);
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        return res.json({ patient });
    }
    catch (err) {
        console.error('[patients] update error:', err);
        return res.status(500).json({ error: 'Failed to update patient' });
    }
});
/**
 * DELETE /api/patients/:id - Delete patient
 */
router.delete('/:id', (0, auth_1.requirePermission)('patients', 'delete'), (req, res) => {
    try {
        // Check if patient has tests
        const tests = Test_1.TestModel.findByPatientId(req.params.id);
        if (tests.length > 0) {
            return res.status(400).json({ error: 'Cannot delete patient with existing tests. Delete tests first.' });
        }
        const deleted = Patient_1.PatientModel.delete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        return res.json({ message: 'Patient deleted' });
    }
    catch (err) {
        console.error('[patients] delete error:', err);
        return res.status(500).json({ error: 'Failed to delete patient' });
    }
});
exports.default = router;
//# sourceMappingURL=patients.js.map