import { Router, Request, Response } from 'express';
import { TestModel } from '../models/Test';
import { PatientModel } from '../models/Patient';
import { UserModel } from '../models/User';
import { ConsultationModel } from '../models/Consultation';
import { requireAuth, requirePermission } from '../middleware/auth';
import { sanitizeTestSignatures } from '../lib/signatureResolver';
import { generatePdfForTest } from '../services/reportPdfService';
import { sseEmitter } from './reception';
import fs from 'fs';
import path from 'path';

const router = Router();

router.use(requireAuth);

/**
 * Test type → prefix mapping (matches the original LIS logic)
 */
const TEST_TYPE_PREFIXES: Record<string, string> = {
  'consultation': 'CN',
  'doctor consultation': 'CN',
  'checkup': 'CN',
  'blood chemistry': 'BC',
  'hematology': 'HM',
  'urinalysis': 'UA',
  'fecalysis': 'FA',
  'xray': 'XR',
  'x-ray': 'XR',
  'drugtest': 'DT',
  'drug test': 'DT',
  'ecg': 'ECG',
  'serology': 'SR',
  'blood typing': 'BT',
  'pregnancy test': 'PT',
  'ct-bt': 'CB',
  'esr': 'ESR',
  'thyroid panel': 'TP',
  'ultrasound': 'US',
  'echocardiography': 'EC',
  'fecal occult blood': 'FOB',
  'pt-aptt': 'PA',
  'dengue duo': 'DD',
  'sendout': 'SO',
};

const ANALYZER_MAP: Record<string, string> = {
  CHOL: 'cholesterol',
  CREA: 'creatinine',
  FBS: 'fbs',
  RBS: 'rbs',
  HDLC: 'hdl',
  SGPT: 'sgpt',
  SGOT: 'sgot',
  TG: 'tg',
  UA: 'uricAcid',
  UREA: 'urea',
  BUN: 'bun',
  LDL: 'ldl',
  VLDL: 'vldl',
  HBA1C: 'hba1c',
  ALB: 'alb',
  CALCIUM: 'calcium',
  SODIUM: 'sodium',
  POTASSIUM: 'potassium',
  CHLORIDE: 'chloride'
};

function getTestPrefix(testType: string): string {
  const lower = testType.toLowerCase();
  for (const [key, prefix] of Object.entries(TEST_TYPE_PREFIXES)) {
    if (lower.includes(key)) return prefix;
  }
  return testType.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase() || 'TS';
}

/**
 * GET /api/tests - List all tests with pagination, search, filters
 */
router.get('/', requirePermission('tests'), (req: Request, res: Response) => {
  try {
    const {
      page,
      limit,
      search,
      status,
      date,
      patientId,
      sortBy,
      sortOrder,
    } = req.query as any;
    const testType = (req.query.testType || req.query.test_type) as string;

    const result = TestModel.findAll({
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
      search: search as string,
      status: status as string,
      testType: testType as string,
      date: date as string,
      patientId: patientId as string,
      sortBy: sortBy as string,
      sortOrder: (sortOrder as 'ASC' | 'DESC') || 'DESC',
    });

    return res.json({
      tests: result.tests,
      total: result.total,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 50,
    });
  } catch (err: any) {
    console.error('[tests] list error:', err);
    return res.status(500).json({ error: 'Failed to list tests' });
  }
});

/**
 * GET /api/tests/:id/analyzer/capture - Read Mindray/Chemistry Analyser.MDB and extract results
 */
router.get('/:id/analyzer/capture', requirePermission('tests'), async (req: Request, res: Response) => {
  try {
    const test = TestModel.findById(req.params.id);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    const patient = test.patient_id ? PatientModel.findById(test.patient_id) : null;

    let gezynePath = process.env.GEZYNE_PATH || path.resolve(process.cwd(), '..', 'new-gezyne');

    function findMDB(start: string): string | null {
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
      } catch (_) { return null; }
      return null;
    }

    let mdbFile: string | null = null;
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

    if (!mdbFile || !fs.existsSync(mdbFile)) {
      return res.json({ error: `Analyzer MDB not found under ${gezynePath}` });
    }

    let MDBReader: any;
    try {
      const mod = require('mdb-reader');
      MDBReader = mod && mod.default ? mod.default : mod;
    } catch (e: any) {
      return res.status(500).json({ error: 'mdb-reader library not available: ' + e.message });
    }

    const buf = fs.readFileSync(mdbFile);
    const reader = new MDBReader(buf);
    const tables: string[] = reader.getTableNames();

    const isNameMatch = (analyzerName: string, firstName?: string, lastName?: string) => {
      if (!analyzerName || (!firstName && !lastName)) return false;
      const normalized = String(analyzerName).toLowerCase().trim();
      const first = (firstName || '').toLowerCase().trim();
      const last = (lastName || '').toLowerCase().trim();

      if (last && first) {
        if (normalized === `${last}, ${first}` || normalized === `${last},${first}`) return true;
        if (normalized === `${first} ${last}`) return true;
        if (normalized.includes(first) && normalized.includes(last)) return true;
      }
      return false;
    };

    const patientTables = tables.filter(t => /^PATIENT/i.test(t));
    const matchingPatients: any[] = [];

    const targetDate = test.test_date ? new Date(test.test_date) : new Date();
    const dateBefore = new Date(targetDate);
    dateBefore.setDate(dateBefore.getDate() - 7);
    const dateAfter = new Date(targetDate);
    dateAfter.setDate(dateAfter.getDate() + 2);

    const monthsToCheck = new Set<string>();
    const cursorDate = new Date(dateBefore);
    while (cursorDate <= dateAfter) {
      const ym = cursorDate.toISOString().slice(0, 7).replace('-', '');
      monthsToCheck.add(`PATIENTINFO${ym}`);
      cursorDate.setMonth(cursorDate.getMonth() + 1);
    }

    for (const t of patientTables) {
      try {
        const isInDateRange = monthsToCheck.has(t);
        const table = reader.getTable(t);
        const rows = table.getData({ start: 0, length: 500 });

        for (const r of rows) {
          let shouldInclude = false;
          if (isInDateRange && r.COLLECT_DATE) {
            try {
              const collectDate = new Date(r.COLLECT_DATE);
              if (collectDate >= dateBefore && collectDate <= dateAfter) {
                shouldInclude = true;
              }
            } catch (_) {}
          }
          if (!shouldInclude && patient && (patient.first_name || patient.last_name)) {
            shouldInclude = isNameMatch(r.FIRST_NAME, patient.first_name, patient.last_name);
          }
          if (shouldInclude) {
            matchingPatients.push({ table: t, row: r });
          }
        }
      } catch (_) {}
    }

    const patientIds = new Set<string>();
    matchingPatients.forEach(mp => {
      if (mp.row && mp.row.ID) patientIds.add(String(mp.row.ID));
    });

    const checkTables = tables.filter(t => /^CHECK_RESULT/i.test(t));
    const checkRows: any[] = [];
    for (const t of checkTables) {
      try {
        const table = reader.getTable(t);
        const rows = table.getData({ start: 0, length: 1000 });
        for (const r of rows) checkRows.push({ ...r, __table: t });
      } catch (_) {}
    }

    let filteredRows = checkRows;
    if (patientIds.size > 0) {
      filteredRows = filteredRows.filter(r => {
        const pid = r.PATIENTID || r['PATIENT_ID'] || r.ID;
        return patientIds.has(String(pid));
      });
    }

    const latestByItem: Record<string, any> = {};
    for (const r of filteredRows) {
      try {
        let code = (r.ITEM || r.Item || r.item || '').toString().toUpperCase();
        code = code.replace(/[^A-Z0-9]/g, '');
        const val = r.RESULT || r.Result || r.result || null;
        if (!code) continue;
        if (!latestByItem[code]) latestByItem[code] = { value: val, row: r };
      } catch (_) {}
    }

    const mapped: Record<string, any> = {};
    for (const code of Object.keys(latestByItem)) {
      const field = ANALYZER_MAP[code];
      if (field) mapped[field] = latestByItem[code].value;
    }

    // Derived values: BUN from Urea, VLDL and LDL using Friedewald formula
    const derived: string[] = [];
    if (mapped.urea && !mapped.bun) {
      const u = parseFloat(mapped.urea);
      if (!isNaN(u)) {
        mapped.bun = String(Math.round(u * 0.467 * 100) / 100);
        derived.push('BUN');
      }
    }
    if (mapped.tg) {
      const tg = parseFloat(mapped.tg);
      if (!isNaN(tg)) {
        const vcalc = Math.round((tg / 5.0) * 100) / 100;
        if (!mapped.vldl || mapped.vldl === '') {
          mapped.vldl = String(vcalc);
          derived.push('VLDL');
        }
      }
      if (mapped.cholesterol && mapped.hdl) {
        const tc = parseFloat(mapped.cholesterol);
        const hdl = parseFloat(mapped.hdl);
        if (!isNaN(tc) && !isNaN(hdl)) {
          const lcalc = Math.round((tc - hdl - (tg / 5.0)) * 100) / 100;
          if (!mapped.ldl || mapped.ldl === '') {
            mapped.ldl = String(lcalc);
            derived.push('LDL');
          }
        }
      }
    }

    const rowsToSend = filteredRows.map(r => {
      let dt = r.CHECK_DATE || r.CHECKDATE || r.DATE || r.Date || r.date;
      if (!dt && r.ID) {
        const idstr = String(r.ID);
        const m = idstr.match(/^(\d{4})(\d{2})(\d{2})/);
        if (m) dt = `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
      }
      if (dt && dt instanceof Date) dt = dt.toISOString();
      const pid = r.PATIENTID || r['PATIENT_ID'] || r.ID;
      return {
        DATE: dt || null,
        ITEM: r.ITEM || r.Item || r.item,
        RESULT: r.RESULT || r.Result || r.result,
        UNIT: r.UNIT || r.Unit || r.unit,
        PATIENT_ID: pid ? String(pid) : null,
      };
    });

    return res.json({
      success: true,
      mapped,
      derived,
      rows: rowsToSend,
      matchingPatientsCount: matchingPatients.length,
    });
  } catch (err: any) {
    console.error('[tests] analyzer capture error:', err);
    return res.status(500).json({ error: 'Failed to capture from analyzer: ' + err?.message });
  }
});

/**
 * GET /api/tests/:id - Get test by ID
 */
router.get('/:id', requirePermission('tests'), (req: Request, res: Response) => {
  try {
    const test = TestModel.findById(req.params.id);
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const patient = test.patient_id ? PatientModel.findById(test.patient_id) : null;
    const consultation = ConsultationModel.findByTestId(test.id);

    return res.json({ test, patient, consultation });
  } catch (err: any) {
    console.error('[tests] get error:', err);
    return res.status(500).json({ error: 'Failed to get test' });
  }
});

/**
 * POST /api/tests - Create new test(s)
 */
router.post('/', requirePermission('tests'), (req: Request, res: Response) => {
  try {
    const { patient_id, test_type, tests: batchTests, ...rest } = req.body;
    const testTypes = batchTests || [{ test_type, ...rest }];

    const created: any[] = [];
    for (const testData of testTypes) {
      const type = testData.test_type || test_type;
      if (!type || !patient_id) continue;

      const prefix = getTestPrefix(type);
      const testId = TestModel.getNextTestId(prefix);

      const test = TestModel.create({
        ...testData,
        patient_id,
        test_type: type,
        test_id: testId,
        requested_by: req.user?.userId,
        test_date: testData.test_date || new Date().toISOString(),
      });

      created.push(test);
    }

    if (created.length === 0) {
      return res.status(400).json({ error: 'No valid tests to create. patient_id and test_type are required.' });
    }

    return res.status(201).json({ tests: created });
  } catch (err: any) {
    console.error('[tests] create error:', err);
    return res.status(500).json({ error: 'Failed to create test' });
  }
});

/**
 * PUT /api/tests/:id - Update test
 */
router.put('/:id', requirePermission('tests'), (req: Request, res: Response) => {
  try {
    const existing = TestModel.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Test not found' });
    }

    const test = TestModel.update(req.params.id, req.body);
    return res.json({ test });
  } catch (err: any) {
    console.error('[tests] update error:', err);
    return res.status(500).json({ error: 'Failed to update test' });
  }
});

/**
 * Helper to save test results with digital signatures & background PDF generation
 */
async function handleSaveResults(req: Request, res: Response) {
  try {
    const existing = TestModel.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Test not found' });
    }

    // Merge results
    let mergedResults = { ...existing.results, ...req.body.results };

    // Resolve active logged-in user auto-signature if configured
    if (req.user?.userId) {
      const currentUser = UserModel.findById(req.user.userId);
      if (currentUser && currentUser.signature) {
        const isAutoSignActive = currentUser.auto_signature_enabled && currentUser.auto_signature_until
          ? new Date(currentUser.auto_signature_until).getTime() > Date.now()
          : false;

        if (isAutoSignActive || currentUser.role === 'Pathologist' || currentUser.role === 'Doctor') {
          mergedResults.signatures = mergedResults.signatures || {};
          if (!mergedResults.signatures[currentUser.id]) {
            mergedResults.signatures[currentUser.id] = {
              name: currentUser.name,
              filename: currentUser.signature,
              placement: { x: 0, y: -56, scale: 1 },
            };
          }
        }
      }
    }

    const updateData: any = {
      results: mergedResults,
      performed_by: req.user?.userId || existing.performed_by,
    };

    // Auto-complete if status is being moved to Completed or Released
    const newStatus = req.body.status || existing.status;
    if (newStatus === 'Completed' || newStatus === 'Released') {
      updateData.status = newStatus;
      if (!existing.completed_at) {
        updateData.completed_at = new Date().toISOString();
      }
    }

    // Track status change in history
    if (req.body.status && req.body.status !== existing.status) {
      const history = [...existing.status_history, {
        from: existing.status,
        to: req.body.status,
        user: req.user?.userId,
        timestamp: new Date().toISOString(),
      }];
      updateData.status_history = history;
      updateData.status = req.body.status;
    }

    let test = TestModel.update(req.params.id, updateData);
    if (test) {
      test = sanitizeTestSignatures(test);
    }

    // Asynchronously pre-generate PDF if test is Completed or Released
    if (test && (test.status === 'Completed' || test.status === 'Released')) {
      const protocol = req.protocol;
      const host = req.get('host') || 'localhost:3020';
      const baseUrl = `${protocol}://${host}`;
      generatePdfForTest(test, baseUrl, true).catch(err => {
        console.warn('[tests] background PDF generation notice:', err?.message);
      });

      // Emit SSE events for real-time live refresh on Kiosk & Reception
      try {
        sseEmitter.emit('test-update', { type: 'complete', test });
        sseEmitter.emit('update', { action: 'test_updated', testId: test.id, status: test.status, time: new Date().toISOString() });
      } catch (_) {}
    }

    return res.json({ test });
  } catch (err: any) {
    console.error('[tests] save results error:', err);
    return res.status(500).json({ error: 'Failed to save results: ' + err?.message });
  }
}

router.put('/:id/results', requirePermission('tests'), handleSaveResults);
router.post('/:id/results', requirePermission('tests'), handleSaveResults);

/**
 * PUT /api/tests/:id/status - Update test status
 */
router.put('/:id/status', requirePermission('tests'), (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const existing = TestModel.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Test not found' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const history = [...existing.status_history, {
      from: existing.status,
      to: status,
      user: req.user?.userId,
      timestamp: new Date().toISOString(),
    }];

    const updateData: any = { status, status_history: history };
    if ((status === 'Completed' || status === 'Released') && !existing.completed_at) {
      updateData.completed_at = new Date().toISOString();
    }

    const test = TestModel.update(req.params.id, updateData);

    try {
      sseEmitter.emit('test-update', { type: 'status', test });
      sseEmitter.emit('update', { action: 'status_changed', testId: test?.id, status, time: new Date().toISOString() });
    } catch (_) {}

    return res.json({ test });
  } catch (err: any) {
    console.error('[tests] update status error:', err);
    return res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * DELETE /api/tests/:id - Delete test
 */
router.delete('/:id', requirePermission('tests', 'delete'), (req: Request, res: Response) => {
  try {
    const deleted = TestModel.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Test not found' });
    }

    return res.json({ message: 'Test deleted' });
  } catch (err: any) {
    console.error('[tests] delete error:', err);
    return res.status(500).json({ error: 'Failed to delete test' });
  }
});

export default router;
