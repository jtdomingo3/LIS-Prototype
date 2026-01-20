const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');


// GET /tests - List all tests
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search || '';

  // Get all tests and patients
  let allTests = await Test.find({});
  const allPatients = await Patient.find({});

    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      allTests = allTests.filter(test => {
        const patient = allPatients.find(p => p.id === test.patient);
        const patientName = patient ? `${patient.firstName} ${patient.lastName}`.toLowerCase() : '';
        return test.testId.toLowerCase().includes(searchLower) ||
               test.testType.toLowerCase().includes(searchLower) ||
               patientName.includes(searchLower);
      });
    }

    // Sort by creation date (newest first)
    allTests.sort((a, b) => new Date(b.createdAt || b.testDate) - new Date(a.createdAt || a.testDate));

    const totalTests = allTests.length;
    const totalPages = Math.ceil(totalTests / limit);

    // Paginate
    const tests = allTests.slice(skip, skip + limit);

    // Add patient info to each test
    const testsWithPatientInfo = tests.map(test => {
      const patient = allPatients.find(p => p.id === test.patient);
      return {
        ...test,
        patient: patient ? {
          firstName: patient.firstName,
          lastName: patient.lastName,
          patientId: patient.patientId
        } : null
      };
    });

    res.render('tests/index', {
      title: 'Test & Results Management',
      tests: testsWithPatientInfo,
      currentPage: page,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page - 1,
      nextPage: page + 1,
      searchQuery
    });
  } catch (error) {
    console.error('Tests list error:', error);
    req.flash('error_msg', 'Error loading tests');
    res.redirect('/dashboard');
  }
});

// GET /tests/new - New test form
router.get('/new', requireAuth, canAccessPatient, async (req, res) => {
  try {
  let patients = await Patient.find({});
  // debug: ensure we have an array
  // sort patients by lastName ascending
  if (Array.isArray(patients)) patients.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  // load templates for test types
  const Template = require('../models/Template');
  let templates = await Template.find({ isActive: true });
  // append static result templates (views/reports/results)
    try {
    const resultsDir = path.join(__dirname, '..', 'views', 'reports', 'results');
    const allowed = [
      'fecalysis.ejs',
      'esr.ejs',
      'fecal-occult-blood.ejs',
      'urinalysis.ejs',
      'ct-bt.ejs',
      'blood-typing.ejs',
      'pregnancy-test.ejs',
      'dengue-duo.ejs',
      'thyroid-panel.ejs',
      'blood-chemistry.ejs',
      'blood-chemistry-sgpt-sgot.ejs',
      'blood-chemistry-bun-crea.ejs',
      'blood-chemistry-lipid-profile.ejs',
      'blood-chemistry-electrolytes.ejs',
      'blood-chemistry-hba1c.ejs',
      'blood-chemistry-albumin.ejs',
      'blood-chemistry-blood-sugar.ejs',
      'pt-aptt.ejs',
      'xray.ejs',
      'hematology.ejs',
      'serology.ejs',
      'ultrasound.ejs'
    ];
    const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
    const staticTemplates = files.map(f => {
      if (f === 'blood-chemistry-bun-crea.ejs') {
        return { name: 'Blood Chemistry - BUN/Crea', testType: 'BUN/Creat' };
      }
      if (f === 'blood-chemistry-sgpt-sgot.ejs') {
        return { name: 'Blood Chemistry - SGPT/SGOT', testType: 'Blood Chemistry - SGPT/SGOT' };
      }
      const name = f.replace('.ejs', '').replace(/-/g, ' ');
      return { name: name.charAt(0).toUpperCase() + name.slice(1), testType: name };
    });
    templates = templates.concat(staticTemplates);
  } catch (e) {
    // ignore static templates on error
  }

    res.render('tests/new', {
      title: 'Create New Test',
      test: {},
      patients,
      templates
    });
  } catch (error) {
    console.error('New test error:', error);
    req.flash('error_msg', 'Error loading form');
    res.redirect('/tests');
  }
});

// POST /tests - Create new test
router.post('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { patient, testType, testDate, status, results, notes, priority } = req.body;

    // Validate required fields
    if (!patient || !testType || !testDate) {
      req.flash('error_msg', 'Please fill all required fields');
      let patients = await Patient.find({});
      if (Array.isArray(patients)) patients.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
      const Template = require('../models/Template');
      let templates = await Template.find({ isActive: true });
      return res.render('tests/new', {
        title: 'Create New Test',
        test: req.body,
        patients,
        templates
      });
    }

    // Generate test ID (file DB compatible)
    const allTestsForId = await Test.find({});
    let testId = 'T001';
    if (allTestsForId && allTestsForId.length) {
      const maxNum = allTestsForId.reduce((max, t) => {
        const n = parseInt((t.testId || 'T0').substring(1)) || 0;
        return Math.max(max, n);
      }, 0);
      testId = 'T' + String(maxNum + 1).padStart(3, '0');
    }

    // Ensure uniqueness if collision
    while ((await Test.findOne({ testId })) !== null) {
      const id = parseInt(testId.substring(1)) + 1;
      testId = 'T' + String(id).padStart(3, '0');
    }

    const test = new Test({
      testId,
      patient,
      testType,
      testDate,
      status: status || 'Pending',
      results,
      notes,
      priority: priority || 'Normal',
      requestedBy: req.session.user.id
    });

    await test.save();

    req.flash('success_msg', `${testType} test created successfully!`);
    res.redirect('/tests');

    } catch (error) {
    console.error('Create test error:', error);
    req.flash('error_msg', 'Error creating test');
  let patients = await Patient.find({});
  console.log('GET /tests/:id/edit - patients type:', typeof patients, 'isArray:', Array.isArray(patients));
  if (Array.isArray(patients)) patients.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  const Template = require('../models/Template');
  let templates = await Template.find({ isActive: true });
    res.render('tests/new', {
      title: 'Create New Test',
      test: req.body,
      patients,
      templates
    });
  }
});

// GET /tests/:id - Show test details
router.get('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    // Fetch test and manually populate relations for file-based DB
    const test = await Test.findById(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    const requestedByUser = test.requestedBy ? await User.findById(test.requestedBy) : null;
    const performedByUser = test.performedBy ? await User.findById(test.performedBy) : null;
    const patient = test.patient ? await Patient.findById(test.patient) : null;

    const populatedTest = {
      ...test,
      requestedBy: requestedByUser ? { name: requestedByUser.name } : null,
      performedBy: performedByUser ? { name: performedByUser.name } : null,
      patient: patient ? patient.toJSON() : null
    };

    res.render('tests/show', {
      title: 'Test Details',
      test: populatedTest
    });

  } catch (error) {
    console.error('Test details error:', error);
    req.flash('error_msg', 'Error loading test details');
    res.redirect('/tests');
  }
});

// GET /tests/:id/results - Results entry form (supports fecalysis for now)
router.get('/:id/results', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    // Only render form for supported test types (including pregnancy)
    // Temporary diagnostic: log testType and guard evaluations to help debugging
    const tt = test.testType || '';
    const checks = {
      fecalysis: /fecalysis/i.test(tt),
      fecal_occult: /(fecal\s*occult|fecal-occult|fecaloccult)/i.test(tt),
      urinalysis: /urinalysis/i.test(tt),
      lipid: /(lipid|lipid\s*profile|blood\s*chemistry\s*-?\s*lipid|blood\s*chemistry\s*lipid\s*profile|blood\s*chemistry\s*lipid)/i.test(tt),
      electrolytes: /(electrolyte|electrolytes|sodium|potassium|chloride)/i.test(tt),
        blood_sugar: /(blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour)/i.test(tt),
      hematology: /hemato|hematology|cbc/i.test(tt),
      blood_typing: /(blood\s*typing|blood-typing|bloodtyping)/i.test(tt),
      serology: /serol|serology/i.test(tt),
      thyroid: /thyroid|thyroid\s*panel|thyroid-panel/i.test(tt),
      hba1c: /(hba1c|hb\s*a1c|hb-a1c|hba\s*1c)/i.test(tt),
      albumin: /(albumin|alb)/i.test(tt),
      pregnancy: /pregnan|pregnancy|pregnancy\s*test/i.test(tt),
      dengue: /dengue/i.test(tt),
      pt: /\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/i.test(tt),
      blood_chem: /(blood\s*chemistry|blood-chemistry|blood\s*chem)/i.test(tt),
      esr: /(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(tt)
      ,
      ct_bt: /(bleeding|clotting|ct\s*&?\s*bt|ct\s*and\s*bt)/i.test(tt)
      ,
      xray: /(x-?ray|xray|radiograph)/i.test(tt)
    };
    console.log(`DEBUG GET /tests/${req.params.id}/results - testType='${tt}', checks=`, checks);
    if (!tt || !Object.values(checks).some(Boolean)) {
      req.flash('error_msg', 'Results entry form is only available for supported test types (including Pregnancy Test)');
      return res.redirect(`/tests/${req.params.id}`);
    }

    // populate patient and performedBy user list
    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const testForView = { ...test, patient: patient ? patient.toJSON() : null };
    const users = await User.find({});

    // choose the appropriate entry form
    let view = 'tests/results_entry_fecalysis';
    // normalize testType for robust matching (remove non-alphanumerics)
    const normalizedType = String(test.testType || '').toLowerCase().replace(/[^a-z0-9]/g, ' ');
    if (/(lipid|lipid\s*profile|blood\s*chemistry\s*-\s*lipid|blood\s*chemistry\s*lipid)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_lipid_profile';
    if (/(sgpt|sgot)/i.test(normalizedType)) view = 'tests/results_entry_blood_chemistry_sgpt_sgot';
    if (/(hba1c|hb\s*a1c|hb-a1c|hba\s*1c)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_hba1c';
    if (/(electrolyte|electrolytes|sodium|potassium|chloride)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_electrolytes';
    if (/(blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_blood_sugar';
    if (/(albumin|alb)/i.test(normalizedType)) view = 'tests/results_entry_blood_chemistry_albumin';
    if (/(x-?ray|xray|radiograph)/i.test(test.testType)) view = 'tests/results_entry_xray';
    if (/(fecal\s*occult|fecal-occult|fecaloccult)/i.test(test.testType)) view = 'tests/results_entry_fecal_occult_blood';
    if (/(bleeding|clotting|ct\s*&?\s*bt|ct\s*and\s*bt)/i.test(test.testType)) view = 'tests/results_entry_ct_bt';
    if (/(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(test.testType)) view = 'tests/results_entry_esr';
    if (/urinalysis/i.test(test.testType)) view = 'tests/results_entry_urinalysis';
    if (/hemato|hematology|cbc/i.test(test.testType)) view = 'tests/results_entry_hematology';
    if (/(blood\s*typing|blood-typing|bloodtyping)/i.test(test.testType)) view = 'tests/results_entry_blood_typing';
    if (/serol|serology/i.test(test.testType)) view = 'tests/results_entry_serology';
    if (/thyroid|thyroid\s*panel|thyroid-panel/i.test(test.testType)) view = 'tests/results_entry_thyroid_panel';
    if (/pregnan|pregnancy|pregnancy\s*test/i.test(test.testType)) view = 'tests/results_entry_pregnancy_test';
    if (/dengue/i.test(test.testType)) view = 'tests/results_entry_dengue_duo';
    if (/\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/i.test(test.testType)) view = 'tests/results_entry_pt_aptt';
    if (/(bun|creatinine|bun[\s\/-]?crea|bun\/?crea)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_bun_crea';
    if (/(blood\s*chemistry|blood-chemistry|blood\s*chem)/i.test(normalizedType) && !/(lipid|lipid\s*profile|blood\s*chemistry\s*-?\s*lipid|blood\s*chemistry\s*lipid\s*profile|blood\s*chemistry\s*lipid|electrolyte|electrolytes|sodium|potassium|chloride|hba1c|hb\s*a1c|hb-a1c|blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour|bun|creatinine|bun[\s\/\-]?crea|bun\/?crea|sgpt|sgot|albumin|alb)/i.test(normalizedType)) view = 'tests/results_entry_blood_chemistry';
    console.log(`DEBUG GET /tests/${req.params.id}/results - selected view='${view}'`);
    res.render(view, {
      title: `Enter ${test.testType} Results`,
      test: testForView,
      users
    });

  } catch (err) {
    console.error('Results entry form error:', err);
    req.flash('error_msg', 'Error loading results form');
    res.redirect(`/tests/${req.params.id}`);
  }
});

// POST /tests/:id/results - Save results for fecalysis
router.post('/:id/results', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }


    // Diagnostic: log testType and which regex checks match (helps debug unsupported type errors)
    const tt = test.testType || '';
    const checks = {
      fecalysis: /fecalysis/i.test(tt),
      fecal_occult: /(fecal\s*occult|fecal-occult|fecaloccult)/i.test(tt),
      urinalysis: /urinalysis/i.test(tt),
      hematology: /hemato|hematology|cbc/i.test(tt),
      blood_typing: /(blood\s*typing|blood-typing|bloodtyping)/i.test(tt),
      serology: /serol|serology/i.test(tt),
      thyroid: /thyroid|thyroid\s*panel|thyroid-panel/i.test(tt),
      pregnancy: /pregnan|pregnancy|pregnancy\s*test/i.test(tt),
      dengue: /dengue/i.test(tt),
      pt: /\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/i.test(tt),
      blood_chem: /(blood\s*chemistry|blood-chemistry|blood\s*chem)/i.test(tt),
      lipid: /(lipid|lipid\s*profile|blood\s*chemistry\s*-?\s*lipid|blood\s*chemistry\s*lipid\s*profile|blood\s*chemistry\s*lipid)/i.test(tt),
        electrolytes: /(electrolyte|electrolytes|sodium|potassium|chloride)/i.test(tt),
        blood_sugar: /(blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour)/i.test(tt),
      esr: /(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(tt),
      ct_bt: /(bleeding|clotting|ct\s*&?\s*bt|ct\s*and\s*bt)/i.test(tt)
      ,
      xray: /(x-?ray|xray|radiograph)/i.test(tt)
    };
    console.log(`DEBUG POST /tests/${req.params.id}/results - testType='${tt}', checks=`, checks);

    if (!tt || !Object.values(checks).some(Boolean)) {
      req.flash('error_msg', 'Invalid test type for this results form');
      return res.redirect(`/tests/${req.params.id}`);
    }

    console.log('POST /tests/:id/results body:', JSON.stringify(req.body || {}));

    // Extract common performer fields
    const { performedBy, mtName, mtLicense, pathName, pathLicense } = req.body;

    let resultsObj = {};
    let topUpdates = {};

    if (/(fecal\s*occult|fecal-occult|fecaloccult)/i.test(test.testType)) {
      const { specimen, result } = req.body;
      resultsObj = {
        specimen: (specimen || '').trim(),
        result: (result || '').trim()
      };
    } else if (/(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(test.testType)) {
      const { esr_value } = req.body;
      const raw = (esr_value || '').toString().trim();
      let flag = '';
      const val = parseFloat(raw);

      // Determine patient age and sex to choose reference range
      let patientObj = null;
      try {
        if (test.patient) patientObj = await Patient.findById(test.patient);
      } catch (e) {
        patientObj = null;
      }

      let age = null;
      if (patientObj && patientObj.dateOfBirth) {
        age = Math.max(0, new Date().getFullYear() - new Date(patientObj.dateOfBirth).getFullYear());
      }
      const sex = patientObj && patientObj.sex ? String(patientObj.sex).toLowerCase() : '';

      // Defaults
      const childUpper = 20;
      const maleUpper = 10;
      const femaleUpper = 20;
      const lower = 0;

      let upper = maleUpper;
      if (age !== null && age < 18) {
        upper = childUpper;
      } else {
        if (sex === 'male' || sex === 'm') upper = maleUpper;
        else upper = femaleUpper;
      }

      if (!isNaN(val)) {
        if (val > upper) flag = 'H';
        else if (val < lower) flag = 'L';
      }

      resultsObj = {
        esr_value: raw,
        esr_flag: flag
      };
    } else if (/(bleeding|clotting|ct\s*&?\s*bt|ct\s*and\s*bt|ct\s*bt|ctbt)/i.test(test.testType)) {
      // Accept minutes and seconds fields for more accurate time input
      const { bleeding_min, bleeding_sec, clotting_min, clotting_sec } = req.body;
      // Fallback to old single-field names if present (back-compat)
      const fallbackBt = (req.body.bleeding_time || '').toString().trim();
      const fallbackCt = (req.body.clotting_time || '').toString().trim();

      const minBt = (bleeding_min || '').toString().trim();
      const secBt = (bleeding_sec || '').toString().trim();
      const minCt = (clotting_min || '').toString().trim();
      const secCt = (clotting_sec || '').toString().trim();

      // Helper to parse ints; return null when not a valid integer
      function toIntSafe(s) {
        const n = parseInt(s, 10);
        return isNaN(n) ? null : n;
      }

      function computeTotalSeconds(minStr, secStr, fallbackStr) {
        const m = toIntSafe(minStr);
        const s = toIntSafe(secStr);
        if (m === null && s === null) {
          if (fallbackStr) {
            const parsed = parseFloat(fallbackStr);
            if (!isNaN(parsed)) return Math.round(parsed * 60);
          }
          return null;
        }
        const minutes = Math.max(0, (m === null ? 0 : m));
        let seconds = Math.max(0, (s === null ? 0 : s));
        // normalize seconds into minutes if >= 60
        if (seconds >= 60) {
          const extra = Math.floor(seconds / 60);
          seconds = seconds % 60;
          return (minutes + extra) * 60 + seconds;
        }
        return minutes * 60 + seconds;
      }

      const btSeconds = computeTotalSeconds(minBt, secBt, fallbackBt);
      const ctSeconds = computeTotalSeconds(minCt, secCt, fallbackCt);

      // Reference ranges in seconds
      const btLowerSec = 1 * 60;
      const btUpperSec = 5 * 60;
      const ctLowerSec = 2 * 60;
      const ctUpperSec = 7 * 60;

      let flagBt = '';
      let flagCt = '';
      if (btSeconds !== null && !isNaN(btSeconds)) {
        if (btSeconds > btUpperSec) flagBt = 'H';
        else if (btSeconds < btLowerSec) flagBt = 'L';
      }
      if (ctSeconds !== null && !isNaN(ctSeconds)) {
        if (ctSeconds > ctUpperSec) flagCt = 'H';
        else if (ctSeconds < ctLowerSec) flagCt = 'L';
      }

      // Prepare display strings like "2 minutes 45 secs" or fall back to numeric minute value
      function formatTimeDisplay(secVal, fallback) {
        if (secVal === null || isNaN(secVal)) return (fallback || '');
        const mins = Math.floor(secVal / 60);
        const secs = Math.round(secVal % 60);
        if (secs) return `${mins} minutes ${secs} secs`;
        return `${mins}`;
      }

      const displayBt = formatTimeDisplay(btSeconds, fallbackBt);
      const displayCt = formatTimeDisplay(ctSeconds, fallbackCt);

      resultsObj = {
        bleeding_time: displayBt,
        bleeding_time_display: displayBt,
        bleeding_seconds: btSeconds,
        bleeding_flag: flagBt,
        clotting_time: displayCt,
        clotting_time_display: displayCt,
        clotting_seconds: ctSeconds,
        clotting_flag: flagCt
      };
    } else if (/fecalysis/i.test(test.testType)) {
      const { color, consistency, pusCell, rbc, parasites, others, note } = req.body;
      resultsObj = {
        color: (color || '').trim(),
        consistency: (consistency || '').trim(),
        pusCell: (pusCell || '').trim(),
        rbc: (rbc || '').trim(),
        parasites: (parasites || '').trim(),
        others: (others || '').trim(),
        note: (note || '').trim()
      };

    } else if (/(lipid|lipid\s*profile|blood\s*chemistry\s*-\s*lipid|blood\s*chemistry\s*lipid)/i.test(test.testType)) {
      // Lipid profile: Cholesterol, Triglyceride (tg), HDL, LDL (auto-calc default)
      const { cholesterol, tg, hdl, ldl, note } = req.body;
      // parse numeric values
      function toNum(v) {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        if (s === '') return null;
        const n = parseFloat(s.replace(/[^0-9.+-eE]/g, ''));
        return isNaN(n) ? null : n;
      }
      const cholN = toNum(cholesterol);
      const tgN = toNum(tg);
      const hdlN = toNum(hdl);
      let ldlN = toNum(ldl);

      // If LDL not provided, compute using Friedewald approximation: LDL = TC - HDL - (TG/5)
      if ((ldlN === null || ldlN === undefined) && cholN !== null && hdlN !== null && tgN !== null) {
        ldlN = cholN - hdlN - (tgN / 5.0);
        // round to 2 decimals
        ldlN = Math.round(ldlN * 100) / 100;
      }

      // Compute H/L flags based on reference ranges
      function computeFlag(val, min, max) {
        if (val === null || val === undefined) return '';
        if (typeof min === 'number' && !isNaN(min) && val < min) return 'L';
        if (typeof max === 'number' && !isNaN(max) && val > max) return 'H';
        return '';
      }

      const cholFlag = computeFlag(cholN, 0, 200);
      const tgFlag = computeFlag(tgN, 60, 150);
      const hdlFlag = computeFlag(hdlN, 35, 80);
      const ldlFlag = computeFlag(ldlN, 66, 178);

      // Prepare display values (string) but keep numeric for flags if needed
      const display = (v) => (v === null || v === undefined ? '' : String(v));

      resultsObj = {
        cholesterol: display(cholesterol || ''),
        cholesterol_numeric: cholN,
        cholesterol_flag: cholFlag,
        tg: display(tg || ''),
        tg_numeric: tgN,
        tg_flag: tgFlag,
        hdl: display(hdl || ''),
        hdl_numeric: hdlN,
        hdl_flag: hdlFlag,
        ldl: (ldl !== undefined && ldl !== null && String(ldl).trim() !== '') ? String(ldl) : (ldlN !== null ? String(ldlN) : ''),
        ldl_numeric: ldlN,
        ldl_flag: ldlFlag,
        note: (note || '').trim()
      };
    } else if (/urinalysis/i.test(test.testType)) {
      const { color, appearance, specificGravity, ph, protein, glucose, ketones, bilirubin, blood, nitrite, leukocyte,
        urobilinogen, rbc, wbc, epithelial, mucus, amorphous, bacteria, casts, others, note } = req.body;
      resultsObj = {
        color: (color || '').trim(),
        appearance: (appearance || '').trim(),
        specificGravity: (specificGravity || '').trim(),
        ph: (ph || '').trim(),
        protein: (protein || '').trim(),
        glucose: (glucose || '').trim(),
        ketones: (ketones || '').trim(),
        bilirubin: (bilirubin || '').trim(),
        blood: (blood || '').trim(),
        nitrite: (nitrite || '').trim(),
        leukocyte: (leukocyte || '').trim(),
        urobilinogen: (urobilinogen || '').trim(),
        rbc: (rbc || '').trim(),
        wbc: (wbc || '').trim(),
        epithelial: (epithelial || '').trim(),
        mucus: (mucus || '').trim(),
        amorphous: (amorphous || '').trim(),
        bacteria: (bacteria || '').trim(),
        casts: (casts || '').trim(),
        others: (others || '').trim(),
        note: (note || '').trim()
      };
    } else if (/hemato|hematology|cbc/i.test(test.testType)) {
      const { rbc, hemoglobin, hematocrit, mcv, mch, mchc, wbc, neutrophils, lymphocyte, monocyte, eosinophils, basophils, platelets } = req.body;
      resultsObj = {
        rbc: (rbc || '').trim(),
        hemoglobin: (hemoglobin || '').trim(),
        hematocrit: (hematocrit || '').trim(),
        mcv: (mcv || '').trim(),
        mch: (mch || '').trim(),
        mchc: (mchc || '').trim(),
        wbc: (wbc || '').trim(),
        neutrophils: (neutrophils || '').trim(),
        lymphocyte: (lymphocyte || '').trim(),
        monocyte: (monocyte || '').trim(),
        eosinophils: (eosinophils || '').trim(),
        basophils: (basophils || '').trim(),
        platelets: (platelets || '').trim()
      };
    } else if (/(blood\s*typing|blood-typing|bloodtyping)/i.test(test.testType)) {
      const { specimen, result } = req.body;
      resultsObj = {
        specimen: (specimen || '').trim(),
        result: (result || '').trim()
      };
    } else if (/serol|serology/i.test(test.testType)) {
      // Serology: allow multiple test/result rows submitted as arrays
      const names = req.body.testName;
      const values = req.body.testResult;
      const entries = [];
      if (Array.isArray(names)) {
        for (let i = 0; i < names.length; i++) {
          const n = (names[i] || '').trim();
          const v = Array.isArray(values) ? (values[i] || '').trim() : (values || '').trim();
          if (n || v) entries.push({ test: n, result: v });
        }
      } else if (names || values) {
        entries.push({ test: (names || '').trim(), result: (values || '').trim() });
      }
      resultsObj = { entries };
    } else if (/thyroid|thyroid\s*panel|thyroid-panel/i.test(test.testType)) {
      const { tsh, ft4, ft3 } = req.body;
      resultsObj = {
        tsh: (tsh || '').trim(),
        ft4: (ft4 || '').trim(),
        ft3: (ft3 || '').trim()
      };
    } else if (/dengue/i.test(test.testType)) {
      const { ns1, igm, igg } = req.body;
      resultsObj = {
        ns1: (ns1 || '').trim(),
        igm: (igm || '').trim(),
        igg: (igg || '').trim()
      };
    } else if (/(hba1c|hb\s*a1c|hb-a1c|hba\s*1c)/i.test(test.testType)) {
      // Single-analyte HbA1c
      const raw = (req.body.hba1c || '').toString().trim();
      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function parseRange(ref){ if(!ref) return null; const m=String(ref).match(/([0-9]+(?:\.[0-9]+)?)\s*[\-–—]\s*([0-9]+(?:\.[0-9]+)?)/); if(m) return {min:parseFloat(m[1]), max:parseFloat(m[2]), display:m[1]+'-'+m[2]}; const m2=String(ref).match(/([0-9]+(?:\.[0-9]+)?)/); if(m2) return {min:parseFloat(m2[1]), max:NaN, display:m2[1]}; return null }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }
      const num = toNum(raw);
      const refRaw = (req.body.hba1c_ref || req.body.reference || '').toString().trim();
      const ref = parseRange(refRaw) || {min:4.00, max:6.50, display:'4.00-6.50'};
      resultsObj = {};
      resultsObj.hba1c = raw;
      resultsObj.hba1c_numeric = num;
      resultsObj.hba1c_flag = (req.body.hba1c_flag || flagNum(num, ref.min, ref.max));
      resultsObj.hba1c_ref = ref.display || '';
    } else if (/(electrolyte|electrolytes|sodium|potassium|chloride)/i.test(test.testType)) {
      // Standalone electrolytes entry: sodium, potassium, chloride
      const sRaw = (req.body.sodium || req.body.na || '').toString().trim();
      const kRaw = (req.body.potassium || req.body.k || '').toString().trim();
      const clRaw = (req.body.chloride || req.body.cl || '').toString().trim();
      const sRefRaw = (req.body.sodium_ref || req.body.na_ref || '').toString().trim();
      const kRefRaw = (req.body.potassium_ref || req.body.k_ref || '').toString().trim();
      const clRefRaw = (req.body.chloride_ref || req.body.cl_ref || '').toString().trim();

      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function parseRange(ref){ if(!ref) return null; const m=String(ref).match(/([0-9]+(?:\.[0-9]+)?)\s*[\-–—]\s*([0-9]+(?:\.[0-9]+)?)/); if(m) return {min:parseFloat(m[1]), max:parseFloat(m[2]), display:m[1]+'-'+m[2]}; const m2=String(ref).match(/([0-9]+(?:\.[0-9]+)?)/); if(m2) return {min:parseFloat(m2[1]), max:NaN, display:m2[1]}; return null }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }

      const defaults = { sodium:{min:135,max:145,display:'135-145'}, potassium:{min:3.5,max:5.1,display:'3.5-5.1'}, chloride:{min:98,max:107,display:'98-107'} };

      const sNum = toNum(sRaw);
      const kNum = toNum(kRaw);
      const clNum = toNum(clRaw);

      const sRef = parseRange(sRefRaw) || defaults.sodium;
      const kRef = parseRange(kRefRaw) || defaults.potassium;
      const clRef = parseRange(clRefRaw) || defaults.chloride;

      resultsObj = {};
      if (sRaw || sNum !== null) {
        resultsObj.sodium = sRaw || (sNum!==null?String(sNum):'');
        resultsObj.sodium_numeric = sNum;
        resultsObj.sodium_flag = (req.body.sodium_flag || flagNum(sNum, sRef.min, sRef.max));
        resultsObj.sodium_ref = sRef.display || '';
      }
      if (kRaw || kNum !== null) {
        resultsObj.potassium = kRaw || (kNum!==null?String(kNum):'');
        resultsObj.potassium_numeric = kNum;
        resultsObj.potassium_flag = (req.body.potassium_flag || flagNum(kNum, kRef.min, kRef.max));
        resultsObj.potassium_ref = kRef.display || '';
      }
      if (clRaw || clNum !== null) {
        resultsObj.chloride = clRaw || (clNum!==null?String(clNum):'');
        resultsObj.chloride_numeric = clNum;
        resultsObj.chloride_flag = (req.body.chloride_flag || flagNum(clNum, clRef.min, clRef.max));
        resultsObj.chloride_ref = clRef.display || '';
      }
    } else if (/(blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour)/i.test(test.testType)) {
      // Standalone blood sugar entry: fbs, rbs, firstHour, secondHour
      const fbsRaw = (req.body.fbs || '').toString().trim();
      const rbsRaw = (req.body.rbs || '').toString().trim();
      const firstRaw = (req.body.firstHour || req.body['1stHour'] || req.body['1st hour'] || '').toString().trim();
      const secondRaw = (req.body.secondHour || req.body['2ndHour'] || req.body['2nd hour'] || '').toString().trim();
      const fbsRefRaw = (req.body.fbs_ref || req.body.fbsRef || '').toString().trim();
      const rbsRefRaw = (req.body.rbs_ref || req.body.rbsRef || '').toString().trim();
      const firstRefRaw = (req.body.firstHour_ref || req.body.firstHourRef || '').toString().trim();
      const secondRefRaw = (req.body.secondHour_ref || req.body.secondHourRef || '').toString().trim();

      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function parseRange(ref){ if(!ref) return null; const m=String(ref).match(/([0-9]+(?:\.[0-9]+)?)\s*[\-–—]\s*([0-9]+(?:\.[0-9]+)?)/); if(m) return {min:parseFloat(m[1]), max:parseFloat(m[2]), display:m[1]+'-'+m[2]}; const m2=String(ref).match(/([0-9]+(?:\.[0-9]+)?)/); if(m2) return {min:parseFloat(m2[1]), max:NaN, display:m2[1]}; return null }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }

      const defaults = { fbs:{min:70,max:110,display:'70-110'}, rbs:{min:80,max:130,display:'80-130'}, firstHour:{min:90,max:140,display:'90-140'}, secondHour:{min:80,max:120,display:'80-120'} };

      const fbsNum = toNum(fbsRaw);
      const rbsNum = toNum(rbsRaw);
      const firstNum = toNum(firstRaw);
      const secondNum = toNum(secondRaw);

      const fbsRef = parseRange(fbsRefRaw) || defaults.fbs;
      const rbsRef = parseRange(rbsRefRaw) || defaults.rbs;
      const firstRef = parseRange(firstRefRaw) || defaults.firstHour;
      const secondRef = parseRange(secondRefRaw) || defaults.secondHour;

      resultsObj = {};
      if (fbsRaw || fbsNum !== null) {
        resultsObj.fbs = fbsRaw || (fbsNum!==null?String(fbsNum):'');
        resultsObj.fbs_numeric = fbsNum;
        resultsObj.fbs_flag = (req.body.fbs_flag || flagNum(fbsNum, fbsRef.min, fbsRef.max));
        resultsObj.fbs_ref = fbsRef.display || '';
      }
      if (rbsRaw || rbsNum !== null) {
        resultsObj.rbs = rbsRaw || (rbsNum!==null?String(rbsNum):'');
        resultsObj.rbs_numeric = rbsNum;
        resultsObj.rbs_flag = (req.body.rbs_flag || flagNum(rbsNum, rbsRef.min, rbsRef.max));
        resultsObj.rbs_ref = rbsRef.display || '';
      }
      if (firstRaw || firstNum !== null) {
        resultsObj.firstHour = firstRaw || (firstNum!==null?String(firstNum):'');
        resultsObj.firstHour_numeric = firstNum;
        resultsObj.firstHour_flag = (req.body.firstHour_flag || flagNum(firstNum, firstRef.min, firstRef.max));
        resultsObj.firstHour_ref = firstRef.display || '';
      }
      if (secondRaw || secondNum !== null) {
        resultsObj.secondHour = secondRaw || (secondNum!==null?String(secondNum):'');
        resultsObj.secondHour_numeric = secondNum;
        resultsObj.secondHour_flag = (req.body.secondHour_flag || flagNum(secondNum, secondRef.min, secondRef.max));
        resultsObj.secondHour_ref = secondRef.display || '';
      }
    } else if (/(bun|creatinine|bun[\s\/-]?crea|bun\/?crea)/i.test(test.testType)) {
      // Standalone BUN / Creatinine variant (result-only). Only save fields present and compute numeric + flags.
      const creatRaw = (req.body.creatinine || req.body.crea || '').toString().trim();
      const bunRaw = (req.body.bun || '').toString().trim();

      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }

      const creatNum = toNum(creatRaw);
      const bunNum = toNum(bunRaw);

      resultsObj = {};
      if (creatRaw || creatNum !== null) {
        resultsObj.creatinine = creatRaw || (creatNum!==null?String(creatNum):'');
        resultsObj.creatinine_numeric = creatNum;
        resultsObj.creatinine_flag = (req.body.creatinine_flag || flagNum(creatNum, 0.5, 1.0));
        resultsObj.creatinine_ref = '0.50-1.00';
      }
      if (bunRaw || bunNum !== null) {
        resultsObj.bun = bunRaw || (bunNum!==null?String(bunNum):'');
        resultsObj.bun_numeric = bunNum;
        resultsObj.bun_flag = (req.body.bun_flag || flagNum(bunNum, 4.67, 23.36));
        resultsObj.bun_ref = '4.67-23.36';
      }
      // optional note
      resultsObj.note = (req.body.note || '').trim();

    } else if (/(albumin|alb)/i.test(test.testType)) {
      // Simple ALB entry: single analyte with optional reference
      const albRaw = (req.body.alb || req.body.ALB || '').toString().trim();
      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function parseRange(ref){ if(!ref) return null; const m=String(ref).match(/([0-9]+(?:\.[0-9]+)?)\s*[\-–—]\s*([0-9]+(?:\.[0-9]+)?)/); if(m) return {min:parseFloat(m[1]), max:parseFloat(m[2]), display:m[1]+'-'+m[2]}; const m2=String(ref).match(/([0-9]+(?:\.[0-9]+)?)/); if(m2) return {min:parseFloat(m2[1]), max:NaN, display:m2[1]}; return null }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }

      const albNum = toNum(albRaw);
      const albRefRaw = (req.body.alb_ref || req.body.albRef || req.body.reference || '').toString().trim();
      const albRef = parseRange(albRefRaw) || {min:3.00, max:6.00, display:'3.00-6.00'};
      resultsObj = {};
      if (albRaw || albNum !== null) {
        resultsObj.alb = albRaw || (albNum!==null?String(albNum):'');
        resultsObj.alb_numeric = albNum;
        resultsObj.alb_flag = (req.body.alb_flag || flagNum(albNum, albRef.min, albRef.max));
        resultsObj.alb_ref = albRef.display || '';
      }
      // optional note
      resultsObj.note = (req.body.note || '').trim();

    } else if (/(x-?ray|xray|radiograph)/i.test(test.testType)) {
      // X-Ray: save case number, short examination, and rich-text paragraphs
      const caseNumber = (req.body.caseNumber || '').toString().trim();
      const examination = (req.body.examination || '').toString().trim();
      const paragraphs = (req.body.paragraphs || '').toString().trim();

      resultsObj = {
        paragraphs: paragraphs || ''
      };

      if (caseNumber) topUpdates.caseNumber = caseNumber;
      if (examination) topUpdates.examination = examination;

    } else if (/(blood(\s*|-)chemistry|blood\s*chem)/i.test(test.testType)) {
      const { fbs, rbs, firstHour, secondHour, cholesterol, tg, hdl, ldl, vldl, uricAcid, creatinine, bun, sgpt, sgot, sodium, potassium, chloride, hba1c, alb } = req.body;
      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }

      const sgptNum = toNum(sgpt);
      const sgotNum = toNum(sgot);

      resultsObj = {
        fbs: (fbs || '').trim(),
        rbs: (rbs || '').trim(),
        firstHour: (firstHour || '').trim(),
        secondHour: (secondHour || '').trim(),
        cholesterol: (cholesterol || '').trim(),
        tg: (tg || '').trim(),
        hdl: (hdl || '').trim(),
        ldl: (ldl || '').trim(),
        vldl: (vldl || '').trim(),
        uricAcid: (uricAcid || '').trim(),
        creatinine: (creatinine || '').trim(),
        bun: (bun || '').trim(),
        sgpt: (sgpt || '').trim(),
        sgpt_numeric: (sgptNum !== null ? sgptNum : undefined),
        sgpt_flag: (req.body.sgpt_flag || flagNum(sgptNum, 0, 32)),
        sgot: (sgot || '').trim(),
        sgot_numeric: (sgotNum !== null ? sgotNum : undefined),
        sgot_flag: (req.body.sgot_flag || flagNum(sgotNum, 0, 31)),
        sodium: (sodium || '').trim(),
        potassium: (potassium || '').trim(),
        chloride: (chloride || '').trim(),
        hba1c: (hba1c || '').trim(),
        alb: (alb || '').trim()
      };
    } else if (/\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/i.test(test.testType)) {
      const { pt_control, pt_patient, pt_activity, pt_inr, aptt_patient } = req.body;
      resultsObj = {
        prothrombin: {
          control: (pt_control || '').trim(),
          patient: (pt_patient || '').trim(),
          activity: (pt_activity || '').trim(),
          inr: (pt_inr || '').trim()
        },
        aptt: {
          patient: (aptt_patient || '').trim()
        }
      };
    } else if (/pregnan|pregnancy|pregnancy\s*test/i.test(test.testType)) {
      const { sample, result } = req.body;
      resultsObj = {
        sample: (sample || '').trim(),
        result: (result || '').trim()
      };
    }

    // allow storing performer name/license directly on results for printing
    resultsObj.performedByName = (mtName || '').trim();
    resultsObj.performedByLicense = (mtLicense || '').trim();
    resultsObj.requestedByName = (pathName || '').trim();
    resultsObj.requestedByLicense = (pathLicense || '').trim();
    // optional validator (second medtech) fields
    resultsObj.validatedByName = (req.body.validatedByName || '').trim();
    resultsObj.validatedByLicense = (req.body.validatedByLicense || '').trim();

    // debug logging removed

    // Determine completedAt from optional timeReleased input (use test date's date part)
    let completedAt = new Date();
    if (req.body.timeReleased && String(req.body.timeReleased).trim()) {
      try {
        const baseDate = test.testDate ? new Date(test.testDate) : new Date();
        const dateStr = baseDate.toISOString().slice(0,10); // YYYY-MM-DD
        const timeStr = String(req.body.timeReleased).trim(); // expected HH:MM
        const iso = dateStr + 'T' + (timeStr.length === 5 ? (timeStr + ':00') : timeStr);
        const parsed = new Date(iso);
        if (!isNaN(parsed.getTime())) completedAt = parsed;
      } catch (e) {
        // fallback to now
        completedAt = new Date();
      }
    }

    const updateData = {
      results: resultsObj,
      status: 'Completed',
      completedAt: completedAt,
      ...topUpdates
    };

    // set performedBy only if explicitly provided (performer management is handled separately)
    if (performedBy) {
      updateData.performedBy = performedBy;
    }

    await Test.findByIdAndUpdate(req.params.id, updateData, { new: true });

    req.flash('success_msg', 'Results saved successfully');
    res.redirect(`/tests/${req.params.id}`);
  } catch (err) {
    console.error('Save results error:', err);
    req.flash('error_msg', 'Error saving results');
    res.redirect(`/tests/${req.params.id}`);
  }
});

// GET /tests/:id/edit - Edit test form
router.get('/:id/edit', requireAuth, canAccessPatient, async (req, res) => {
  try {
  const test = await Test.findById(req.params.id);
  let patients = await Patient.find({});
  if (Array.isArray(patients)) patients.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || ''));

  // load templates for test types (file DB)
  const Template = require('../models/Template');
  let templates = await Template.find({ isActive: true });
  // append static result templates
  try {
    const resultsDir = path.join(__dirname, '..', 'views', 'reports', 'results');
    const allowed = [
      'fecalysis.ejs',
      'esr.ejs',
      'ct-bt.ejs',
      'urinalysis.ejs',
      'blood-typing.ejs',
      'pregnancy-test.ejs',
      'dengue-duo.ejs',
      'blood-chemistry.ejs',
      'blood-chemistry-sgpt-sgot.ejs',
      'blood-chemistry-bun-crea.ejs',
      'blood-chemistry-electrolytes.ejs',
      'blood-chemistry-hba1c.ejs',
      'blood-chemistry-albumin.ejs',
      'pt-aptt.ejs',
      'xray.ejs',
      'hematology.ejs',
      'serology.ejs',
      'ultrasound.ejs'
    ];
    const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
    const staticTemplates = files.map(f => {
      if (f === 'blood-chemistry-bun-crea.ejs') {
        return { name: 'Blood Chemistry - BUN/Crea', testType: 'BUN/Creat' };
      }
      if (f === 'blood-chemistry-sgpt-sgot.ejs') {
        return { name: 'Blood Chemistry - SGPT/SGOT', testType: 'Blood Chemistry - SGPT/SGOT' };
      }
      const name = f.replace('.ejs', '').replace(/-/g, ' ');
      return { name: name.charAt(0).toUpperCase() + name.slice(1), testType: name };
    });
    templates = templates.concat(staticTemplates);
  } catch (e) {
    // ignore
  }

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    // add patient object for edit view
    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const testForView = { ...test, patient: patient ? patient.toJSON() : null };

    res.render('tests/edit', {
      title: 'Edit Test',
      test: testForView,
      patients,
      templates
    });

  } catch (error) {
    console.error('Edit test error:', error);
    req.flash('error_msg', 'Error loading test');
    res.redirect('/tests');
  }
});

// PUT /tests/:id - Update test
// Note: status is now controlled by server logic (results -> Completed). Do not accept manual status overrides from the form.
router.put('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { patient, testType, testDate, results, notes, priority, performedBy } = req.body;

    // Validate required fields
    if (!patient || !testType || !testDate) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect(`/tests/${req.params.id}/edit`);
    }

    const updateData = {
      patient,
      testType,
      testDate,
      results,
      notes,
      priority
    };

    // Only allow certain roles to update performedBy
    if (req.session.user.role === 'Admin' || req.session.user.role === 'Doctor') {
      if (performedBy) {
        updateData.performedBy = performedBy;
      }
    }

    // If results were provided, mark status as Completed (server-controlled). For non-doctor/registration tests, set completedAt
    if (results && String(results).trim()) {
      updateData.status = 'Completed';
      if (testType !== "Doctor's Check-up" && testType !== 'Registration') {
        updateData.completedAt = updateData.completedAt || new Date();
      }
    }

    const test = await Test.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    req.flash('success_msg', `Test ${test.testId} updated successfully!`);
    res.redirect(`/tests/${req.params.id}`);

  } catch (error) {
    console.error('Update test error:', error);
    req.flash('error_msg', 'Error updating test');
    res.redirect(`/tests/${req.params.id}/edit`);
  }
});

// DELETE /tests/:id - Delete test
router.delete('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findByIdAndDelete(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    req.flash('success_msg', 'Test deleted successfully');
    res.redirect('/tests');

  } catch (error) {
    console.error('Delete test error:', error);
    req.flash('error_msg', 'Error deleting test');
    res.redirect('/tests');
  }
});

module.exports = router;