const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Patient = require('../models/Patient');
const { requireAuth } = require('../middleware/auth');

// GET /dashboard - Dashboard page
router.get('/', requireAuth, async (req, res) => {
  try {
    // Get statistics
    const allPatients = await Patient.find({});
    const allTests = await Test.find({});

  const totalPatients = allPatients.length;
  // Pending = tests currently in reception areas.
  // Exclude statuses that represent in-progress, finalized, or external sendout/check states.
  const NON_PENDING_STATUSES = ['In Progress', 'Completed', 'Releasing of Result', 'Released', 'Sendout', 'Checked'];
  const pendingTests = allTests.filter(t => t && t.status && !NON_PENDING_STATUSES.includes(t.status)).length;
  // Completed = tests with final results encoded (include Released)
  const completedTests = allTests.filter(t => t && (t.status === 'Completed' || t.status === 'Released')).length;
  // Active / In Progress = finished reception and waiting for results encoding
  const activeTests = allTests.filter(t => t && t.status === 'In Progress').length;
  // Released = tests explicitly marked Released
  const releasedTests = allTests.filter(t => t && t.status === 'Released').length;

  // Compute sales totals from patient paymentHistory (if present)
  let totalSales = 0;
  let todaySales = 0;
  let clinicalSales = 0;
  let xraySales = 0;
  let clinicalToday = 0;
  let xrayToday = 0;
  try {
    const today = new Date();
    if (Array.isArray(allPatients)) {
      for (const p of allPatients) {
        const payments = Array.isArray(p.paymentHistory) ? p.paymentHistory : [];
        for (const entry of payments) {
          // Support new split entries with `clinical` and `xray`, fallback to legacy `amount` or `total`.
          const clin = parseFloat(entry && (entry.clinical || entry.clinical === 0) ? entry.clinical : 0) || 0;
          const xray = parseFloat(entry && (entry.xray || entry.xray === 0) ? entry.xray : 0) || 0;
          const legacy = parseFloat(entry && (entry.amount || entry.total) ? (entry.amount || entry.total) : 0) || 0;
          const entryTotal = (clin || xray) ? (clin + xray) : legacy;
          totalSales += entryTotal;
          clinicalSales += clin;
          xraySales += xray;
          if (entry && entry.timestamp) {
            const ts = new Date(entry.timestamp);
            if (ts.getFullYear() === today.getFullYear() && ts.getMonth() === today.getMonth() && ts.getDate() === today.getDate()) {
              todaySales += entryTotal;
              clinicalToday += clin;
              xrayToday += xray;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed computing sales totals', e);
  }

  // Compute totals for each requested test across all tests.
  // Treat blood chemistry and ultrasound variants as single groups.
  const testTotals = {};
  const testTotalsToday = {};
  try {
    const isSameDay = (d1, d2) => {
      try {
        return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
      } catch (e) { return false; }
    };
    const normalize = (raw) => {
      if (!raw) return '';
      const s = String(raw).trim();
      const lower = s.toLowerCase();
      // Group blood chemistry variants
      if (/blood\s*chemistry|blood-chemistry|\bbc\b|bun|crea|sgpt|sgot|lipid|hba1c|albumin|blood[-_\s]?sugar/i.test(lower)) return 'Blood Chemistry';
      // Group ultrasound variants
      if (/ultrasound|ultrasonography|sonography|usg|abdomen sonography|abdominal ultrasound/i.test(lower)) return 'Ultrasound';
      // Normalize common separators and capitalization
      return s.replace(/\s+/g, ' ').replace(/[-_]+/g, ' ').trim();
    };

    if (Array.isArray(allTests)) {
      const today = new Date();
      for (const t of allTests) {
        const rlist = Array.isArray(t.requestedTests) ? t.requestedTests : [];
        const candidates = rlist.length === 0 ? [ (t.testType || '') ] : rlist.map(r => (r && (r.label || r.key)) ? (r.label || r.key) : r);
        for (const cand of candidates) {
          const key = normalize(cand);
          if (!key) continue;
          testTotals[key] = (testTotals[key] || 0) + 1;
          // determine if this test counts for today (based on testDate or createdAt)
          const dtStr = t.testDate || t.createdAt;
          const dt = dtStr ? new Date(dtStr) : null;
          if (dt && isSameDay(dt, today)) {
            testTotalsToday[key] = (testTotalsToday[key] || 0) + 1;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed computing test totals', e);
  }

    // Get recent test results with patient info
    let recentTests = [];
    if (Array.isArray(allTests)) {
      recentTests = allTests
        .sort((a, b) => new Date(b.createdAt || b.testDate) - new Date(a.createdAt || a.testDate))
        .slice(0, 10)
        .map(test => {
          const patient = Array.isArray(allPatients) ? allPatients.find(p => p.id === test.patient) : null;
          return {
            ...test,
            patient: patient ? { firstName: patient.firstName, lastName: patient.lastName } : null
          };
        });
    }

    res.render('dashboard/index', {
      title: 'Dashboard',
        stats: {
        totalPatients,
        pendingTests,
        completedTests,
        activeTests,
        releasedTests
        , totalSales, todaySales, clinicalSales, xraySales, clinicalToday, xrayToday
          , testTotals, testTotalsToday
      },
      recentTests
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    req.flash('error_msg', 'Error loading dashboard');
    res.render('dashboard/index', {
      title: 'Dashboard',
      stats: { totalPatients: 0, pendingTests: 0, completedTests: 0, activeTests: 0, totalSales: 0, todaySales: 0 },
      recentTests: []
    });
  }
});

module.exports = router;