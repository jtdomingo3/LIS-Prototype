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

  // selectedDate parsed below; default to today when not provided
  let selectedDate = null;
  const isSameDay = (d1, d2) => {
    try { return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate(); } catch (e) { return false; }
  };

  // parse optional selected date from query (supports YYYY-MM-DD, 'today', 'yesterday')
  try {
    const dp = req && req.query && req.query.date ? String(req.query.date).trim() : '';
    if (dp) {
      if (dp.toLowerCase() === 'today') selectedDate = new Date();
      else if (dp.toLowerCase() === 'yesterday') { selectedDate = new Date(); selectedDate.setDate(selectedDate.getDate() - 1); }
      else {
        const parsed = new Date(dp);
        if (!isNaN(parsed)) selectedDate = parsed;
      }
    }
  } catch (e) { selectedDate = null; }
  if (!selectedDate) selectedDate = new Date();
  // normalize to day bounds (inclusive)
  const selectedStart = new Date(selectedDate);
  selectedStart.setHours(0,0,0,0);
  const selectedEnd = new Date(selectedDate);
  selectedEnd.setHours(23,59,59,999);

  let totalPatients = 0;
  // Pending/Completed/Active/Released will be computed as snapshot at selectedDate
  const NON_PENDING_STATUSES = ['In Progress', 'Completed', 'Releasing of Result', 'Released', 'Sendout', 'Checked'];
  let pendingTests = 0;
  let completedTests = 0;
  let activeTests = 0;
  let releasedTests = 0;

  // Compute sales totals from patient paymentHistory (if present)
  let totalSales = 0;
  let todaySales = 0;
  let clinicalSales = 0;
  let xraySales = 0;
  let clinicalToday = 0;
  let xrayToday = 0;
  try {
    if (Array.isArray(allPatients)) {
      // totalPatients = patients created up to selectedEnd
      totalPatients = allPatients.filter(p => {
        try { const d = p && p.createdAt ? new Date(p.createdAt) : null; return d && d <= selectedEnd; } catch (e) { return false; }
      }).length;

      for (const p of allPatients) {
        const payments = Array.isArray(p.paymentHistory) ? p.paymentHistory : [];
        for (const entry of payments) {
          const clin = parseFloat(entry && (entry.clinical || entry.clinical === 0) ? entry.clinical : 0) || 0;
          const xray = parseFloat(entry && (entry.xray || entry.xray === 0) ? entry.xray : 0) || 0;
          const legacy = parseFloat(entry && (entry.amount || entry.total) ? (entry.amount || entry.total) : 0) || 0;
          const entryTotal = (clin || xray) ? (clin + xray) : legacy;
          // payment timestamp
          const ts = entry && entry.timestamp ? new Date(entry.timestamp) : null;
          if (ts && ts <= selectedEnd) {
            // cumulative up to selected date
            totalSales += entryTotal;
            clinicalSales += clin;
            xraySales += xray;
          }
          if (ts && isSameDay(ts, selectedStart)) {
            // counts for the selected day
            todaySales += entryTotal;
            clinicalToday += clin;
            xrayToday += xray;
          }
        }
      }
    }
  } catch (e) {
    console.warn('Failed computing sales totals', e);
  }

  // Compute totals for each requested test across all tests (snapshot-aware).
  // Treat blood chemistry and ultrasound variants as single groups.
  const testTotals = {};
  const testTotalsSelected = {};
  const testTotalsToday = {};
  try {
    const normalize = (raw) => {
      if (!raw) return '';
      const s = String(raw).trim();
      const lower = s.toLowerCase();
      if (/blood\s*chemistry|blood-chemistry|\bbc\b|bun|crea|sgpt|sgot|lipid|hba1c|albumin|blood[-_\s]?sugar/i.test(lower)) return 'Blood Chemistry';
      if (/ultrasound|ultrasonography|sonography|usg|abdomen sonography|abdominal ultrasound/i.test(lower)) return 'Ultrasound';
      return s.replace(/\s+/g, ' ').replace(/[-_]+/g, ' ').trim();
    };

    // helper: determine status of a test at a given datetime (returns null if test not yet created)
    const statusAt = (test, atDate) => {
      try {
        const created = test && test.createdAt ? new Date(test.createdAt) : null;
        if (!created || created > atDate) return null; // not yet created
        const history = Array.isArray(test.statusHistory) ? test.statusHistory.slice().sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)) : [];
        let last = null;
        for (const h of history) {
          const ts = h && h.timestamp ? new Date(h.timestamp) : null;
          if (!ts) continue;
          if (ts <= atDate) last = h;
          else break;
        }
        if (last && last.to) return last.to;
        return test.status || null;
      } catch (e) { return test.status || null; }
    };

    if (Array.isArray(allTests)) {
      for (const t of allTests) {
        // only include tests that exist by selectedEnd
        const created = t && t.createdAt ? new Date(t.createdAt) : null;
        if (!created || created > selectedEnd) continue;

        // determine status at selectedEnd for snapshot counts
        const s = statusAt(t, selectedEnd);
        if (!s) continue;
        if (!NON_PENDING_STATUSES.includes(s)) pendingTests++;
        if (s === 'Completed' || s === 'Released') completedTests++;
        if (s === 'In Progress') activeTests++;
        if (s === 'Released') releasedTests++;

        // requested test breakdowns
        const rlist = Array.isArray(t.requestedTests) ? t.requestedTests : [];
        const candidates = rlist.length === 0 ? [ (t.testType || '') ] : rlist.map(r => (r && (r.label || r.key)) ? (r.label || r.key) : r);
        for (const cand of candidates) {
          const key = normalize(cand);
          if (!key) continue;
          // cumulative up to selectedEnd
          testTotals[key] = (testTotals[key] || 0) + 1;
          // count if testDate/createdAt falls on the selected day
          const dtStr = t.testDate || t.createdAt;
          const dt = dtStr ? new Date(dtStr) : null;
          if (dt && dt >= selectedStart && dt <= selectedEnd) {
            testTotalsSelected[key] = (testTotalsSelected[key] || 0) + 1;
            testTotalsToday[key] = (testTotalsToday[key] || 0) + 1; // keep TODAY aligned to selected day
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
          , testTotals, testTotalsToday, testTotalsSelected, selectedDate: (selectedDate ? (new Date(selectedDate)).toISOString().slice(0,10) : null)
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