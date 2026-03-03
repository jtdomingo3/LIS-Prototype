import { Router, Request, Response } from 'express';
import { PatientModel } from '../models/Patient';
import { TestModel } from '../models/Test';
import { requireAuth, requirePermission } from '../middleware/auth';
import { getDb } from '../db/connection';

const router = Router();

router.use(requireAuth);

// Normalize test type names (group blood chemistry variants, ultrasound variants, etc.)
function normalizeTestType(raw: string): string {
  if (!raw) return '';
  const s = raw.trim();
  const lower = s.toLowerCase();
  if (/blood\s*chemistry|blood-chemistry|\bbc\b|bun|crea|sgpt|sgot|lipid|hba1c|albumin|blood[-_\s]?sugar/i.test(lower)) return 'Blood Chemistry';
  if (/ultrasound|ultrasonography|sonography|usg|abdomen sonography|abdominal ultrasound/i.test(lower)) return 'Ultrasound';
  return s.replace(/\s+/g, ' ').replace(/[-_]+/g, ' ').trim();
}

/**
 * GET /api/dashboard - Dashboard statistics with sales, chart data, and recent tests
 */
router.get('/', requirePermission('dashboard'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const dateParam = req.query.date as string | undefined;

    // Parse selected date
    let selectedDate: Date;
    if (dateParam) {
      if (dateParam.toLowerCase() === 'today') selectedDate = new Date();
      else if (dateParam.toLowerCase() === 'yesterday') {
        selectedDate = new Date();
        selectedDate.setDate(selectedDate.getDate() - 1);
      } else {
        selectedDate = new Date(dateParam);
        if (isNaN(selectedDate.getTime())) selectedDate = new Date();
      }
    } else {
      selectedDate = new Date();
    }

    const selectedDateStr = selectedDate.toISOString().slice(0, 10);

    // Patient counts
    const totalPatients = PatientModel.count();

    // Test status counts (all time)
    const statusCounts = TestModel.countByStatus();
    const pending = statusCounts['Pending'] || 0;
    const inProgress = (statusCounts['In Progress'] || 0) + (statusCounts['Extraction Area'] || 0);
    const completed = statusCounts['Completed'] || 0;
    const released = statusCounts['Released'] || 0;
    const totalTests = Object.values(statusCounts).reduce((a, b) => a + b, 0);

    // Sales totals from payment_history in patients table
    let totalSales = 0, todaySales = 0, clinicalSales = 0, xraySales = 0, clinicalToday = 0, xrayToday = 0;
    try {
      const allPatients = db.prepare('SELECT payment_history FROM patients').all() as { payment_history: string }[];
      for (const row of allPatients) {
        const payments = JSON.parse(row.payment_history || '[]');
        if (!Array.isArray(payments)) continue;
        for (const entry of payments) {
          const clin = parseFloat(entry?.clinical || 0) || 0;
          const xray = parseFloat(entry?.xray || 0) || 0;
          const legacy = parseFloat(entry?.amount || entry?.total || 0) || 0;
          const entryTotal = (clin || xray) ? (clin + xray) : legacy;
          const ts = entry?.timestamp ? new Date(entry.timestamp) : null;
          if (ts) {
            totalSales += entryTotal;
            clinicalSales += clin;
            xraySales += xray;
            if (ts.toISOString().slice(0, 10) === selectedDateStr) {
              todaySales += entryTotal;
              clinicalToday += clin;
              xrayToday += xray;
            }
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Test type totals for Chart.js (total, selected day, today)
    const testTotals: Record<string, number> = {};
    const testTotalsSelected: Record<string, number> = {};
    const testTotalsToday: Record<string, number> = {};
    
    try {
      const allTests = db.prepare('SELECT test_type, test_date, created_at, requested_tests FROM tests').all() as any[];
      const todayStr = new Date().toISOString().slice(0, 10);
      for (const t of allTests) {
        const requestedTests = JSON.parse(t.requested_tests || '[]');
        const candidates = requestedTests.length === 0
          ? [t.test_type || '']
          : requestedTests.map((r: any) => (r?.label || r?.key) || r);
        
        for (const cand of candidates) {
          const key = normalizeTestType(String(cand));
          if (!key) continue;
          testTotals[key] = (testTotals[key] || 0) + 1;

          const dt = t.test_date || t.created_at || '';
          const dtStr = dt ? new Date(dt).toISOString().slice(0, 10) : '';
          if (dtStr === selectedDateStr) {
            testTotalsSelected[key] = (testTotalsSelected[key] || 0) + 1;
          }
          if (dtStr === todayStr) {
            testTotalsToday[key] = (testTotalsToday[key] || 0) + 1;
          }
        }
      }
    } catch (e) { /* ignore */ }

    // Recent tests (last 10)
    let recentTests: any[] = [];
    try {
      const rows = db.prepare(`
        SELECT t.id, t.test_id, t.test_type, t.status, t.test_date, t.created_at,
               t.patient_id, p.first_name, p.last_name
        FROM tests t
        LEFT JOIN patients p ON t.patient_id = p.id
        ORDER BY t.created_at DESC
        LIMIT 10
      `).all() as any[];
      recentTests = rows.map((r: any) => ({
        id: r.id,
        testId: r.test_id,
        testType: r.test_type,
        status: r.status,
        testDate: r.test_date || r.created_at,
        patient: r.first_name ? { firstName: r.first_name, lastName: r.last_name } : null,
      }));
    } catch (e) { /* ignore */ }

    // Type breakdown (for the grid)
    const typeBreakdown = TestModel.countByType();

    return res.json({
      stats: {
        totalPatients,
        totalTests,
        pending,
        inProgress,
        completed,
        released,
        totalSales: Math.round(totalSales * 100) / 100,
        todaySales: Math.round(todaySales * 100) / 100,
        clinicalSales: Math.round(clinicalSales * 100) / 100,
        xraySales: Math.round(xraySales * 100) / 100,
        clinicalToday: Math.round(clinicalToday * 100) / 100,
        xrayToday: Math.round(xrayToday * 100) / 100,
        testTotals,
        testTotalsSelected,
        testTotalsToday,
        selectedDate: selectedDateStr,
      },
      statusBreakdown: statusCounts,
      typeBreakdown,
      recentTests,
      date: selectedDateStr,
    });
  } catch (err: any) {
    console.error('[dashboard] error:', err);
    return res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});

export default router;
