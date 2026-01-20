const express = require('express');
const router = express.Router();
const Template = require('../models/Template');
const User = require('../models/User');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

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

    // include static result templates
    const staticTemplates = await getStaticResultTemplates();
    // Exclude static templates that conflict with DB templates (match by testType)
    const existingTypes = new Set((templatesWithCreators || []).map(t => (t.testType || '').toLowerCase()));
    const filteredStatic = (staticTemplates || []).filter(st => !existingTypes.has((st.testType || '').toLowerCase()));
    const allTemplates = [...templatesWithCreators, ...filteredStatic];

    res.render('templates/index', {
      title: 'Report Templates',
      templates: allTemplates
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

// Append static result templates (views/reports/results/*.ejs) to the templates list
async function getStaticResultTemplates() {
  try {
    const resultsDir = path.join(__dirname, '..', 'views', 'reports', 'results');
    // Only expose the actual report templates (exclude sample image files and size placeholders)
    const allowed = [
      'fecalysis.ejs',
      'esr.ejs',
      'ct-bt.ejs',
      'fecal-occult-blood.ejs',
      'urinalysis.ejs',
      'blood-typing.ejs',
      'dengue-duo.ejs',
      'blood-chemistry.ejs',
      'blood-chemistry-sgpt-sgot.ejs',
      'blood-chemistry-bun-crea.ejs',
      'blood-chemistry-lipid-profile.ejs',
      'blood-chemistry-electrolytes.ejs',
      'blood-chemistry-hba1c.ejs',
      'blood-chemistry-albumin.ejs',
      'blood-chemistry-blood-sugar.ejs',
      'thyroid-panel.ejs',
      'pregnancy-test.ejs',
      'pt-aptt.ejs',
      'xray.ejs',
      'hematology.ejs',
      'serology.ejs',
      'ultrasound.ejs'
    ];
    const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
    return files.map(f => {
      if (f === 'blood-chemistry-bun-crea.ejs') {
        return {
          id: `static:${f}`,
          name: 'Blood Chemistry - BUN/Crea',
          testType: 'BUN/Creat',
          fields: [],
          createdAt: null,
          isStatic: true,
          filename: f
        };
      }
      if (f === 'blood-chemistry-sgpt-sgot.ejs') {
        return {
          id: `static:${f}`,
          name: 'Blood Chemistry - SGPT/SGOT',
          testType: 'Blood Chemistry - SGPT/SGOT',
          fields: [],
          createdAt: null,
          isStatic: true,
          filename: f
        };
      }
      const name = f.replace('.ejs', '').replace(/-/g, ' ');
      return {
        id: `static:${f}`,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        testType: name,
        fields: [],
        createdAt: null,
        isStatic: true,
        filename: f
      };
    });
  } catch (err) {
    return [];
  }
}

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
    const id = req.params.id;

    // Handle static templates (id format: static:filename.ejs)
    if (id && id.startsWith('static:')) {
      const filename = id.replace('static:', '');
      const templateName = filename.replace('.ejs', '');

      // render the static result template file for preview
      // provide a minimal `test` object so templates referencing `test` don't fail
      const viewPath = `reports/results/${templateName}`;
      const renderOptions = {
        title: 'Template Details',
        template: { id, name: templateName, isStatic: true },
        test: { patient: {}, results: {}, requestedBy: null, performedBy: null }
      };

      // Provide inlineLogo fallback so static templates can reference it safely
      const inlineLogo = (req.app && req.app.locals && req.app.locals.inlineLogo) ? req.app.locals.inlineLogo : '/assets/gezyne-logo.png';
      Object.assign(renderOptions, { inlineLogo });

      // If express-ejs-layouts is installed it wraps res.render; use the original renderer
      // (stored at res.__render) to bypass layout handling and send the raw template output.
      if (res.__render && typeof res.__render === 'function') {
        return res.__render.call(res, viewPath, renderOptions, (err, html) => {
          if (err) {
            console.error('Static template render error:', err);
            req.flash('error_msg', 'Error rendering template');
            return res.redirect('/templates');
          }
          res.send(html);
        });
      }

      return res.render(viewPath, Object.assign({}, renderOptions, { layout: false }));
    }

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