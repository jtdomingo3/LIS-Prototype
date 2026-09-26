const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const RevenueEntry = require('../models/RevenueEntry');
const CostPerTest = require('../models/CostPerTest');
const PayrollRecord = require('../models/PayrollRecord');
const { requireAuth, canAccessCosting } = require('../middleware/auth');
const ExcelJS = require('exceljs');

// Apply auth & costing access guard to all costing routes
router.use(requireAuth);
router.use(canAccessCosting);

/**
 * Helper to compute P&L statistics for a given month or year
 */
async function computeFinancialSummary(periodMonth = null, periodYear = null) {
  const currentYear = periodYear || new Date().getFullYear().toString();
  const currentMonth = periodMonth || new Date().toISOString().slice(0, 7);

  // Revenue
  const revList = await RevenueEntry.find(periodMonth ? { month: periodMonth } : {});
  let totalRevenue = 0;
  let clinicalRevenue = 0;
  let xrayRevenue = 0;
  let discountTotal = 0;

  for (const r of revList) {
    if (!periodMonth && periodYear && (!r.month || !r.month.startsWith(periodYear))) continue;
    clinicalRevenue += (Number(r.clinicalAmount) || 0);
    xrayRevenue += (Number(r.xrayAmount) || 0);
    discountTotal += (Number(r.discountAmount) || 0);
    totalRevenue += (Number(r.totalAmount) || 0);
  }
  const netRevenue = Math.max(0, totalRevenue - discountTotal);

  // Expenses
  const expList = await Expense.find(periodMonth ? { month: periodMonth } : {});
  let totalExpenses = 0;
  const categories = {
    reagent_purchase: 0,
    equipment_service: 0,
    overhead: 0,
    personnel: 0,
    misc: 0
  };

  for (const e of expList) {
    if (!periodMonth && periodYear && (!e.month || !e.month.startsWith(periodYear))) continue;
    const amt = Number(e.amount) || 0;
    totalExpenses += amt;
    const cat = e.category in categories ? e.category : 'misc';
    categories[cat] += amt;
  }

  // Net Profit / Loss
  const netProfit = netRevenue - totalExpenses;
  const marginPercent = netRevenue > 0 ? Math.round((netProfit / netRevenue) * 1000) / 10 : 0;

  return {
    period: periodMonth || periodYear || 'All Time',
    totalRevenue,
    netRevenue,
    clinicalRevenue,
    xrayRevenue,
    discountTotal,
    totalExpenses,
    categories,
    netProfit,
    marginPercent
  };
}

/**
 * GET /costing
 * Main Costing & Financial Dashboard
 */
router.get('/', async (req, res) => {
  try {
    const selectedMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const selectedYear = req.query.year || selectedMonth.slice(0, 4);

    const summary = await computeFinancialSummary(selectedMonth);
    const yearlySummary = await computeFinancialSummary(null, selectedYear);

    // 12-month trend data
    const monthlyTrend = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const ym = `${selectedYear}-${mm}`;
      const revs = await RevenueEntry.find({ month: ym });
      const exps = await Expense.find({ month: ym });
      const rev = revs.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
      const exp = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      monthlyTrend.push({
        month: ym,
        label: new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short' }),
        revenue: rev,
        expenses: exp,
        profit: rev - exp
      });
    }

    // Payment method distribution for selected month
    const paymentMethods = await RevenueEntry.aggregateByPaymentMethod(selectedMonth);

    // Recent expenses
    const recentExpenses = (await Expense.find({ month: selectedMonth })).slice(0, 10);

    // Cost-per-test estimates
    const costPerTestList = await CostPerTest.find();

    res.render('costing/index', {
      title: 'Financial Costing & Analytics',
      selectedMonth,
      selectedYear,
      summary,
      yearlySummary,
      monthlyTrend,
      paymentMethods,
      recentExpenses,
      costPerTestCount: costPerTestList.length,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[costing] Dashboard error:', err);
    req.flash('error_msg', 'Failed to load Costing dashboard');
    res.redirect('/dashboard');
  }
});

/**
 * GET /costing/revenue
 * Itemized Revenue List
 */
router.get('/revenue', async (req, res) => {
  try {
    const selectedMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const methodFilter = req.query.method || '';

    let entries = await RevenueEntry.find({ month: selectedMonth });
    if (methodFilter) {
      entries = entries.filter(e => e.paymentMethod === methodFilter);
    }

    const totalRev = entries.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const totalClin = entries.reduce((s, r) => s + (Number(r.clinicalAmount) || 0), 0);
    const totalXray = entries.reduce((s, r) => s + (Number(r.xrayAmount) || 0), 0);

    res.render('costing/revenue', {
      title: 'Revenue Details',
      entries,
      selectedMonth,
      methodFilter,
      totalRev,
      totalClin,
      totalXray,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[costing] Revenue error:', err);
    req.flash('error_msg', 'Failed to load revenue list');
    res.redirect('/costing');
  }
});

/**
 * GET /costing/expenses
 * Expense Management & Itemized List
 */
router.get('/expenses', async (req, res) => {
  try {
    const selectedMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const categoryFilter = req.query.category || '';

    let expenses = await Expense.find({ month: selectedMonth });
    if (categoryFilter) {
      expenses = expenses.filter(e => e.category === categoryFilter);
    }

    const totalAmount = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

    res.render('costing/expenses', {
      title: 'Laboratory Expenses',
      expenses,
      selectedMonth,
      categoryFilter,
      totalAmount,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[costing] Expenses error:', err);
    req.flash('error_msg', 'Failed to load expenses');
    res.redirect('/costing');
  }
});

/**
 * POST /costing/expenses
 * Create new manual expense entry
 */
router.post('/expenses', async (req, res) => {
  try {
    const { category, subcategory, description, amount, expenseDate, vendorSupplier, notes } = req.body;

    if (!description || !amount || Number(amount) <= 0) {
      req.flash('error_msg', 'Please provide a valid description and amount for the expense');
      return res.redirect('/costing/expenses');
    }

    const expDate = expenseDate || new Date().toISOString().slice(0, 10);
    const exp = new Expense({
      category: category || 'overhead',
      subcategory: subcategory || '',
      description: description.trim(),
      amount: parseFloat(amount),
      vendorSupplier: vendorSupplier || '',
      referenceType: 'manual',
      expenseDate: expDate,
      month: expDate.slice(0, 7),
      notes: notes || '',
      recordedBy: req.session?.user?.name || req.session?.user?.email || 'Admin'
    });

    await exp.save();
    req.flash('success_msg', 'Expense recorded successfully');
    res.redirect(`/costing/expenses?month=${exp.month}`);
  } catch (err) {
    console.error('[costing] Add expense error:', err);
    req.flash('error_msg', 'Failed to save expense');
    res.redirect('/costing/expenses');
  }
});

/**
 * POST /costing/expenses/:id/edit
 * Update an existing expense
 */
router.post('/expenses/:id/edit', async (req, res) => {
  try {
    const exp = await Expense.findById(req.params.id);
    if (!exp) {
      req.flash('error_msg', 'Expense record not found');
      return res.redirect('/costing/expenses');
    }

    const { category, subcategory, description, amount, expenseDate, vendorSupplier, notes } = req.body;
    exp.category = category || exp.category;
    exp.subcategory = subcategory || exp.subcategory;
    exp.description = description || exp.description;
    exp.amount = parseFloat(amount) || exp.amount;
    exp.vendorSupplier = vendorSupplier || exp.vendorSupplier;
    if (expenseDate) {
      exp.expenseDate = expenseDate;
      exp.month = expenseDate.slice(0, 7);
    }
    exp.notes = notes !== undefined ? notes : exp.notes;

    await exp.save();
    req.flash('success_msg', 'Expense updated successfully');
    res.redirect(`/costing/expenses?month=${exp.month}`);
  } catch (err) {
    console.error('[costing] Edit expense error:', err);
    req.flash('error_msg', 'Failed to update expense');
    res.redirect('/costing/expenses');
  }
});

/**
 * POST /costing/expenses/:id/delete
 * Delete an expense entry
 */
router.post('/expenses/:id/delete', async (req, res) => {
  try {
    const userRole = req.session?.user?.role;
    if (userRole !== 'Admin' && userRole !== 'Owner') {
      req.flash('error_msg', 'Only Admin and Owner can delete expense entries');
      return res.redirect('/costing/expenses');
    }

    const exp = await Expense.findById(req.params.id);
    const month = exp ? exp.month : new Date().toISOString().slice(0, 7);
    await Expense.deleteById(req.params.id);

    req.flash('success_msg', 'Expense record deleted');
    res.redirect(`/costing/expenses?month=${month}`);
  } catch (err) {
    console.error('[costing] Delete expense error:', err);
    req.flash('error_msg', 'Failed to delete expense');
    res.redirect('/costing/expenses');
  }
});

/**
 * GET /costing/cost-per-test
 * Configure Reagent Usage Cost Mapping per test type
 */
router.get('/cost-per-test', async (req, res) => {
  try {
    const mappings = await CostPerTest.find();

    // Fetch existing test templates and inventory items to populate dropdowns
    const templates = (global.db && typeof global.db.getTemplates === 'function') ? global.db.getTemplates() : [];
    const inventory = (global.db && typeof global.db.getInventory === 'function') ? global.db.getInventory() : [];

    res.render('costing/cost_per_test', {
      title: 'Reagent Cost Per Test',
      mappings,
      templates,
      inventory,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[costing] Cost-per-test error:', err);
    req.flash('error_msg', 'Failed to load Cost-per-Test configuration');
    res.redirect('/costing');
  }
});

/**
 * POST /costing/cost-per-test
 * Save or update reagent mapping for a test type
 */
router.post('/cost-per-test', async (req, res) => {
  try {
    const { testType, estimatedCost, inventoryItemsJson, notes } = req.body;

    if (!testType) {
      req.flash('error_msg', 'Test type is required');
      return res.redirect('/costing/cost-per-test');
    }

    let existing = await CostPerTest.findByTestType(testType);
    if (!existing) {
      existing = new CostPerTest({ testType });
    }

    existing.estimatedCost = parseFloat(estimatedCost) || 0;
    if (inventoryItemsJson) {
      try {
        existing.inventoryItems = JSON.parse(inventoryItemsJson);
        existing.recalculateCost();
      } catch (_) {}
    }
    existing.notes = notes || existing.notes;
    existing.updatedBy = req.session?.user?.name || 'Admin';

    await existing.save();
    req.flash('success_msg', `Cost mapping for "${testType}" saved successfully`);
    res.redirect('/costing/cost-per-test');
  } catch (err) {
    console.error('[costing] Save cost-per-test error:', err);
    req.flash('error_msg', 'Failed to save cost mapping');
    res.redirect('/costing/cost-per-test');
  }
});

/**
 * POST /costing/cost-per-test/:id/delete
 */
router.post('/cost-per-test/:id/delete', async (req, res) => {
  try {
    await CostPerTest.deleteById(req.params.id);
    req.flash('success_msg', 'Cost mapping deleted');
    res.redirect('/costing/cost-per-test');
  } catch (err) {
    req.flash('error_msg', 'Failed to delete cost mapping');
    res.redirect('/costing/cost-per-test');
  }
});

/**
 * GET /costing/monthly & /costing/monthly/:yearMonth
 * Accounting-style Monthly P&L Statement
 */
router.get('/monthly', (req, res) => {
  const currentMonth = req.query.month || new Date().toISOString().slice(0, 7);
  res.redirect(`/costing/monthly/${currentMonth}`);
});

router.get('/monthly/:yearMonth', async (req, res) => {
  try {
    const yearMonth = req.params.yearMonth || new Date().toISOString().slice(0, 7);
    const summary = await computeFinancialSummary(yearMonth);
    const expenses = await Expense.find({ month: yearMonth });
    const revenueEntries = await RevenueEntry.find({ month: yearMonth });

    res.render('costing/monthly', {
      title: `P&L Statement — ${yearMonth}`,
      yearMonth,
      summary,
      expenses,
      revenueEntries,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[costing] Monthly statement error:', err);
    req.flash('error_msg', 'Failed to load monthly statement');
    res.redirect('/costing');
  }
});

/**
 * GET /costing/export/:format
 * Export P&L or Expenses to Excel / CSV
 */
router.get('/export/:format', async (req, res) => {
  try {
    const format = req.params.format; // 'excel' or 'csv'
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const type = req.query.type || 'pnl'; // 'pnl', 'expenses', 'revenue'

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Gezyne Clinical Laboratory';
    workbook.created = new Date();

    if (type === 'expenses') {
      const sheet = workbook.addWorksheet(`Expenses ${month}`);
      sheet.columns = [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Subcategory', key: 'subcategory', width: 18 },
        { header: 'Description', key: 'description', width: 35 },
        { header: 'Vendor / Supplier', key: 'vendor', width: 25 },
        { header: 'Amount (PHP)', key: 'amount', width: 16 },
        { header: 'Recorded By', key: 'recordedBy', width: 18 }
      ];

      const expenses = await Expense.find({ month });
      for (const e of expenses) {
        sheet.addRow({
          date: e.expenseDate ? e.expenseDate.slice(0, 10) : '',
          category: e.category,
          subcategory: e.subcategory,
          description: e.description,
          vendor: e.vendorSupplier,
          amount: Number(e.amount) || 0,
          recordedBy: e.recordedBy
        });
      }
    } else {
      // P&L Summary Sheet
      const sheet = workbook.addWorksheet(`P&L ${month}`);
      const summary = await computeFinancialSummary(month);

      sheet.addRow(['GEZYNE CLINICAL LABORATORY']);
      sheet.addRow([`PROFIT & LOSS STATEMENT — ${month}`]);
      sheet.addRow([]);
      sheet.addRow(['REVENUE', 'AMOUNT (PHP)']);
      sheet.addRow(['Clinical Laboratory Revenue', summary.clinicalRevenue]);
      sheet.addRow(['Radiology / X-Ray Revenue', summary.xrayRevenue]);
      sheet.addRow(['Gross Revenue', summary.totalRevenue]);
      sheet.addRow(['Discounts (Senior / PWD / Promo)', -summary.discountTotal]);
      sheet.addRow(['NET REVENUE', summary.netRevenue]);
      sheet.addRow([]);
      sheet.addRow(['EXPENSES', 'AMOUNT (PHP)']);
      sheet.addRow(['Reagent & Supply Purchases', summary.categories.reagent_purchase]);
      sheet.addRow(['Equipment Maintenance & Calibration', summary.categories.equipment_service]);
      sheet.addRow(['Personnel / Payroll Cost', summary.categories.personnel]);
      sheet.addRow(['Overhead (Utilities, Rent, Internet)', summary.categories.overhead]);
      sheet.addRow(['Miscellaneous Expenses', summary.categories.misc]);
      sheet.addRow(['TOTAL EXPENSES', summary.totalExpenses]);
      sheet.addRow([]);
      sheet.addRow(['NET PROFIT / LOSS', summary.netProfit]);
      sheet.addRow(['PROFIT MARGIN %', `${summary.marginPercent}%`]);
    }

    const filename = `Financial_${type}_${month}.${format === 'csv' ? 'csv' : 'xlsx'}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      await workbook.csv.write(res);
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      await workbook.xlsx.write(res);
    }
    res.end();
  } catch (err) {
    console.error('[costing] Export error:', err);
    req.flash('error_msg', 'Failed to generate financial export');
    res.redirect('/costing');
  }
});

/**
 * GET /api/costing/summary
 * JSON API for live chart refresh
 */
router.get('/api/summary', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const summary = await computeFinancialSummary(month);
    res.json({ success: true, data: summary });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
