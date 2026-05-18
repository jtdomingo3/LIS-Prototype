"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Test_1 = require("../models/Test");
const Patient_1 = require("../models/Patient");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
/**
 * Test type → prefix mapping (matches the original LIS logic)
 */
const TEST_TYPE_PREFIXES = {
    'blood chemistry': 'BC',
    'hematology': 'HM',
    'urinalysis': 'UA',
    'fecalysis': 'FA',
    'xray': 'XR',
    'x-ray': 'XR',
    'drugtest': 'DT',
    'drug test': 'DT',
    'ecg': 'ECG',
    'serology': 'SR',
    'blood typing': 'BT',
    'pregnancy test': 'PT',
    'ct-bt': 'CB',
    'esr': 'ESR',
    'thyroid panel': 'TP',
    'ultrasound': 'US',
    'echocardiography': 'EC',
    'fecal occult blood': 'FOB',
    'pt-aptt': 'PA',
    'dengue duo': 'DD',
    'sendout': 'SO',
};
function getTestPrefix(testType) {
    const lower = testType.toLowerCase();
    for (const [key, prefix] of Object.entries(TEST_TYPE_PREFIXES)) {
        if (lower.includes(key))
            return prefix;
    }
    // Default: first 2 chars uppercase
    return testType.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase() || 'TS';
}
/**
 * GET /api/tests - List all tests with pagination, search, filters
 */
router.get('/', (0, auth_1.requirePermission)('tests'), (req, res) => {
    try {
        // accept both camelCase and snake_case parameters for compatibility with Angular client
        const { page, limit, search, status, date, patientId, sortBy, sortOrder, } = req.query;
        const testType = (req.query.testType || req.query.test_type);
        const result = Test_1.TestModel.findAll({
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 50,
            search: search,
            status: status,
            testType: testType,
            date: date,
            patientId: patientId,
            sortBy: sortBy,
            sortOrder: sortOrder || 'DESC',
        });
        return res.json({
            tests: result.tests,
            total: result.total,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 50,
        });
    }
    catch (err) {
        console.error('[tests] list error:', err);
        return res.status(500).json({ error: 'Failed to list tests' });
    }
});
/**
 * GET /api/tests/:id - Get test by ID
 */
router.get('/:id', (0, auth_1.requirePermission)('tests'), (req, res) => {
    try {
        const test = Test_1.TestModel.findById(req.params.id);
        if (!test) {
            return res.status(404).json({ error: 'Test not found' });
        }
        // Also get patient info
        const patient = Patient_1.PatientModel.findById(test.patient_id);
        return res.json({ test, patient });
    }
    catch (err) {
        console.error('[tests] get error:', err);
        return res.status(500).json({ error: 'Failed to get test' });
    }
});
/**
 * POST /api/tests - Create new test(s)
 */
router.post('/', (0, auth_1.requirePermission)('tests'), (req, res) => {
    try {
        const { patient_id, test_type, tests: batchTests, ...rest } = req.body;
        // Support batch creation (array of test types)
        const testTypes = batchTests || [{ test_type, ...rest }];
        const created = [];
        for (const testData of testTypes) {
            const type = testData.test_type || test_type;
            if (!type || !patient_id) {
                continue;
            }
            const prefix = getTestPrefix(type);
            const testId = Test_1.TestModel.getNextTestId(prefix);
            const test = Test_1.TestModel.create({
                ...testData,
                patient_id,
                test_type: type,
                test_id: testId,
                requested_by: req.user?.userId,
                test_date: testData.test_date || new Date().toISOString(),
            });
            created.push(test);
        }
        if (created.length === 0) {
            return res.status(400).json({ error: 'No valid tests to create. patient_id and test_type are required.' });
        }
        return res.status(201).json({ tests: created });
    }
    catch (err) {
        console.error('[tests] create error:', err);
        return res.status(500).json({ error: 'Failed to create test' });
    }
});
/**
 * PUT /api/tests/:id - Update test
 */
router.put('/:id', (0, auth_1.requirePermission)('tests'), (req, res) => {
    try {
        const existing = Test_1.TestModel.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Test not found' });
        }
        const test = Test_1.TestModel.update(req.params.id, req.body);
        return res.json({ test });
    }
    catch (err) {
        console.error('[tests] update error:', err);
        return res.status(500).json({ error: 'Failed to update test' });
    }
});
/**
 * PUT /api/tests/:id/results - Save test results
 */
router.put('/:id/results', (0, auth_1.requirePermission)('tests'), (req, res) => {
    try {
        const existing = Test_1.TestModel.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Test not found' });
        }
        // Merge results
        const mergedResults = { ...existing.results, ...req.body.results };
        const updateData = {
            results: mergedResults,
            performed_by: req.user?.userId,
        };
        // Auto-complete if status is being moved to Completed
        if (req.body.status === 'Completed' || req.body.status === 'Released') {
            updateData.status = req.body.status;
            if (!existing.completed_at) {
                updateData.completed_at = new Date().toISOString();
            }
        }
        // Track status change in history
        if (req.body.status && req.body.status !== existing.status) {
            const history = [...existing.status_history, {
                    from: existing.status,
                    to: req.body.status,
                    user: req.user?.userId,
                    timestamp: new Date().toISOString(),
                }];
            updateData.status_history = history;
            updateData.status = req.body.status;
        }
        const test = Test_1.TestModel.update(req.params.id, updateData);
        return res.json({ test });
    }
    catch (err) {
        console.error('[tests] save results error:', err);
        return res.status(500).json({ error: 'Failed to save results' });
    }
});
/**
 * PUT /api/tests/:id/status - Update test status
 */
router.put('/:id/status', (0, auth_1.requirePermission)('tests'), (req, res) => {
    try {
        const { status } = req.body;
        const existing = Test_1.TestModel.findById(req.params.id);
        if (!existing) {
            return res.status(404).json({ error: 'Test not found' });
        }
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }
        const history = [...existing.status_history, {
                from: existing.status,
                to: status,
                user: req.user?.userId,
                timestamp: new Date().toISOString(),
            }];
        const updateData = { status, status_history: history };
        if ((status === 'Completed' || status === 'Released') && !existing.completed_at) {
            updateData.completed_at = new Date().toISOString();
        }
        const test = Test_1.TestModel.update(req.params.id, updateData);
        return res.json({ test });
    }
    catch (err) {
        console.error('[tests] update status error:', err);
        return res.status(500).json({ error: 'Failed to update status' });
    }
});
/**
 * DELETE /api/tests/:id - Delete test
 */
router.delete('/:id', (0, auth_1.requirePermission)('tests', 'delete'), (req, res) => {
    try {
        const deleted = Test_1.TestModel.delete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Test not found' });
        }
        return res.json({ message: 'Test deleted' });
    }
    catch (err) {
        console.error('[tests] delete error:', err);
        return res.status(500).json({ error: 'Failed to delete test' });
    }
});
exports.default = router;
//# sourceMappingURL=tests.js.map