"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const Template_1 = require("../models/Template");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
/**
 * GET /api/templates - List all templates
 * Query params:
 *   all=true         — include inactive templates
 *   testType=string  — filter by test_type (case-insensitive)
 */
router.get('/', (0, auth_1.requirePermission)('templates'), (req, res) => {
    try {
        const activeOnly = req.query.all !== 'true';
        const testType = req.query.testType;
        let templates = Template_1.TemplateModel.findAll(activeOnly);
        if (testType) {
            const lower = testType.toLowerCase().trim();
            templates = templates.filter(t => t.test_type && t.test_type.toLowerCase().trim() === lower);
        }
        return res.json({ templates });
    }
    catch (err) {
        console.error('[templates] list error:', err);
        return res.status(500).json({ error: 'Failed to list templates' });
    }
});
/**
 * GET /api/templates/:id - Get template by ID
 */
router.get('/:id', (0, auth_1.requirePermission)('templates'), (req, res) => {
    try {
        const template = Template_1.TemplateModel.findById(req.params.id);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        return res.json({ template });
    }
    catch (err) {
        console.error('[templates] get error:', err);
        return res.status(500).json({ error: 'Failed to get template' });
    }
});
/**
 * POST /api/templates - Create template
 */
router.post('/', (0, auth_1.requirePermission)('templates'), (req, res) => {
    try {
        const { name, test_type, fields, footer_notes } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Template name is required' });
        }
        const template = Template_1.TemplateModel.create({
            name,
            test_type,
            fields,
            footer_notes,
            created_by: req.user?.userId,
        });
        return res.status(201).json({ template });
    }
    catch (err) {
        console.error('[templates] create error:', err);
        return res.status(500).json({ error: 'Failed to create template' });
    }
});
/**
 * PUT /api/templates/:id - Update template
 */
router.put('/:id', (0, auth_1.requirePermission)('templates'), (req, res) => {
    try {
        const template = Template_1.TemplateModel.update(req.params.id, req.body);
        if (!template) {
            return res.status(404).json({ error: 'Template not found' });
        }
        return res.json({ template });
    }
    catch (err) {
        console.error('[templates] update error:', err);
        return res.status(500).json({ error: 'Failed to update template' });
    }
});
/**
 * DELETE /api/templates/:id - Soft-delete template
 */
router.delete('/:id', (0, auth_1.requirePermission)('templates'), (req, res) => {
    try {
        const deleted = Template_1.TemplateModel.delete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ error: 'Template not found' });
        }
        return res.json({ message: 'Template deactivated' });
    }
    catch (err) {
        console.error('[templates] delete error:', err);
        return res.status(500).json({ error: 'Failed to delete template' });
    }
});
exports.default = router;
//# sourceMappingURL=templates.js.map