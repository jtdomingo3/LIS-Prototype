const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');

const Employee = require('../models/Employee');
const PayrollRecord = require('../models/PayrollRecord');
const HrDocument = require('../models/HrDocument');
const LeaveRecord = require('../models/LeaveRecord');
const DtrRecord = require('../models/DtrRecord');
const Expense = require('../models/Expense');

const { requireAuth, canAccessHR, canAccessOwnHR } = require('../middleware/auth');
const { computePayrollForEmployee } = require('../lib/payrollComputer');
const { computeAllContributions } = require('../lib/philippineContributions');
const { getLaboratoryOwner } = require('../lib/ownerHelper');
const DATA_DIR = require('../lib/dataPath').getDataDir();

// Setup Multer for HR Document Uploads
const uploadDir = path.join(DATA_DIR, 'hr-documents');
try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (_) {}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper to determine if current session user is management
function isManagement(user) {
  if (!user) return false;
  const roles = new Set(['Admin', 'Manager', 'Owner']);
  if (roles.has(user.role)) return true;
  let perms = user.permissions || {};
  if (typeof perms === 'string') {
    try { perms = JSON.parse(perms); } catch (_) { perms = {}; }
  }
  return !!perms.hr;
}

// All HR routes require authentication
router.use(requireAuth);

// -------------------------------------------------------------
// STAFF SELF-SERVICE ROUTES (Accessible to ALL logged-in staff)
// -------------------------------------------------------------

/**
 * GET /hr/my
 * Staff Personal HR Portal
 */
router.get('/my', canAccessOwnHR, async (req, res) => {
  try {
    const userId = req.session.user.id;
    let employee = await Employee.findByUserId(userId);

    // If employee record doesn't exist yet, auto-provision a starter record
    if (!employee) {
      employee = new Employee({
        userId,
        employeeCode: `EMP-${(req.session.user.name || 'USER').slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
        department: req.session.user.role === 'Receptionist' ? 'Reception' : 'Clinical Laboratory',
        position: req.session.user.role || 'Staff'
      });
      await employee.save();
    }

    const payslips = await PayrollRecord.findByEmployeeId(employee.id);
    const documents = await HrDocument.findByEmployeeId(employee.id);
    const leaves = await LeaveRecord.findByEmployeeId(employee.id);
    const leavesUsed = leaves
      .filter(l => l.status === 'Approved')
      .reduce((sum, l) => sum + (Number(l.totalDays) || 0), 0);

    res.render('hr/my/index', {
      title: 'My HR Portal',
      employee,
      payslips: payslips.slice(0, 6),
      documents,
      leaves: leaves.slice(0, 6),
      leavesUsed,
      isManagement: isManagement(req.session.user),
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] /my portal error:', err);
    req.flash('error_msg', 'Could not load your HR portal');
    res.redirect('/dashboard');
  }
});

/**
 * GET /hr/my/payslips
 */
router.get('/my/payslips', canAccessOwnHR, async (req, res) => {
  try {
    const employee = await Employee.findByUserId(req.session.user.id);
    if (!employee) {
      req.flash('error_msg', 'Employee profile not found');
      return res.redirect('/hr/my');
    }
    const payslips = await PayrollRecord.findByEmployeeId(employee.id);
    res.render('hr/my/payslips', {
      title: 'My Payslips',
      employee,
      payslips,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] /my/payslips error:', err);
    res.redirect('/hr/my');
  }
});

/**
 * POST /hr/my/leaves
 * Staff submits a leave request
 */
router.post('/my/leaves', canAccessOwnHR, async (req, res) => {
  try {
    const employee = await Employee.findByUserId(req.session.user.id);
    if (!employee) {
      req.flash('error_msg', 'Employee profile not found');
      return res.redirect('/hr/my');
    }

    const { leaveType, startDate, endDate, totalDays, reason } = req.body;
    if (!startDate || !endDate) {
      req.flash('error_msg', 'Start date and end date are required');
      return res.redirect('/hr/my');
    }

    // All leaves are non-paid per laboratory policy (Leave Without Pay / LWOP)
    const isPaid = false;

    const leave = new LeaveRecord({
      employeeId: employee.id,
      leaveType: leaveType || 'Vacation',
      startDate,
      endDate,
      totalDays: parseFloat(totalDays) || 1,
      reason: reason || '',
      isPaid,
      status: 'Pending'
    });

    await leave.save();
    res.redirect(`/hr/print/leave/${leave.id}`);
  } catch (err) {
    console.error('[hr] submit leave error:', err);
    req.flash('error_msg', 'Failed to submit leave request');
    res.redirect('/hr/my');
  }
});

/**
 * GET /hr/my/dtr
 * Daily Time Record (DTR) for individual staff member
 */
router.get('/my/dtr', canAccessOwnHR, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const isMgmt = isManagement(req.session.user);
    let employee = null;
    if (isMgmt && req.query.employeeId) {
      employee = await Employee.findById(req.query.employeeId);
    }
    if (!employee) {
      employee = await Employee.findByUserId(userId);
    }
    if (!employee) {
      employee = new Employee({
        userId,
        employeeCode: `EMP-${(req.session.user.name || 'USER').slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
        department: req.session.user.role === 'Receptionist' ? 'Reception' : 'Clinical Laboratory',
        position: req.session.user.role || 'Staff'
      });
      await employee.save();
    }

    const allEmployees = isMgmt ? await Employee.findAll() : [];

    const selectedMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    const monthDate = new Date(year, month - 1, 1);
    const monthName = monthDate.toLocaleDateString('en-US', { month: 'long' });
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    const records = await DtrRecord.findByEmployeeAndMonth(employee.id, selectedMonth);
    const recordMap = new Map();
    records.forEach(r => recordMap.set(r.date, r));

    const dayRows = [];
    let completedDuties = 0;
    let full8HourDuties = 0;
    let totalRenderedHours = 0;
    let totalOvertimeHours = 0;
    let totalUndertimeMins = 0;
    const weekDutyCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    for (let d = 1; d <= 31; d++) {
      const isPastMonthEnd = d > totalDaysInMonth;
      const dateStr = isPastMonthEnd ? '' : `${selectedMonth}-${String(d).padStart(2, '0')}`;
      let dayName = '';
      let isWeekend = false;
      let weekNum = 1;
      let rec = null;
      let underHours = '';
      let underMinutes = '';

      if (!isPastMonthEnd) {
        const dateObj = new Date(year, month - 1, d);
        dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
        isWeekend = (dateObj.getDay() === 0 || dateObj.getDay() === 6);

        const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
        weekNum = Math.min(6, Math.ceil((d + firstDayOfMonth) / 7));

        rec = recordMap.get(dateStr) || null;

        // Default pre-filled DTR schedule: Mon to Fri 8:00 AM - 12:00 PM, 1:00 PM - 5:00 PM (8.0 hrs duty)
        if (!rec && !isWeekend) {
          rec = {
            id: `default-${dateStr}`,
            employeeId: employee.id,
            date: dateStr,
            amIn: '08:00',
            amOut: '12:00',
            pmIn: '13:00',
            pmOut: '17:00',
            rawTotalHours: 8.0,
            totalHours: 8.0,
            amHours: 4.0,
            pmHours: 4.0,
            isFullDuty: 1,
            dutyCredit: 1.0,
            undertimeMinutes: 0,
            overtimeHours: 0,
            pendingOtHours: 0,
            isOtApproved: 0,
            approvedOtHours: 0,
            status: '8-Hour Duty Completed',
            notes: '',
            isPreFilled: true
          };
        }

        if (rec && rec.dutyCredit > 0) {
          completedDuties += rec.dutyCredit;
          if (rec.isFullDuty) full8HourDuties++;
          // Sum valid duty hours (8.0 hrs standard unless overtime is approved)
          totalRenderedHours += Number(rec.totalHours) || 0;
          if (rec.isOtApproved && Number(rec.overtimeHours) > 0) {
            totalOvertimeHours += Number(rec.overtimeHours);
          }
          totalUndertimeMins += rec.undertimeMinutes || 0;
          weekDutyCounts[weekNum] = (weekDutyCounts[weekNum] || 0) + 1;
        }

        if (rec && rec.undertimeMinutes > 0) {
          underHours = Math.floor(rec.undertimeMinutes / 60) || '';
          underMinutes = (rec.undertimeMinutes % 60) || '';
        }
      }

      dayRows.push({
        date: dateStr,
        dayNum: d,
        dayName,
        isWeekend,
        isPastMonthEnd,
        weekNum,
        underHours,
        underMinutes,
        record: rec
      });
    }

    const totalUndertimeHours = Math.floor(totalUndertimeMins / 60);
    const totalUndertimeRemMinutes = totalUndertimeMins % 60;

    let accruedPay = 0;
    if (employee.payType === 'Daily Duty') {
      const rate = employee.dailyRate || (employee.basicSalary > 0 ? Math.round((employee.basicSalary / 22) * 100) / 100 : 0);
      accruedPay = Math.round(completedDuties * rate * 100) / 100;
    } else if (employee.payType === 'Fixed Monthly') {
      accruedPay = employee.basicSalary || 0;
    }

    res.render('hr/my/dtr', {
      title: 'My Daily Time Record (DTR)',
      employee,
      selectedMonth,
      monthName,
      year,
      totalDaysInMonth,
      totalUndertimeHours,
      totalUndertimeRemMinutes,
      allEmployees,
      dayRows,
      stats: {
        completedDuties: Math.round(completedDuties * 100) / 100,
        full8HourDuties,
        totalRenderedHours: Math.round(totalRenderedHours * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        totalUndertimeMins,
        totalUndertimeHours,
        totalUndertimeRemMinutes,
        accruedPay,
        weekDutyCounts,
        maxDaysPerWeek: employee.maxDaysPerWeek || 5,
        isDoctor: employee.isDoctorOrPathologist()
      },
      isManagement: isMgmt,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] /my/dtr error:', err);
    req.flash('error_msg', 'Failed to load Daily Time Record');
    res.redirect('/hr/my');
  }
});

/**
 * POST /hr/my/dtr/correct
 * Personnel updates their AM/PM in and out punches
 */
router.post('/my/dtr/correct', canAccessOwnHR, async (req, res) => {
  try {
    const { date, amIn, amOut, pmIn, pmOut, notes, employeeIdOverride } = req.body;
    if (!date) {
      req.flash('error_msg', 'Date is required');
      return res.redirect('/hr/my/dtr');
    }

    let employee = null;
    if (employeeIdOverride && isManagement(req.session.user)) {
      employee = await Employee.findById(employeeIdOverride);
    } else {
      employee = await Employee.findByUserId(req.session.user.id);
    }

    if (!employee) {
      req.flash('error_msg', 'Employee profile not found');
      return res.redirect('/hr/my/dtr');
    }

    const isMgmt = isManagement(req.session.user);
    let dtr = await DtrRecord.findByEmployeeAndDate(employee.id, date);

    let isOtApproved = dtr ? (Number(dtr.isOtApproved) || 0) : 0;
    let approvedOtHours = dtr ? (Number(dtr.approvedOtHours) || 0) : 0;
    let otApprovedBy = dtr ? (dtr.otApprovedBy || null) : null;
    let otApprovedAt = dtr ? (dtr.otApprovedAt || null) : null;

    if (isMgmt) {
      if (req.body.isOtApproved !== undefined) {
        const approvedBool = (req.body.isOtApproved === '1' || req.body.isOtApproved === 'true' || req.body.isOtApproved === true || req.body.isOtApproved === 'on');
        isOtApproved = approvedBool ? 1 : 0;
        approvedOtHours = isOtApproved ? Math.max(0, parseFloat(req.body.approvedOtHours) || 0) : 0;
        otApprovedBy = isOtApproved ? (req.session.user.name || 'Head / Manager') : null;
        otApprovedAt = isOtApproved ? new Date().toISOString() : null;
      }
    }

    if (!dtr) {
      dtr = new DtrRecord({
        employeeId: employee.id,
        date,
        amIn,
        amOut,
        pmIn,
        pmOut,
        isOtApproved,
        approvedOtHours,
        otApprovedBy,
        otApprovedAt,
        notes,
        correctedBy: req.session.user.name || 'User'
      });
    } else {
      dtr.amIn = amIn !== undefined ? amIn : dtr.amIn;
      dtr.amOut = amOut !== undefined ? amOut : dtr.amOut;
      dtr.pmIn = pmIn !== undefined ? pmIn : dtr.pmIn;
      dtr.pmOut = pmOut !== undefined ? pmOut : dtr.pmOut;
      dtr.notes = notes !== undefined ? notes : dtr.notes;
      dtr.correctedBy = req.session.user.name || 'User';
      dtr.correctedAt = new Date().toISOString();

      dtr.isOtApproved = isOtApproved;
      dtr.approvedOtHours = approvedOtHours;
      dtr.otApprovedBy = otApprovedBy;
      dtr.otApprovedAt = otApprovedAt;

      const c = DtrRecord.computeHours(dtr.amIn, dtr.amOut, dtr.pmIn, dtr.pmOut, isOtApproved, approvedOtHours);
      dtr.rawTotalHours = c.rawTotalHours;
      dtr.amHours = c.amHours;
      dtr.pmHours = c.pmHours;
      dtr.totalHours = c.totalHours; // Capped at 8.0 hrs unless OT approved
      dtr.isFullDuty = c.isFullDuty;
      dtr.dutyCredit = c.dutyCredit;
      dtr.undertimeMinutes = c.undertimeMinutes;
      dtr.overtimeHours = c.overtimeHours;
      dtr.pendingOtHours = c.pendingOtHours;
      dtr.status = dtr.isFullDuty ? '8-Hour Duty Completed' : (dtr.totalHours > 0 ? 'Undertime' : 'No Duty');
    }

    // Owner / Manager / HR manual duty hour override (if provided)
    if (isMgmt && req.body.dutyHoursOverride !== undefined && req.body.dutyHoursOverride !== '') {
      const overrideVal = parseFloat(req.body.dutyHoursOverride);
      if (!isNaN(overrideVal) && overrideVal >= 0) {
        dtr.totalHours = overrideVal;
        dtr.isManualAdjusted = 1;
        dtr.dutyCredit = Math.round((overrideVal / 8) * 100) / 100;
        dtr.notes = dtr.notes ? `${dtr.notes} [Adjusted: ${overrideVal} hrs]` : `[Adjusted: ${overrideVal} hrs]`;
      }
    }

    await dtr.save();

    let flashMsg = '';
    if (dtr.isFullDuty) {
      const otMsg = dtr.isOtApproved && dtr.overtimeHours > 0 ? ` (+${dtr.overtimeHours} hrs approved OT)` : '';
      flashMsg = `DTR for ${date} updated: 8-Hour Valid Duty Verified (8.00 hrs credited${otMsg}) ✅`;
    } else if (dtr.totalHours > 0) {
      flashMsg = `DTR for ${date} updated: ${dtr.totalHours} hrs credited (${dtr.undertimeMinutes} mins undertime)`;
    } else {
      flashMsg = `DTR for ${date} saved`;
    }

    req.flash('success_msg', flashMsg);
    const returnMonth = date.slice(0, 7);
    const returnUrl = req.headers.referer || `/hr/my/dtr?month=${returnMonth}`;
    res.redirect(returnUrl);
  } catch (err) {
    console.error('[hr] /my/dtr/correct error:', err);
    req.flash('error_msg', 'Failed to update DTR entry');
    res.redirect('/hr/my/dtr');
  }
});

// -------------------------------------------------------------
// PRINTABLE DOCUMENT ROUTES (Accessible to staff for own record, or managers)
// -------------------------------------------------------------

/**
 * GET /hr/print/payslip/:payrollId
 */
router.get('/print/payslip/:payrollId', canAccessOwnHR, async (req, res) => {
  try {
    const payroll = await PayrollRecord.findById(req.params.payrollId);
    if (!payroll) {
      req.flash('error_msg', 'Payslip not found');
      return res.redirect('/hr/my');
    }

    const employee = await Employee.findById(payroll.employeeId);
    // Security check: non-management can only print their OWN payslip
    if (!isManagement(req.session.user) && (!employee || employee.userId !== req.session.user.id)) {
      req.flash('error_msg', 'You are not authorized to view this payslip');
      return res.redirect('/hr/my');
    }

    res.render('hr/print/payslip', {
      layout: false,
      title: `Payslip — ${employee ? employee.name : 'Staff'} (${payroll.month})`,
      payroll,
      employee,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] print payslip error:', err);
    res.redirect('/hr/my');
  }
});

/**
 * GET /hr/print/coe/:employeeId
 */
router.get('/print/coe/:employeeId', canAccessOwnHR, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.employeeId);
    if (!employee) {
      req.flash('error_msg', 'Employee not found');
      return res.redirect('/hr/my');
    }

    // Security check
    if (!isManagement(req.session.user) && employee.userId !== req.session.user.id) {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/hr/my');
    }

    const includeSalary = req.query.salary === '1' && isManagement(req.session.user);

    // Resolve owner dynamically (Clinical vs X-Ray)
    const owner = getLaboratoryOwner(employee.department);

    res.render('hr/print/coe', {
      layout: false,
      title: `Certificate of Employment — ${employee.name}`,
      employee,
      includeSalary,
      owner,
      currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] print coe error:', err);
    res.redirect('/hr/my');
  }
});

/**
 * GET /hr/print/leave-form
 * Blank or employee-prefilled Leave Application Form
 */
router.get('/print/leave-form', canAccessOwnHR, async (req, res) => {
  try {
    let employee = null;
    if (req.query.employeeId && isManagement(req.session.user)) {
      employee = await Employee.findById(req.query.employeeId);
    }
    if (!employee) {
      employee = await Employee.findByUserId(req.session.user.id);
    }

    const owner = getLaboratoryOwner(employee ? employee.department : '');

    res.render('hr/print/leave', {
      layout: false,
      title: `Application for Leave — ${employee ? employee.name : 'Form'}`,
      employee,
      leave: null,
      owner,
      currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] print leave-form error:', err);
    res.redirect('/hr/my');
  }
});

/**
 * GET /hr/print/leave/:id
 * Completed Leave Application Form for a specific submitted leave request
 */
router.get('/print/leave/:id', canAccessOwnHR, async (req, res) => {
  try {
    const leave = await LeaveRecord.findById(req.params.id);
    if (!leave) {
      req.flash('error_msg', 'Leave application record not found');
      return res.redirect('/hr/my');
    }

    const employee = await Employee.findById(leave.employeeId);
    if (!employee) {
      req.flash('error_msg', 'Employee record not found');
      return res.redirect('/hr/my');
    }

    if (!isManagement(req.session.user) && employee.userId !== req.session.user.id) {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/hr/my');
    }

    const owner = getLaboratoryOwner(employee.department);

    res.render('hr/print/leave', {
      layout: false,
      title: `Application for Leave — ${employee.name} (${leave.leaveType})`,
      employee,
      leave,
      owner,
      currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] print leave record error:', err);
    res.redirect('/hr/my');
  }
});

/**
 * GET /hr/print/clearance/:employeeId
 */
router.get('/print/clearance/:employeeId', canAccessOwnHR, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.employeeId);
    if (!employee) {
      req.flash('error_msg', 'Employee not found');
      return res.redirect('/hr/my');
    }

    if (!isManagement(req.session.user) && employee.userId !== req.session.user.id) {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/hr/my');
    }

    const owner = getLaboratoryOwner(employee ? employee.department : '');

    res.render('hr/print/clearance', {
      layout: false,
      title: `Employee Clearance — ${employee.name}`,
      employee,
      owner,
      currentDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] print clearance error:', err);
    res.redirect('/hr/my');
  }
});

/**
 * GET /hr/print/tax-summary/:employeeId/:year
 */
router.get('/print/tax-summary/:employeeId/:year', canAccessOwnHR, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.employeeId);
    if (!employee) {
      req.flash('error_msg', 'Employee not found');
      return res.redirect('/hr/my');
    }

    if (!isManagement(req.session.user) && employee.userId !== req.session.user.id) {
      req.flash('error_msg', 'Access denied');
      return res.redirect('/hr/my');
    }

    const year = req.params.year || new Date().getFullYear().toString();
    const allPayrolls = await PayrollRecord.findByEmployeeId(employee.id);
    const yearPayrolls = allPayrolls.filter(p => p.month && p.month.startsWith(year));

    let totalGross = 0;
    let totalTaxWithheld = 0;
    let totalSss = 0;
    let totalPh = 0;
    let totalPagibig = 0;

    for (const p of yearPayrolls) {
      totalGross += (Number(p.grossPay) || 0);
      totalTaxWithheld += (Number(p.withholdingTax) || 0);
      totalSss += (Number(p.sssContribution) || 0);
      totalPh += (Number(p.philhealthContribution) || 0);
      totalPagibig += (Number(p.pagibigContribution) || 0);
    }

    const settings = (global.db && typeof global.db.getSettings === 'function')
      ? (global.db.getSettings() || {})
      : ((global.db && global.db.read && global.db.read().settings) || {});
    const labTin = settings.labTin || '009-876-543-000';
    const labName = settings.labName || 'GEZYNE CLINICAL LABORATORY';
    const labAddress = settings.labAddress || '0330 Vergel De Dios St., Poblacion, Plaridel, Bulacan';
    const labZipCode = settings.labZipCode || '3004';
    const labRdoCode = settings.labRdoCode || '025';

    const owner = getLaboratoryOwner(employee ? employee.department : '');

    res.render('hr/print/tax_summary', {
      layout: false,
      title: `BIR Form No. 2316 — ${employee.name} (${year})`,
      employee,
      owner,
      year,
      yearPayrolls,
      totalGross,
      totalTaxWithheld,
      totalSss,
      totalPh,
      totalPagibig,
      totalNonTaxable: totalSss + totalPh + totalPagibig,
      taxableIncome: Math.max(0, totalGross - (totalSss + totalPh + totalPagibig)),
      settings,
      labTin,
      labName,
      labAddress,
      labZipCode,
      labRdoCode,
      isMgmt: isManagement(req.session.user),
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] print tax summary error:', err);
    res.redirect('/hr/my');
  }
});

/**
 * POST /hr/quick-update-tins
 * Combined quick update for both Laboratory TIN and Employee TIN directly from the 2316 print preview or HR modal
 */
router.post('/quick-update-tins', async (req, res) => {
  try {
    if (!isManagement(req.session.user)) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, error: 'Access denied: Only Manager, Owner, or Admin can edit TIN information' });
      }
      req.flash('error_msg', 'Access denied: Only Manager, Owner, or Admin can edit TIN information');
      return res.redirect('/hr');
    }

    const { employeeId, employeeTin, labTin } = req.body;
    let labUpdated = false;
    let empUpdated = false;

    // Update Laboratory TIN if provided
    if (labTin !== undefined && labTin !== null) {
      let settings = {};
      if (global.db && typeof global.db.getSettings === 'function') {
        settings = global.db.getSettings() || {};
      } else if (global.db && typeof global.db.read === 'function') {
        const d = global.db.read();
        settings = (d && d.settings) || {};
      }
      settings.labTin = String(labTin).trim();
      if (req.body.labName) settings.labName = String(req.body.labName).trim();
      if (req.body.labAddress) settings.labAddress = String(req.body.labAddress).trim();
      if (req.body.labZipCode) settings.labZipCode = String(req.body.labZipCode).trim();
      if (req.body.labRdoCode) settings.labRdoCode = String(req.body.labRdoCode).trim();

      if (global.db && typeof global.db.setSettings === 'function') {
        global.db.setSettings(settings);
      } else if (global.db && typeof global.db.read === 'function') {
        const d = global.db.read();
        d.settings = settings;
        global.db.write(d);
      }
      labUpdated = true;
    }

    // Update Employee TIN if provided
    if (employeeId && employeeTin !== undefined) {
      const employee = await Employee.findById(employeeId);
      if (employee) {
        employee.tinNumber = String(employeeTin).trim();
        await employee.save();
        empUpdated = true;
      }
    }

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, labUpdated, empUpdated, message: 'TINs updated successfully' });
    }

    req.flash('success_msg', 'TIN information updated successfully');
    res.redirect(req.get('Referrer') || '/hr');
  } catch (err) {
    console.error('[hr] quick-update-tins error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to update TIN information');
    res.redirect(req.get('Referrer') || '/hr');
  }
});

/**
 * POST /hr/employees/:id/quick-tin
 * Quick update of an individual employee's TIN (Restricted to Manager, Owner, Admin)
 */
router.post('/employees/:id/quick-tin', async (req, res) => {
  try {
    if (!isManagement(req.session.user)) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, error: 'Access denied: Only Manager, Owner, or Admin can edit TIN numbers' });
      }
      req.flash('error_msg', 'Access denied: Only Manager, Owner, or Admin can edit TIN numbers');
      return res.redirect('/hr/employees');
    }

    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(404).json({ success: false, error: 'Employee not found' });
      }
      req.flash('error_msg', 'Employee not found');
      return res.redirect('/hr/employees');
    }

    const tin = (req.body.tinNumber || req.body.tin || '').trim();
    employee.tinNumber = tin;
    await employee.save();

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, employeeId: employee.id, tinNumber: employee.tinNumber });
    }

    req.flash('success_msg', `Updated BIR TIN for ${employee.name}`);
    res.redirect(req.get('Referrer') || `/hr/employees/${employee.id}`);
  } catch (err) {
    console.error('[hr] quick-tin error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to update employee TIN');
    res.redirect(req.get('Referrer') || '/hr/employees');
  }
});

/**
 * POST /hr/settings/lab-tax-info
 * Full update for Laboratory Tax Registration info from HR Management
 */
router.post('/settings/lab-tax-info', async (req, res) => {
  try {
    if (!isManagement(req.session.user)) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }
      req.flash('error_msg', 'Admin or Manager access required to edit Laboratory Tax Settings');
      return res.redirect('/hr');
    }

    let settings = {};
    if (global.db && typeof global.db.getSettings === 'function') {
      settings = global.db.getSettings() || {};
    } else if (global.db && typeof global.db.read === 'function') {
      const d = global.db.read();
      settings = (d && d.settings) || {};
    }

    if (req.body.labTin !== undefined) settings.labTin = String(req.body.labTin).trim();
    if (req.body.labName !== undefined) settings.labName = String(req.body.labName).trim();
    if (req.body.labAddress !== undefined) settings.labAddress = String(req.body.labAddress).trim();
    if (req.body.labZipCode !== undefined) settings.labZipCode = String(req.body.labZipCode).trim();
    if (req.body.labRdoCode !== undefined) settings.labRdoCode = String(req.body.labRdoCode).trim();

    if (global.db && typeof global.db.setSettings === 'function') {
      global.db.setSettings(settings);
    } else if (global.db && typeof global.db.read === 'function') {
      const d = global.db.read();
      d.settings = settings;
      global.db.write(d);
    }

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, settings });
    }

    req.flash('success_msg', 'Laboratory BIR & Tax Information updated successfully');
    res.redirect(req.get('Referrer') || '/hr');
  } catch (err) {
    console.error('[hr] lab-tax-info error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to update Laboratory Tax Information');
    res.redirect(req.get('Referrer') || '/hr');
  }
});

// -------------------------------------------------------------
// MANAGEMENT ROUTES (Admin, Manager, Owner ONLY)
// -------------------------------------------------------------

router.use(canAccessHR);

/**
 * GET /hr
 * HR Management Main Dashboard
 */
router.get('/', async (req, res) => {
  try {
    const currentMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const employees = await Employee.find();
    const activeEmployees = employees.filter(e => e.employmentStatus === 'Active');

    // Total monthly payroll projection & actual approved
    let projectedMonthlyPayroll = 0;
    let totalEmployerContributions = 0;
    const departmentCounts = {};

    for (const emp of activeEmployees) {
      projectedMonthlyPayroll += (Number(emp.basicSalary) || 0) + emp.totalAllowances;
      totalEmployerContributions += emp.estimatedEmployerContributions;
      const dept = emp.department || 'Clinical Laboratory';
      departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
    }

    // Recent payroll runs
    const recentPayrolls = (await PayrollRecord.find({ month: currentMonth })).slice(0, 10);
    const actualMonthlyCost = recentPayrolls.reduce((sum, p) => sum + (p.totalEmployerCost || 0), 0);

    // Pending leave requests
    const allLeaves = await LeaveRecord.find({ status: 'Pending' });

    const settings = (global.db && typeof global.db.getSettings === 'function')
      ? (global.db.getSettings() || {})
      : ((global.db && global.db.read && global.db.read().settings) || {});
    const labTin = settings.labTin || '009-876-543-000';
    const labName = settings.labName || 'GEZYNE CLINICAL LABORATORY';
    const labAddress = settings.labAddress || '0330 Vergel De Dios St., Poblacion, Plaridel, Bulacan';
    const labZipCode = settings.labZipCode || '3004';
    const labRdoCode = settings.labRdoCode || '025';

    res.render('hr/index', {
      title: 'HR & Payroll Management',
      currentMonth,
      employees,
      totalEmployees: employees.length,
      activeEmployeesCount: activeEmployees.length,
      projectedMonthlyPayroll,
      totalEmployerContributions,
      actualMonthlyCost,
      departmentCounts,
      recentPayrolls,
      pendingLeavesCount: allLeaves.length,
      pendingLeaves: allLeaves.slice(0, 5),
      settings,
      labTin,
      labName,
      labAddress,
      labZipCode,
      labRdoCode,
      isMgmt: isManagement(req.session.user),
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] Dashboard error:', err);
    req.flash('error_msg', 'Failed to load HR dashboard');
    res.redirect('/dashboard');
  }
});

/**
 * GET /hr/employees
 * Employee Directory
 */
router.get('/employees', async (req, res) => {
  try {
    const deptFilter = req.query.department || '';
    const statusFilter = req.query.status || '';
    const search = (req.query.search || '').toLowerCase().trim();

    let employees = await Employee.find();

    // Auto-sync: if any user in db doesn't have an Employee record yet, create default
    const allUsers = (global.db && typeof global.db.getUsers === 'function') ? global.db.getUsers() : [];
    const existingUserIds = new Set(employees.map(e => e.userId));

    for (const u of allUsers) {
      if (u && u.id && !existingUserIds.has(u.id)) {
        const newEmp = new Employee({
          userId: u.id,
          employeeCode: `EMP-${(u.name || 'STF').slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-4)}`,
          department: u.role === 'Receptionist' ? 'Reception' : (u.role.includes('X-Ray') || u.role.includes('Radiol') ? 'Radiology' : 'Clinical Laboratory'),
          position: u.role || 'Staff'
        });
        await newEmp.save();
        employees.push(newEmp);
        existingUserIds.add(u.id);
      }
    }

    if (deptFilter) {
      employees = employees.filter(e => e.department === deptFilter);
    }
    if (statusFilter) {
      employees = employees.filter(e => e.employmentStatus === statusFilter);
    }
    if (search) {
      employees = employees.filter(e => {
        return (e.name && e.name.toLowerCase().includes(search)) ||
               (e.employeeCode && e.employeeCode.toLowerCase().includes(search)) ||
               (e.position && e.position.toLowerCase().includes(search));
      });
    }

    res.render('hr/employees/index', {
      title: 'Employee Directory',
      employees,
      deptFilter,
      statusFilter,
      search,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] Employees list error:', err);
    req.flash('error_msg', 'Failed to load employees list');
    res.redirect('/hr');
  }
});

/**
 * GET /hr/employees/new
 */
router.get('/employees/new', async (req, res) => {
  try {
    const allUsers = (global.db && typeof global.db.getUsers === 'function') ? global.db.getUsers() : [];
    const employees = await Employee.find();
    const assignedUserIds = new Set(employees.map(e => e.userId));
    const availableUsers = allUsers.filter(u => u && !assignedUserIds.has(u.id));

    res.render('hr/employees/form', {
      title: 'Add New Employee Record',
      employee: new Employee(),
      availableUsers,
      isEdit: false,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] New employee error:', err);
    res.redirect('/hr/employees');
  }
});

/**
 * POST /hr/employees
 */
router.post('/employees', async (req, res) => {
  try {
    const body = req.body;
    if (!body.userId && !body.employeeCode) {
      req.flash('error_msg', 'User selection and Employee Code are required');
      return res.redirect('/hr/employees/new');
    }

    const employee = new Employee({
      ...body,
      basicSalary: parseFloat(body.basicSalary) || 0,
      riceAllowance: parseFloat(body.riceAllowance) || 0,
      transportAllowance: parseFloat(body.transportAllowance) || 0,
      mealAllowance: parseFloat(body.mealAllowance) || 0,
      otherAllowances: parseFloat(body.otherAllowances) || 0
    });

    await employee.save();
    req.flash('success_msg', `Employee record for "${employee.name}" created successfully`);
    res.redirect(`/hr/employees/${employee.id}`);
  } catch (err) {
    console.error('[hr] Save employee error:', err);
    req.flash('error_msg', 'Failed to save employee record');
    res.redirect('/hr/employees');
  }
});

/**
 * GET /hr/employees/:id
 * Full Employee Profile
 */
router.get('/employees/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      req.flash('error_msg', 'Employee not found');
      return res.redirect('/hr/employees');
    }

    const payrolls = await PayrollRecord.findByEmployeeId(employee.id);
    const documents = await HrDocument.findByEmployeeId(employee.id);
    const leaves = await LeaveRecord.findByEmployeeId(employee.id);
    const statutory = computeAllContributions(employee.basicSalary, employee.salaryFrequency);

    res.render('hr/employees/show', {
      title: `Employee Profile — ${employee.name}`,
      employee,
      payrolls,
      documents,
      leaves,
      statutory,
      isMgmt: isManagement(req.session.user),
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] Show employee error:', err);
    res.redirect('/hr/employees');
  }
});

/**
 * GET /hr/employees/:id/edit
 */
router.get('/employees/:id/edit', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      req.flash('error_msg', 'Employee not found');
      return res.redirect('/hr/employees');
    }

    const allUsers = (global.db && typeof global.db.getUsers === 'function') ? global.db.getUsers() : [];

    res.render('hr/employees/form', {
      title: `Edit Employee — ${employee.name}`,
      employee,
      availableUsers: allUsers,
      isEdit: true,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] Edit employee form error:', err);
    res.redirect('/hr/employees');
  }
});

/**
 * POST /hr/employees/:id
 * Update employee record
 */
router.post('/employees/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      req.flash('error_msg', 'Employee not found');
      return res.redirect('/hr/employees');
    }

    const b = req.body;
    employee.employeeCode = b.employeeCode || employee.employeeCode;
    employee.department = b.department || employee.department;
    employee.position = b.position || employee.position;
    employee.employmentType = b.employmentType || employee.employmentType;
    employee.dateHired = b.dateHired || employee.dateHired;
    employee.dateRegularized = b.dateRegularized || employee.dateRegularized;
    employee.employmentStatus = b.employmentStatus || employee.employmentStatus;

    // Compensation (Duty Pay)
    if (b.dailyRate !== undefined && b.dailyRate !== '') {
      employee.dailyRate = parseFloat(b.dailyRate) || 0;
      employee.basicSalary = parseFloat(b.basicSalary) || Math.round(employee.dailyRate * 22 * 100) / 100;
    } else {
      employee.basicSalary = parseFloat(b.basicSalary) || employee.basicSalary;
      employee.dailyRate = parseFloat(b.dailyRate) || Math.round((employee.basicSalary / 22) * 100) / 100;
    }
    employee.salaryFrequency = b.salaryFrequency || employee.salaryFrequency || 'Per Duty / Day';
    employee.hourlyRate = parseFloat(b.hourlyRate) || (employee.dailyRate > 0 ? Math.round((employee.dailyRate / 8) * 100) / 100 : 0);
    employee.isTaxExempt = (b.isTaxExempt === '1' || b.isTaxExempt === 1 || b.isTaxExempt === 'true' || b.isTaxExempt === 'on') ? 1 : 0;

    // Allowances
    employee.riceAllowance = parseFloat(b.riceAllowance) || 0;
    employee.transportAllowance = parseFloat(b.transportAllowance) || 0;
    employee.mealAllowance = parseFloat(b.mealAllowance) || 0;
    employee.otherAllowances = parseFloat(b.otherAllowances) || 0;
    employee.allowancesNotes = b.allowancesNotes || '';

    // Gov IDs
    employee.sssNumber = b.sssNumber || '';
    employee.philhealthNumber = b.philhealthNumber || '';
    employee.pagibigNumber = b.pagibigNumber || '';
    employee.tinNumber = b.tinNumber || '';

    // Bank
    employee.bankName = b.bankName || '';
    employee.bankAccountNumber = b.bankAccountNumber || '';
    employee.bankAccountName = b.bankAccountName || '';

    // Emergency Contact
    employee.emergencyContactName = b.emergencyContactName || '';
    employee.emergencyContactPhone = b.emergencyContactPhone || '';
    employee.emergencyContactRelation = b.emergencyContactRelation || '';

    // Personal
    employee.birthDate = b.birthDate || employee.birthDate;
    employee.civilStatus = b.civilStatus || employee.civilStatus;
    employee.numberOfDependents = parseInt(b.numberOfDependents, 10) || 0;
    employee.permanentAddress = b.permanentAddress || '';
    employee.presentAddress = b.presentAddress || '';
    employee.contactPhone = b.contactPhone || '';

    // Leave Balances
    if (b.vacationLeaveBalance !== undefined) employee.vacationLeaveBalance = parseFloat(b.vacationLeaveBalance) || 0;
    if (b.sickLeaveBalance !== undefined) employee.sickLeaveBalance = parseFloat(b.sickLeaveBalance) || 0;
    employee.notes = b.notes || employee.notes;

    employee.isTaxExempt = (b.isTaxExempt === '1' || b.isTaxExempt === 1 || b.isTaxExempt === 'true' || b.isTaxExempt === 'on') ? 1 : 0;

    await employee.save();
    req.flash('success_msg', 'Employee record updated successfully');
    res.redirect(`/hr/employees/${employee.id}`);
  } catch (err) {
    console.error('[hr] Update employee error:', err);
    req.flash('error_msg', 'Failed to update employee record');
    res.redirect(`/hr/employees/${req.params.id}`);
  }
});

/**
 * POST /hr/employees/:id/quick-salary
 * Fast-update basic pay, pay frequency, tax exemption, and optional de minimis allowances
 */
router.post('/employees/:id/quick-salary', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      req.flash('error_msg', 'Employee not found');
      return res.redirect('/hr/employees');
    }

    const { 
      payType, 
      dailyRate, 
      fixedMonthlyPay, 
      basicSalary, 
      salaryFrequency, 
      isTaxExempt, 
      isPayrollExempt, 
      maxDaysPerWeek,
      riceAllowance, 
      transportAllowance, 
      mealAllowance 
    } = req.body;

    employee.payType = payType || (employee.isDoctorOrPathologist() ? 'Fixed Monthly' : 'Daily Duty');

    if (employee.payType === 'Commission Only' || isPayrollExempt === '1' || isPayrollExempt === 1) {
      employee.payType = 'Commission Only';
      employee.isPayrollExempt = 1;
      employee.dailyRate = 0;
      employee.basicSalary = 0;
      employee.hourlyRate = 0;
      employee.maxDaysPerWeek = 0;
      employee.salaryFrequency = 'Commission Only';
    } else if (employee.payType === 'Fixed Monthly') {
      employee.isPayrollExempt = 0;
      employee.basicSalary = parseFloat(fixedMonthlyPay !== undefined && fixedMonthlyPay !== '' ? fixedMonthlyPay : basicSalary) || 0;
      employee.dailyRate = 0;
      employee.hourlyRate = employee.basicSalary > 0 ? Math.round((employee.basicSalary / (22 * 8)) * 100) / 100 : 0;
      employee.maxDaysPerWeek = 0;
      employee.salaryFrequency = 'Monthly';
    } else {
      // Daily Duty Staff
      employee.payType = 'Daily Duty';
      employee.isPayrollExempt = 0;
      employee.dailyRate = parseFloat(dailyRate !== undefined && dailyRate !== '' ? dailyRate : (basicSalary ? basicSalary / 22 : 0)) || 0;
      employee.basicSalary = Math.round(employee.dailyRate * 22 * 100) / 100;
      employee.hourlyRate = employee.dailyRate > 0 ? Math.round((employee.dailyRate / 8) * 100) / 100 : 0;
      employee.maxDaysPerWeek = maxDaysPerWeek !== undefined && maxDaysPerWeek !== '' ? Number(maxDaysPerWeek) : 5;
      employee.salaryFrequency = salaryFrequency || 'Per Duty / Day';
    }

    employee.isTaxExempt = (isTaxExempt === '1' || isTaxExempt === 1 || isTaxExempt === 'true' || isTaxExempt === 'on') ? 1 : 0;

    if (riceAllowance !== undefined && riceAllowance !== '') employee.riceAllowance = parseFloat(riceAllowance) || 0;
    if (transportAllowance !== undefined && transportAllowance !== '') employee.transportAllowance = parseFloat(transportAllowance) || 0;
    if (mealAllowance !== undefined && mealAllowance !== '') employee.mealAllowance = parseFloat(mealAllowance) || 0;

    await employee.save();

    let flashMsg = '';
    if (employee.payType === 'Commission Only') {
      flashMsg = `Compensation updated for ${employee.name}: Commission Only / Lab Share (Payroll Exempt)`;
    } else if (employee.payType === 'Fixed Monthly') {
      flashMsg = `Compensation updated for ${employee.name}: Fixed ₱${employee.basicSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}/month (Doctor Retainer) - ${employee.isTaxExempt ? 'Tax Exempt (0% W-Tax)' : 'Subject to TRAIN Tax'}`;
    } else {
      flashMsg = `Duty pay updated for ${employee.name}: ₱${employee.dailyRate.toLocaleString('en-US', { minimumFractionDigits: 2 })}/duty day (Max 5 days/wk, ~₱${employee.basicSalary.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo) - ${employee.isTaxExempt ? 'Tax Exempt (0% W-Tax)' : 'Subject to TRAIN Tax'}`;
    }

    req.flash('success_msg', flashMsg);
    const returnUrl = req.headers.referer || '/hr/employees';
    res.redirect(returnUrl);
  } catch (err) {
    console.error('[hr] quick-salary error:', err);
    req.flash('error_msg', 'Failed to update compensation');
    res.redirect('/hr/employees');
  }
});

/**
 * POST /hr/employees/:id/resign
 */
router.post('/employees/:id/resign', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      req.flash('error_msg', 'Employee not found');
      return res.redirect('/hr/employees');
    }

    employee.employmentStatus = 'Resigned';
    employee.dateResigned = req.body.dateResigned || new Date().toISOString().slice(0, 10);
    employee.resignationReason = req.body.resignationReason || 'Voluntary resignation';
    await employee.save();

    req.flash('success_msg', `Employee "${employee.name}" marked as Resigned. Clearance form can now be generated.`);
    res.redirect(`/hr/employees/${employee.id}`);
  } catch (err) {
    console.error('[hr] Resign employee error:', err);
    res.redirect('/hr/employees');
  }
});

/**
 * GET /hr/payroll
 * Payroll Register
 */
router.get('/payroll', async (req, res) => {
  try {
    const selectedMonth = req.query.month || new Date().toISOString().slice(0, 7);
    const statusFilter = req.query.status || '';

    let records = await PayrollRecord.findByMonth(selectedMonth);
    if (statusFilter) {
      records = records.filter(p => p.status === statusFilter);
    }

    const totalGross = records.reduce((s, p) => s + (p.grossPay || 0), 0);
    const totalDeductions = records.reduce((s, p) => s + (p.totalDeductions || 0), 0);
    const totalNet = records.reduce((s, p) => s + (p.netPay || 0), 0);
    const totalEmployerCost = records.reduce((s, p) => s + (p.totalEmployerCost || 0), 0);

    res.render('hr/payroll/index', {
      title: 'Payroll Management',
      records,
      selectedMonth,
      statusFilter,
      totalGross,
      totalDeductions,
      totalNet,
      totalEmployerCost,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] Payroll index error:', err);
    req.flash('error_msg', 'Failed to load payroll records');
    res.redirect('/hr');
  }
});

/**
 * GET /hr/payroll/compute
 * Payroll Computation Wizard Page
 */
router.get('/payroll/compute', async (req, res) => {
  try {
    const activeEmployees = await Employee.find({ employmentStatus: 'Active' });
    res.render('hr/payroll/compute', {
      title: 'Run Payroll Computation',
      activeEmployees,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] Payroll compute error:', err);
    res.redirect('/hr/payroll');
  }
});

/**
 * POST /hr/payroll/compute
 * Execute computation for active employees
 */
router.post('/payroll/compute', async (req, res) => {
  try {
    const { payPeriodStart, payPeriodEnd, payDate, frequency, selectedEmployeeIds } = req.body;

    if (!payPeriodStart || !payPeriodEnd) {
      req.flash('error_msg', 'Pay period start and end dates are required');
      return res.redirect('/hr/payroll/compute');
    }

    let employeesToCompute = [];
    if (selectedEmployeeIds) {
      const ids = Array.isArray(selectedEmployeeIds) ? selectedEmployeeIds : [selectedEmployeeIds];
      for (const id of ids) {
        const emp = await Employee.findById(id);
        if (emp) employeesToCompute.push(emp);
      }
    } else {
      employeesToCompute = await Employee.find({ employmentStatus: 'Active' });
    }

    // Exclude doctors who only take patient commission (payroll-exempt)
    employeesToCompute = employeesToCompute.filter(e => !e.isPayrollExempt && e.payType !== 'Commission Only');

    let computedCount = 0;
    const currentMonth = payPeriodEnd.slice(0, 7);

    for (const emp of employeesToCompute) {
      const result = computePayrollForEmployee(emp, {
        payPeriodStart,
        payPeriodEnd,
        payDate,
        frequency: frequency || emp.salaryFrequency || 'Monthly',
        computedBy: req.session?.user?.name || 'Manager'
      });

      const payroll = new PayrollRecord(result);
      await payroll.save();
      computedCount++;
    }

    req.flash('success_msg', `Successfully computed payroll for ${computedCount} staff members`);
    res.redirect(`/hr/payroll?month=${currentMonth}`);
  } catch (err) {
    console.error('[hr] Compute payroll execute error:', err);
    req.flash('error_msg', 'Failed to execute payroll computation');
    res.redirect('/hr/payroll/compute');
  }
});

/**
 * GET /hr/payroll/:id
 */
router.get('/payroll/:id', async (req, res) => {
  try {
    const payroll = await PayrollRecord.findById(req.params.id);
    if (!payroll) {
      req.flash('error_msg', 'Payroll record not found');
      return res.redirect('/hr/payroll');
    }

    const employee = await Employee.findById(payroll.employeeId);
    res.render('hr/payroll/show', {
      title: `Payroll Details — ${employee ? employee.name : 'Staff'}`,
      payroll,
      employee,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('[hr] Payroll show error:', err);
    res.redirect('/hr/payroll');
  }
});

/**
 * POST /hr/payroll/:id/approve
 * Approves payroll AND auto-records the personnel expense in Costing module!
 */
router.post('/payroll/:id/approve', async (req, res) => {
  try {
    const payroll = await PayrollRecord.findById(req.params.id);
    if (!payroll) {
      req.flash('error_msg', 'Payroll record not found');
      return res.redirect('/hr/payroll');
    }

    payroll.status = 'Approved';
    payroll.approvedBy = req.session?.user?.name || 'Owner';
    payroll.approvedAt = new Date().toISOString();
    await payroll.save();

    // Auto-record personnel expense in Costing module
    try {
      const emp = payroll.getEmployee();
      const expDate = payroll.payDate || payroll.payPeriodEnd;
      const expense = new Expense({
        category: 'personnel',
        subcategory: emp ? emp.department : 'General Staff',
        description: `Payroll: ${emp ? emp.name : 'Staff'} (${payroll.payPeriodStart.slice(0, 10)} to ${payroll.payPeriodEnd.slice(0, 10)})`,
        amount: payroll.totalEmployerCost,
        currency: 'PHP',
        referenceId: payroll.id,
        referenceType: 'payroll',
        expenseDate: expDate,
        month: payroll.month || expDate.slice(0, 7),
        recordedBy: req.session?.user?.name || 'System'
      });
      await expense.save();
    } catch (expErr) {
      console.warn('[hr] Auto-recording payroll to expenses failed:', expErr.message);
    }

    req.flash('success_msg', 'Payroll approved and personnel cost recorded in Costing module');
    res.redirect(`/hr/payroll/${payroll.id}`);
  } catch (err) {
    console.error('[hr] Approve payroll error:', err);
    req.flash('error_msg', 'Failed to approve payroll');
    res.redirect('/hr/payroll');
  }
});

/**
 * POST /hr/payroll/:id/mark-paid
 */
router.post('/payroll/:id/mark-paid', async (req, res) => {
  try {
    const payroll = await PayrollRecord.findById(req.params.id);
    if (payroll) {
      payroll.status = 'Paid';
      payroll.paidVia = req.body.paidVia || payroll.paidVia;
      await payroll.save();
      req.flash('success_msg', 'Payroll marked as Paid');
    }
    res.redirect(`/hr/payroll/${req.params.id}`);
  } catch (err) {
    res.redirect('/hr/payroll');
  }
});

/**
 * GET /hr/documents
 * List all HR documents
 */
router.get('/documents', async (req, res) => {
  try {
    const documents = await HrDocument.find();
    const employees = await Employee.find();

    const settings = (global.db && typeof global.db.getSettings === 'function')
      ? (global.db.getSettings() || {})
      : ((global.db && global.db.read && global.db.read().settings) || {});
    const labTin = settings.labTin || '009-876-543-000';
    const labName = settings.labName || 'GEZYNE CLINICAL LABORATORY';
    const labAddress = settings.labAddress || '0330 Vergel De Dios St., Poblacion, Plaridel, Bulacan';
    const labZipCode = settings.labZipCode || '3004';
    const labRdoCode = settings.labRdoCode || '025';

    res.render('hr/documents/index', {
      title: 'HR Documents & Tax Forms',
      documents,
      employees,
      settings,
      labTin,
      labName,
      labAddress,
      labZipCode,
      labRdoCode,
      isMgmt: isManagement(req.session.user),
      sessionUser: req.session.user
    });
  } catch (err) {
    res.redirect('/hr');
  }
});

/**
 * POST /hr/documents/upload
 * Upload Tax Forms, Contracts, Memos
 */
router.post('/documents/upload', upload.single('documentFile'), async (req, res) => {
  try {
    const { employeeId, documentType, title, description, forPeriod } = req.body;

    if (!employeeId || !title || !req.file) {
      req.flash('error_msg', 'Employee, title, and file are required');
      return res.redirect('/hr/documents');
    }

    const doc = new HrDocument({
      employeeId,
      documentType: documentType || 'Other',
      title: title.trim(),
      description: description || '',
      filePath: `/hr-documents/${req.file.filename}`,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      forPeriod: forPeriod || null,
      generatedBy: req.session?.user?.name || 'HR Admin',
      isGenerated: 0
    });

    await doc.save();
    req.flash('success_msg', 'Document uploaded successfully');
    res.redirect(`/hr/employees/${employeeId}`);
  } catch (err) {
    console.error('[hr] Upload document error:', err);
    req.flash('error_msg', 'Failed to upload document');
    res.redirect('/hr/documents');
  }
});

/**
 * GET /hr/leaves
 * Manage leave requests
 */
router.get('/leaves', async (req, res) => {
  try {
    const statusFilter = req.query.status || '';
    let leaves = await LeaveRecord.find();
    if (statusFilter) {
      leaves = leaves.filter(l => l.status === statusFilter);
    }

    res.render('hr/leaves/index', {
      title: 'Leave Requests Management',
      leaves,
      statusFilter,
      sessionUser: req.session.user
    });
  } catch (err) {
    res.redirect('/hr');
  }
});

/**
 * POST /hr/leaves/:id/approve
 */
router.post('/leaves/:id/approve', async (req, res) => {
  try {
    const leave = await LeaveRecord.findById(req.params.id);
    if (leave) {
      await leave.approve(req.session?.user?.name || 'Manager');
      req.flash('success_msg', 'Leave request approved');
    }
    res.redirect('/hr/leaves');
  } catch (err) {
    req.flash('error_msg', 'Failed to approve leave');
    res.redirect('/hr/leaves');
  }
});

/**
 * POST /hr/leaves/:id/reject
 */
router.post('/leaves/:id/reject', async (req, res) => {
  try {
    const leave = await LeaveRecord.findById(req.params.id);
    if (leave) {
      await leave.reject(req.session?.user?.name || 'Manager', req.body.reason || '');
      req.flash('success_msg', 'Leave request rejected');
    }
    res.redirect('/hr/leaves');
  } catch (err) {
    req.flash('error_msg', 'Failed to reject leave');
    res.redirect('/hr/leaves');
  }
});

/**
 * GET /hr/export/:type
 * Export HR data to Excel
 */
router.get('/export/:type', async (req, res) => {
  try {
    const type = req.params.type; // 'employees' or 'payroll'
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Gezyne Clinical Laboratory HR';

    if (type === 'employees') {
      const sheet = workbook.addWorksheet('Employee Masterlist');
      sheet.columns = [
        { header: 'Employee Code', key: 'code', width: 16 },
        { header: 'Full Name', key: 'name', width: 25 },
        { header: 'Department', key: 'department', width: 22 },
        { header: 'Position', key: 'position', width: 25 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Date Hired', key: 'dateHired', width: 14 },
        { header: 'Basic Salary (PHP)', key: 'salary', width: 18 },
        { header: 'SSS #', key: 'sss', width: 16 },
        { header: 'PhilHealth #', key: 'philhealth', width: 16 },
        { header: 'Pag-IBIG #', key: 'pagibig', width: 16 },
        { header: 'TIN #', key: 'tin', width: 16 }
      ];

      const employees = await Employee.find();
      for (const e of employees) {
        sheet.addRow({
          code: e.employeeCode,
          name: e.name,
          department: e.department,
          position: e.position,
          status: e.employmentStatus,
          dateHired: e.dateHired,
          salary: Number(e.basicSalary) || 0,
          sss: e.sssNumber,
          philhealth: e.philhealthNumber,
          pagibig: e.pagibigNumber,
          tin: e.tinNumber
        });
      }
    } else {
      // Payroll Summary
      const month = req.query.month || new Date().toISOString().slice(0, 7);
      const sheet = workbook.addWorksheet(`Payroll ${month}`);
      sheet.columns = [
        { header: 'Employee Code', key: 'code', width: 16 },
        { header: 'Name', key: 'name', width: 25 },
        { header: 'Department', key: 'department', width: 20 },
        { header: 'Basic Pay', key: 'basic', width: 14 },
        { header: 'Gross Pay', key: 'gross', width: 14 },
        { header: 'SSS EE', key: 'sssEE', width: 12 },
        { header: 'PhilHealth EE', key: 'phEE', width: 14 },
        { header: 'Pag-IBIG EE', key: 'hdmfEE', width: 14 },
        { header: 'Withholding Tax', key: 'tax', width: 16 },
        { header: 'Total Deductions', key: 'deductions', width: 16 },
        { header: 'Net Pay', key: 'net', width: 14 },
        { header: 'Total Employer Cost', key: 'erCost', width: 20 },
        { header: 'Status', key: 'status', width: 12 }
      ];

      const records = await PayrollRecord.findByMonth(month);
      for (const p of records) {
        const emp = p.getEmployee();
        sheet.addRow({
          code: emp ? emp.employeeCode : '',
          name: emp ? emp.name : '',
          department: emp ? emp.department : '',
          basic: p.basicPay,
          gross: p.grossPay,
          sssEE: p.sssContribution,
          phEE: p.philhealthContribution,
          hdmfEE: p.pagibigContribution,
          tax: p.withholdingTax,
          deductions: p.totalDeductions,
          net: p.netPay,
          erCost: p.totalEmployerCost,
          status: p.status
        });
      }
    }

    const filename = `HR_${type}_${Date.now()}.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[hr] Export error:', err);
    res.redirect('/hr');
  }
});

module.exports = router;
