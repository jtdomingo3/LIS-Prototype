const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'templates.js');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize CRLF to LF for reliable string replacement
content = content.replace(/\r\n/g, '\n');

const getEditOriginal = `// GET /templates/:id/edit - Edit template form
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
});`;

const getEditNew = `// GET /templates/:id/edit - Edit template form
router.get('/:id/edit', requireAuth, canAccessPatient, async (req, res) => {
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
});`;

const putOriginal = `// PUT /templates/:id - Update template
router.put('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { name, testType, fields, footerNotes } = req.body;

    // Validate required fields
    if (!name || !testType || !fields) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect(\`/templates/\${req.params.id}/edit\`);
    }

    // Parse fields
    let parsedFields = [];
    try {
      parsedFields = JSON.parse(fields);
    } catch {
      const fieldLines = fields.split('\\n').filter(line => line.trim());
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

    req.flash('success_msg', \`Template "\${name}" updated successfully!\`);
    res.redirect(\`/templates/\${req.params.id}\`);

  } catch (error) {
    console.error('Update template error:', error);
    req.flash('error_msg', 'Error updating template');
    res.redirect(\`/templates/\${req.params.id}/edit\`);
  }
});`;

const putNew = `// PUT /templates/:id - Update template
router.put('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { name, testType, fields, footerNotes } = req.body;
    const id = req.params.id;

    // Validate required fields
    if (!name || !testType || !fields) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect(\`/templates/\${id}/edit\`);
    }

    // Parse fields
    let parsedFields = [];
    try {
      parsedFields = JSON.parse(fields);
    } catch {
      const fieldLines = fields.split('\\n').filter(line => line.trim());
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

    req.flash('success_msg', \`Template "\${name}" updated successfully!\`);
    res.redirect(\`/templates/\${template.id || template._id}\`);

  } catch (error) {
    console.error('Update template error:', error);
    req.flash('error_msg', 'Error updating template');
    res.redirect(\`/templates/\${req.params.id}/edit\`);
  }
});`;

if (!content.includes(getEditOriginal)) {
  console.log('GET edit route not found');
} else {
  content = content.replace(getEditOriginal, getEditNew);
}

if (!content.includes(putOriginal)) {
  console.log('PUT route not found');
} else {
  content = content.replace(putOriginal, putNew);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched routes');
