const express = require('express');
const router = express.Router();
const Template = require('../models/Template');
const User = require('../models/User');
const { requireAuth, canAccessPatient } = require('../middleware/auth');

// GET /templates - List all templates
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const templates = await Template.find({ isActive: true });
    
    // Manually populate createdBy
    const templatesWithCreators = await Promise.all(
      templates.map(async (template) => {
        const creator = await User.findById(template.createdBy);
        return {
          ...template,
          createdBy: creator ? { name: creator.name } : null
        };
      })
    );

    res.render('templates/index', {
      title: 'Report Templates',
      templates: templatesWithCreators
    });

  } catch (error) {
    console.error('Templates list error:', error);
    req.flash('error_msg', 'Error loading templates');
    res.render('templates/index', {
      title: 'Report Templates',
      templates: []
    });
  }
});

// GET /templates/new - New template form
router.get('/new', requireAuth, canAccessPatient, (req, res) => {
  res.render('templates/new', {
    title: 'Create New Template',
    template: {}
  });
});

// POST /templates - Create new template
router.post('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { name, testType, fields, footerNotes } = req.body;

    // Validate required fields
    if (!name || !testType || !fields) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.render('templates/new', {
        title: 'Create New Template',
        template: req.body
      });
    }

    // Parse fields (expecting JSON or simple text format)
    let parsedFields = [];
    try {
      // Try to parse as JSON first
      parsedFields = JSON.parse(fields);
    } catch {
      // If not JSON, parse as simple text (one field per line)
      const fieldLines = fields.split('\n').filter(line => line.trim());
      parsedFields = fieldLines.map(line => ({
        name: line.trim(),
        type: 'text',
        required: false
      }));
    }

    const template = new Template({
      name,
      testType,
      fields: parsedFields,
      footerNotes,
      createdBy: req.session.user.id
    });

    await template.save();

    req.flash('success_msg', `Template "${name}" created successfully!`);
    res.redirect('/templates');

  } catch (error) {
    console.error('Create template error:', error);
    req.flash('error_msg', 'Error creating template');
    res.render('templates/new', {
      title: 'Create New Template',
      template: req.body
    });
  }
});

// GET /templates/:id - Show template details
router.get('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);

    if (!template) {
      req.flash('error_msg', 'Template not found');
      return res.redirect('/templates');
    }

    // Manually populate createdBy
    const creator = template.createdBy ? await User.findById(template.createdBy) : null;
    const templateForView = {
      ...template,
      createdBy: creator ? { name: creator.name } : null
    };

    res.render('templates/show', {
      title: 'Template Details',
      template: templateForView
    });

  } catch (error) {
    console.error('Template details error:', error);
    req.flash('error_msg', 'Error loading template details');
    res.redirect('/templates');
  }
});

// GET /templates/:id/edit - Edit template form
router.get('/:id/edit', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);

    if (!template) {
      req.flash('error_msg', 'Template not found');
      return res.redirect('/templates');
    }

    res.render('templates/edit', {
      title: 'Edit Template',
      template
    });

  } catch (error) {
    console.error('Edit template error:', error);
    req.flash('error_msg', 'Error loading template');
    res.redirect('/templates');
  }
});

// PUT /templates/:id - Update template
router.put('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { name, testType, fields, footerNotes } = req.body;

    // Validate required fields
    if (!name || !testType || !fields) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect(`/templates/${req.params.id}/edit`);
    }

    // Parse fields
    let parsedFields = [];
    try {
      parsedFields = JSON.parse(fields);
    } catch {
      const fieldLines = fields.split('\n').filter(line => line.trim());
      parsedFields = fieldLines.map(line => ({
        name: line.trim(),
        type: 'text',
        required: false
      }));
    }

    const template = await Template.findByIdAndUpdate(
      req.params.id,
      {
        name,
        testType,
        fields: parsedFields,
        footerNotes
      },
      { new: true }
    );

    if (!template) {
      req.flash('error_msg', 'Template not found');
      return res.redirect('/templates');
    }

    req.flash('success_msg', `Template "${name}" updated successfully!`);
    res.redirect(`/templates/${req.params.id}`);

  } catch (error) {
    console.error('Update template error:', error);
    req.flash('error_msg', 'Error updating template');
    res.redirect(`/templates/${req.params.id}/edit`);
  }
});

// DELETE /templates/:id - Delete template
router.delete('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!template) {
      req.flash('error_msg', 'Template not found');
      return res.redirect('/templates');
    }

    req.flash('success_msg', 'Template deleted successfully');
    res.redirect('/templates');

  } catch (error) {
    console.error('Delete template error:', error);
    req.flash('error_msg', 'Error deleting template');
    res.redirect('/templates');
  }
});

module.exports = router;