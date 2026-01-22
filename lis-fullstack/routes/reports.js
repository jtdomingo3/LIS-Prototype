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
    // Get all completed or released tests for report generation
    const allTests = await Test.find({});
    const completedTests = Array.isArray(allTests) ? allTests.filter(t => t && (t.status === 'Completed' || t.status === 'Released')) : [];
    
    // Manually populate patient data and sort by testDate
    let testsWithPatients = [];
    if (Array.isArray(completedTests)) {
      testsWithPatients = await Promise.all(
        completedTests
          .sort((a, b) => new Date(b.testDate) - new Date(a.testDate))
          .map(async (test) => {
            const patient = await Patient.findById(test.patient);
            return {
              id: test.id || test._id,
              testId: test.testId,
              testDate: test.testDate,
              testType: test.testType || '',
              template: test.template || '',
              patient: patient ? {
                firstName: patient.firstName,
                lastName: patient.lastName,
                patientId: patient.patientId
              } : null
            };
          })
      );
    }

    // Also provide a lightweight list for client-side navigation/filtering
    const testsForNav = testsWithPatients.map(t => ({
      id: t.id,
      testId: t.testId,
      patientName: t.patient ? `${t.patient.firstName || ''} ${t.patient.lastName || ''}`.trim() : '',
      testType: t.testType || t.template || '',
      testDate: t.testDate || null
    }));

    res.render('reports/index', {
      title: 'Generate & View Reports',
      tests: testsWithPatients,
      testsForNav
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

    if (!(test.status === 'Completed' || test.status === 'Released')) {
      req.flash('error_msg', 'Report can only be generated for completed or released tests');
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

    // --- NEW: build navigation list for prev/next and client-side filtering ---
    const allTests = await Test.find({});
    const completedSorted = Array.isArray(allTests) ? allTests.filter(t => t && (t.status === 'Completed' || t.status === 'Released')) : [];
    // sort by testDate (newest first)
    completedSorted.sort((a, b) => new Date(b.testDate || b.createdAt) - new Date(a.testDate || a.createdAt));

    const testsForNav = await Promise.all(completedSorted.map(async (t) => {
      const p = t.patient ? await Patient.findById(t.patient) : null;
      return {
        id: t.id || t._id,
        testId: t.testId,
        testType: t.testType || t.template || '',
        patientName: p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : (t.patientName || ''),
        testDate: t.testDate || t.createdAt || null
      };
    }));

    const currentIndex = testsForNav.findIndex(tn => String(tn.id) === String(test.id || test._id));
    const prevId = (currentIndex > 0) ? testsForNav[currentIndex - 1].id : null;
    const nextId = (currentIndex >= 0 && currentIndex < testsForNav.length - 1) ? testsForNav[currentIndex + 1].id : null;
    // --- END NEW ---

    // Render the result template without layout into an HTML string,
    // then wrap it with the print wrapper so preview iframe gets full HTML+styles
    const renderOptions = { title: 'Result Preview', test: populatedTest, image, layout: false, inlineLogo };
    // Use res.render callback to capture template HTML
    res.render(viewPath, renderOptions, (err, renderedHtml) => {
      if (err) {
        console.error('Error rendering result template for preview:', err);
        logReportError(err, 'render preview result template');
      }

      // Render the print wrapper which includes styles and print layout
        const printOptions = { title: 'Print Report', test: populatedTest, currentDate: new Date().toLocaleDateString(), renderedResultHtml: renderedHtml, layout: false, inlineLogo };
        return res.render('reports/print', printOptions, (err2, finalHtml) => {
        if (err2) {
          console.error('Error rendering print wrapper for preview:', err2);
          logReportError(err2, 'render print wrapper for preview');
          // fall back to the raw rendered template if wrapper fails
            // include incoming filter query string so links preserve filters
            const qparts = [];
            if (req.query.filterPatient) qparts.push('filterPatient=' + encodeURIComponent(req.query.filterPatient));
            if (req.query.filterTestType) qparts.push('filterTestType=' + encodeURIComponent(req.query.filterTestType));
            if (req.query.filterDate) qparts.push('filterDate=' + encodeURIComponent(req.query.filterDate));
            const filterQuery = qparts.length ? ('?' + qparts.join('&')) : '';
            return res.render('reports/preview', {
              title: 'Report Preview',
              test: populatedTest,
              currentDate: new Date().toLocaleDateString(),
              renderedResultHtml: renderedHtml || null,
              testsForNav,
              prevId,
              nextId,
              filterQuery
            });
        }

        // finalHtml contains the full HTML (with styles) suitable for iframe srcdoc
          const qparts = [];
          if (req.query.filterPatient) qparts.push('filterPatient=' + encodeURIComponent(req.query.filterPatient));
          if (req.query.filterTestType) qparts.push('filterTestType=' + encodeURIComponent(req.query.filterTestType));
          if (req.query.filterDate) qparts.push('filterDate=' + encodeURIComponent(req.query.filterDate));
          const filterQuery = qparts.length ? ('?' + qparts.join('&')) : '';
          return res.render('reports/preview', {
            title: 'Report Preview',
            test: populatedTest,
            currentDate: new Date().toLocaleDateString(),
            renderedResultHtml: finalHtml || renderedHtml || null,
            testsForNav,
            prevId,
            nextId,
            filterQuery
          });
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

  if (type.includes('fecal occult') || type.includes('fecal-occult') || type.includes('fecaloccult')) {
    template = 'fecal-occult-blood';
    image = '56226bda-3645-4fe4-aec7-7b62ff6a5a4b.jpg';
  } else if (type.includes('fecal') || type.includes('fecalysis')) {
    template = 'fecalysis';
    image = '56226bda-3645-4fe4-aec7-7b62ff6a5a4b.jpg';
  } else if (type.includes('urinal') || type.includes('urinalysis')) {
    template = 'urinalysis';
    image = '8bb335a9-e0fb-4909-acdc-e2a070851a13.jpg';
  } else if (type.includes('blood typing') || type.includes('blood-typing') || type.includes('bloodtyping')) {
    template = 'blood-typing';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (type.includes('pregnan') || type.includes('pregnancy')) {
    template = 'pregnancy-test';
    image = 'd7c357bf-74a2-42dc-b3d1-2a573a30784d.jpg';
  } else if (type.includes('dengue')) {
    template = 'dengue-duo';
    image = 'd7c357bf-74a2-42dc-b3d1-2a573a30784d.jpg';
  } else if (type.includes('esr') || type.includes('erythrocyte') || type.includes('erythrocyte sedimentation')) {
    template = 'esr';
    image = 'cb07aab1-5855-4314-be0f-d734ce0e608a.jpg';
  } else if (type.includes('lipid') || type.includes('lipid profile') || type.includes('lipid-profile')) {
    template = 'blood-chemistry-lipid-profile';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (type.includes('ecg') || type.includes('electrocardio') || type.includes('electrocardiogram')) {
    template = 'ecg';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (type.includes('albumin') || type.includes('\balb\b')) {
    template = 'blood-chemistry-albumin';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (type.includes('sgpt') || type.includes('sgot') || /sgpt\s*\/?\s*sgot/.test(type) || type.includes('sgpt sgot')) {
    template = 'blood-chemistry-sgpt-sgot';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (type.includes('electrolyte') || type.includes('electrolytes') || type.includes('sodium') || type.includes('potassium') || type.includes('chloride')) {
    template = 'blood-chemistry-electrolytes';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (type.includes('bun') || type.includes('creatinine') || type.includes('crea')) {
    template = 'blood-chemistry-bun-crea';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (/blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour/.test(type)) {
    template = 'blood-chemistry-blood-sugar';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (type.includes('hba1c') || type.includes('hb a1c') || type.includes('hb-a1c') || type.includes('hba 1c')) {
    template = 'blood-chemistry-hba1c';
    image = 'd7c357bf-74a2-42dc-b3d1-2a573a30784d.jpg';
  } else if (type.includes('bleeding') || type.includes('clotting') || type.includes('ct & bt') || type.includes('ct & bt') || type.includes('ct') && type.includes('bt')) {
    template = 'ct-bt';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (/\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/.test(type)) {
    template = 'pt-aptt';
    image = 'd7c357bf-74a2-42dc-b3d1-2a573a30784d.jpg';
  } else if (type.includes('blood') || type.includes('chem')) {
    template = 'blood-chemistry';
    image = '924756c2-1555-439d-bb99-4306bafd22de.jpg';
  } else if (type.includes('xray') || type.includes('x-ray') || type.includes('x ray')) {
    template = 'xray';
    image = '93220381-3be7-4696-8189-9cca307d20bd.jpg';
  } else if (type.includes('hemato') || type.includes('hematology') || type.includes('cbc')) {
    template = 'hematology';
    image = 'cb07aab1-5855-4314-be0f-d734ce0e608a.jpg';
  } else if (type.includes('thyroid') || type.includes('thyroid panel') || type.includes('thyroid-panel')) {
    template = 'thyroid-panel';
    image = 'd7c357bf-74a2-42dc-b3d1-2a573a30784d.jpg';
  } else if (type.includes('serol') || type.includes('serology')) {
    template = 'serology';
    image = 'd7c357bf-74a2-42dc-b3d1-2a573a30784d.jpg';
  } else if (type.includes('ultrasound-abd-kubp-hbt') || type.includes('ultrasound abd kubp hbt')) {
    template = 'ultrasound-abd-kubp-hbt';
    image = '8bb335a9-e0fb-4909-acdc-e2a070851a13.jpg';
  }
  else if (type.includes('1st') && type.includes('trimester') || /1st\s*trimester|first\s*trimester/.test(type)) {
    template = 'ultrasound-1st-trimester-obstetrics';
    image = '8bb335a9-e0fb-4909-acdc-e2a070851a13.jpg';
  }
  else if (type.includes('transvaginal') || type.includes('ultrasound-transvaginal')) {
    template = 'ultrasound-transvaginal';
    image = '8bb335a9-e0fb-4909-acdc-e2a070851a13.jpg';
  }
  else if (type.includes('pelvic') || type.includes('ultrasound-pelvic')) {
    template = 'ultrasound-pelvic';
    image = '8bb335a9-e0fb-4909-acdc-e2a070851a13.jpg';
  }
  else if (type.includes('biophysical') || type.includes('ultrasound-biophysical')) {
    template = 'ultrasound-biophysical';
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

    if (!(test.status === 'Completed' || test.status === 'Released')) {
      req.flash('error_msg', 'Result template can only be viewed for completed or released tests');
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

    if (!(test.status === 'Completed' || test.status === 'Released')) {
      req.flash('error_msg', 'PDF can only be generated for completed or released tests');
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

// GET /reports/print-multiple?ids=id1,id2,... - Print multiple filtered reports
router.get('/print-multiple', requireAuth, canAccessPatient, async (req, res) => {
  try {
    let ids = req.query.ids;
    if (!ids) {
      req.flash('error_msg', 'No tests specified for printing');
      return res.redirect('/reports');
    }
    if (typeof ids === 'string') ids = ids.split(',').map(s => s.trim()).filter(Boolean);
    if (!Array.isArray(ids) || !ids.length) {
      req.flash('error_msg', 'No valid test ids provided');
      return res.redirect('/reports');
    }

    // Fetch tests and preserve order from ids
    const found = await Test.find({ _id: { $in: ids } });
    const foundById = {};
    found.forEach(t => { foundById[String(t._id)] = t; });
    const ordered = ids.map(id => foundById[id]).filter(Boolean).filter(t => t && (t.status === 'Completed' || t.status === 'Released'));

    if (!ordered.length) {
      req.flash('error_msg', 'No printable tests found for provided ids');
      return res.redirect('/reports');
    }

    const renderedParts = [];
    for (const t of ordered) {
      const patient = t.patient ? await Patient.findById(t.patient) : null;
      const requestedBy = t.requestedBy ? await User.findById(t.requestedBy) : null;
      const performedBy = t.performedBy ? await User.findById(t.performedBy) : null;

      const populatedTest = {
        ...t,
        patient: patient ? patient.toJSON() : null,
        requestedBy: requestedBy ? { name: requestedBy.name } : null,
        performedBy: performedBy ? { name: performedBy.name } : null
      };

      const { template, image } = getResultTemplate(populatedTest);
      // Render each template into HTML (no layout)
      const html = await new Promise((resolve, reject) => {
        res.render(`reports/results/${template}`, { title: 'Result', test: populatedTest, image, layout: false, inlineLogo: getInlineLogo() }, (err, html) => {
          if (err) return reject(err);
          resolve(html);
        });
      });
      renderedParts.push(html);
    }

    // Join each rendered report with a page-break
    const concatenated = renderedParts.join('\n<div style="page-break-after:always;"></div>\n');
    return res.render('reports/print', { title: 'Print Reports', renderedResultHtml: concatenated, layout: false });

  } catch (err) {
    console.error('Print multiple error:', err);
    logReportError(err, 'print-multiple');
    req.flash('error_msg', 'Error printing multiple reports');
    return res.redirect('/reports');
  }
});

module.exports = router;
