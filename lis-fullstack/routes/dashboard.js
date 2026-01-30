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