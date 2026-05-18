import { Router, Request, Response } from 'express';
import { TestModel } from '../models/Test';
import { PatientModel } from '../models/Patient';
import { requireAuth, requirePermission } from '../middleware/auth';
import { getDb } from '../db/connection';
import { renderReportHtml } from '../lib/reportHtmlRenderer';

const router = Router();

router.use(requireAuth);

// Helper to flatten nested results
function flattenResults(obj: any, prefix = ''): Record<string, any> {
  const out: Record<string, any> = {};
  if (obj == null) return out;
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    out[prefix || 'results'] = obj;
    return out;
  }
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const key = prefix ? `${prefix}.${k}` : k;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenResults(v, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/**
 * GET /api/reports - List completed/released tests for report navigation
 */
router.get('/', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { search, testType, date, page, limit } = req.query;
    const pg = page ? parseInt(page as string) : 1;
    const lim = limit ? parseInt(limit as string) : 50;
    const offset = (pg - 1) * lim;

    let where = "WHERE (t.status = 'Completed' OR t.status = 'Released')";
    const params: any[] = [];

    if (search) {
      where += ' AND (t.test_id LIKE ? OR p.first_name LIKE ? OR p.last_name LIKE ? OR t.test_type LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (testType) {
      where += ' AND LOWER(t.test_type) = LOWER(?)';
      params.push(testType);
    }
    if (date) {
      where += ' AND DATE(t.test_date) = DATE(?)';
      params.push(date);
    }

    const countRow = db.prepare(`SELECT COUNT(*) as count FROM tests t LEFT JOIN patients p ON t.patient_id = p.id ${where}`).get(...params) as { count: number };
    const rows = db.prepare(`
      SELECT t.*, p.first_name, p.last_name, p.patient_code, p.patient_id as p_patient_id
      FROM tests t
      LEFT JOIN patients p ON t.patient_id = p.id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, lim, offset) as any[];

    const tests = rows.map((r: any) => ({
      id: r.id,
      testId: r.test_id,
      testType: r.test_type,
      status: r.status,
      testDate: r.test_date || r.created_at,
      patientName: r.first_name ? `${r.last_name}, ${r.first_name}` : 'Unknown',
      patientCode: r.patient_code,
    }));

    // Get unique test types for filter dropdown
    const typeRows = db.prepare("SELECT DISTINCT test_type FROM tests WHERE status IN ('Completed', 'Released') AND test_type IS NOT NULL ORDER BY test_type").all() as any[];
    const availableTestTypes = typeRows.map((r: any) => r.test_type);

    return res.json({
      tests,
      total: countRow.count,
      page: pg,
      limit: lim,
      availableTestTypes,
      pagination: {
        totalPages: Math.max(1, Math.ceil(countRow.count / lim)),
        page: pg,
        limit: lim,
        total: countRow.count,
      },
    });
  } catch (err: any) {
    console.error('[reports] list error:', err);
    return res.status(500).json({ error: 'Failed to list reports' });
  }
});

/**
 * GET /api/reports/nav - Lightweight navigation list (all completed/released tests)
 * Returns minimal data for client-side filtering & navigation — no pagination.
 */
router.get('/nav', requirePermission('reports'), (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT t.id, t.test_id, t.test_type, t.test_date, t.created_at,
             p.first_name, p.last_name, p.patient_code
      FROM tests t
      LEFT JOIN patients p ON t.patient_id = p.id
      WHERE t.status IN ('Completed', 'Released')
      ORDER BY t.created_at DESC
    `).all() as any[];

    const items = rows.map((r: any) => ({
      id: r.id,
      testId: r.test_id || '',
      testType: r.test_type || '',
      testDate: r.test_date || r.created_at || '',
      patientName: r.first_name ? `${r.last_name}, ${r.first_name}` : 'Unknown',
      patientCode: r.patient_code || '',
    }));

    // unique patient names (sorted) for dropdown
    const patientSet = new Set<string>();
    items.forEach((i: any) => { if (i.patientName && i.patientName !== 'Unknown') patientSet.add(i.patientName); });
    const patients = Array.from(patientSet).sort();

    // unique test types
    const typeSet = new Set<string>();
    items.forEach((i: any) => { if (i.testType) typeSet.add(i.testType); });
    const testTypes = Array.from(typeSet).sort();

    return res.json({ items, patients, testTypes, total: items.length });
  } catch (err: any) {
    console.error('[reports] nav error:', err);
    return res.status(500).json({ error: 'Failed to get nav list' });
  }
});

/**
 * POST /api/reports/print-multiple - Render concatenated HTML for multiple reports
 * Body: { ids: string[] }
 */
router.post('/print-multiple', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' });
    }

    const protocol = req.protocol;
    const host = req.get('host') || 'localhost:3020';
    const baseUrl = `${protocol}://${host}`;

    const pages: string[] = [];
    for (const id of ids) {
      const test = TestModel.findById(id);
      if (!test) continue;
      const patient = PatientModel.findById(test.patient_id) || {} as any;
      const html = renderReportHtml(test as any, patient as any, baseUrl, { print: false });
      // Extract just the body content (strip the full document wrapper)
      const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/i);
      pages.push(bodyMatch ? bodyMatch[1] : html);
    }

    // Combine pages with page-break dividers
    const combined = pages.join('\n<div style="page-break-after:always;"></div>\n');

    // Wrap in a single document
    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Print Reports</title>
<style>
@page { size: Letter; margin: 0.25in; }
body { margin:0; padding:0; font-family:'Times New Roman',Times,serif; }
</style>
</head><body>
${combined}
<script>setTimeout(function(){ window.print(); },500);</script>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    return res.send(fullHtml);
  } catch (err: any) {
    console.error('[reports] print-multiple error:', err);
    return res.status(500).send('<h1>Failed to render reports</h1>');
  }
});

/**
 * GET /api/reports/print-multiple-get?ids[]=id1&ids[]=id2
 * Same as POST /print-multiple but as a GET so it can be opened directly in a new tab.
 * The browser auto-triggers window.print() on load.
 */
router.get('/print-multiple-get', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const raw = req.query['ids[]'];
    const ids: string[] = Array.isArray(raw) ? raw as string[] : raw ? [raw as string] : [];

    if (ids.length === 0) {
      return res.status(400).send('<h1>No report IDs provided</h1>');
    }

    const protocol = req.protocol;
    const host = req.get('host') || 'localhost:3020';
    const baseUrl = `${protocol}://${host}`;

    const pages: string[] = [];
    for (const id of ids) {
      const test = TestModel.findById(id);
      if (!test) continue;
      const patient = PatientModel.findById(test.patient_id) || {} as any;
      const html = renderReportHtml(test as any, patient as any, baseUrl, { print: false });
      const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/i);
      pages.push(bodyMatch ? bodyMatch[1] : html);
    }

    const combined = pages.join('\n<div style="page-break-after:always;"></div>\n');

    const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Print Reports</title>
<style>
@page { size: Letter; margin: 0.25in; }
body { margin:0; padding:0; font-family:'Times New Roman',Times,serif; }
</style>
</head><body>
${combined}
<script>setTimeout(function(){ window.print(); },500);</script>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    return res.send(fullHtml);
  } catch (err: any) {
    console.error('[reports] print-multiple-get error:', err);
    return res.status(500).send('<h1>Failed to render reports</h1>');
  }
});


/**
 * GET /api/reports/worksheet/types - Get available test types for worksheet dropdown
 * NOTE: Must be defined BEFORE /:id routes to avoid being captured by :id param
 */
router.get('/worksheet/types', requirePermission('reports'), (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT DISTINCT test_type FROM tests WHERE test_type IS NOT NULL ORDER BY test_type").all() as any[];
    const types = rows.map((r: any) => r.test_type);
    
    // Get unique companies for patient export
    const compRows = db.prepare("SELECT DISTINCT company FROM patients WHERE company IS NOT NULL AND company != '' ORDER BY company").all() as any[];
    const companies = compRows.map((r: any) => r.company);

    return res.json({ types, companies });
  } catch (err: any) {
    console.error('[reports] worksheet types error:', err);
    return res.status(500).json({ error: 'Failed to get types' });
  }
});

/**
 * GET /api/reports/:id/html - Render formatted report HTML (for preview / print / PDF)
 */
router.get('/:id/html', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const test = TestModel.findById(req.params.id);
    if (!test) return res.status(404).send('<h1>Not found</h1>');
    const patient = PatientModel.findById(test.patient_id) || {} as any;
    const protocol = req.protocol;
    const host = req.get('host') || 'localhost:3020';
    const baseUrl = `${protocol}://${host}`;
    const printMode = req.query.print === '1';
    const html = renderReportHtml(test as any, patient as any, baseUrl, { print: printMode });
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
    return res.send(html);
  } catch (err: any) {
    console.error('[reports] html render error:', err);
    return res.status(500).send('<h1>Failed to render report</h1>');
  }
});

/**
 * GET /api/reports/:id - Get a single report (test + patient)
 */
router.get('/:id', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const test = TestModel.findById(req.params.id);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    const patient = PatientModel.findById(test.patient_id);
    return res.json({ test, patient });
  } catch (err: any) {
    console.error('[reports] get error:', err);
    return res.status(500).json({ error: 'Failed to get report' });
  }
});

/**
 * POST /api/reports/worksheet/preview - Preview worksheet data
 */
router.post('/worksheet/preview', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const { testType, dateFrom, dateTo, allData } = req.body;
    const db = getDb();

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (!allData) {
      if (testType) {
        if (testType.toLowerCase() === 'blood chemistry') {
          where += ' AND LOWER(t.test_type) LIKE ?';
          params.push('%blood%chemistry%');
        } else {
          where += ' AND LOWER(t.test_type) LIKE LOWER(?)';
          params.push(`%${testType}%`);
        }
      }
      if (dateFrom) {
        where += ' AND DATE(t.test_date) >= DATE(?)';
        params.push(dateFrom);
      }
      if (dateTo) {
        where += ' AND DATE(t.test_date) <= DATE(?)';
        params.push(dateTo);
      }
    }

    const rows = db.prepare(`
      SELECT t.*, p.first_name, p.last_name, p.patient_id as p_patient_id, p.gender
      FROM tests t
      LEFT JOIN patients p ON t.patient_id = p.id
      ${where}
      ORDER BY t.test_date ASC
      LIMIT 200
    `).all(...params) as any[];

    const resultCols = new Set<string>();
    const previewRows = rows.map((r: any) => {
      const results = JSON.parse(r.results || '{}');
      const flat = flattenResults(results);
      Object.keys(flat).forEach(k => resultCols.add(k));
      return {
        testId: r.test_id,
        testType: r.test_type,
        date: r.test_date ? new Date(r.test_date).toISOString().slice(0, 10) : '',
        time: r.test_date ? new Date(r.test_date).toISOString().slice(11, 19) : '',
        patientId: r.p_patient_id || '',
        firstName: r.first_name || '',
        lastName: r.last_name || '',
        flatResults: flat,
      };
    });

    return res.json({ count: previewRows.length, rows: previewRows, resultCols: Array.from(resultCols) });
  } catch (err: any) {
    console.error('[reports] worksheet preview error:', err);
    return res.status(500).json({ error: 'Failed to generate preview' });
  }
});

/**
 * POST /api/reports/worksheet/download - Download worksheet as CSV
 */
router.post('/worksheet/download', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const { testType, dateFrom, dateTo, allData, format } = req.body;
    const db = getDb();

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (!allData) {
      if (testType) {
        if (testType.toLowerCase() === 'blood chemistry') {
          where += ' AND LOWER(t.test_type) LIKE ?';
          params.push('%blood%chemistry%');
        } else {
          where += ' AND LOWER(t.test_type) LIKE LOWER(?)';
          params.push(`%${testType}%`);
        }
      }
      if (dateFrom) {
        where += ' AND DATE(t.test_date) >= DATE(?)';
        params.push(dateFrom);
      }
      if (dateTo) {
        where += ' AND DATE(t.test_date) <= DATE(?)';
        params.push(dateTo);
      }
    }

    const rows = db.prepare(`
      SELECT t.*, p.first_name, p.last_name, p.patient_id as p_patient_id,
             p.date_of_birth, p.gender, p.phone
      FROM tests t
      LEFT JOIN patients p ON t.patient_id = p.id
      ${where}
      ORDER BY t.test_date ASC
    `).all(...params) as any[];

    // Build CSV
    const resultKeys = new Set<string>();
    const testRows = rows.map((r: any) => {
      const results = JSON.parse(r.results || '{}');
      const flat = flattenResults(results);
      Object.keys(flat).forEach(k => resultKeys.add(k));
      return { ...r, flat };
    });

    const resultCols = Array.from(resultKeys);
    const headers = ['Test ID', 'Test Type', 'Test Date', 'Test Time', 'Patient ID', 'First Name', 'Last Name', 'DOB', 'Sex', 'Phone', 'Results (raw)', ...resultCols];

    function escapeCsv(v: any) {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }

    const lines = [headers.map(escapeCsv).join(',')];
    for (const r of testRows) {
      const dateStr = r.test_date ? new Date(r.test_date).toISOString().slice(0, 10) : '';
      const timeStr = r.test_date ? new Date(r.test_date).toISOString().slice(11, 19) : '';
      const base = [
        r.test_id, r.test_type, dateStr, timeStr,
        r.p_patient_id || '', r.first_name || '', r.last_name || '',
        r.date_of_birth || '', r.gender || '', r.phone || '',
        JSON.stringify(JSON.parse(r.results || '{}')),
      ];
      const resultVals = resultCols.map(k => r.flat[k] !== undefined ? r.flat[k] : '');
      lines.push(base.concat(resultVals).map(escapeCsv).join(','));
    }

    const filename = `worksheet_export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
    return res.send(lines.join('\n'));
  } catch (err: any) {
    console.error('[reports] worksheet download error:', err);
    return res.status(500).json({ error: 'Failed to generate worksheet' });
  }
});

/**
 * POST /api/reports/patient-export/preview - Preview patient data
 */
router.post('/patient-export/preview', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, company, philhealth } = req.body;
    const db = getDb();

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (dateFrom) {
      where += ' AND DATE(created_at) >= DATE(?)';
      params.push(dateFrom);
    }
    if (dateTo) {
      where += ' AND DATE(created_at) <= DATE(?)';
      params.push(dateTo);
    }
    if (company) {
      where += ' AND LOWER(company) LIKE LOWER(?)';
      params.push(`%${company}%`);
    }
    if (philhealth === 'yes') {
      where += ' AND philhealth_consent = 1';
    } else if (philhealth === 'no') {
      where += ' AND (philhealth_consent = 0 OR philhealth_consent IS NULL)';
    }

    // if date filters are provided we want patients who have tests in that range
    let query = `SELECT DISTINCT p.* FROM patients p`;
    if (dateFrom || dateTo) {
      query += ' JOIN tests t ON t.patient_id = p.id';
    }
    const rows = db.prepare(`${query} ${where} ORDER BY p.created_at DESC LIMIT 200`).all(...params) as any[];
    // to include testType within selected date range we may need the parameters
    const dateStart = dateFrom || null;
    const dateEnd = dateTo || null;
    const previewRows = rows.map((r: any) => {
      let testType = '';
      if (dateStart && dateEnd) {
        const tr = db.prepare(`SELECT test_type FROM tests WHERE patient_id = ? AND DATE(test_date) BETWEEN DATE(?) AND DATE(?) ORDER BY test_date LIMIT 1`).get(r.id, dateStart, dateEnd) as any;
        if (tr && tr.test_type) testType = tr.test_type;
      }
      return {
        patientId: r.patient_id,
        firstName: r.first_name,
        lastName: r.last_name,
        company: r.company || '',
        philhealthConsent: !!r.philhealth_consent,
        phone: r.phone || '',
        createdAt: r.created_at,
        testType,
      };
    });

    return res.json({ count: previewRows.length, rows: previewRows });
  } catch (err: any) {
    console.error('[reports] patient export preview error:', err);
    return res.status(500).json({ error: 'Failed to preview patients' });
  }
});

/**
 * POST /api/reports/patient-export/download - Download patient data as CSV
 */
router.post('/patient-export/download', requirePermission('reports'), (req: Request, res: Response) => {
  try {
    const { dateFrom, dateTo, company, philhealth } = req.body;
    const db = getDb();

    let where = 'WHERE 1=1';
    const params: any[] = [];

    if (dateFrom) {
      where += ' AND DATE(created_at) >= DATE(?)';
      params.push(dateFrom);
    }
    if (dateTo) {
      where += ' AND DATE(created_at) <= DATE(?)';
      params.push(dateTo);
    }
    if (company) {
      where += ' AND LOWER(company) LIKE LOWER(?)';
      params.push(`%${company}%`);
    }
    if (philhealth === 'yes') {
      where += ' AND philhealth_consent = 1';
    } else if (philhealth === 'no') {
      where += ' AND (philhealth_consent = 0 OR philhealth_consent IS NULL)';
    }

    let query = `SELECT DISTINCT p.* FROM patients p`;
    if (dateFrom || dateTo) {
      query += ' JOIN tests t ON t.patient_id = p.id';
    }
    const rows = db.prepare(`${query} ${where} ORDER BY p.created_at DESC`).all(...params) as any[];

    const headers = ['Patient ID', 'First Name', 'Middle Name', 'Last Name', 'DOB', 'Gender', 'Phone', 'Email', 'Address', 'Company', 'PhilHealth Consent', 'PhilHealth ID', 'Physician', 'Created At', 'Test Type'];

    function escapeCsv(v: any) {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes('"') || s.includes(',') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }

    const lines = [headers.map(escapeCsv).join(',')];
    for (const r of rows) {
      // compute a testType if within date filter
      let testType = '';
      if (dateFrom && dateTo) {
        const tr = db.prepare(`SELECT test_type FROM tests WHERE patient_id = ? AND DATE(test_date) BETWEEN DATE(?) AND DATE(?) ORDER BY test_date LIMIT 1`).get(r.id, dateFrom, dateTo) as any;
        if (tr && tr.test_type) testType = tr.test_type;
      }
      const vals = [
        r.patient_id, r.first_name, r.middle_name || '', r.last_name,
        r.date_of_birth || '', r.gender || '', r.phone || '', r.email || '', r.address || '',
        r.company || '', r.philhealth_consent ? 'Yes' : 'No', r.philhealth_id || '', r.physician || '', r.created_at || '',
        testType,
      ];
      lines.push(vals.map(escapeCsv).join(','));
    }

    const filename = `patient_export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
    return res.send(lines.join('\n'));
  } catch (err: any) {
    console.error('[reports] patient export error:', err);
    return res.status(500).json({ error: 'Failed to export patients' });
  }
});

export default router;
