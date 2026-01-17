const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Patient = require('../models/Patient');
const User = require('../models/User');
const Template = require('../models/Template');
const fs = require('fs');
const path = require('path');
const pdf = require('html-pdf');
const os = require('os');
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.warn('Puppeteer not installed; PDF rendering will use html-pdf fallback.');
}
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const { logReportError } = require('../lib/reportLogger');

// Helper to inline logo as base64 data URI for reliable PDF rendering
function getInlineLogo() {
  try {
    const p = path.join(__dirname, '..', 'assets', 'gezyne-logo.png');
    const buf = fs.readFileSync(p);
    return 'data:image/png;base64,' + buf.toString('base64');
  } catch (err) {
    console.warn('Inline logo read failed:', err && err.message);
    return null;
  }
}

// uses centralized logger in lib/reportLogger.js

// GET /reports - Reports page
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    // Get all completed tests for report generation
    const completedTests = await Test.find({ status: 'Completed' });
    
    // Manually populate patient data and sort by testDate
    let testsWithPatients = [];
    if (Array.isArray(completedTests)) {
      testsWithPatients = await Promise.all(
        completedTests
          .sort((a, b) => new Date(b.testDate) - new Date(a.testDate))
          .map(async (test) => {
            const patient = await Patient.findById(test.patient);
            return {
              ...test,
              patient: patient ? {
                firstName: patient.firstName,
                lastName: patient.lastName,
                patientId: patient.patientId
              } : null
            };
          })
      );
    }

    res.render('reports/index', {
      title: 'Generate & View Reports',
      tests: testsWithPatients
    });

  } catch (error) {
    console.error('Reports page error:', error);
    req.flash('error_msg', 'Error loading reports page');
    res.render('reports/index', {
      title: 'Generate & View Reports',
      tests: []
    });
  }
});

// GET /reports/preview/:testId - Preview report
router.get('/preview/:testId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/reports');
    }

    if (test.status !== 'Completed') {
      req.flash('error_msg', 'Report can only be generated for completed tests');
      return res.redirect('/reports');
    }

    // Manually populate patient, requestedBy, and performedBy
    const patient = await Patient.findById(test.patient);
    const requestedBy = await User.findById(test.requestedBy);
    const performedBy = await User.findById(test.performedBy);

    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: requestedBy ? { name: requestedBy.name } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    // If user objects are not present, fall back to names stored in test.results
    if ((!populatedTest.requestedBy || !populatedTest.requestedBy.name) && populatedTest.results && populatedTest.results.requestedByName) {
      populatedTest.requestedBy = {
        name: populatedTest.results.requestedByName,
        license: populatedTest.results.requestedByLicense || null
      };
    }

    if ((!populatedTest.performedBy || !populatedTest.performedBy.name) && populatedTest.results && populatedTest.results.performedByName) {
      populatedTest.performedBy = {
        name: populatedTest.results.performedByName,
        license: populatedTest.results.performedByLicense || null
      };
    }

    // Determine specific result template for this test and render it to HTML
    const { template, image } = getResultTemplate(populatedTest);
    const viewPath = `reports/results/${template}`;

    // Inline logo for preview/template rendering (helps PDF renderer later)
    const inlineLogo = getInlineLogo();

    // Render the result template without layout into an HTML string, then render preview page
    const renderOptions = { title: 'Result Preview', test: populatedTest, image, layout: false, inlineLogo };
    // Use res.render callback to capture HTML
    res.render(viewPath, renderOptions, (err, renderedHtml) => {
      if (err) {
        console.error('Error rendering result template for preview:', err);
        logReportError(err, 'render preview result template');
      }

      return res.render('reports/preview', {
        title: 'Report Preview',
        test: populatedTest,
        currentDate: new Date().toLocaleDateString(),
        renderedResultHtml: renderedHtml || null
      });
    });

  } catch (error) {
    console.error('Report preview error:', error);
    req.flash('error_msg', 'Error loading report preview');
    res.redirect('/reports');
  }
});

// Helper to map test types to result template and default image
function getResultTemplate(test) {
  const type = (test && test.testType ? String(test.testType) : '').toLowerCase();
  // default template and sample image
  let template = 'blood-chemistry';
  let image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';

  if (type.includes('fecal') || type.includes('fecalysis')) {
    template = 'fecalysis';
    image = '56226bda-3645-4fe4-aec7-7b62ff6a5a4b.jpg';
  } else if (type.includes('urinal') || type.includes('urinalysis')) {
    template = 'urinalysis';
    image = '8bb335a9-e0fb-4909-acdc-e2a070851a13.jpg';
  } else if (type.includes('blood') || type.includes('chem')) {
    template = 'blood-chemistry';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (type.includes('xray') || type.includes('x-ray') || type.includes('x ray')) {
    template = 'xray';
    image = '93220381-3be7-4696-8189-9cca307d20bd.jpg';
  } else if (type.includes('hemato') || type.includes('hematology') || type.includes('cbc')) {
    template = 'hematology';
    image = 'cb07aab1-5855-4314-be0f-d734ce0e608a.jpg';
  } else if (type.includes('serol') || type.includes('serology')) {
    template = 'serology';
    image = 'd7c357bf-74a2-42dc-b3d1-2a573a30784d.jpg';
  } else if (type.includes('ultra') || type.includes('ultrasound')) {
    template = 'ultrasound';
    image = '8bb335a9-e0fb-4909-acdc-e2a070851a13.jpg';
  }

  // Allow overriding with explicit `template` field on test
  if (test && test.template && typeof test.template === 'string') {
    template = test.template;
  }

  return { template, image };
}

// GET /reports/result/:testId - Render result template for a test
router.get('/result/:testId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/reports');
    }

    if (test.status !== 'Completed') {
      req.flash('error_msg', 'Result template can only be viewed for completed tests');
      return res.redirect('/reports');
    }

    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const requestedBy = test.requestedBy ? await User.findById(test.requestedBy) : null;
    const performedBy = test.performedBy ? await User.findById(test.performedBy) : null;

    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: requestedBy ? { name: requestedBy.name } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    const { template, image } = getResultTemplate(populatedTest);
    // Render the matching template view under reports/results
    // allow embedding without layout when requested (used by preview iframe)
    const useLayout = req.query.embedded ? false : 'print';
    const autoPrint = req.query.print === '1' || req.query.print === 'true';
    const inlineLogo = getInlineLogo();
    return res.render(`reports/results/${template}`, {
      title: 'Result',
      test: populatedTest,
      image,
      layout: useLayout,
      print: autoPrint,
      inlineLogo
    });

  } catch (error) {
    console.error('Result template render error:', error);
    req.flash('error_msg', 'Error rendering result template');
    res.redirect('/reports');
  }
});

// GET /reports/pdf/:testId - Generate PDF report
router.get('/pdf/:testId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/reports');
    }

    if (test.status !== 'Completed') {
      req.flash('error_msg', 'PDF can only be generated for completed tests');
      return res.redirect('/reports');
    }

    // When generating a report, ensure completedAt is set so reception will map to Releasing.
    // Do NOT set completedAt for Doctor's Check-up or Registration (those should not go to Releasing).
    if (!test.completedAt && (test.results && String(test.results).trim()) && test.testType !== "Doctor's Check-up" && test.testType !== 'Registration') {
      await Test.findByIdAndUpdate(test.id, { completedAt: new Date() }, { new: true });
      test.completedAt = new Date();
    }

    // Manually populate patient and users
    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const requestedBy = test.requestedBy ? await User.findById(test.requestedBy) : null;
    const performedBy = test.performedBy ? await User.findById(test.performedBy) : null;

    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: requestedBy ? { name: requestedBy.name } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    // Determine specific result template and render it to HTML without layout
    const { template, image } = getResultTemplate(populatedTest);
    const viewPath = `reports/results/${template}`;
    const renderOptions = { title: 'Result PDF', test: populatedTest, image, layout: false };

    const inlineLogo = getInlineLogo();
    return res.render(viewPath, Object.assign({}, renderOptions, { inlineLogo }), async (err, renderedHtml) => {
      if (err) {
        console.error('Error rendering result template for PDF:', err);
        logReportError(err, 'render pdf result template');
        req.flash('error_msg', 'Error generating PDF');
        return res.redirect('/reports');
      }

      // Render the print wrapper with the rendered result HTML so PDF matches the print view
      const inlineLogo2 = getInlineLogo();
      res.render('reports/print', { title: 'Print Report', test: populatedTest, currentDate: new Date().toLocaleDateString(), renderedResultHtml: renderedHtml, layout: false, inlineLogo: inlineLogo2 }, async (err2, finalHtml) => {
        if (err2) {
          console.error('Error rendering print wrapper for PDF:', err2);
          logReportError(err2, 'render print wrapper for pdf');
          req.flash('error_msg', 'Error generating PDF');
          return res.redirect('/reports');
        }

        // Ensure asset URLs are absolute so the PDF renderer can fetch them
        const baseUrl = req.protocol + '://' + req.get('host');
        let htmlForPdf = finalHtml.replace(/(href=|src=|url\()\s*["']?\/assets\//g, function(m) {
          return m.replace('/assets/', baseUrl + '/assets/');
        });

        // Try Puppeteer first (headless Chromium) for pixel-perfect rendering
        if (puppeteer) {
          try {
            const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            const page = await browser.newPage();
            await page.setContent(htmlForPdf, { waitUntil: 'networkidle0' });
            const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' } });
            await browser.close();
            // Verify the renderer returned a PDF buffer (starts with %PDF-)
            const pdfBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
            const header = pdfBuf && pdfBuf.length ? pdfBuf.toString('utf8', 0, 5) : null;
            if (header !== '%PDF-') {
              const tmpHtml = path.join(os.tmpdir(), `lab_report_html_${populatedTest.testId}.html`);
              try { fs.writeFileSync(tmpHtml, htmlForPdf, 'utf8'); console.warn('Puppeteer produced non-PDF output; wrote HTML to', tmpHtml); } catch (werr) { console.warn('Failed writing debug HTML from puppeteer fallback:', werr && werr.message); }
              logReportError(new Error('Puppeteer did not return a PDF buffer'), `puppeteer pdf header check for ${populatedTest.testId}`);
              req.flash('error_msg', 'Error generating PDF (renderer produced invalid output)');
              return res.redirect('/reports');
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=Lab_Report_${populatedTest.testId}_${populatedTest.patient ? populatedTest.patient.lastName : 'patient'}.pdf`);
            if (process.env.DEBUG_PDF) {
              try {
                const tmpPath = path.join(os.tmpdir(), `lab_report_${populatedTest.testId}.pdf`);
                fs.writeFileSync(tmpPath, pdfBuffer);
                console.log('Wrote debug PDF to', tmpPath);
              } catch (werr) {
                console.warn('Failed writing debug PDF:', werr && werr.message);
              }
            }
            return res.end(pdfBuffer);
          } catch (puErr) {
            console.error('Puppeteer PDF generation failed, falling back to html-pdf:', puErr);
          }
        }

        // Fallback to html-pdf
        const options = {
          width: '8.5in',
          height: '11in',
          border: '0.4in'
        };

        pdf.create(htmlForPdf, options).toBuffer((err3, buffer) => {
          if (err3) {
            console.error('PDF generation error:', err3);
            logReportError(err3, 'html-pdf create');
            req.flash('error_msg', 'Error generating PDF');
            return res.redirect('/reports');
          }
          // Verify buffer looks like PDF
          const bufFallback = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
          const hdr = bufFallback && bufFallback.length ? bufFallback.toString('utf8', 0, 5) : null;
          if (hdr !== '%PDF-') {
            const tmpHtml = path.join(os.tmpdir(), `lab_report_html_fallback_${populatedTest.testId}.html`);
            try { fs.writeFileSync(tmpHtml, htmlForPdf, 'utf8'); console.warn('html-pdf produced non-PDF output; wrote HTML to', tmpHtml); } catch (werr) { console.warn('Failed writing debug HTML from html-pdf fallback:', werr && werr.message); }
            logReportError(new Error('html-pdf did not return a PDF buffer'), `html-pdf header check for ${populatedTest.testId}`);
            req.flash('error_msg', 'Error generating PDF (renderer produced invalid output)');
            return res.redirect('/reports');
          }

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=Lab_Report_${populatedTest.testId}_${populatedTest.patient ? populatedTest.patient.lastName : 'patient'}.pdf`);
          if (process.env.DEBUG_PDF) {
            try {
              const tmpPath = path.join(os.tmpdir(), `lab_report_fallback_${populatedTest.testId}.pdf`);
              fs.writeFileSync(tmpPath, buffer);
              console.log('Wrote debug fallback PDF to', tmpPath);
            } catch (werr) {
              console.warn('Failed writing debug fallback PDF:', werr && werr.message);
            }
          }
          return res.end(buffer);
        });
      });
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    req.flash('error_msg', 'Error generating PDF');
    res.redirect('/reports');
  }
});

// GET /reports/print/:testId - Print report
router.get('/print/:testId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.testId);

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/reports');
    }

    if (test.status !== 'Completed') {
      req.flash('error_msg', 'Report can only be printed for completed tests');
      return res.redirect('/reports');
    }

    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const requestedBy = test.requestedBy ? await User.findById(test.requestedBy) : null;
    const performedBy = test.performedBy ? await User.findById(test.performedBy) : null;

    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: requestedBy ? { name: requestedBy.name } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    // Render the specific result template into HTML, then render the print wrapper
    const { template, image } = getResultTemplate(populatedTest);
    const viewPath = `reports/results/${template}`;

    // Render the result template without layout to get its HTML
    const inlineLogo = getInlineLogo();
    res.render(viewPath, { title: 'Result Print', test: populatedTest, image, layout: false, inlineLogo }, (err, renderedHtml) => {
      if (err) {
        console.error('Error rendering result template for print:', err);
        // fallback to previous print view if rendering fails
        return res.render('reports/print', {
          title: 'Print Report',
          test: populatedTest,
          currentDate: new Date().toLocaleDateString(),
          layout: 'print'
        });
      }

      return res.render('reports/print', {
        title: 'Print Report',
        test: populatedTest,
        currentDate: new Date().toLocaleDateString(),
        renderedResultHtml: renderedHtml,
        layout: 'print'
      });
    });

  } catch (error) {
    console.error('Print report error:', error);
    req.flash('error_msg', 'Error loading print view');
    res.redirect('/reports');
  }
});

module.exports = router;
