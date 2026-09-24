"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const Equipment_1 = require("../models/Equipment");
const router = (0, express_1.Router)();
// List equipment
router.get('/', auth_1.requireAuth, (req, res) => {
    try {
        const { department, status, search } = req.query;
        const items = Equipment_1.EquipmentModel.findAll({
            department: department,
            status: status,
            search: search,
        });
        res.json(items);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// QC Controls listing
router.get('/qc/controls', auth_1.requireAuth, (req, res) => {
    try {
        const { equipment_id } = req.query;
        const controls = Equipment_1.EquipmentModel.findQcControls(equipment_id);
        res.json(controls);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// QC Entries for Levey-Jennings
router.get('/qc/entries/:controlId', auth_1.requireAuth, (req, res) => {
    try {
        const { analyte_code } = req.query;
        const entries = Equipment_1.EquipmentModel.findQcEntries(req.params.controlId, analyte_code);
        res.json(entries);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Record QC Entry
router.post('/qc/entries', auth_1.requireAuth, (req, res) => {
    try {
        const performedBy = req.user ? req.user.email : 'System';
        const entry = Equipment_1.EquipmentModel.addQcEntry({
            ...req.body,
            performed_by: performedBy,
        });
        res.status(201).json(entry);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// NEQAS records
router.get('/neqas/records', auth_1.requireAuth, (req, res) => {
    try {
        const { year } = req.query;
        const records = Equipment_1.EquipmentModel.findNeqasRecords(year);
        res.json(records);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get equipment by ID
router.get('/:id', auth_1.requireAuth, (req, res) => {
    try {
        const eq = Equipment_1.EquipmentModel.findById(req.params.id);
        if (!eq) {
            res.status(404).json({ error: 'Equipment not found' });
            return;
        }
        const logs = Equipment_1.EquipmentModel.findLogs(eq.id);
        const qcControls = Equipment_1.EquipmentModel.findQcControls(eq.id);
        res.json({ ...eq, logs, qc_controls: qcControls });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Create equipment
router.post('/', auth_1.requireAuth, (req, res) => {
    try {
        const createdBy = req.user ? req.user.email : 'System';
        const eq = Equipment_1.EquipmentModel.create({
            ...req.body,
            created_by: createdBy,
        });
        res.status(201).json(eq);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Update equipment
router.put('/:id', auth_1.requireAuth, (req, res) => {
    try {
        const updated = Equipment_1.EquipmentModel.update(req.params.id, req.body);
        if (!updated) {
            res.status(404).json({ error: 'Equipment not found' });
            return;
        }
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Delete equipment
router.delete('/:id', auth_1.requireAuth, (req, res) => {
    try {
        const ok = Equipment_1.EquipmentModel.delete(req.params.id);
        if (!ok) {
            res.status(404).json({ error: 'Equipment not found' });
            return;
        }
        res.json({ message: 'Equipment deleted' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get equipment service logs
router.get('/:id/logs', auth_1.requireAuth, (req, res) => {
    try {
        const logs = Equipment_1.EquipmentModel.findLogs(req.params.id);
        res.json(logs);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Add equipment log (Calibration, PM, etc.)
router.post('/:id/logs', auth_1.requireAuth, (req, res) => {
    try {
        const eq = Equipment_1.EquipmentModel.findById(req.params.id);
        if (!eq) {
            res.status(404).json({ error: 'Equipment not found' });
            return;
        }
        const performedBy = req.user ? req.user.email : 'System';
        const log = Equipment_1.EquipmentModel.addLog({
            ...req.body,
            equipment_id: eq.id,
            performed_by: performedBy,
        });
        res.status(201).json(log);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=equipment.js.map