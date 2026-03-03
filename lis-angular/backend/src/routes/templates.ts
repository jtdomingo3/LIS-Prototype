import { Router, Request, Response } from 'express';
import { TemplateModel } from '../models/Template';
import { requireAuth, requirePermission } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/templates - List all templates
 */
router.get('/', requirePermission('templates'), (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.all !== 'true';
    const templates = TemplateModel.findAll(activeOnly);
    return res.json({ templates });
  } catch (err: any) {
    console.error('[templates] list error:', err);
    return res.status(500).json({ error: 'Failed to list templates' });
  }
});

/**
 * GET /api/templates/:id - Get template by ID
 */
router.get('/:id', requirePermission('templates'), (req: Request, res: Response) => {
  try {
    const template = TemplateModel.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    return res.json({ template });
  } catch (err: any) {
    console.error('[templates] get error:', err);
    return res.status(500).json({ error: 'Failed to get template' });
  }
});

/**
 * POST /api/templates - Create template
 */
router.post('/', requirePermission('templates'), (req: Request, res: Response) => {
  try {
    const { name, test_type, fields, footer_notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const template = TemplateModel.create({
      name,
      test_type,
      fields,
      footer_notes,
      created_by: req.user?.userId,
    });

    return res.status(201).json({ template });
  } catch (err: any) {
    console.error('[templates] create error:', err);
    return res.status(500).json({ error: 'Failed to create template' });
  }
});

/**
 * PUT /api/templates/:id - Update template
 */
router.put('/:id', requirePermission('templates'), (req: Request, res: Response) => {
  try {
    const template = TemplateModel.update(req.params.id, req.body);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    return res.json({ template });
  } catch (err: any) {
    console.error('[templates] update error:', err);
    return res.status(500).json({ error: 'Failed to update template' });
  }
});

/**
 * DELETE /api/templates/:id - Soft-delete template
 */
router.delete('/:id', requirePermission('templates'), (req: Request, res: Response) => {
  try {
    const deleted = TemplateModel.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }
    return res.json({ message: 'Template deactivated' });
  } catch (err: any) {
    console.error('[templates] delete error:', err);
    return res.status(500).json({ error: 'Failed to delete template' });
  }
});

export default router;
