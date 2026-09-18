const express = require('express');
const router = express.Router();
const Template = require('../models/Template');
const User = require('../models/User');
const { requireAuth, canAccessTemplates } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

// GET /templates - List all templates
router.get('/', requireAuth, canAccessTemplates, async (req, res) => {
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
      'thyroid-panel.ejs',
      'pregnancy-test.ejs',
      'pt-aptt.ejs',
      'xray.ejs',
      'ecg.ejs',
      'hematology.ejs',
      'serology.ejs',
      'ultrasound-abd-kubp-hbt.ejs',
      'echocardiography-2d.ejs',
      'ultrasound-transvaginal.ejs',
      'ultrasound-biophysical.ejs',
      'ultrasound-1st-trimester-obstetrics.ejs',
      'ultrasound-pelvic.ejs',
      'ultrasound-pelvic-biometry.ejs',
      'drugtest.ejs'
    ];
    const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
    return files.map(f => {
      const defaultFieldsMapping = {"blood-chemistry.ejs":[{"name":"FBS","type":"text","required":false,"normalValues":"70.00 - 110.00","unit":"mg/dL"},{"name":"RBS","type":"text","required":false,"normalValues":"80.00 - 130.00","unit":"mg/dL"},{"name":"1st Hour","type":"text","required":false,"normalValues":"90.00 - 140.00","unit":"mg/dL"},{"name":"2nd Hour","type":"text","required":false,"normalValues":"80.00 - 120.00","unit":"mg/dL"},{"name":"Cholesterol","type":"text","required":false,"normalValues":"0.00 - 200.00","unit":"mg/dL"},{"name":"Triglyceride","type":"text","required":false,"normalValues":"60.00 - 150.00","unit":"mg/dL"},{"name":"HDL-C","type":"text","required":false,"normalValues":"35.00 - 80.00","unit":"mg/dL"},{"name":"LDL","type":"text","required":false,"normalValues":"66.00 - 178.00","unit":"mg/dL"},{"name":"VLDL","type":"text","required":false,"normalValues":"0.00 - 30.00","unit":"mg/dL"},{"name":"Uric Acid","type":"text","required":false,"normalValues":"2.40 - 5.70","unit":"mg/dL"},{"name":"Creatinine","type":"text","required":false,"normalValues":"0.50 - 1.00","unit":"mg/dL"},{"name":"Urea","type":"text","required":false,"normalValues":"10.00 - 50.00","unit":"mg/dL"},{"name":"BUN","type":"text","required":false,"normalValues":"4.67 - 23.36","unit":"mg/dL"},{"name":"SGPT (ALT)","type":"text","required":false,"normalValues":"0.00 - 32.00","unit":"U/L"},{"name":"SGOT (AST)","type":"text","required":false,"normalValues":"0.00 - 31.00","unit":"U/L"},{"name":"Sodium","type":"text","required":false,"normalValues":"136.00 - 148.00","unit":"mmol/L"},{"name":"Potassium","type":"text","required":false,"normalValues":"3.50 - 5.10","unit":"mmol/L"},{"name":"Chloride","type":"text","required":false,"normalValues":"98.00 - 107.00","unit":"mmol/L"},{"name":"HbA1c","type":"text","required":false,"normalValues":"4.00 - 6.50","unit":"%"},{"name":"ALB","type":"text","required":false,"normalValues":"3.00 - 6.00","unit":"g/L"}],"hematology.ejs":[{"name":"RBC ct.","type":"text","required":false,"normalValues":"3.8-5.8","unit":"x 10^6/µL"},{"name":"Hemoglobin (Male)","type":"text","required":false,"normalValues":"130-160","unit":"g/dL"},{"name":"Hemoglobin (Female)","type":"text","required":false,"normalValues":"120-140","unit":"g/dL"},{"name":"Hematocrit (Male)","type":"text","required":false,"normalValues":"0.38-0.49","unit":"%"},{"name":"Hematocrit (Female)","type":"text","required":false,"normalValues":"0.36-0.44","unit":"%"},{"name":"MCV","type":"text","required":false,"normalValues":"83.0-98.0","unit":"µm^3"},{"name":"MCH","type":"text","required":false,"normalValues":"27.0-32.2","unit":"pg"},{"name":"MCHC","type":"text","required":false,"normalValues":"31.8-33.7","unit":"g/dL"},{"name":"WBC ct.","type":"text","required":false,"normalValues":"5.0-10.0","unit":"x10^9/L"},{"name":"Neutrophils","type":"text","required":false,"normalValues":"43.0-76.0","unit":"%"},{"name":"Lymphocyte","type":"text","required":false,"normalValues":"17.0-48.0","unit":"%"},{"name":"Monocyte","type":"text","required":false,"normalValues":"0-10.0","unit":"%"},{"name":"Eosinophils","type":"text","required":false,"normalValues":"0.5-5.0","unit":"%"},{"name":"Basophils","type":"text","required":false,"normalValues":"0-1","unit":"%"},{"name":"Platelet ct.","type":"text","required":false,"normalValues":"150-350","unit":"x10^9/L"}],"thyroid-panel.ejs":[{"name":"TSH","type":"text","required":false,"normalValues":"0.30 - 4.20","unit":"mIU/L"},{"name":"FT4","type":"text","required":false,"normalValues":"12.0 - 22.0","unit":"pmol/L"},{"name":"FT3","type":"text","required":false,"normalValues":"2.80 - 7.10","unit":"pmol/L"}],"pt-aptt.ejs":[{"name":"PT Patient","type":"text","required":false,"normalValues":"10.0-14.0 sec."},{"name":"PT Activity","type":"text","required":false,"normalValues":"70-150 %"},{"name":"PT INR","type":"text","required":false,"normalValues":"1.0-1.3"},{"name":"APTT Patient","type":"text","required":false,"normalValues":"22.0-38.0 sec."}],"blood-chemistry-bun-crea.ejs":[{"name":"BUN","type":"text","required":false,"normalValues":"4.67 - 23.36","unit":"mg/dL"},{"name":"Creatinine","type":"text","required":false,"normalValues":"0.50 - 1.00","unit":"mg/dL"}],"blood-chemistry-sgpt-sgot.ejs":[{"name":"SGPT (ALT)","type":"text","required":false,"normalValues":"0.00 - 32.00","unit":"U/L"},{"name":"SGOT (AST)","type":"text","required":false,"normalValues":"0.00 - 31.00","unit":"U/L"}],"ultrasound-abd-kubp-hbt.ejs":[{"name":"Examination","type":"text"},{"name":"Impression","type":"text"}],"echocardiography-2d.ejs":[{"name":"Examination","type":"text"},{"name":"Impression","type":"text"}],"ultrasound-transvaginal.ejs":[{"name":"Examination","type":"text"},{"name":"Impression","type":"text"}],"ultrasound-biophysical.ejs":[{"name":"Examination","type":"text"},{"name":"Impression","type":"text"}],"ultrasound-1st-trimester-obstetrics.ejs":[{"name":"Examination","type":"text"},{"name":"Impression","type":"text"}],"ultrasound-pelvic.ejs":[{"name":"Examination","type":"text"},{"name":"Impression","type":"text"}],"ultrasound-pelvic-biometry.ejs":[{"name":"Examination","type":"text"},{"name":"Impression","type":"text"}],"xray.ejs":[{"name":"Examination","type":"text"},{"name":"Impression","type":"text"}],"urinalysis.ejs":[{"name":"Color","type":"text"},{"name":"Appearance","type":"text"},{"name":"pH","type":"text","normalValues":"5.0-7.0"},{"name":"Specific Gravity","type":"text","normalValues":"1.005-1.025"},{"name":"Glucose","type":"text","normalValues":"Negative"},{"name":"Protein","type":"text","normalValues":"Negative"},{"name":"Leukocyte","type":"text","normalValues":"Negative"},{"name":"Nitrite","type":"text","normalValues":"Negative"},{"name":"Urobilinogen","type":"text","normalValues":"Negative"},{"name":"Blood","type":"text","normalValues":"Negative"},{"name":"Ketones","type":"text","normalValues":"Negative"},{"name":"Bilirubin","type":"text","normalValues":"Negative"},{"name":"WBC","type":"text","normalValues":"0-3 /hpf"},{"name":"RBC","type":"text","normalValues":"0-5 /hpf"},{"name":"Epithelial","type":"text"},{"name":"Mucus","type":"text"},{"name":"Amorphous","type":"text"},{"name":"Bacteria","type":"text"},{"name":"Others","type":"text"},{"name":"Note","type":"text"}],"fecalysis.ejs":[{"name":"Color","type":"text"},{"name":"Consistency","type":"text"},{"name":"Pus Cell","type":"text"},{"name":"RBC","type":"text"},{"name":"Parasites","type":"text"},{"name":"Others","type":"text"},{"name":"Note","type":"text"}],"esr.ejs":[{"name":"ESR Value","type":"text","normalValues":"Child:0-20, Male:0-10, Female:0-20 mm/hr"}],"blood-typing.ejs":[{"name":"Specimen","type":"text"},{"name":"Result","type":"text"}],"serology.ejs":[{"name":"HBsAg","type":"text"},{"name":"Syphilis","type":"text"}],"pregnancy-test.ejs":[{"name":"Specimen","type":"text"},{"name":"Result","type":"text"}],"ct-bt.ejs":[{"name":"Bleeding Time","type":"text"},{"name":"Clotting Time","type":"text"}],"dengue-duo.ejs":[{"name":"NS1 Ag","type":"text"},{"name":"IgG","type":"text"},{"name":"IgM","type":"text"}],"drugtest.ejs":[{"name":"Methamphetamine","type":"text"},{"name":"Tetrahydrocannabinol","type":"text"}],"ecg.ejs":[{"name":"Rhythm","type":"text"},{"name":"Rate","type":"text"},{"name":"Impression","type":"text"}],"fecal-occult-blood.ejs":[{"name":"Result","type":"text"}]};
      if (f === 'drugtest.ejs') {
        return {
          id: `static:${f}`,
          name: 'Drug Test',
          testType: 'drugtest',
          fields: (defaultFieldsMapping[f] || []),
          createdAt: null,
          isStatic: true,
          filename: f
        };
      }
      if (f === 'blood-chemistry-bun-crea.ejs') {
        return {
          id: `static:${f}`,
          name: 'Blood Chemistry - BUN/Crea',
          testType: 'BUN/Creat',
          fields: (defaultFieldsMapping[f] || []),
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
          fields: (defaultFieldsMapping[f] || []),
          createdAt: null,
          isStatic: true,
          filename: f
        };
      }
      if (f === 'ultrasound-abd-kubp-hbt.ejs') {
        return {
          id: `static:${f}`,
          name: 'Ultrasound - ABD / KUBP / HBT',
          testType: 'ultrasound-abd-kubp-hbt',
          fields: (defaultFieldsMapping[f] || []),
          createdAt: null,
          isStatic: true,
          filename: f
        };
      }
      if (f === 'echocardiography-2d.ejs') {
        return {
          id: `static:${f}`,
          name: 'Echocardiography - 2D',
          testType: 'echocardiography-2d',
          fields: (defaultFieldsMapping[f] || []),
          createdAt: null,
          isStatic: true,
          filename: f
        };
      }
      if (f === 'ultrasound-transvaginal.ejs') {
        return {
          id: `static:${f}`,
          name: 'Ultrasound - Transvaginal',
          testType: 'ultrasound-transvaginal',
          fields: (defaultFieldsMapping[f] || []),
          createdAt: null,
          isStatic: true,
          filename: f
        };
      }
      if (f === 'ultrasound-biophysical.ejs') {
        return {
          id: `static:${f}`,
          name: 'Ultrasound - Biophysical',
          testType: 'ultrasound-biophysical',
          fields: (defaultFieldsMapping[f] || []),
          createdAt: null,
          isStatic: true,
          filename: f
        };
      }
      if (f === 'ultrasound-1st-trimester-obstetrics.ejs') {
        return {
          id: `static:${f}`,
          name: 'Ultrasound - Trimester Obstetrics',
          testType: 'ultrasound-trimester-obstetrics',
          fields: (defaultFieldsMapping[f] || []),
          createdAt: null,
          isStatic: true,
          filename: f
        };
      }
        if (f === 'ultrasound-pelvic.ejs') {
          return {
            id: `static:${f}`,
            name: 'Ultrasound - Pelvic Ultrasound',
            testType: 'ultrasound-pelvic',
            fields: (defaultFieldsMapping[f] || []),
          createdAt: null,
            isStatic: true,
            filename: f
          };
        }
        if (f === 'ultrasound-pelvic-biometry.ejs') {
          return {
            id: `static:${f}`,
            name: 'Ultrasound - Pelvic Biometry',
            testType: 'ultrasound-pelvic-biometry',
            fields: (defaultFieldsMapping[f] || []),
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
        fields: (defaultFieldsMapping[f] || []),
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
router.get('/new', requireAuth, canAccessTemplates, (req, res) => {
  res.render('templates/new', {
    title: 'Create New Template',
    template: {}
  });
});

// POST /templates - Create new template
router.post('/', requireAuth, canAccessTemplates, async (req, res) => {
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

// GET /templates/:id - View single template
router.get('/:id', requireAuth, canAccessTemplates, async (req, res) => {
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
router.get('/:id/edit', requireAuth, canAccessTemplates, async (req, res) => {
  try {
    const id = req.params.id;
    let template;

    if (id && id.startsWith('static:')) {
      const staticTemplates = await getStaticResultTemplates();
      template = staticTemplates.find(t => t.id === id);
      if (!template) {
        req.flash('error_msg', 'Static template not found');
        return res.redirect('/templates');
      }
    } else {
      template = await Template.findById(id);
      if (!template) {
        req.flash('error_msg', 'Template not found');
        return res.redirect('/templates');
      }
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
router.put('/:id', requireAuth, canAccessTemplates, async (req, res) => {
  try {
    const { name, testType, fields, footerNotes } = req.body;
    const id = req.params.id;

    // Validate required fields
    if (!name || !testType || !fields) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect(`/templates/${id}/edit`);
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

    let template;
    if (id && id.startsWith('static:')) {
      template = new Template({
        name,
        testType,
        fields: parsedFields,
        footerNotes,
        createdBy: req.session.user.id,
        isActive: true
      });
      await template.save();
    } else {
      template = await Template.findByIdAndUpdate(
        id,
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
    }

    req.flash('success_msg', `Template "${name}" updated successfully!`);
    res.redirect(`/templates/${template.id || template._id}`);

  } catch (error) {
    console.error('Update template error:', error);
    req.flash('error_msg', 'Error updating template');
    res.redirect(`/templates/${req.params.id}/edit`);
  }
});

// DELETE /templates/:id - Delete template
router.delete('/:id', requireAuth, canAccessTemplates, async (req, res) => {
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