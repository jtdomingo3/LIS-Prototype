const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const sseEmitter = require('../lib/sseEmitter');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const os = require('os');

// multer for handling multipart/form-data file uploads in memory
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Analyzer mapping: analyzer ITEM codes -> form field names.  Note that
// some exports use UREA while others use BUN; we keep both so they don't
// overwrite each other.  Additional codes (SGOT, RBS, CALCIUM) are also
// supported so the capture is as complete as possible.
const ANALYZER_MAP = {
  CHOL: 'cholesterol',
  CREA: 'creatinine',
  FBS: 'fbs',
  RBS: 'rbs',           // random blood sugar
  HDLC: 'hdl',
  SGPT: 'sgpt',
  SGOT: 'sgot',         // added AST
  TG: 'tg',
  UA: 'uricAcid',
  UREA: 'urea',         // keep as separate from BUN
  BUN: 'bun',
  LDL: 'ldl',
  VLDL: 'vldl',
  HBA1C: 'hba1c',
  ALB: 'alb',
  CALCIUM: 'calcium',   // occasionally present
  SODIUM: 'sodium',
  POTASSIUM: 'potassium',
  CHLORIDE: 'chloride'
};

async function loadMdbReader() {
  try {
    let MDBReader;
    try {
      const mod = require('mdb-reader');
      MDBReader = mod && mod.default ? mod.default : mod;
    } catch (e) {
      const mod = await import('mdb-reader');
      MDBReader = mod && mod.default ? mod.default : mod;
    }
    return MDBReader;
  } catch (e) {
    throw new Error('mdb-reader not available: ' + e.message);
  }
}

// GET /tests/:id/analyzer/capture - read analyzer DB/export and return mapped results
router.get('/:id/analyzer/capture', requireAuth, async (req, res) => {
  console.log('[analyzer] capture handler invoked for', req.params.id);
  try {
    const test = await Test.findById(req.params.id);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    const patient = test.patient ? await Patient.findById(test.patient) : null;

    // Determine gezyne folder from app settings, persistent settings, env, or default
    let gezynePath = null;
    if (req.app && req.app.locals && req.app.locals.settings && req.app.locals.settings.gezynePath) {
      gezynePath = req.app.locals.settings.gezynePath;
    } else {
      // try to read from data.json directly in case settings haven't been loaded yet
      try {
        const data = global.db.read();
        if (data && data.settings && data.settings.gezynePath) {
          gezynePath = data.settings.gezynePath;
          req.app.locals.settings = req.app.locals.settings || {};
          req.app.locals.settings.gezynePath = gezynePath;
        }
      } catch (e) {}
      gezynePath = gezynePath || (process.env.GEZYNE_PATH || path.resolve(__dirname, '..', '..', 'new-gezyne'));
    }
    console.log('[analyzer] using gezynePath value', gezynePath);
    // resolve target mdb file flexibly
    let mdbFile = null;
    function findMDB(start) {
      try {
        const entries = fs.readdirSync(start, { withFileTypes: true });
        for (const e of entries) {
          if (e.isFile() && /Analyser\.MDB$/i.test(e.name)) {
            return path.join(start, e.name);
          }
          if (e.isDirectory()) {
            const found = findMDB(path.join(start, e.name));
            if (found) return found;
          }
        }
      } catch (e) { return null; }
      return null;
    }
    if (fs.existsSync(gezynePath)) {
      const stat = fs.statSync(gezynePath);
      if (stat.isFile() && /Analyser\.MDB$/i.test(gezynePath)) {
        mdbFile = gezynePath;
      } else if (stat.isDirectory()) {
        const attempt = path.join(gezynePath, 'DataBase', 'Analyser.MDB');
        if (fs.existsSync(attempt)) {
          mdbFile = attempt;
        } else {
          mdbFile = findMDB(gezynePath);
        }
      }
    }
    console.log('[analyzer] resolved mdb path', mdbFile);
    if (!mdbFile || !fs.existsSync(mdbFile)) {
      return res.json({ error: 'Analyzer MDB not found under ' + gezynePath });
    }

    const MDBReader = await loadMdbReader();
    console.log('[analyzer] checking existence before read:', fs.existsSync(mdbFile));
    try {
      const fd = fs.openSync(mdbFile, 'r');
      fs.closeSync(fd);
      console.log('[analyzer] open succeeded');
    } catch (err) {
      console.error('[analyzer] open error', err && err.message);
    }
    let buf;
    try {
      buf = fs.readFileSync(mdbFile);
      console.log('[analyzer] readFileSync succeeded, buffer length', buf && buf.length);
    } catch (err) {
      console.error('[analyzer] readFileSync failed', err && err.message);
      throw err;
    }
    let reader;
    try {
      reader = new MDBReader(buf);
    } catch (err) {
      console.error('[analyzer] MDBReader construction failed', err && err.message);
      throw err;
    }
    const tables = reader.getTableNames();

    // collect patient records matching name tokens
    const nameTokens = [];
    if (patient) {
      if (patient.firstName) nameTokens.push(String(patient.firstName).toLowerCase());
      if (patient.lastName) nameTokens.push(String(patient.lastName).toLowerCase());
      if (patient.fullName) nameTokens.push(String(patient.fullName).toLowerCase());
    }
    console.log('[analyzer] searching with nameTokens', nameTokens);
    console.log('[analyzer] patient object', patient ? {firstName: patient.firstName, lastName: patient.lastName, fullName: patient.fullName} : null);

    const patientTables = tables.filter(t => /^PATIENT/i.test(t));
    console.log('[analyzer] patient tables found:', patientTables.length, 'recent ones:', patientTables.filter(t => t.includes('2025') || t.includes('2026')));
    const matchingPatients = [];
    
    // Determine date range for filtering: use test date if available, otherwise use current date
    let targetDate = test && test.testDate ? new Date(test.testDate) : new Date();
    const dateBefore = new Date(targetDate);
    dateBefore.setDate(dateBefore.getDate() - 7); // 7 days before
    const dateAfter = new Date(targetDate);
    dateAfter.setDate(dateAfter.getDate() + 2); // 2 days after
    console.log('[analyzer] filtering by date range:', dateBefore.toISOString().slice(0, 10), 'to', dateAfter.toISOString().slice(0, 10));
    
    // Determine which months to check based on date range
    const monthsToCheck = new Set();
    const cursorDate = new Date(dateBefore);
    while (cursorDate <= dateAfter) {
      const ym = cursorDate.toISOString().slice(0, 7).replace('-', ''); // YYYYMM
      monthsToCheck.add(`PATIENTINFO${ym}`);
      cursorDate.setMonth(cursorDate.getMonth() + 1);
    }
    console.log('[analyzer] checking patient tables:', Array.from(monthsToCheck));
    
    for (const t of patientTables) {
      try {
        // Only process tables in our date range OR tables with name matches
        const isInDateRange = monthsToCheck.has(t);
        
        const table = reader.getTable(t);
        const rows = table.getData({ start: 0, length: 500 });
        let matchCount = 0;
        
        for (const r of rows) {
          let shouldInclude = false;
          
          // Check date range if this table is in the target months
          if (isInDateRange && r.COLLECT_DATE) {
            try {
              const collectDate = new Date(r.COLLECT_DATE);
              if (collectDate >= dateBefore && collectDate <= dateAfter) {
                shouldInclude = true;
              }
            } catch (e) {}
          }
          
          // Also check for name matches
          if (!shouldInclude && nameTokens.length > 0) {
            const joined = Object.values(r).join(' ').toLowerCase();
            shouldInclude = nameTokens.some(tok => joined.includes(tok));
          }
          
          if (shouldInclude) {
            matchingPatients.push({ table: t, row: r });
            matchCount++;
          }
        }
        
        if (matchCount > 0) {
          console.log(`[analyzer] ${t}: ${matchCount} matches${isInDateRange ? ' (date range)' : ' (name match)'} out of ${rows.length} rows`);
        }
      } catch (e) {
        console.log(`[analyzer] error reading table ${t}:`, e.message);
      }
    }
    console.log('[analyzer] matchingPatients count', matchingPatients.length);
    if (matchingPatients.length > 0) {
      console.log('[analyzer] sample matchingPatients (first 5):');
      matchingPatients.slice(0, 5).forEach((mp, idx) => {
        console.log(`  ${idx + 1}. ${mp.row.FIRST_NAME || '(no name)'} (ID: ${mp.row.ID}, Table: ${mp.table})`);
      });
    }
    // extract ID values from patient rows for filtering
    const patientIds = new Set();
    matchingPatients.forEach(mp => {
      if (mp.row && mp.row.ID) patientIds.add(String(mp.row.ID));
    });
    console.log('[analyzer] patientIds count:', patientIds.size);
    console.log('[analyzer] first 10 patientIds:', Array.from(patientIds).slice(0, 10));
    // Also get recent patient IDs for 202601 table specifically
    const recent202601 = matchingPatients.filter(mp => mp.table.includes('202601')).map(mp => mp.row.ID);
    if (recent202601.length > 0) {
      console.log('[analyzer] 202601 patient IDs:', recent202601);
    }

    // Collect recent CHECK_RESULT* rows
    const checkTables = tables.filter(t => /^CHECK_RESULT/i.test(t));
    let checkRows = [];
    for (const t of checkTables) {
      try {
        const table = reader.getTable(t);
        const rows = table.getData({ start: 0, length: 1000 });
        for (const r of rows) checkRows.push(Object.assign({ __table: t }, r));
      } catch (e) {}
    }

    console.log('[analyzer] raw checkRows count', checkRows.length);
    // try narrowing by patientIds if we were able to determine any (from
    // PATIENT* tables). the value used in CHECK_RESULT rows appears under
    // different keys depending on the analyzer export; r.PATIENTID is the one
    // we observed, but some rows may also provide r.ID which is ambiguous.
    // we don’t rely on name filtering anymore as those fields typically don’t
    // contain anything useful.
    let filteredRows = checkRows;
    if (patientIds.size > 0) {
      const beforeCount = filteredRows.length;
      filteredRows = filteredRows.filter(r => {
        const pid = r.PATIENTID || r['PATIENT_ID'] || r.ID;
        return patientIds.has(String(pid));
      });
      console.log('[analyzer] filtered checkRows by patientIds, new count', filteredRows.length, 'from', beforeCount);
    }
    // no automatic date filtering; user will choose the run manually in the
    // popup.  keeping the code here as comment in case automatic mode is ever
    // desired again.
    // if (test && test.testDate) {
    //   const want = new Date(test.testDate).toISOString().slice(0,10);
    //   const before = filteredRows.length;
    //   filteredRows = filteredRows.filter(r => {
    //     const d = r.DATE || r.Date || r.date;
    //     if (!d) return false;
    //     try { return new Date(d).toISOString().slice(0,10) === want; } catch(e) { return false; }
    //   });
    //   console.log('[analyzer] filtered by testDate', want, 'new count', filteredRows.length, 'from', before);
    // }

    // Build mapping of latest item -> result (from filtered rows)
    const latestByItem = {};
    for (const r of filteredRows) {
      try {
        // normalize code: remove spaces, dashes, other punctuation so e.g. "LDL-C" or
        // "VLDL/C" become matchable to our mapping keys.
        let code = (r.ITEM || r.Item || r.item || '').toString().toUpperCase();
        code = code.replace(/[^A-Z0-9]/g, '');
        const val = (r.RESULT || r.Result || r.result || null);
        if (!code) continue;
        if (!latestByItem[code]) latestByItem[code] = { value: val, row: r };
      } catch (e) {}
    }

    // Map to form names
    const mapped = {};
    for (const code of Object.keys(latestByItem)) {
      const field = ANALYZER_MAP[code];
      if (field) mapped[field] = latestByItem[code].value;
    }
    // if we only received urea but not bun, derive BUN using standard conversion
    let derived = [];
    if (mapped.urea && !mapped.bun) {
      const u = parseFloat(mapped.urea);
      if (!isNaN(u)) {
        mapped.bun = String(Math.round(u * 0.467 * 100) / 100);
        derived.push('BUN');
      }
    }
    // always compute LDL and VLDL from lipid profile if we have TG (and HDL/Chol for LDL)
    if (mapped.tg) {
      const tg = parseFloat(mapped.tg);
      if (!isNaN(tg)) {
        const vcalc = Math.round((tg / 5.0) * 100) / 100;
        if ((!mapped.vldl || mapped.vldl === '') || String(mapped.vldl) !== String(vcalc)) {
          mapped.vldl = String(vcalc);
          derived.push('VLDL');
        }
      }
      if (mapped.cholesterol && mapped.hdl) {
        const tc = parseFloat(mapped.cholesterol);
        const hdl = parseFloat(mapped.hdl);
        if (!isNaN(tc) && !isNaN(hdl)) {
          const lcalc = Math.round((tc - hdl - (tg / 5.0)) * 100) / 100;
          if (( !mapped.ldl || mapped.ldl === '' ) || String(mapped.ldl) !== String(lcalc)) {
            mapped.ldl = String(lcalc);
            derived.push('LDL');
          }
        }
      }
    }
    if (derived.length) {
      console.log('[analyzer] derived values for', derived);
    }

    // diagnostics: which codes we actually saw vs mapping keys
    const seenCodes = Object.keys(latestByItem);
    const allMapKeys = Object.keys(ANALYZER_MAP);
    const missingCodes = allMapKeys.filter(k => !seenCodes.includes(k));
    console.log('[analyzer] seen codes', seenCodes.sort());
    console.log('[analyzer] missing mapped codes (not in export)', missingCodes.sort());

    // send only whatever we filtered; do not fall back to full data (it was
    // confusing when the date wasn’t found in the MDB). log when empty so the
    // caller can diagnose missing export.
    let rowsToSend = filteredRows;
    console.log('[analyzer] returning rows count', rowsToSend.length);
    if (rowsToSend.length === 0) {
      console.log('[analyzer] no rows matched patient/date filter');
    }
    console.log('[analyzer] sample filtered row keys', Object.keys(filteredRows[0] || {}));
    if (filteredRows.length > 0) {
      console.log('[analyzer] sample filtered row object', filteredRows[0]);
      // list all unique ITEM codes present
      const codes = new Set(filteredRows.map(r => (r.ITEM||r.Item||r.item||'').toString().toUpperCase()));
      console.log('[analyzer] unique ITEM codes', Array.from(codes).sort());
    }
    // map
    rowsToSend = rowsToSend.map(r => {
      // date may appear under a few different names in MDB export
      let dt = r.CHECK_DATE || r.CHECKDATE || r.CHECK_DATE || r.DATE || r.Date || r.date;
      // some monthly tables omit a separate date column; the ID often encodes YYYYMMDD
      if (!dt && r.ID) {
        const idstr = String(r.ID);
        const m = idstr.match(/^(\d{4})(\d{2})(\d{2})/);
        if (m) {
          dt = `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
        }
      }
      if (dt && dt instanceof Date) dt = dt.toISOString();
      // include patient ID so client can correlate with patient names
      const pid = r.PATIENTID || r['PATIENT_ID'] || r.ID;
      return {
        DATE: dt || null,
        ITEM: r.ITEM || r.Item || r.item,
        RESULT: r.RESULT || r.Result || r.result,
        UNIT: r.UNIT || r.Unit || r.unit,
        PATIENT_ID: pid ? String(pid) : null
      };
    });
    
    // Only send patients that are actually referenced in the rows we're sending
    const rowPatientIds = new Set(rowsToSend.map(r => r.PATIENT_ID).filter(Boolean));
    const relevantPatients = matchingPatients.filter(mp => 
      mp.row && mp.row.ID && rowPatientIds.has(String(mp.row.ID))
    );
    console.log('[analyzer] sending patients count:', relevantPatients.length, 'of', matchingPatients.length, 'matched');
    if (relevantPatients.length > 0) {
      console.log('[analyzer] sending patient sample:', relevantPatients[0]);
    }
    
    res.json({ patients: relevantPatients, checkCount: checkRows.length, mapped, rows: rowsToSend });
  } catch (err) {
    console.error('Analyzer capture error', err);
    res.json({ error: String(err) });
  }
});


// GET /tests - List all tests
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search || '';
    const statusFilter = req.query.status || '';
    const typeFilter = req.query.testType || '';
    const dateFilter = req.query.date || '';

  // Get all tests and patients
  let allTests = await Test.find({});
  const allPatients = await Patient.find({});

    // Available test types for filter dropdown
    // Collapse blood-chemistry variants (including BUN/Creat and common synonyms)
    const rawTypes = Array.isArray(allTests) ? allTests.map(t => (t.testType || '').toString()).filter(Boolean) : [];
    let sawBloodChem = false;
    const mapped = rawTypes.map(s => {
      const low = String(s || '').toLowerCase();
      if (/^blood[\s-]*chemistry/.test(low) || low.indexOf('blood-chemistry') !== -1 || /(bun\b|creat(inine)?|creat\/?creat|sgpt|sgot|lipid|hba1c|albumin|blood\s*urea|blood\s*sugar)/.test(low)) {
        sawBloodChem = true;
        return null; // collapse into single Blood Chemistry entry
      }
      return String(s).trim();
    }).filter(Boolean);
    if (sawBloodChem) mapped.push('Blood Chemistry');
    const availableTestTypes = Array.from(new Set(mapped)).filter(Boolean).sort();

    // Apply search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      allTests = allTests.filter(test => {
        const patient = allPatients.find(p => p.id === test.patient);
        const patientName = patient ? `${patient.firstName} ${patient.lastName}`.toLowerCase() : '';
        return (test.testId || '').toString().toLowerCase().includes(searchLower) ||
               (test.testType || '').toString().toLowerCase().includes(searchLower) ||
               patientName.includes(searchLower);
      });
    }

    // Ensure For Send Out is added even when no selectedTests were provided
    try {
      const forSendOutAlways = req.body.forSendOut === '1' || req.body.forSendOut === 'on' || req.body.forSendOut === 'true';
      if (forSendOutAlways) {
        const exists = requestedTestsDetailed.some(r => String(r.label || r.key || '').toLowerCase() === 'for send out');
        if (!exists) {
          const amtRaw = req.body['amount_sendout'];
          const amt = amtRaw ? parseFloat(String(amtRaw).replace(/,/g,'')) : 0;
          const remark = req.body['remark_sendout'] || '';
          // normalize to internal 'Sendout' area
          requestedTestsDetailed.push({ key: 'For Send Out', label: 'For Send Out', amount: isNaN(amt) ? 0 : amt, lab: 'external', area: 'Sendout', remarks: remark });
        }
      }
    } catch (e) {}

    // Apply status filter
    if (statusFilter) {
      const sf = statusFilter.toString().toLowerCase();
      allTests = allTests.filter(t => ((t.status || '').toString().toLowerCase() === sf));
    }

    // Apply testType filter (substring match) with special handling for Blood Chemistry
    if (typeFilter) {
      const tf = typeFilter.toString().toLowerCase().trim();
      if (/^blood\s*chemistry$/.test(tf)) {
        allTests = allTests.filter(t => {
          const tid = String(t.testId || '').toUpperCase();
          const candidate = String(t.testType || t.template || '').toLowerCase().trim();
          if (tid && tid.startsWith('BC')) return true;
          if (candidate.indexOf('blood') !== -1 && candidate.indexOf('chemistry') !== -1) return true;
          if (/(bun\b|creat(inine)?|creat\/?creat|sgpt|sgot|lipid|hba1c|albumin|blood\s*urea|blood\s*sugar)/.test(candidate)) return true;
          return false;
        });
      } else {
        const tfEq = tf;
        allTests = allTests.filter(t => (t.testType || '').toString().toLowerCase().includes(tfEq));
      }
    }

    // Date filter (match testDate or createdAt YYYY-MM-DD)
    if (dateFilter) {
      const df = String(dateFilter);
      allTests = allTests.filter(t => {
        const dt = t.testDate || t.createdAt || null;
        try { return dt ? new Date(dt).toISOString().slice(0,10) === df : false; } catch (e) { return false; }
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
      searchQuery,
      statusFilter,
      typeFilter,
      dateFilter,
      availableTestTypes
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
    const staticTemplates = files.map(f => {
      if (f === 'drugtest.ejs') return { name: 'Drug Test', testType: 'drugtest' };
      if (f === 'blood-chemistry-bun-crea.ejs') {
        return { name: 'Blood Chemistry - BUN/Crea', testType: 'BUN/Creat' };
      }
      if (f === 'blood-chemistry-sgpt-sgot.ejs') {
        return { name: 'Blood Chemistry - SGPT/SGOT', testType: 'Blood Chemistry - SGPT/SGOT' };
      }
      if (f === 'ultrasound-abd-kubp-hbt.ejs') {
        return { name: 'Ultrasound - ABD / KUBP / HBT', testType: 'ultrasound-abd-kubp-hbt' };
      }
      if (f === 'echocardiography-2d.ejs') {
        return { name: 'Echocardiography - 2D', testType: 'echocardiography-2d' };
      }
      if (f === 'ultrasound-transvaginal.ejs') {
        return { name: 'Ultrasound - Transvaginal', testType: 'ultrasound-transvaginal' };
      }
      if (f === 'ultrasound-biophysical.ejs') {
        return { name: 'Ultrasound - Biophysical', testType: 'ultrasound-biophysical' };
      }
      if (f === 'ultrasound-1st-trimester-obstetrics.ejs') {
        return { name: 'Ultrasound - Trimester Obstetrics', testType: 'ultrasound-trimester-obstetrics' };
      }
      if (f === 'ultrasound-pelvic.ejs') {
        return { name: 'Ultrasound - Pelvic Ultrasound', testType: 'ultrasound-pelvic' };
      }
      if (f === 'ultrasound-pelvic-biometry.ejs') {
        return { name: 'Ultrasound - Pelvic Biometry', testType: 'ultrasound-pelvic-biometry' };
      }
      const name = f.replace('.ejs', '').replace(/-/g, ' ');
      return { name: name.charAt(0).toUpperCase() + name.slice(1), testType: f.replace('.ejs','') };
    });
    templates = templates.concat(staticTemplates);
    // Ensure trimester ultrasound static template is available in selection
    try {
      const exists = templates.some(t => (t.testType || '').toLowerCase() === 'ultrasound-trimester-obstetrics');
      if (!exists) {
        templates.push({ name: 'Ultrasound - Trimester Obstetrics', testType: 'ultrasound-trimester-obstetrics' });
      }
    } catch (e) {}
  } catch (e) {
    // ignore static templates on error
  }

    const test = {};
    test.patient = req.query.patient || '';
    // If opening the new test form from a patient link, enable print-after-assign by default
    if (req.query && req.query.patient) {
      test.printAfterAssign = '1';
    }
    res.render('tests/new', {
      title: 'Create New Test',
      test,
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
    // normalize selected tests (from checkbox grid)
    const selectedTests = Array.isArray(req.body.selectedTests) ? req.body.selectedTests : (req.body.selectedTests ? [req.body.selectedTests] : []);

    // Build detailed requestedTests if selectedTests provided
    let requestedTestsDetailed = [];
    let awaitingOnly = false;
    if (selectedTests.length) {
      const mapTestToArea = (testLabel) => {
        const s = String(testLabel || '').toLowerCase();
        if (!s) return null;
        if (s.includes('fecal') || s.includes('pregnancy') || s.includes('urinalysis')) return null;
        if (s.includes('echocardiography') || s.includes('2d echo') || s.includes('2d')) return '2D Echo';
        if (s.includes('drugtest') || s.includes('drug test')) return 'Drug Test';
        if (s.includes('ecg')) return 'ECG';
        if (s.includes('ultrasound')) return 'Ultrasound';
        if (s.includes('xray') || s.includes('x-ray')) return 'X-ray';
        if (s.includes('blood') || s.includes('chemistry') || s.includes('hematology') || s.includes('serology') || s.includes('pt') || s.includes('aptt')) return 'Extraction Area';
        return null;
      };
      const mappedAreas = new Set();
      for (const t of selectedTests) {
        const raw = String(t || '');
        const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
        const amtRaw = req.body['amount_' + slug];
        const amt = amtRaw ? parseFloat(String(amtRaw).replace(/,/g,'')) : 0;
        const remark = req.body['remark_' + slug] || '';
        const area = mapTestToArea(raw);
        if (area) mappedAreas.add(area);
        requestedTestsDetailed.push({ key: raw, label: raw, amount: isNaN(amt) ? 0 : amt, lab: (area === 'X-ray') ? 'xray' : 'clinical', area: area || null, remarks: remark });
      }
      awaitingOnly = selectedTests.length > 0 && mappedAreas.size === 0;
      // Add For Send Out if present
      const forSendOut = req.body.forSendOut === '1' || req.body.forSendOut === 'on' || req.body.forSendOut === 'true';
      if (forSendOut) {
        const amtRaw = req.body['amount_sendout'];
        const amt = amtRaw ? parseFloat(String(amtRaw).replace(/,/g,'')) : 0;
        const remark = req.body['remark_sendout'] || '';
        // use internal normalized area name 'Sendout' (do not expose as separate kiosk tile)
        requestedTestsDetailed.push({ key: 'For Send Out', label: 'For Send Out', amount: isNaN(amt) ? 0 : amt, lab: 'external', area: 'Sendout', remarks: remark });
      }
    }

    // Normalize requiredAreas from form (may contain doctor selections)
    const requiredAreas = Array.isArray(req.body.requiredAreas) ? req.body.requiredAreas : (req.body.requiredAreas ? [req.body.requiredAreas] : []);

    // Also include any selected Doctor's Check-up requiredAreas as requested tests so they appear on receipts
    try {
      for (const ra of requiredAreas) {
        if (!ra) continue;
        const rstr = String(ra || '').trim();
        if (/doctor/i.test(rstr) && /check/i.test(rstr)) {
          // Normalize label to shorter form to keep it on one line when printed
          const normalized = rstr.replace(/Doctor'?s\s*Check-?up/i, 'Doctor Check-up');
          // Avoid duplicating if already present
          const exists = requestedTestsDetailed.some(x => String(x.label || x.key || '').toLowerCase() === normalized.toLowerCase());
          if (!exists) requestedTestsDetailed.push({ key: normalized, label: normalized, amount: 0, lab: 'clinical', area: 'Doctor', remarks: '' });
        }
      }
    } catch (e) {}

    // Validate required fields: require patient and either a single testType, selectedTests,
    // or a doctor/sendout selection (these are allowed to create tests without a testType)
    const hasSelected = Array.isArray(selectedTests) && selectedTests.length > 0;
    const doctorSelected = requiredAreas.some(r => r && /doctor/i.test(String(r)));
    const forSendOutFlag = (req.body.forSendOut === '1' || req.body.forSendOut === 'on' || req.body.forSendOut === 'true') || requestedTestsDetailed.some(r => String(r.area || '').toLowerCase() === 'sendout');
    if (!patient || (!testType && !hasSelected && !doctorSelected && !forSendOutFlag)) {
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

    // Helper: determine prefix from label
    const getPrefixForLabel = (label) => {
      const s = String(label || '').toLowerCase();
      if (/send\s*out|for\s*send|sendout|send-out/.test(s)) return 'SO';
      if (/doctor|check-?up|checkup/.test(s)) return 'DC';
      if (/drug/.test(s)) return 'DT';
      if (/\becg\b|electrocardio|electrocardiogram/.test(s)) return 'ECG';
      if (/x[-\s]?ray|radiograph/.test(s)) return 'XR';
      if (/ultrasound|ultra[-\s]?sound/.test(s)) return 'US';
      if (/echo|echocardiograph|echocardiography|2d\s*echo/.test(s)) return 'ECHO';
      if (/serol|serology/.test(s)) return 'SR';
      if (/fecal|fecalysis|stool/.test(s)) return 'FA';
      if (/urinal|urine|urinalysis/.test(s)) return 'UA';
      if (/pregnan|pregnancy/.test(s)) return 'PT';
      // Prothrombin / APTT (coagulation) tests should use their own APT prefix
      if (/\b(?:pt|prothrombin|pt-aptt|ptaptt|aptt)\b/.test(s)) return 'APT';
      // Specific clinical tests -> unique prefixes
      if (/blood\s*typing|blood-typing|bloodtyping/.test(s)) return 'BT';
      if (/hematology|hemato|cbc/.test(s)) return 'HM';
      if (/thyroid|thyroid\s*panel/.test(s)) return 'TH';
      if (/\besr\b|erythrocyte/.test(s)) return 'ESR';
      if (/dengue/.test(s)) return 'DG';
      if (/(ct[-_\s]*&?\s*bt|ct[-_\s]*bt|ct[-_\s]*and[-_\s]*bt|bleeding|clotting)/.test(s)) return 'CTBT';
      // Blood chemistry group (exclude PT/APTT which are coagulation tests)
      if (/(?:blood|chemistry|bun|crea|sgpt|sgot|lipid|hba1c|albumin|blood\s*sugar)/.test(s)) return 'BC';
      return 'T';
    };

    // Helper: get next counter and persist
    const getNextTestId = (prefix) => {
      try {
        const counters = global.db.getCounters() || {};
        const next = (counters[prefix] || 0) + 1;
        counters[prefix] = next;
        global.db.saveCounters(counters);
        // increase width to accommodate more test ids (add 3 digits)
        return prefix + String(next).padStart(7, '0');
      } catch (e) {
        // fallback to timestamp-based id
        return prefix + Date.now();
      }
    };

    const createdTests = [];

    // Helper to detect doctor-only requested item

    // Helper to detect doctor-only requested item
    const isDoctorRequest = (rt) => {
      try {
        const lab = String(rt.lab || '').toLowerCase();
        const label = String(rt.label || rt.key || '').toLowerCase();
        if (lab === 'doctor' || label.includes('doctor')) return true;
      } catch (e) {}
      return false;
    };

    // Doctor area names configurable via environment
    const DOCTOR_1_NAME = process.env.DOCTOR_1_NAME || 'Dr. Lorenzo';
    const DOCTOR_2_NAME = process.env.DOCTOR_2_NAME || 'Dr. Arcilla';
    function doctorArea(name) { return `Doctor's Check-up - ${name}`; }
    // Helper to pick doctor area string from requiredAreas (prefer DOCTOR_1 then DOCTOR_2)
    const pickDoctorArea = () => {
      try {
        for (const r of requiredAreas) {
          if (!r) continue;
          const s = String(r).toLowerCase();
          if (s.includes((DOCTOR_1_NAME || '').toLowerCase()) || s.includes('lorenzo')) return doctorArea(DOCTOR_1_NAME);
          if (s.includes((DOCTOR_2_NAME || '').toLowerCase()) || s.includes('arcilla')) return doctorArea(DOCTOR_2_NAME);
        }
      } catch (e) {}
      return null;
    };

    // Helper to lookup doctor user by last name
    const findDoctorUser = async (areaStr) => {
      try {
        if (!areaStr) return null;
        if (areaStr.toLowerCase().includes('lorenzo')) {
          const docs = await User.find({ role: 'Doctor' });
          return docs.find(d => String(d.name || '').toLowerCase().includes('lorenzo')) || null;
        }
        if (areaStr.toLowerCase().includes('arcilla')) {
          const docs = await User.find({ role: 'Doctor' });
          return docs.find(d => String(d.name || '').toLowerCase().includes('arcilla')) || null;
        }
      } catch (e) { console.warn('findDoctorUser failed', e); }
      return null;
    };

    // Group blood chemistry variants into single 'Blood Chemistry' test when multiple selected
    if (requestedTestsDetailed && requestedTestsDetailed.length) {
      const copyRequested = requestedTestsDetailed.slice();
      // Treat specific requested items as Blood Chemistry only when they match chemistry-related keywords
      // but explicitly exclude 'typing' (e.g., 'Blood Typing') which is a separate serology/hematology test.
      const isBloodChem = r => {
        const s = String(r.key || r.label || '').toLowerCase();
        if (!s) return false;
        if (s.includes('typing')) return false; // exclude Blood Typing
        return /chemistry|bun|crea|sgpt|sgot|lipid|hba1c|albumin|blood\s*sugar|blood\s*chemistry/.test(s);
      };
      const bloodItems = copyRequested.filter(isBloodChem);
      if (bloodItems.length > 1) {
        const prefix = getPrefixForLabel('Blood Chemistry');
        const tid = getNextTestId(prefix);
        const payload = {
          testId: tid,
          patient,
          testType: 'Blood Chemistry',
          testDate: (new Date()).toISOString(),
          status: 'Payment Area',
          priority: (priority && String(priority).trim()) ? priority : 'Normal',
          requestedBy: req.session.user.id,
          requestedTests: bloodItems,
          awaitingOnly: awaitingOnly
        };
        if (req.body && req.body.client_id) payload.client_id = req.body.client_id;
        const t = new Test(payload);
        await t.save();
        createdTests.push(t);
        // remove blood items from further processing
        for (const b of bloodItems) {
          const idx = copyRequested.findIndex(x => x.key === b.key && x.label === b.label);
          if (idx >= 0) copyRequested.splice(idx, 1);
        }
      }

      // Create individual tests for remaining requested items
      for (const rt of copyRequested) {
        const prefix = getPrefixForLabel(rt.label || rt.key || 'T');
        const tid = getNextTestId(prefix);
        const payload = {
          testId: tid,
          patient,
          testType: rt.label || rt.key || 'Test',
          testDate: (new Date()).toISOString(),
          status: 'Payment Area',
          priority: (priority && String(priority).trim()) ? priority : 'Normal',
          requestedBy: req.session.user.id,
          requestedTests: [rt],
          awaitingOnly: awaitingOnly
        };
        // If this single requested item is a doctor-only request and no other non-doctor items
        // are present for this patient creation flow, queue directly to doctor's checkup.
        try {
          const doctorArea = pickDoctorArea();
          if (isDoctorRequest(rt) && (!copyRequested.some(x => !isDoctorRequest(x)))) {
            if (doctorArea) {
              payload.status = doctorArea;
              const docUser = await findDoctorUser(doctorArea);
              if (docUser) { payload.assignedDoctorId = docUser.id; payload.assignedDoctorName = docUser.name; }
            } else {
              // if no explicit doctor selected, use the configured first doctor area
              payload.status = doctorArea(DOCTOR_1_NAME);
              const docUser = await findDoctorUser(doctorArea(DOCTOR_1_NAME));
              if (docUser) { payload.assignedDoctorId = docUser.id; payload.assignedDoctorName = docUser.name; }
            }
          }
        } catch (e) { console.warn('Doctor assignment logic failed', e); }
        const t = new Test(payload);
        await t.save();
        createdTests.push(t);
      }
    } else {
      // Single testType path
      // Detect sendout single-request early: use SO prefix and queue to Sendout immediately
      const forSendOutSingle = req.body && (req.body.forSendOut === '1' || req.body.forSendOut === 'on' || req.body.forSendOut === 'true');
      let prefix = getPrefixForLabel(testType || 'T');
      if (forSendOutSingle) prefix = 'SO';
      const tid = getNextTestId(prefix);
      const payload = {
        testId: tid,
        patient,
        testType: forSendOutSingle ? 'For Send Out' : (testType || 'Registration'),
        testDate: (new Date()).toISOString(),
        // keep initial status as 'Payment Area' so reception/payment can process it
        status: 'Payment Area',
        results,
        notes,
        priority: (priority && String(priority).trim()) ? priority : 'Normal',
        requestedBy: req.session.user.id
      };
      // If the form requested a Send Out but no detailed requestedTests were provided
      // (single testType path), attach a normalized For Send Out requested item so
      // the Payment Area processing can route it to the internal 'Sendout' area.
      // Add defensive logging to help debug missing form fields in production.
      try {
        console.log('DEBUG POST /tests - single-path payload check, forSendOut raw=', req.body && req.body.forSendOut);
      } catch (e) {}
      if (!requestedTestsDetailed.length && forSendOutSingle) {
        const amtRaw = req.body['amount_sendout'];
        const amt = amtRaw ? parseFloat(String(amtRaw).replace(/,/g,'')) : 0;
        const remark = req.body['remark_sendout'] || '';
        payload.requestedTests = [{ key: 'For Send Out', label: 'For Send Out', amount: isNaN(amt) ? 0 : amt, lab: 'external', area: 'Sendout', remarks: remark }];
        payload.awaitingOnly = awaitingOnly;
        console.log('DEBUG POST /tests - attached single-path For Send Out requestedTests', payload.requestedTests);
      } else if (requestedTestsDetailed.length) {
        payload.requestedTests = requestedTestsDetailed;
        payload.awaitingOnly = awaitingOnly;
        console.log('DEBUG POST /tests - attached requestedTestsDetailed length=', requestedTestsDetailed.length);
      } else {
        // ensure requestedTests exists as empty array for clarity in DB
        payload.requestedTests = payload.requestedTests || [];
      }
      // If this is a doctor check-up (and there are no X-ray/clinical/lab items), queue directly
      try {
        const allDoctorOnly = requestedTestsDetailed.length && requestedTestsDetailed.every(isDoctorRequest);
        const doctorArea = pickDoctorArea();
        if ((String(testType || '').toLowerCase().includes('doctor') || allDoctorOnly) && allDoctorOnly) {
          if (doctorArea) {
            payload.status = doctorArea;
            const docUser = await findDoctorUser(doctorArea);
            if (docUser) { payload.assignedDoctorId = docUser.id; payload.assignedDoctorName = docUser.name; }
          } else {
            payload.status = doctorArea(DOCTOR_1_NAME);
            const docUser = await findDoctorUser(doctorArea(DOCTOR_1_NAME));
            if (docUser) { payload.assignedDoctorId = docUser.id; payload.assignedDoctorName = docUser.name; }
          }
        }
      } catch (e) { console.warn('Doctor-only single test logic failed', e); }
      const t = new Test(payload);
      await t.save();
      createdTests.push(t);
    }

    // Emit SSE update so reception/kiosk updates
    try {
      sseEmitter.emit('update', { action: 'assigned', patientId: patient, tests: createdTests.map(ct => ({ testId: ct.testId, id: ct.id, testType: ct.testType })), time: (new Date()).toISOString() });
    } catch (e) { console.warn('SSE emit failed', e); }

    // If this request is from the standalone sync engine, return JSON with created ids + client_id
    if (req.headers['x-lis-sync-email'] || req.headers['x-lis-sync-hash']) {
      const created = createdTests.map(ct => ({ id: ct.id, testId: ct.testId || null, client_id: ct.client_id || null }));
      return res.json(created);
    }

    // If UI requested printing after assign, invoke print helper once for the patient with all created tests
    try {
      const doctorSelected = requiredAreas.some(r => String(r || '').toLowerCase().includes('doctor') && String(r || '').toLowerCase().includes('check'));
      let doPrint = req.body && (req.body.printAfterAssign === '1' || req.body.printAfterAssign === 'on' || req.body.printAfterAssign === 'true');
      if (doctorSelected) doPrint = true;
      if (doPrint) {
        const printHelper = require('../lib/printHelper');
        const patientObj = await Patient.findById(patient);
        // Fire-and-forget printing so HTTP response/redirect is not blocked by printer transport
        printHelper.printPatientReceipt(patientObj, createdTests)
          .then(result => {
            if (result && result.success) console.log('Background print succeeded for patient', patient);
            else console.warn('Background print failed for patient', patient, result && result.error);
          })
          .catch(err => console.warn('Background print error', err));
      }
    } catch (e) {
      console.error('Print after assign error:', e);
      req.flash('warning_msg', `Tests created but printing error occurred`);
    }

    req.flash('success_msg', `Tests created successfully!`);

    // Determine where to redirect after creating/assigning tests.
    // Priority: explicit hidden `returnTo` form field -> query param -> Referer -> fallback '/tests'
    let returnTo = (req.body && req.body.returnTo) || req.query.returnTo || req.get('Referer') || '/tests';
    try {
      // If it's an absolute URL, only allow same-host paths to avoid open-redirects
      if (/^https?:\/\//i.test(returnTo)) {
        const u = new URL(returnTo);
        if (u.host === req.get('host')) {
          returnTo = u.pathname + (u.search || '');
        } else {
          returnTo = '/tests';
        }
      } else if (!returnTo.startsWith('/')) {
        // try to resolve relative URLs against current host
        try {
          const u = new URL(returnTo, `${req.protocol}://${req.get('host')}`);
          returnTo = u.pathname + (u.search || '');
        } catch (e) {
          returnTo = '/tests';
        }
      }
    } catch (e) {
      returnTo = '/tests';
    }

    return res.redirect(returnTo);

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
      blood_chem: /(blood\s*chemistry|blood-chemistry|blood\s*chem|(?:bun|creat|creatinine))/i.test(tt),
        echocardiography: /(echo|echocardiograph|echocardiography|2d\s*echo|2decho)/i.test(tt),
      ultrasound_abd: /(ultrasound[-\s]?abd[-\s]?kubp[-\s]?hbt)/i.test(tt),
      ultrasound_transvaginal: /(ultrasound[-\s]?transvaginal|transvaginal)/i.test(tt),
      ultrasound_biophysical: /(ultrasound[-\s]?biophysical|biophysical)/i.test(tt),
      ultrasound_pelvic: /(static:)?(ultrasound[-_\s]?pelvic(?:[-_\s]?biometry)?(\.ejs)?|pelvic(?:[-_\s]?biometry)?)/i.test(tt),
      ultrasound_1st_trimester: /(?:1st|first|2nd|second|3rd|third|trimester|trimester[-_\s]?obstetrics|ultrasound[-_\s]?trimester)/i.test(tt),
      esr: /(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(tt)
      ,
      drugtest: /(drug\s*test|drugtest)/i.test(tt),
      ct_bt: /(bleeding|clotting|ct[-_\s]*&?\s*bt|ct[-_\s]*and[-_\s]*bt|ct[-_\s]*bt)/i.test(tt)
      ,
      xray: /(x-?ray|xray|radiograph)/i.test(tt),
      ecg: /(ecg|electrocardio|electrocardiogram)/i.test(tt)
      ,
      echocardiography: /(echo|echocardiograph|echocardiography|2d\s*echo|2decho)/i.test(tt)
    };
    // Fallback: if the POST body contains gestational/CRL fields, treat as ultrasound (pelvic/transvaginal)
    try {
      const hasGest = req && req.body && (req.body.gestational_sac_length || req.body.gestational_sac_length_A || req.body.gestational_sac_length_B);
      const hasCrl = req && req.body && (req.body.crl_length || req.body.crl_length_A || req.body.crl_length_B);
      const hasBiophysical = req && req.body && (req.body.bpd_size || req.body.hc_size || req.body.ac_size || req.body.fl_size || req.body['biometry_size[]'] || req.body.biometry_size);
      if (hasGest || hasCrl) {
        checks.ultrasound_transvaginal = true;
        checks.ultrasound_pelvic = true;
      } else if (hasBiophysical) {
        checks.ultrasound_biophysical = true;
      }
    } catch (e) {}
    console.log(`DEBUG GET /tests/${req.params.id}/results - testType='${tt}', checks=`, checks);
    if (!tt || !Object.values(checks).some(Boolean)) {
      console.error(`UNSUPPORTED results entry request for test ${req.params.id} - testType='${tt}'`, { checks });
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
    if (/(ecg|electrocardio|electrocardiogram)/i.test(test.testType)) view = 'tests/results_entry_ecg';
    if (/(fecal\s*occult|fecal-occult|fecaloccult)/i.test(test.testType)) view = 'tests/results_entry_fecal_occult_blood';
    if (/(bleeding|clotting|ct[-_\s]*&?\s*bt|ct[-_\s]*and[-_\s]*bt|ct[-_\s]*bt)/i.test(test.testType)) view = 'tests/results_entry_ct_bt';
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
    if (/(ultrasound[-\s]?transvaginal|transvaginal)/i.test(test.testType)) view = 'tests/results_entry_ultrasound_transvaginal';
    if (/(ultrasound[-\s]?biophysical|biophysical)/i.test(test.testType)) view = 'tests/results_entry_ultrasound_biophysical';
    if (/(?:1st|first|2nd|second|3rd|third|trimester|ultrasound[-_\s]?trimester)/i.test(test.testType)) view = 'tests/results_entry_ultrasound_1st_trimester_obstetrics';
    if (/(ultrasound[-\s]?abd[-\s]?kubp[-\s]?hbt)/i.test(test.testType)) view = 'tests/results_entry_ultrasound_abd_kubp_hbt';
    if (/(echo|echocardiograph|echocardiography|2d\s*echo|2decho)/i.test(test.testType)) view = 'tests/results_entry_echocardiography_2d';
    if (/(static:)?(ultrasound[-_\s]?pelvic[-_\s]?biometry|pelvic\s*biometry|pelvic-biometry|ultrasound[-_\s]?pelvicbiometry)(\.ejs)?/i.test(test.testType)) view = 'tests/results_entry_ultrasound_pelvic_biometry';
    if (/(static:)?(ultrasound[-_\s]?pelvic(?![-_\s]?biometry)(\.ejs)?|pelvic(?![-_\s]?biometry))/i.test(test.testType)) view = 'tests/results_entry_ultrasound_pelvic';
    if (/(drug\s*test|drugtest)/i.test(test.testType)) view = 'tests/results_entry_drugtest';
    console.log(`DEBUG GET /tests/${req.params.id}/results - selected view='${view}'`);

    // Compute a suggested next case number for X-ray entry form (6 digits, zero-padded)
    let nextCaseNumber = '';
    try {
      if (view === 'tests/results_entry_xray') {
        const allTests = await Test.find();
        let maxNum = 0;
        allTests.forEach(t => {
          const cn = (t.caseNumber || (t.results && t.results.caseNumber)) || '';
          const digits = String(cn).replace(/[^0-9]/g, '');
          if (digits) {
            const n = parseInt(digits, 10);
            if (!isNaN(n) && n > maxNum) maxNum = n;
          }
        });
        const next = maxNum + 1 || 1;
        nextCaseNumber = String(next).padStart(6, '0');
      }
    } catch (e) {
      console.warn('Failed to compute nextCaseNumber for xray entry:', e);
    }

    console.log(`DEBUG nextCaseNumber for view='${view}':`, nextCaseNumber);
    res.render(view, {
      title: `Enter ${test.testType} Results`,
      test: testForView,
      users,
      nextCaseNumber,
      ANALYZER_MAP
    });

  } catch (err) {
    console.error('Results entry form error:', err);
    req.flash('error_msg', 'Error loading results form');
    res.redirect(`/tests/${req.params.id}`);
  }
});

// POST /tests/:id/results - Save results for fecalysis
router.post('/:id/results', requireAuth, canAccessPatient, upload.single('photoFile'), async (req, res) => {
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
      blood_chem: /(blood\s*chemistry|blood-chemistry|blood\s*chem|(?:bun|creat|creatinine))/i.test(tt),
      lipid: /(lipid|lipid\s*profile|blood\s*chemistry\s*-?\s*lipid|blood\s*chemistry\s*lipid\s*profile|blood\s*chemistry\s*lipid)/i.test(tt),
      electrolytes: /(electrolyte|electrolytes|sodium|potassium|chloride)/i.test(tt),
      blood_sugar: /(blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour)/i.test(tt),
      ultrasound_abd: /(ultrasound[-\s]?abd[-\s]?kubp[-\s]?hbt)/i.test(tt),
      ultrasound_transvaginal: /(ultrasound[-\s]?transvaginal|transvaginal)/i.test(tt),
      ultrasound_biophysical: /(ultrasound[-\s]?biophysical|biophysical)/i.test(tt),
      ultrasound_pelvic: /(ultrasound[-_\s]?pelvic(\.ejs)?|pelvic)/i.test(tt),
      ultrasound_1st_trimester: /(1st\s*trimester|first\s*trimester|1st[-\s]?trimester|trimester\s*obstetrics|ultrasound[-\s]?.*1st)/i.test(tt),
      esr: /(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(tt),
      drugtest: /(drug\s*test|drugtest)/i.test(tt),
      ct_bt: /(bleeding|clotting|ct[-_\s]*&?\s*bt|ct[-_\s]*and[-_\s]*bt|ct[-_\s]*bt)/i.test(tt)
      ,
      xray: /(x-?ray|xray|radiograph)/i.test(tt)
      ,
      ecg: /(ecg|electrocardio|electrocardiogram)/i.test(tt)
    };
    console.log(`DEBUG POST /tests/${req.params.id}/results - testType='${tt}', checks=`, checks);

    // Ensure pelvic ultrasound forms are accepted even when testType string
    // does not exactly match (some forms submit fields instead of testType).
    checks.ultrasound_pelvic = checks.ultrasound_pelvic || /(static:)?(ultrasound[-_\s]?pelvic(\.ejs)?|pelvic)/i.test(tt);
    // Ensure biophysical ultrasound forms are accepted when form fields are submitted
    checks.ultrasound_biophysical = checks.ultrasound_biophysical || /(ultrasound[-\s]?biophysical|biophysical)/i.test(tt);
    // Fallback: if the request contains common ultrasound fields, accept as ultrasound-pelvic
    if (!checks.ultrasound_pelvic && req && req.body && (
      req.body.gestational_sac_length || req.body.crl_length || req.body.impression || req.body.paragraphs || req.body.findings || req.body.examination
    )) {
      checks.ultrasound_pelvic = true;
      // also mark transvaginal true for compatibility with shared ultrasound handlers
      checks.ultrasound_transvaginal = checks.ultrasound_transvaginal || true;
    }
    // Fallback: if the request contains biophysical-specific fields, accept as biophysical
    if (!checks.ultrasound_biophysical && req && req.body && (
      req.body.bpd_size || req.body.hc_size || req.body.ac_size || req.body.fl_size || req.body['biometry_size[]'] || req.body.biometry_size
    )) {
      checks.ultrasound_biophysical = true;
    }

    if (!tt || !Object.values(checks).some(Boolean)) {
      console.error(`UNSUPPORTED POST results entry for test ${req.params.id} - testType='${tt}'`, { checks, template: test && test.template });
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
    } else if (/(bleeding|clotting|ct[-_\s]*&?\s*bt|ct[-_\s]*and[-_\s]*bt|ct[-_\s]*bt|ctbt)/i.test(test.testType)) {
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

    } else if (/(drug\s*test|drugtest)/i.test(test.testType)) {
      // Drug test entry parsing
      const serial = (req.body.serial || '').toString().trim() || 'NB126997';
      const ccfNo = (req.body.ccfNo || '').toString().trim() || '202511290286';
      const name = (req.body.name || '').toString().trim();
      const gender = (req.body.gender || '').toString().trim();
      const transactionDateTime = req.body.transactionDateTime ? new Date(req.body.transactionDateTime).toISOString() : null;
      const reportDateTime = req.body.reportDateTime ? new Date(req.body.reportDateTime).toISOString() : null;
      const purpose = (req.body.purpose || '').toString().trim();
      const analyst = (req.body.analyst || '').toString().trim();
      const headLab = (req.body.headLab || '').toString().trim();
      // If multer processed an uploaded file, prefer that (process with sharp if available)
      let photoData = null;
      try {
        if (req.file && req.file.buffer) {
          try {
            // Try to use sharp for safe server-side resizing/compression
            const sharp = require('sharp');
            const maxDim = 800;
            const processed = await sharp(req.file.buffer)
              .rotate()
              .resize({ width: maxDim, height: maxDim, fit: 'inside' })
              .jpeg({ quality: 75 })
              .toBuffer();
            photoData = `data:image/jpeg;base64,${processed.toString('base64')}`;
          } catch (sharpErr) {
            // sharp not available or processing failed — fallback to original buffer
            photoData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
          }
        } else if (req.body.photoData) {
          photoData = (req.body.photoData || '').toString().trim() || null;
        }
      } catch (e) {
        photoData = null;
      }

      // drugs arrays
      const names = (Array.isArray(req.body['drugNames[]']) ? req.body['drugNames[]'] : (Array.isArray(req.body.drugNames) ? req.body.drugNames : (req.body['drugNames[]'] ? [req.body['drugNames[]']] : (req.body.drugNames ? [req.body.drugNames] : []))));
      const results = (Array.isArray(req.body['drugResults[]']) ? req.body['drugResults[]'] : (Array.isArray(req.body.drugResults) ? req.body.drugResults : (req.body['drugResults[]'] ? [req.body['drugResults[]']] : (req.body.drugResults ? [req.body.drugResults] : []))));
      const remarks = (Array.isArray(req.body['drugRemarks[]']) ? req.body['drugRemarks[]'] : (Array.isArray(req.body.drugRemarks) ? req.body.drugRemarks : (req.body['drugRemarks[]'] ? [req.body['drugRemarks[]']] : (req.body.drugRemarks ? [req.body.drugRemarks] : []))));

      const drugs = [];
      const maxLen = Math.max(names.length, results.length, remarks.length);
      for (let i = 0; i < maxLen; i++) {
        const dname = (names[i] || '').toString().trim();
        const dres = (results[i] || '').toString().trim() || '';
        const drem = (remarks[i] || '').toString().trim() || '';
        if (dname || dres || drem) drugs.push({ drug: dname, result: dres, remarks: drem });
      }

      resultsObj = {
        serial,
        ccfNo,
        name,
        gender,
        transactionDateTime,
        reportDateTime,
        purpose,
        drugs,
        photoData,
        analyst,
        headLab
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
      const paragraphsRaw = (req.body.paragraphs || '').toString();
      const fontSize = (req.body.paragraphsFontSize || '').toString().trim();
      const fontFamily = (req.body.paragraphsFontFamily || '').toString().trim();

      // If user submitted raw text without HTML tags, convert newlines to paragraphs
      let paragraphs = paragraphsRaw.trim();
      const hasHtmlTag = /<\/?[a-z][\s\S]*>/i.test(paragraphs);
      if (!hasHtmlTag && paragraphs.length) {
        // Split on double newlines for paragraphs, single newlines to <br>
        const paras = paragraphs.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean).map(p => '<p>' + p.replace(/\r?\n/g, '<br>') + '</p>');
        paragraphs = paras.join('\n');
      }

      resultsObj = {
        paragraphs: paragraphs || ''
      };

      // Also store caseNumber and examination inside results as fallback
      if (caseNumber) resultsObj.caseNumber = caseNumber;
      if (examination) resultsObj.examination = examination;

      if (fontSize) resultsObj.paragraphs_font_size = fontSize;
      if (fontFamily) resultsObj.paragraphs_font_family = fontFamily;

      if (caseNumber) topUpdates.caseNumber = caseNumber;
      if (examination) topUpdates.examination = examination;

    } else if (/(blood(\s*|-)chemistry|blood\s*chem)/i.test(test.testType)) {
      // Generic blood chemistry fallback: attempt to capture common analytes
      const {
        fbs, rbs, firstHour, secondHour,
        cholesterol, tg, hdl, ldl, vldl,
        uricAcid, creatinine, bun, sgpt, sgot,
        sodium, potassium, chloride, hba1c, alb, note
      } = req.body;

      // small helpers
      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function computeFlag(val, min, max){ if(val===null||val===undefined) return ''; if(typeof min==='number' && !isNaN(min) && val<min) return 'L'; if(typeof max==='number' && !isNaN(max) && val>max) return 'H'; return '' }

      resultsObj = {};

      // Lipids
      const cholN = toNum(cholesterol);
      const tgN = toNum(tg);
      const hdlN = toNum(hdl);
      let ldlN = toNum(ldl);
      if ((ldlN === null || ldlN === undefined) && cholN !== null && hdlN !== null && tgN !== null) {
        ldlN = Math.round((cholN - hdlN - (tgN / 5.0)) * 100) / 100;
      }
      if (cholesterol || cholN !== null) {
        resultsObj.cholesterol = (cholesterol || (cholN!==null?String(cholN):''));
        resultsObj.cholesterol_numeric = cholN;
        resultsObj.cholesterol_flag = computeFlag(cholN, 0, 200);
      }
      if (tg || tgN !== null) {
        resultsObj.tg = (tg || (tgN!==null?String(tgN):''));
        resultsObj.tg_numeric = tgN;
        resultsObj.tg_flag = computeFlag(tgN, 60, 150);
      }
      if (hdl || hdlN !== null) {
        resultsObj.hdl = (hdl || (hdlN!==null?String(hdlN):''));
        resultsObj.hdl_numeric = hdlN;
        resultsObj.hdl_flag = computeFlag(hdlN, 35, 80);
      }
      if ((ldl || ldlN !== null)) {
        resultsObj.ldl = (ldl || (ldlN!==null?String(ldlN):''));
        resultsObj.ldl_numeric = ldlN;
        resultsObj.ldl_flag = computeFlag(ldlN, 66, 178);
      }
      if (vldl) resultsObj.vldl = String(vldl).trim();

      // Blood sugar
      const fbsN = toNum(fbs);
      const rbsN = toNum(rbs);
      const firstN = toNum(firstHour);
      const secondN = toNum(secondHour);
      if (fbs || fbsN !== null) { resultsObj.fbs = (fbs || (fbsN!==null?String(fbsN):'')); resultsObj.fbs_numeric = fbsN; }
      if (rbs || rbsN !== null) { resultsObj.rbs = (rbs || (rbsN!==null?String(rbsN):'')); resultsObj.rbs_numeric = rbsN; }
      if (firstHour || firstN !== null) { resultsObj.firstHour = (firstHour || (firstN!==null?String(firstN):'')); resultsObj.firstHour_numeric = firstN; }
      if (secondHour || secondN !== null) { resultsObj.secondHour = (secondHour || (secondN!==null?String(secondN):'')); resultsObj.secondHour_numeric = secondN; }

      // Renal, liver, electrolytes, albumin, hba1c
      if (uricAcid) resultsObj.uricAcid = String(uricAcid).trim();
      if (creatinine || toNum(creatinine) !== null) { resultsObj.creatinine = (creatinine || String(toNum(creatinine))); resultsObj.creatinine_numeric = toNum(creatinine); }
      if (bun || toNum(bun) !== null) { resultsObj.bun = (bun || String(toNum(bun))); resultsObj.bun_numeric = toNum(bun); }
      if (sgpt || toNum(sgpt) !== null) { resultsObj.sgpt = (sgpt || String(toNum(sgpt))); resultsObj.sgpt_numeric = toNum(sgpt); }
      if (sgot || toNum(sgot) !== null) { resultsObj.sgot = (sgot || String(toNum(sgot))); resultsObj.sgot_numeric = toNum(sgot); }
      if (sodium || toNum(sodium) !== null) { resultsObj.sodium = (sodium || String(toNum(sodium))); resultsObj.sodium_numeric = toNum(sodium); }
      if (potassium || toNum(potassium) !== null) { resultsObj.potassium = (potassium || String(toNum(potassium))); resultsObj.potassium_numeric = toNum(potassium); }
      if (chloride || toNum(chloride) !== null) { resultsObj.chloride = (chloride || String(toNum(chloride))); resultsObj.chloride_numeric = toNum(chloride); }
      if (hba1c || toNum(hba1c) !== null) { resultsObj.hba1c = (hba1c || String(toNum(hba1c))); resultsObj.hba1c_numeric = toNum(hba1c); }
      if (alb || toNum(alb) !== null) { resultsObj.alb = (alb || String(toNum(alb))); resultsObj.alb_numeric = toNum(alb); }

      if (note) resultsObj.note = String(note).trim();

      console.log('DEBUG: blood chemistry fallback matched, results keys:', Object.keys(resultsObj));

    } else if (/(ecg|electrocardio|electrocardiogram)/i.test(test.testType)) {
      // ECG: paragraph findings + single reading physician
      const paragraphsRaw = (req.body.paragraphs || '').toString();
      const fontSize = (req.body.paragraphsFontSize || '').toString().trim();
      const fontFamily = (req.body.paragraphsFontFamily || '').toString().trim();

      let paragraphs = paragraphsRaw.trim();
      const hasHtmlTagEcg = /<\/?[a-z][\s\S]*>/i.test(paragraphs);
      if (!hasHtmlTagEcg && paragraphs.length) {
        const paras = paragraphs.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean).map(p => '<p>' + p.replace(/\r?\n/g, '<br>') + '</p>');
        paragraphs = paras.join('\n');
      }

      resultsObj = {
        paragraphs: paragraphs || ''
      };

      if (fontSize) resultsObj.paragraphs_font_size = fontSize;
      if (fontFamily) resultsObj.paragraphs_font_family = fontFamily;

      // Reading physician
      resultsObj.doctorName = (req.body.doctorName || '').trim();
      resultsObj.doctorLicense = (req.body.doctorLicense || '').trim();
      // Prefer custom designation if provided (doctorDesignationOther)
      const doctorDesignationOther = (req.body.doctorDesignationOther || '').toString().trim();
      resultsObj.doctorDesignation = doctorDesignationOther ? doctorDesignationOther : (req.body.doctorDesignation || '').trim();

      // ECG results stored above (paragraphs + doctor info)
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
    } else if (/(ultrasound[-\s]?biophysical|biophysical|ultrasound[-_\s]?pelvic[-_\s]?biometry|pelvic[-_\s]?biometry|pelvic\s*biometry)/i.test(test.testType)) {
      // Biophysical ultrasound parsing
      const bpd_size = (req.body.bpd_size || '').toString().trim();
      const bpd_label = (req.body.bpd_label || '').toString().trim();
      const hc_size = (req.body.hc_size || '').toString().trim();
      const hc_label = (req.body.hc_label || '').toString().trim();
      const ac_size = (req.body.ac_size || '').toString().trim();
      const ac_label = (req.body.ac_label || '').toString().trim();
      const fl_size = (req.body.fl_size || '').toString().trim();
      const fl_label = (req.body.fl_label || '').toString().trim();

      // extra biometry rows
      const labelsRaw = req.body['biometry_label[]'] || req.body.biometry_label || req.body.biometry_label;
      const sizesRaw = req.body['biometry_size[]'] || req.body.biometry_size || req.body.biometry_size;
      let biometry = [];
      if (Array.isArray(labelsRaw) || Array.isArray(sizesRaw)) {
        const labels = Array.isArray(labelsRaw) ? labelsRaw : (labelsRaw ? [labelsRaw] : []);
        const sizes = Array.isArray(sizesRaw) ? sizesRaw : (sizesRaw ? [sizesRaw] : []);
        const max = Math.max(labels.length, sizes.length);
        for (let i = 0; i < max; i++) {
          const lbl = labels[i] !== undefined ? String(labels[i]).trim() : '';
          const sz = sizes[i] !== undefined ? String(sizes[i]).trim() : '';
          if (lbl || sz) biometry.push({ label: lbl, size: sz });
        }
      }

      const number_of_fetus = (req.body.number_of_fetus || '').toString().trim();
      const average_ultrasound_age = (req.body.average_ultrasound_age || '').toString().trim();
      const presentation = (req.body.presentation || '').toString().trim();
      const edc_by_ultrasound_raw = (req.body.edc_by_ultrasound || '').toString().trim();
      let edc_by_ultrasound = '';
      if (edc_by_ultrasound_raw) {
        const d = new Date(edc_by_ultrasound_raw);
        if (!isNaN(d.getTime())) edc_by_ultrasound = d.toISOString(); else edc_by_ultrasound = edc_by_ultrasound_raw;
      }
      const efw = (req.body.efw || '').toString().trim();
      const fetal_heart_rate = (req.body.fetal_heart_rate || '').toString().trim();
      const placental_location = (req.body.placental_location || '').toString().trim();
      const maturity = (req.body.maturity || '').toString().trim();
      const amniotic_fluid = (req.body.amniotic_fluid || '').toString().trim();
      const gender = (req.body.gender || '').toString().trim();
      const fetal_tone = (req.body.fetal_tone || '').toString().trim();
      const fetal_movement = (req.body.fetal_movement || '').toString().trim();
      const fetal_breathing = (req.body.fetal_breathing || '').toString().trim();
      const afi = (req.body.afi || '').toString().trim();
      const bps = (req.body.bps || '').toString().trim();
      const estimated_date_of_delivery_raw = (req.body.estimated_date_of_delivery || req.body.estimatedDateOfDelivery || '').toString().trim();
      let estimated_date_of_delivery = '';
      if (estimated_date_of_delivery_raw) {
        const d2 = new Date(estimated_date_of_delivery_raw);
        if (!isNaN(d2.getTime())) estimated_date_of_delivery = d2.toISOString(); else estimated_date_of_delivery = estimated_date_of_delivery_raw;
      }

      const impression = (req.body.impression || '').toString().trim();
      const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
      const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
      const doctorDesignation = (req.body.doctorDesignation || '').toString().trim();

      resultsObj = {
        bpd_size, bpd_label,
        hc_size, hc_label,
        ac_size, ac_label,
        fl_size, fl_label,
        biometry,
        number_of_fetus,
        average_ultrasound_age,
        presentation,
        edc_by_ultrasound,
        efw,
        fetal_heart_rate,
        placental_location,
        maturity,
        amniotic_fluid,
        gender,
        fetal_tone,
        fetal_movement,
        fetal_breathing,
        afi,
        bps,
        estimated_date_of_delivery,
        impression,
        doctorName,
        doctorLicense,
        doctorDesignation
      };

      // optional spacing between impression and signatures
      if (req.body.impression_spacing && String(req.body.impression_spacing).trim()) {
        resultsObj.impression_spacing = String(req.body.impression_spacing).trim();
      }

      // store editable section title
      resultsObj.section_title = (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || 'BIOPHYSICAL ULTRASOUND').toString().trim();

    } else if (/(static:)?(ultrasound[-_\s]?(transvaginal|pelvic(?:[-_\s]?biometry)?)(\.ejs)?|transvaginal|pelvic(?:[-_\s]?biometry)?)/i.test(test.testType)) {
      // Transvaginal ultrasound: structured fields per checklist
      const gestational_sac_length = (req.body.gestational_sac_length || req.body.gestationalSacLength || '').toString().trim();
      const gestational_sac_age = (req.body.gestational_sac_age || req.body.gestationalSacAge || '').toString().trim();
      const crl_length = (req.body.crl_length || req.body.crlLength || '').toString().trim();
      const crl_age = (req.body.crl_age || req.body.crlAge || '').toString().trim();
      // Support multiple comment entries: arrays `comment_sign[]` and `comment_text[]`
      const commentSigns = req.body['comment_sign[]'] || req.body.comment_sign || req.body.comment_signs || req.body.comment_sign;
      const commentTexts = req.body['comment_text[]'] || req.body.comment_text || req.body.comment_texts || req.body.comment_text;
      let commentEntries = [];
      if (Array.isArray(commentSigns) || Array.isArray(commentTexts)) {
        const signs = Array.isArray(commentSigns) ? commentSigns : (commentSigns ? [commentSigns] : []);
        const texts = Array.isArray(commentTexts) ? commentTexts : (commentTexts ? [commentTexts] : []);
        const max = Math.max(signs.length, texts.length);
        for (let i = 0; i < max; i++) {
          const s = signs[i] !== undefined ? String(signs[i]).trim() : '-';
          const t = texts[i] !== undefined ? String(texts[i]).trim() : '';
          if (t || s) commentEntries.push({ sign: (s === '+' ? '+' : '-'), text: t });
        }
      } else if (req.body.comment_yolk || req.body.yolkSac || req.body.comment_hemorrhage || req.body.hemorrhage) {
        if (req.body.comment_yolk || req.body.yolkSac) commentEntries.push({ sign: '-', text: (req.body.comment_yolk || req.body.yolkSac).toString().trim() });
        if (req.body.comment_hemorrhage || req.body.hemorrhage) commentEntries.push({ sign: '-', text: (req.body.comment_hemorrhage || req.body.hemorrhage).toString().trim() });
      } else {
        // nothing submitted; keep empty array
        commentEntries = [];
      }
      const average_ultrasound_age = (req.body.average_ultrasound_age || req.body.averageUltrasoundAge || '').toString().trim();
      const fetal_heart_rate = (req.body.fetal_heart_rate || req.body.fetalHeartRate || '').toString().trim();
      const expected_date_of_delivery_raw = (req.body.expected_date_of_delivery || req.body.expectedDateOfDelivery || '').toString().trim();
      let expected_date_of_delivery = '';
      if (expected_date_of_delivery_raw) {
        const d = new Date(expected_date_of_delivery_raw);
        if (!isNaN(d.getTime())) expected_date_of_delivery = d.toISOString(); else expected_date_of_delivery = expected_date_of_delivery_raw;
      }
      const other = (req.body.other || '').toString().trim();
      const impression = (req.body.impression || '').toString().trim();
      const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
      const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
      const doctorDesignation = (req.body.doctorDesignation || '').toString().trim();

      resultsObj = {
        gestational_sac_length: gestational_sac_length,
        gestational_sac_age: gestational_sac_age,
        crl_length: crl_length,
        crl_age: crl_age,
        comment_entries: commentEntries,
        // back-compat: expose the first two entries as separate fields if present
        comment_yolk: (commentEntries && commentEntries[0] ? (commentEntries[0].text || '') : ''),
        comment_hemorrhage: (commentEntries && commentEntries[1] ? (commentEntries[1].text || '') : ''),
        average_ultrasound_age: average_ultrasound_age,
        fetal_heart_rate: fetal_heart_rate,
        expected_date_of_delivery: expected_date_of_delivery,
        other: other,
        impression: impression,
        doctorName: doctorName,
        doctorLicense: doctorLicense,
        doctorDesignation: doctorDesignation
      };
      // store editable section title when provided (or keep existing/default)
      resultsObj.section_title = (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || (/(transvaginal)/i.test(test.testType) ? 'TRANSVAGINAL ULTRASOUND' : 'PELVIC ULTRASOUND')).toString().trim();
      // optional spacing between impression and signatures
      if (req.body.impression_spacing && String(req.body.impression_spacing).trim()) {
        resultsObj.impression_spacing = String(req.body.impression_spacing).trim();
      }
    } else if (/(?:1st|first|2nd|second|3rd|third|trimester|ultrasound[-_\s]?trimester|trimester[-_\s]?obstetrics)/i.test(test.testType)) {
      // 1st Trimester Obstetrics - unified single/twin parsing
      const isTwinRaw = req.body.isTwin;
      const isTwin = (isTwinRaw === 'on' || isTwinRaw === 'true' || isTwinRaw === true || String(isTwinRaw).toLowerCase() === 'on');

      function parseCommentArray(signsRaw, textsRaw, fallbackKey1, fallbackKey2) {
        let entries = [];
        if (Array.isArray(signsRaw) || Array.isArray(textsRaw)) {
          const signs = Array.isArray(signsRaw) ? signsRaw : (signsRaw ? [signsRaw] : []);
          const texts = Array.isArray(textsRaw) ? textsRaw : (textsRaw ? [textsRaw] : []);
          const max = Math.max(signs.length, texts.length);
          for (let i = 0; i < max; i++) {
            const s = signs[i] !== undefined ? String(signs[i]).trim() : '-';
            const t = texts[i] !== undefined ? String(texts[i]).trim() : '';
            if (t || s) entries.push({ sign: (s === '+' ? '+' : '-'), text: t });
          }
        } else if (req.body[fallbackKey1] || req.body[fallbackKey2]) {
          if (req.body[fallbackKey1]) entries.push({ sign: '-', text: String(req.body[fallbackKey1]).trim() });
          if (req.body[fallbackKey2]) entries.push({ sign: '-', text: String(req.body[fallbackKey2]).trim() });
        }
        return entries;
      }

      if (isTwin) {
        const gA_len = (req.body.gestational_sac_length_A || req.body.gestational_sac_length || '').toString().trim();
        const gA_age = (req.body.gestational_sac_age_A || req.body.gestational_sac_age || '').toString().trim();
        const crlA_len = (req.body.crl_length_A || req.body.crl_length || '').toString().trim();
        const crlA_age = (req.body.crl_age_A || req.body.crl_age || '').toString().trim();

        const gB_len = (req.body.gestational_sac_length_B || '').toString().trim();
        const gB_age = (req.body.gestational_sac_age_B || '').toString().trim();
        const crlB_len = (req.body.crl_length_B || '').toString().trim();
        const crlB_age = (req.body.crl_age_B || '').toString().trim();

        const commentEntriesA = parseCommentArray(req.body['comment_sign_A[]'] || req.body.comment_sign_A, req.body['comment_text_A[]'] || req.body.comment_text_A, 'comment_yolk', 'yolkSac');
        const commentEntriesB = parseCommentArray(req.body['comment_sign_B[]'] || req.body.comment_sign_B, req.body['comment_text_B[]'] || req.body.comment_text_B, 'comment_hemorrhage', 'hemorrhage');

        // combined fallback for older forms
        let combinedComments = [];
        if (Array.isArray(req.body['comment_sign[]']) || Array.isArray(req.body['comment_text[]'])) {
          const signs = Array.isArray(req.body['comment_sign[]']) ? req.body['comment_sign[]'] : (req.body['comment_sign[]'] ? [req.body['comment_sign[]']] : []);
          const texts = Array.isArray(req.body['comment_text[]']) ? req.body['comment_text[]'] : (req.body['comment_text[]'] ? [req.body['comment_text[]']] : []);
          const max = Math.max(signs.length, texts.length);
          for (let i = 0; i < max; i++) {
            const s = signs[i] !== undefined ? String(signs[i]).trim() : '-';
            const t = texts[i] !== undefined ? String(texts[i]).trim() : '';
            if (t || s) combinedComments.push({ sign: (s === '+' ? '+' : '-'), text: t });
          }
        }

        const avgA = (req.body.average_ultrasound_age_A || req.body.average_ultrasound_age || '').toString().trim();
        const fhrA = (req.body.fetal_heart_rate_A || req.body.fetal_heart_rate || '').toString().trim();
        const avgB = (req.body.average_ultrasound_age_B || '').toString().trim();
        const fhrB = (req.body.fetal_heart_rate_B || '').toString().trim();

        const expected_date_of_delivery_raw = (req.body.expected_date_of_delivery || req.body.expectedDateOfDelivery || '').toString().trim();
        let expected_date_of_delivery = '';
        if (expected_date_of_delivery_raw) {
          const d = new Date(expected_date_of_delivery_raw);
          if (!isNaN(d.getTime())) expected_date_of_delivery = d.toISOString(); else expected_date_of_delivery = expected_date_of_delivery_raw;
        }

        const other = (req.body.other || '').toString().trim();
        const impression = (req.body.impression || '').toString().trim();
        const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
        const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
        const doctorDesignation = (req.body.doctorDesignation || req.body.doctorDesignation || '').toString().trim();

        resultsObj = {
          isTwin: true,
          gestational_sac_length_A: gA_len,
          gestational_sac_age_A: gA_age,
          crl_length_A: crlA_len,
          crl_age_A: crlA_age,
          gestational_sac_length_B: gB_len,
          gestational_sac_age_B: gB_age,
          crl_length_B: crlB_len,
          crl_age_B: crlB_age,
          comment_entries_A: commentEntriesA,
          comment_entries_B: commentEntriesB,
          // keep legacy combined comments if present
          comment_entries: (commentEntriesA && commentEntriesA.length) || (commentEntriesB && commentEntriesB.length) ? (commentEntriesA.concat(commentEntriesB)) : (combinedComments.length ? combinedComments : []),
          average_ultrasound_age_A: avgA,
          fetal_heart_rate_A: fhrA,
          average_ultrasound_age_B: avgB,
          fetal_heart_rate_B: fhrB,
          expected_date_of_delivery: expected_date_of_delivery,
          other: other,
          impression: impression,
          doctorName: doctorName,
          doctorLicense: doctorLicense,
          doctorDesignation: doctorDesignation
        };
        if (req.body.impression_spacing && String(req.body.impression_spacing).trim()) {
          resultsObj.impression_spacing = String(req.body.impression_spacing).trim();
        }
        // allow editable section title for trimester obstetrics
        resultsObj.section_title = (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || 'TRIMESTER OBSTETRICS').toString().trim();
      } else {
        // single fetus parsing (back-compat and new single form)
        const g_len = (req.body.gestational_sac_length || req.body.gestationalSacLength || '').toString().trim();
        const g_age = (req.body.gestational_sac_age || req.body.gestationalSacAge || '').toString().trim();
        const crl_len = (req.body.crl_length || req.body.crlLength || '').toString().trim();
        const crl_age = (req.body.crl_age || req.body.crlAge || '').toString().trim();

        const commentSigns = req.body['comment_sign[]'] || req.body.comment_sign || req.body.comment_signs || req.body.comment_sign;
        const commentTexts = req.body['comment_text[]'] || req.body.comment_text || req.body.comment_texts || req.body.comment_text;
        let commentEntries = [];
        if (Array.isArray(commentSigns) || Array.isArray(commentTexts)) {
          const signs = Array.isArray(commentSigns) ? commentSigns : (commentSigns ? [commentSigns] : []);
          const texts = Array.isArray(commentTexts) ? commentTexts : (commentTexts ? [commentTexts] : []);
          const max = Math.max(signs.length, texts.length);
          for (let i = 0; i < max; i++) {
            const s = signs[i] !== undefined ? String(signs[i]).trim() : '-';
            const t = texts[i] !== undefined ? String(texts[i]).trim() : '';
            if (t || s) commentEntries.push({ sign: (s === '+' ? '+' : '-'), text: t });
          }
        } else if (req.body.comment_yolk || req.body.yolkSac || req.body.comment_hemorrhage || req.body.hemorrhage) {
          if (req.body.comment_yolk || req.body.yolkSac) commentEntries.push({ sign: '-', text: (req.body.comment_yolk || req.body.yolkSac).toString().trim() });
          if (req.body.comment_hemorrhage || req.body.hemorrhage) commentEntries.push({ sign: '-', text: (req.body.comment_hemorrhage || req.body.hemorrhage).toString().trim() });
        }

        const average_ultrasound_age = (req.body.average_ultrasound_age || req.body.averageUltrasoundAge || '').toString().trim();
        const fetal_heart_rate = (req.body.fetal_heart_rate || req.body.fetalHeartRate || '').toString().trim();
        const expected_date_of_delivery_raw = (req.body.expected_date_of_delivery || req.body.expectedDateOfDelivery || '').toString().trim();
        let expected_date_of_delivery = '';
        if (expected_date_of_delivery_raw) {
          const d = new Date(expected_date_of_delivery_raw);
          if (!isNaN(d.getTime())) expected_date_of_delivery = d.toISOString(); else expected_date_of_delivery = expected_date_of_delivery_raw;
        }
        const other = (req.body.other || '').toString().trim();
        const impression = (req.body.impression || '').toString().trim();
        const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
        const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
        const doctorDesignation = (req.body.doctorDesignation || req.body.doctorDesignation || '').toString().trim();

        resultsObj = {
          isTwin: false,
          gestational_sac_length: g_len,
          gestational_sac_age: g_age,
          crl_length: crl_len,
          crl_age: crl_age,
          comment_entries: commentEntries,
          // back-compat
          comment_yolk: (commentEntries && commentEntries[0] ? (commentEntries[0].text || '') : ''),
          comment_hemorrhage: (commentEntries && commentEntries[1] ? (commentEntries[1].text || '') : ''),
          average_ultrasound_age: average_ultrasound_age,
          fetal_heart_rate: fetal_heart_rate,
          expected_date_of_delivery: expected_date_of_delivery,
          other: other,
          impression: impression,
          doctorName: doctorName,
          doctorLicense: doctorLicense,
          doctorDesignation: doctorDesignation
        };
        // allow editable section title for trimester obstetrics
        resultsObj.section_title = (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || 'TRIMESTER OBSTETRICS').toString().trim();
        if (req.body.impression_spacing && String(req.body.impression_spacing).trim()) {
          resultsObj.impression_spacing = String(req.body.impression_spacing).trim();
        }
      }
    } else if (/(ultrasound[-\s]?abd[-\s]?kubp[-\s]?hbt)/i.test(test.testType)) {
      // Ultrasound ABD / KUBP / HBT variant: accept examination select, findings paragraphs, and impression
      const examination = (req.body.examination || '').toString().trim();
      const paragraphs = (req.body.paragraphs || req.body.findings || req.body.result || '').toString().trim();
      const impression = (req.body.impression || '').toString().trim();
      const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
      const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
      const doctorDesignation = (req.body.doctorDesignation || '').toString().trim();
      resultsObj = {
        examination: examination,
        section_title: (req.body.section_title || req.body.sectionTitle || '').toString().trim() || 'ULTRASOUND RESULT',
        paragraphs: paragraphs,
        impression: impression,
        doctorName: doctorName,
        doctorLicense: doctorLicense,
        doctorDesignation: doctorDesignation,
        paragraphs_font_family: req.body.paragraphsFontFamily || req.body.paragraphs_font_family,
        paragraphs_font_size: req.body.paragraphsFontSize || req.body.paragraphs_font_size
      };
      if (req.body.impression_spacing && String(req.body.impression_spacing).trim()) {
        resultsObj.impression_spacing = String(req.body.impression_spacing).trim();
      }
    } else if (/(echo|echocardiograph|echocardiography|2d\s*echo|2decho)/i.test(test.testType)) {
      // Echocardiography (2D): findings paragraphs, color flow study, conclusion and signature
      const paragraphs = (req.body.paragraphs || req.body.findings || req.body.result || '').toString().trim();
      const color_flow = (req.body.color_flow || req.body.color_flow_study || '').toString().trim();
      const conclusion = (req.body.conclusion || req.body.impression || req.body.conclusion_text || '').toString().trim();
      const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
      const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
      const doctorDesignation = (req.body.doctorDesignation || '').toString().trim() || 'Cardiologist';

      // weight/height/bsa handling
      const weightRaw = (req.body.weight || '').toString().trim();
      const heightRaw = (req.body.height || '').toString().trim();
      const bsaRaw = (req.body.bsa || '').toString().trim();

      // parse numeric values when possible
      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      const weightNum = toNum(weightRaw);
      const heightNum = toNum(heightRaw);
      let bsaVal = (bsaRaw && bsaRaw !== '') ? bsaRaw : '';

      // If bsa not provided but weight and height are numeric, compute Mosteller BSA
      if ((!bsaVal || bsaVal==='') && weightNum !== null && heightNum !== null) {
        const bsaCalc = Math.sqrt((heightNum * weightNum) / 3600);
        if (!isNaN(bsaCalc)) bsaVal = (Math.round(bsaCalc * 100) / 100).toFixed(2);
      }

      resultsObj = {
        paragraphs: paragraphs,
        color_flow: color_flow,
        conclusion: conclusion,
        doctorName: doctorName,
        doctorLicense: doctorLicense,
        doctorDesignation: doctorDesignation,
        weight: weightRaw || (weightNum!==null?String(weightNum):''),
        weight_numeric: weightNum,
        height: heightRaw || (heightNum!==null?String(heightNum):''),
        height_numeric: heightNum,
        bsa: bsaVal,
        section_title: (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || 'ECHOCARDIOGRAPHY REPORT').toString().trim(),
        paragraphs_font_family: req.body.paragraphsFontFamily || req.body.paragraphs_font_family,
        paragraphs_font_size: req.body.paragraphsFontSize || req.body.paragraphs_font_size
      };
      // Diagnostic log for echocardiography saving
      console.log(`ECHOCARDIO POST for test ${req.params.id} - weight,height,bsa:`, { weightRaw, heightRaw, bsaVal });
    }

    // allow storing performer name/license directly on results for printing
    // Only set when non-empty to avoid clearing existing/default values
    if (mtName && String(mtName).trim()) resultsObj.performedByName = String(mtName).trim();
    if (mtLicense && String(mtLicense).trim()) resultsObj.performedByLicense = String(mtLicense).trim();
    if (pathName && String(pathName).trim()) resultsObj.requestedByName = String(pathName).trim();
    if (pathLicense && String(pathLicense).trim()) resultsObj.requestedByLicense = String(pathLicense).trim();
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

    const updated = await Test.findByIdAndUpdate(req.params.id, updateData, { new: true });
    // Auto-apply profile signatures for any selected signatory fields (e.g., mtSelect, doctorSelect, pathSelect)
    try {
      const sigRoutes = require('./signatures');
      if (sigRoutes && typeof sigRoutes.applyProfileSignatureIfEnabled === 'function') {
        // scan form fields for keys that end with 'Select' (signatory_select uses '<prefix>Select')
        for (const key of Object.keys(req.body || {})) {
          try {
            if (/Select$/.test(key)) {
              const uid = req.body[key];
              if (uid && uid !== '__manual__') {
                await sigRoutes.applyProfileSignatureIfEnabled(updated, uid);
              }
            }
          } catch (e) { console.warn('Auto-apply signature iteration error for key', key, e); }
        }
        // backward-compat: also try performedBy if present
        if (performedBy) {
          try { await sigRoutes.applyProfileSignatureIfEnabled(updated, performedBy); } catch (e) {}
        }
      }
    } catch (e) { console.warn('Auto-apply signature failed', e); }

    try {
      console.log('Saved results for test', req.params.id, 'results keys:', updated && updated.results ? Object.keys(updated.results) : null);
    } catch (e) {}

    // Emit SSE event to notify clients that results were encoded for this test
    try {
      sseEmitter.emit('update', { action: 'result_encoded', testId: updated.testId, status: updated.status, patient: updated.patient, time: (new Date()).toISOString() });
    } catch (e) { console.warn('SSE emit (result_encoded) failed', e); }

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
      'drugtest.ejs',
      'ultrasound-pelvic.ejs'
    ];
    const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
    const staticTemplates = files.map(f => {
      if (f === 'drugtest.ejs') return { name: 'Drug Test', testType: 'drugtest' };
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
    try {
      const exists2 = templates.some(t => (t.testType || '').toLowerCase() === 'ultrasound-trimester-obstetrics');
      if (!exists2) {
        templates.push({ name: 'Ultrasound - Trimester Obstetrics', testType: 'ultrasound-trimester-obstetrics' });
      }
    } catch (e) {}
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

    // If results were included in this update, emit result_encoded event so clients can react
    try {
      if (updateData && updateData.results && Object.keys(updateData.results).length) {
        try { sseEmitter.emit('update', { action: 'result_encoded', testId: test.testId, status: test.status, patient: test.patient, time: (new Date()).toISOString() }); } catch (e) { console.warn('SSE emit (result_encoded) failed', e); }
      }
    } catch (e) {}

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