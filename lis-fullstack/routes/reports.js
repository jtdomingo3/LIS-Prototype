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
const ExcelJS = require('exceljs');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const { logReportError } = require('../lib/reportLogger');
const reportGenerator = require('../lib/reportGenerator');
const { getResultTemplate } = require('../lib/templateResolver');

// user reports directory (pre-generated PDFs written here)
const userReportsDir = reportGenerator.reportsDir;

// Helper to inline logo as base64 data URI for reliable PDF rendering (cached)
let _cachedInlineLogo;
function getInlineLogo() {
  if (typeof _cachedInlineLogo !== 'undefined') return _cachedInlineLogo;
  try {
    const p = path.join(__dirname, '..', 'assets', 'gezyne-logo.png');
    const buf = fs.readFileSync(p);
    _cachedInlineLogo = 'data:image/png;base64,' + buf.toString('base64');
  } catch (err) {
    console.warn('Inline logo read failed:', err && err.message);
    _cachedInlineLogo = null;
  }
  return _cachedInlineLogo;
}

// uses centralized logger in lib/reportLogger.js

// GET /reports - Reports page
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    // Find the most recent completed/released test and redirect to its preview
    const allTests = await Test.find({});
    const completedTests = Array.isArray(allTests)
      ? allTests.filter(t => t && (t.status === 'Completed' || t.status === 'Released'))
      : [];
    completedTests.sort((a, b) => new Date(b.testDate || b.createdAt) - new Date(a.testDate || a.createdAt));

    if (completedTests.length) {
      const mostRecent = completedTests[0];
      return res.redirect(`/reports/preview/${mostRecent.id || mostRecent._id}`);
    }

    // No completed tests — show a simple message
    return res.render('reports/preview', {
      title: 'Report Preview',
      test: null,
      currentDate: new Date().toLocaleDateString(),
      renderedResultHtml: null,
      testsForNav: [],
      prevId: null,
      nextId: null,
      filterQuery: ''
    });

  } catch (error) {
    console.error('Reports page error:', error);
    req.flash('error_msg', 'Error loading reports');
    res.redirect('/dashboard');
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

    // Populate only the current test's patient (fast — single lookup)
    const patient = await Patient.findById(test.patient);
    const requestedBy = await User.findById(test.requestedBy);
    const performedBy = await User.findById(test.performedBy);

    const isRequestedByMedical = requestedBy && (requestedBy.role === 'Radiologist' || requestedBy.role === 'Doctor' || requestedBy.role === 'Pathologist');
    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: isRequestedByMedical ? { name: requestedBy.name, role: requestedBy.role } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    if ((!populatedTest.requestedBy || !populatedTest.requestedBy.name) && populatedTest.results && populatedTest.results.requestedByName) {
      populatedTest.requestedBy = { name: populatedTest.results.requestedByName, license: populatedTest.results.requestedByLicense || null };
    }
    if ((!populatedTest.performedBy || !populatedTest.performedBy.name) && populatedTest.results && populatedTest.results.performedByName) {
      populatedTest.performedBy = { name: populatedTest.results.performedByName, license: populatedTest.results.performedByLicense || null };
    }

    // Build navigation list — lightweight: read patient names from a single
    // in-memory scan of the patients array, NOT one-by-one async lookups.
    const allTests = await Test.find({});
    const completedSorted = Array.isArray(allTests)
      ? allTests.filter(t => t && (t.status === 'Completed' || t.status === 'Released'))
      : [];
    completedSorted.sort((a, b) => new Date(b.testDate || b.createdAt) - new Date(a.testDate || a.createdAt));

    // Build a patient-id → name map from in-memory DB (one scan, not N async calls)
    const allPatients = await Patient.find ? await Patient.find({}) : [];
    const patientMap = {};
    (Array.isArray(allPatients) ? allPatients : []).forEach(p => {
      const pid = p.id || p._id;
      if (pid) patientMap[pid] = `${p.lastName || ''}, ${p.firstName || ''}`.replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
    });

    const testsForNav = completedSorted.map(t => ({
      id: t.id || t._id,
      testId: t.testId,
      testType: t.testType || t.template || '',
      patientName: t.patient ? (patientMap[t.patient] || '') : '',
      testDate: t.testDate || t.createdAt || null
    }));

    const currentIndex = testsForNav.findIndex(tn => String(tn.id) === String(test.id || test._id));
    let prevId = (currentIndex > 0) ? testsForNav[currentIndex - 1].id : null;
    let nextId = (currentIndex >= 0 && currentIndex < testsForNav.length - 1) ? testsForNav[currentIndex + 1].id : null;

    // filtered prev/next
    const fp = req.query.filterPatient || null;
    const ft = req.query.filterTestType || null;
    const fd = req.query.filterDate || null;
    if (fp || ft || fd) {
      try {
        const filtered = testsForNav.filter(tn => {
          if (fp && (tn.patientName || '') !== fp) return false;
          if (ft && (tn.testType || '') !== ft) return false;
          if (fd) { const d = tn.testDate ? new Date(tn.testDate).toISOString().slice(0,10) : ''; if (d !== fd) return false; }
          return true;
        });
        const ci = filtered.findIndex(tn => String(tn.id) === String(test.id || test._id));
        if (ci !== -1) {
          prevId = ci > 0 ? filtered[ci - 1].id : null;
          nextId = ci < filtered.length - 1 ? filtered[ci + 1].id : null;
        }
      } catch (e) {}
    }

    // Render the result partial + print wrapper HTML for the preview iframe srcdoc
    const template = getResultTemplate(populatedTest);
    const inlineLogo = getInlineLogo();

    const qparts = [];
    if (req.query.filterPatient) qparts.push('filterPatient=' + encodeURIComponent(req.query.filterPatient));
    if (req.query.filterTestType) qparts.push('filterTestType=' + encodeURIComponent(req.query.filterTestType));
    if (req.query.filterDate) qparts.push('filterDate=' + encodeURIComponent(req.query.filterDate));
    const filterQuery = qparts.length ? ('?' + qparts.join('&')) : '';

    // Render result template → HTML string (callback, no layout)
    res.render(`reports/results/${template}`, { title: 'Result', test: populatedTest, layout: false, inlineLogo }, (err, renderedHtml) => {
      if (err) { console.error('Error rendering result template for preview:', err); }

      // Wrap with print layout
      res.render('reports/print', {
        title: 'Print Report', test: populatedTest,
        currentDate: new Date().toLocaleDateString(),
        renderedResultHtml: renderedHtml, layout: false, inlineLogo
      }, (err2, finalHtml) => {
        if (err2) { console.error('Error rendering print wrapper for preview:', err2); }

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

// getResultTemplate is imported from lib/templateResolver.js above
// (kept as comment for reference — the function lives in lib/templateResolver.js)

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

    const isRequestedByMedical = requestedBy && (requestedBy.role === 'Radiologist' || requestedBy.role === 'Doctor' || requestedBy.role === 'Pathologist');
    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: isRequestedByMedical ? { name: requestedBy.name, role: requestedBy.role } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    const template = getResultTemplate(populatedTest);
    // Render the matching template view under reports/results
    // allow embedding without layout when requested (used by preview iframe)
    const useLayout = req.query.embedded ? false : 'print';
    const autoPrint = req.query.print === '1' || req.query.print === 'true';
    const inlineLogo = getInlineLogo();
    return res.render(`reports/results/${template}`, {
      title: 'Result',
      test: populatedTest,
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

// GET /reports/pdf/:testId - Serve pre-generated PDF (or generate on-demand if missing)
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

    // Ensure completedAt is set for reception workflow
    if (!test.completedAt && test.results && String(test.results).trim() && test.testType !== "Doctor's Check-up" && test.testType !== 'Registration') {
      await Test.findByIdAndUpdate(test.id, { completedAt: new Date() }, { new: true });
      test.completedAt = new Date();
    }

    // Check for pre-generated PDF in user's Documents/LIS/reports
    const pdfPath = reportGenerator.getReportPath(test);

    // If PDF doesn't exist yet, generate it now (one-time cost)
    if (!reportGenerator.reportExists(test)) {
      console.log(`[reports] PDF not found for testId=${test.testId}, generating on-demand...`);
      await reportGenerator.generatePdfForTest(test);
    }

    // Serve the file from disk
    if (fs.existsSync(pdfPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${path.basename(pdfPath)}`);
      return fs.createReadStream(pdfPath).pipe(res);
    }

    // If we still don't have the file, something went wrong
    req.flash('error_msg', 'Error generating PDF report');
    return res.redirect('/reports');

  } catch (error) {
    console.error('PDF serve error:', error);
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

    const isRequestedByMedical = requestedBy && (requestedBy.role === 'Radiologist' || requestedBy.role === 'Doctor' || requestedBy.role === 'Pathologist');
    const populatedTest = {
      ...test,
      patient: patient ? patient.toJSON() : null,
      requestedBy: isRequestedByMedical ? { name: requestedBy.name, role: requestedBy.role } : null,
      performedBy: performedBy ? { name: performedBy.name } : null
    };

    // Render the specific result template into HTML, then render the print wrapper
    const template = getResultTemplate(populatedTest);
    const viewPath = `reports/results/${template}`;

    // Render the result template without layout to get its HTML
    const inlineLogo = getInlineLogo();
    res.render(viewPath, { title: 'Result Print', test: populatedTest, layout: false, inlineLogo }, (err, renderedHtml) => {
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

    // Fetch tests by id in the provided order. The file-backed `Test` model
    // does not support Mongo-style queries with $in, so fetch each id
    // explicitly and preserve the requested order.
    const fetched = await Promise.all(ids.map(id => Test.findById(id)));
    const ordered = (fetched || []).filter(Boolean).filter(t => t && (t.status === 'Completed' || t.status === 'Released'));

    if (!ordered.length) {
      req.flash('error_msg', 'No printable tests found for provided ids');
      return res.redirect('/reports');
    }

    const renderedParts = [];
    for (const t of ordered) {
      const patient = t.patient ? await Patient.findById(t.patient) : null;
      const requestedBy = t.requestedBy ? await User.findById(t.requestedBy) : null;
      const performedBy = t.performedBy ? await User.findById(t.performedBy) : null;

      const isRequestedByMedical = requestedBy && (requestedBy.role === 'Radiologist' || requestedBy.role === 'Doctor' || requestedBy.role === 'Pathologist');
      const populatedTest = {
        ...t,
        patient: patient ? patient.toJSON() : null,
        requestedBy: isRequestedByMedical ? { name: requestedBy.name, role: requestedBy.role } : null,
        performedBy: performedBy ? { name: performedBy.name } : null
      };

      const template = getResultTemplate(populatedTest);
      // Render each template into HTML (no layout)
      try {
        const html = await new Promise((resolve, reject) => {
          res.render(`reports/results/${template}`, { title: 'Result', test: populatedTest, layout: false, inlineLogo: getInlineLogo() }, (err, html) => {
            if (err) return reject(err);
            resolve(html);
          });
        });
        renderedParts.push(html);
      } catch (renderErr) {
        console.error('Failed to render template for test', t.id || t._id, renderErr && renderErr.message);
        logReportError(renderErr, `render-multiple ${t.id || t._id}`);
        // skip this test and continue with others
      }
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

// Worksheet export routes
router.get('/worksheet', requireAuth, canAccessPatient, async (req, res) => {
  try {
    // get distinct test types for dropdown
    let types = [];
    try {
      types = await Test.distinct('testType');
    } catch (e) {
      // fallback to scanning tests
      const all = await Test.find({});
      types = Array.from(new Set((all || []).map(t => t.testType || '').filter(Boolean)));
    }
    types = (types || []).filter(Boolean).sort();
    res.render('reports/worksheet', { title: 'Worksheet Export', types });
  } catch (err) {
    console.error('Worksheet page error:', err);
    req.flash('error_msg', 'Error loading worksheet page');
    res.redirect('/reports');
  }
});

router.post('/worksheet/download', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testType, dateFrom, dateTo, allData, format } = req.body || {};
    const q = {};
    if (!allData) {
      if (testType) q.testType = testType;
      if (dateFrom) q.testDate = Object.assign(q.testDate || {}, { $gte: new Date(dateFrom) });
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23,59,59,999);
        q.testDate = Object.assign(q.testDate || {}, { $lte: end });
      }
    }

    let testsRaw = await Test.find(q);
    // Test.find returns an array for this file-based model; apply filters in-memory because model supports limited query keys
    if (!allData) {
      if (testType) {
        const ttLower = String(testType).toLowerCase().trim();
        testsRaw = (testsRaw || []).filter(t => {
          const candidate = String(t.testType || t.template || '').toLowerCase().trim();
          return candidate.includes(ttLower) || ttLower.includes(candidate);
        });
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        testsRaw = (testsRaw || []).filter(t => {
          const d = new Date(t.testDate || t.createdAt);
          return d >= from;
        });
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23,59,59,999);
        testsRaw = (testsRaw || []).filter(t => {
          const d = new Date(t.testDate || t.createdAt);
          return d <= end;
        });
      }
    }

    // sort in-memory by testDate ascending
    testsRaw = (testsRaw || []).sort((a, b) => new Date(a.testDate || a.createdAt) - new Date(b.testDate || b.createdAt));

    // collect rows and dynamic result keys
    const rows = [];
    const resultKeys = new Set();
    for (const t of testsRaw) {
      const p = t.patient ? await Patient.findById(t.patient) : null;
      const requestedBy = t.requestedBy ? await User.findById(t.requestedBy) : null;
      const performedBy = t.performedBy ? await User.findById(t.performedBy) : null;
      const resultsObj = (t.results && typeof t.results === 'object') ? t.results : (t.results ? { results: String(t.results) } : {});
      Object.keys(resultsObj).forEach(k => resultKeys.add(k));
      const isRequestedByMedical = requestedBy && (requestedBy.role === 'Radiologist' || requestedBy.role === 'Doctor' || requestedBy.role === 'Pathologist');
      rows.push({
        testId: t.testId || (t.id || t._id) || '',
        testType: t.testType || t.template || '',
        testDate: t.testDate ? new Date(t.testDate) : null,
        patient: p ? p.toJSON() : null,
        resultsObj,
        requestedBy: isRequestedByMedical ? { name: requestedBy.name } : (t.requestedByName ? { name: t.requestedByName } : null),
        performedBy: performedBy ? { name: performedBy.name, license: performedBy.license || null } : (t.performedByName ? { name: t.performedByName, license: t.performedByLicense || null } : null)
      });
    }

    const resultCols = Array.from(resultKeys);
    const headers = ['Test ID','Test Type','Test Date','Test Time','Patient ID','First Name','Last Name','DOB','Sex','Phone','Results (raw)','Performed By','Performed By License','Requested By', ...resultCols];

    function escapeCsvCell(v) {
      if (v === null || typeof v === 'undefined') return '';
      const s = String(v);
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        return '"' + s.replace(/"/g,'""') + '"';
      }
      return s;
    }

    const lines = [headers.map(escapeCsvCell).join(',')];
    for (const r of rows) {
      const dateStr = r.testDate ? r.testDate.toLocaleDateString() : '';
      const timeStr = r.testDate ? r.testDate.toLocaleTimeString() : '';
      const p = r.patient || {};
      const rawResults = (r.resultsObj && Object.keys(r.resultsObj).length) ? JSON.stringify(r.resultsObj) : '';
      const base = [
        r.testId, r.testType, dateStr, timeStr,
        p.patientId || p.patientId || '',
        p.firstName || '', p.lastName || '',
        p.dateOfBirth ? (new Date(p.dateOfBirth)).toLocaleDateString() : '',
        p.sex || p.gender || '',
        p.phone || p.telephone || '',
        rawResults,
        r.performedBy ? r.performedBy.name : '',
        r.performedBy ? r.performedBy.license || '' : '',
        r.requestedBy ? r.requestedBy.name : ''
      ];
      const resultVals = resultCols.map(k => (r.resultsObj && typeof r.resultsObj[k] !== 'undefined') ? r.resultsObj[k] : '');
      const rowVals = base.concat(resultVals).map(escapeCsvCell).join(',');
      lines.push(rowVals);
    }

    const filenameBase = `worksheet_export_${(new Date()).toISOString().slice(0,19).replace(/[:T]/g,'-')}`;
    const fmt = (format || '').toLowerCase();

    if (fmt === 'xlsx') {
      // Build a real .xlsx workbook using exceljs
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Worksheet Export');

      // Build header row with keys
      const cols = headers.map(h => ({ header: h, key: h, width: Math.min(40, Math.max(10, String(h).length + 4)) }));
      ws.columns = cols;

      for (const r of rows) {
        const dateStr = r.testDate ? r.testDate.toLocaleDateString() : '';
        const timeStr = r.testDate ? r.testDate.toLocaleTimeString() : '';
        const p = r.patient || {};
        const rawResults = (r.resultsObj && Object.keys(r.resultsObj).length) ? JSON.stringify(r.resultsObj) : '';
        const baseVals = [
          r.testId, r.testType, dateStr, timeStr,
          p.patientId || '',
          p.firstName || '', p.lastName || '',
          p.dateOfBirth ? (new Date(p.dateOfBirth)).toLocaleDateString() : '',
          p.sex || p.gender || '',
          p.phone || '',
          rawResults,
          r.performedBy ? r.performedBy.name : '',
          r.performedBy ? r.performedBy.license || '' : '',
          r.requestedBy ? r.requestedBy.name : ''
        ];
        const rowVals = baseVals.concat(resultCols.map(k => (r.resultsObj && typeof r.resultsObj[k] !== 'undefined') ? r.resultsObj[k] : ''));
        // Push as object keyed by header to preserve column order
        const rowObj = {};
        headers.forEach((h, i) => { rowObj[h] = rowVals[i]; });
        ws.addRow(rowObj);
      }

      // Auto-filter and freeze header row
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(Buffer.from(buffer));
    }

    if (fmt === 'excel') {
      // Legacy: send HTML table as .xls which Excel will open
      let html = '<table border="1"><thead><tr>';
      headers.forEach(h => html += `<th>${String(h).replace(/</g,'&lt;')}</th>`);
      html += '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>';
        const dateStr = r.testDate ? r.testDate.toLocaleDateString() : '';
        const timeStr = r.testDate ? r.testDate.toLocaleTimeString() : '';
        const p = r.patient || {};
        const rawResults = (r.resultsObj && Object.keys(r.resultsObj).length) ? JSON.stringify(r.resultsObj) : '';
        const baseVals = [
          r.testId, r.testType, dateStr, timeStr,
          p.patientId || '',
          p.firstName || '', p.lastName || '',
          p.dateOfBirth ? (new Date(p.dateOfBirth)).toLocaleDateString() : '',
          p.sex || p.gender || '',
          p.phone || '',
          rawResults,
          r.performedBy ? r.performedBy.name : '',
          r.performedBy ? r.performedBy.license || '' : '',
          r.requestedBy ? r.requestedBy.name : ''
        ];
        baseVals.concat(resultCols.map(k => (r.resultsObj && typeof r.resultsObj[k] !== 'undefined') ? r.resultsObj[k] : '')).forEach(v => {
          html += `<td>${String(v === undefined || v === null ? '' : v).replace(/</g,'&lt;')}</td>`;
        });
        html += '</tr>';
      }
      html += '</tbody></table>';
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xls"`);
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=UTF-8');
      return res.send(html);
    }

    // default CSV
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
    res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
    return res.send(lines.join('\n'));
  } catch (error) {
    console.error('Worksheet export error:', error);
    req.flash('error_msg', 'Error generating worksheet export');
    res.redirect('/reports');
  }
});

// POST /reports/worksheet/preview - return a preview (JSON) of filtered rows (limited)
router.post('/worksheet/preview', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testType, dateFrom, dateTo, allData, limit } = req.body || {};
    const q = {};
    // fetch all then filter in-memory (same logic as download)
    let testsRaw = await Test.find(q);
    if (!allData) {
      if (testType) {
        const ttLower = String(testType).toLowerCase();
        testsRaw = (testsRaw || []).filter(t => {
          const candidate = String(t.testType || t.template || '').toLowerCase();
          return candidate === ttLower;
        });
      }
      if (dateFrom) {
        const from = new Date(dateFrom);
        testsRaw = (testsRaw || []).filter(t => {
          const d = new Date(t.testDate || t.createdAt);
          return d >= from;
        });
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23,59,59,999);
        testsRaw = (testsRaw || []).filter(t => {
          const d = new Date(t.testDate || t.createdAt);
          return d <= end;
        });
      }
    }
    testsRaw = (testsRaw || []).sort((a, b) => new Date(a.testDate || a.createdAt) - new Date(b.testDate || b.createdAt));

    // build preview rows (minimal patient info + date/time + performedBy + results object)
    const previewRows = [];
    const resultKeys = new Set();
    for (const t of testsRaw) {
      const p = t.patient ? await Patient.findById(t.patient) : null;
      const performedBy = t.performedBy ? await User.findById(t.performedBy) : null;
      const resultsObj = (t.results && typeof t.results === 'object') ? t.results : (t.results ? { results: String(t.results) } : {});
      Object.keys(resultsObj).forEach(k => resultKeys.add(k));
      previewRows.push({
        testId: t.testId || t.id || t._id || '',
        testType: t.testType || t.template || '',
        date: t.testDate ? new Date(t.testDate).toISOString().slice(0,10) : (t.createdAt ? new Date(t.createdAt).toISOString().slice(0,10) : ''),
        time: t.testDate ? new Date(t.testDate).toISOString().slice(11,19) : '',
        patientId: p ? (p.patientId || '') : '',
        firstName: p ? (p.firstName || '') : '',
        lastName: p ? (p.lastName || '') : '',
        signatory: performedBy ? (performedBy.name || '') : (t.performedByName || ''),
        resultsObj
      });
    }

    const resultCols = Array.from(resultKeys);
    const max = Math.min(1000, parseInt(limit || '200', 10) || 200);
    return res.json({ count: previewRows.length, rows: previewRows.slice(0, max), resultCols });
  } catch (err) {
    console.error('Worksheet preview error:', err);
    return res.status(500).json({ error: 'Error generating preview' });
  }
});
