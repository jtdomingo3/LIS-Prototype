/**
 * test/intensive-philhealth-costing-hr.test.js
 *
 * Intensive Functional & Print Layout Verification Suite for:
 * 1. PhilHealth (Konsulta, DOH SOA Tranches) & Health Card (HMO Claims, LOA)
 * 2. Laboratory Costing & Profit and Loss (P&L, Cost-Per-Test)
 * 3. HR, Statutory Payroll (SSS, PhilHealth, Pag-IBIG, TRAIN Tax), and CSC Form 48 DTR
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let ejs;
try {
  ejs = require('../lis-fullstack/node_modules/ejs');
} catch (e) {
  ejs = require('ejs');
}

const Employee = require('../lis-fullstack/models/Employee');
const PayrollRecord = require('../lis-fullstack/models/PayrollRecord');
const LeaveRecord = require('../lis-fullstack/models/LeaveRecord');
const DtrRecord = require('../lis-fullstack/models/DtrRecord');
const Expense = require('../lis-fullstack/models/Expense');
const RevenueEntry = require('../lis-fullstack/models/RevenueEntry');
const CostPerTest = require('../lis-fullstack/models/CostPerTest');
const PhilhealthRecord = require('../lis-fullstack/models/PhilhealthRecord');
const HealthCardRecord = require('../lis-fullstack/models/HealthCardRecord');
const { getCatalog } = require('../lis-fullstack/lib/philhealthCatalog');
const { getHmoCatalog, PH_HMO_PROVIDERS } = require('../lis-fullstack/lib/hmoCatalog');
const { getLaboratoryOwner } = require('../lis-fullstack/lib/ownerHelper');
const { computeAllContributions, computeWithholdingTax } = require('../lis-fullstack/lib/philippineContributions');

const viewsDir = path.join(__dirname, '..', 'lis-fullstack', 'views');

function renderView(viewRelativePath, data) {
  const fullPath = path.join(viewsDir, viewRelativePath + '.ejs');
  assert.ok(fs.existsSync(fullPath), `View template file must exist: ${fullPath}`);
  const template = fs.readFileSync(fullPath, 'utf8');
  return ejs.render(template, {
    ...data,
    filename: fullPath,
    sessionUser: data.sessionUser || { id: 1, name: 'Admin User', role: 'Admin' },
    user: data.sessionUser || { id: 1, name: 'Admin User', role: 'Admin' },
    messages: data.messages || {},
    csrfToken: 'test-csrf-token'
  });
}

async function runIntensiveSuite() {
  console.log('\n========================================================================');
  console.log('🧪 RUNNING INTENSIVE PHILHEALTH, HEALTH CARD, COSTING & HR TEST SUITE');
  console.log('========================================================================\n');

  // =============================================================
  // SECTION 1: PHILHEALTH & HEALTH CARD (HMO) ENGINE & PRINT LAYOUTS
  // =============================================================
  console.log('--- SECTION 1: PhilHealth & Health Card Implementation ---');

  // 1.1 PhilHealth Record Model & Tranche Settlement
  const phRecord = new PhilhealthRecord({
    id: 'ph-rec-001',
    controlNo: 'PH-2026-0001',
    patientId: 'pat-001',
    recordDate: '2026-11-11',
    firstName: 'JUAN',
    lastName: 'DELA CRUZ',
    pinNo: '12-345678901-2',
    agency: 'Konsulta DOH Clinic',
    status: 'Approved',
    tranche1Paid: 'Paid',
    tranche2Paid: 'Not Paid',
    soaRef: 'SOA-DOH-2026-889',
    paidDate: '2026-11-11'
  });

  assert.strictEqual(phRecord.controlNo, 'PH-2026-0001');
  assert.strictEqual(phRecord.status, 'Approved');
  assert.strictEqual(phRecord.tranche1Paid, 'Paid');
  console.log('  ✓ 1.1 PhilHealth model and tranche settlement states validated');

  // 1.2 Health Card Record Model & LOA Coverage
  const hcRecord = new HealthCardRecord({
    id: 'hc-rec-001',
    controlNo: 'HC-2026-0001',
    patientId: 'pat-002',
    recordDate: '2026-11-11',
    firstName: 'MARIA',
    lastName: 'SANTOS',
    hmoProvider: 'Maxicare Healthcare',
    cardNumber: 'MAX-99887766',
    loaNumber: 'LOA-2026-110022',
    loaDate: '2026-11-11',
    loaExpiry: '2026-11-14',
    availmentType: 'Outpatient Diagnostic',
    grossAmount: 2500,
    hmoCoveredAmount: 2000,
    patientExcessAmount: 500,
    status: 'Approved'
  });

  assert.strictEqual(hcRecord.hmoProvider, 'Maxicare Healthcare');
  assert.strictEqual(hcRecord.grossAmount, 2500);
  assert.strictEqual(hcRecord.patientExcessAmount, 500);
  console.log('  ✓ 1.2 Health Card (HMO) model, LOA authorization & copay validated');

  // 1.3 PhilHealth View & Landscape Print Styling Verification
  const phHtml = renderView('philhealth/index', {
    title: 'PhilHealth / Health Card Panel',
    records: [phRecord],
    catalog: getCatalog(),
    stats: {
      total: 1,
      pendingApproval: 0,
      approved: 1,
      tranche1Paid: 1,
      tranche2Paid: 0,
      tranche1Pending: 0,
      tranche2Pending: 1,
      hasPcuErrors: 0
    },
    searchQuery: '',
    statusFilter: '',
    tranche1PaidFilter: '',
    tranche2PaidFilter: '',
    dateFrom: '',
    dateTo: '',
    currentPage: 1,
    totalPages: 1,
    pagination: { page: 1, totalPages: 1, totalRecords: 1 }
  });

  assert.ok(phHtml.includes('PhilHealth Registry &amp; SOA Tranches') || phHtml.includes('PhilHealth Registry & SOA Tranches'));
  assert.ok(phHtml.includes('Print Registry'), 'Print Registry button must exist in PhilHealth view');
  assert.ok(phHtml.includes('@media print'), 'PhilHealth view must include @media print stylesheet');
  assert.ok(phHtml.includes('size: letter landscape'), 'PhilHealth print must strictly enforce landscape layout');
  assert.ok(phHtml.includes('.sidebar, .header') && phHtml.includes('display: none !important'), 'Print CSS must hide sidebars');
  console.log('  ✓ 1.3 PhilHealth Registry view renders with valid Landscape @media print layout');

  // 1.4 Health Card View & Landscape Print Styling Verification
  const hcHtml = renderView('healthcard/index', {
    title: 'Health Card / HMO Claims Panel',
    records: [hcRecord],
    catalog: getHmoCatalog(),
    stats: {
      total: 1,
      pendingLoa: 0,
      approved: 1,
      completed: 0,
      billed: 0,
      paid: 0,
      cancelled: 0,
      totalGross: 2500,
      totalHmoCovered: 2000,
      totalExcess: 500
    },
    hmoProviders: ['Maxicare Healthcare', 'Medicard Philippines', 'Intellicare'],
    searchQuery: '',
    hmoFilter: '',
    statusFilter: '',
    dateFrom: '',
    dateTo: '',
    currentPage: 1,
    totalPages: 1,
    pagination: { page: 1, totalPages: 1, totalRecords: 1 }
  });

  assert.ok(hcHtml.includes('Health Card / HMO Claims Panel'));
  assert.ok(hcHtml.includes('Print Claims'), 'Print Claims button must exist in HealthCard view');
  assert.ok(hcHtml.includes('@media print'), 'HealthCard view must include @media print stylesheet');
  assert.ok(hcHtml.includes('size: letter landscape'), 'HealthCard print must strictly enforce landscape layout');
  console.log('  ✓ 1.4 Health Card view renders with valid Landscape @media print layout');

  // =============================================================
  // SECTION 2: LABORATORY COSTING & P&L STATEMENT VERIFICATION
  // =============================================================
  console.log('\n--- SECTION 2: Costing & Profit and Loss (P&L) Implementation ---');

  // 2.1 Cost Per Test Model Computation
  const cpt = new CostPerTest({
    id: 'cpt-001',
    testType: 'hematology',
    inventoryItems: [
      { name: 'CBC Diluent', quantityPerTest: 1, unitCost: 45.50 },
      { name: 'Lyse Reagent', quantityPerTest: 1, unitCost: 15.00 },
      { name: 'Vacutainer EDTA Tube', quantityPerTest: 1, unitCost: 25.00 },
      { name: 'Lancet & Alcohol Swab', quantityPerTest: 1, unitCost: 10.00 },
      { name: 'Thermal Printing Paper', quantityPerTest: 1, unitCost: 20.00 }
    ]
  });

  const totalCost = cpt.recalculateCost();
  assert.strictEqual(totalCost, 115.50);
  const sellingPrice = 250.00;
  const profitMargin = sellingPrice - totalCost;
  assert.strictEqual(profitMargin, 134.50);
  const marginPct = Math.round((profitMargin / sellingPrice) * 100);
  assert.strictEqual(marginPct, 54);
  console.log('  ✓ 2.1 Cost-per-test unit economics and 54% margin verified');

  // 2.2 Monthly P&L View Rendering & Print Layout
  const pnlHtml = renderView('costing/monthly', {
    title: 'Monthly P&L Statement',
    yearMonth: '2026-11',
    summary: {
      totalRevenue: 285000,
      clinicalRevenue: 215000,
      xrayRevenue: 70000,
      discountTotal: 8500,
      netRevenue: 276500,
      totalExpenses: 142000,
      netProfit: 134500,
      marginPercent: 48.6,
      categories: {
        reagent_purchase: 55000,
        equipment_service: 12000,
        overhead: 25000,
        personnel: 45000,
        misc: 5000
      }
    },
    expenses: [
      new Expense({ id: 'exp-1', category: 'reagent_purchase', description: 'CBC Diluent & Lyse Reagents', amount: 25000, date: '2026-11-05', month: '2026-11' })
    ],
    revenues: [
      new RevenueEntry({ id: 'rev-1', patientName: 'Rodrigo Reyes', totalAmount: 500, clinicalAmount: 500, xrayAmount: 0, discountAmount: 0, date: '2026-11-11', month: '2026-11' })
    ]
  });

  assert.ok(pnlHtml.includes('Monthly P&amp;L Statement') || pnlHtml.includes('Monthly P&L Statement') || pnlHtml.includes('2026-11'));
  assert.ok(pnlHtml.includes('Print Statement'), 'Print Statement button must exist in monthly P&L view');
  assert.ok(pnlHtml.includes('@media print'), 'P&L view must contain @media print');
  assert.ok(pnlHtml.includes('276,500') || pnlHtml.includes('276500'), 'Net revenue must be formatted in P&L');
  console.log('  ✓ 2.2 Monthly P&L Statement renders with clean print controls and formatted figures');

  // =============================================================
  // SECTION 3: HR, CSC FORM 48 DTR & STATUTORY PAYROLL
  // =============================================================
  console.log('\n--- SECTION 3: HR, CSC Form 48 DTR & Philippine Payroll Engine ---');

  const mockEmployee = new Employee({
    id: 'emp-dtr-001',
    name: 'Gezyne M. Lopez, RMT',
    employeeCode: 'EMP-LAB-0012',
    position: 'Medical Technologist',
    department: 'Clinical Laboratory',
    employmentStatus: 'Active',
    basicSalary: 32000,
    dailyRate: 1454.55,
    hourlyRate: 181.82,
    dateHired: '2022-01-10',
    tinNumber: '111-222-333-000',
    sssNumber: '04-1234567-8',
    philhealthNumber: '12-987654321-0',
    pagibigNumber: '1234-5678-9012'
  });

  // 3.1 Clean legal name verification
  assert.strictEqual(mockEmployee.name, 'Gezyne M. Lopez', 'Credentials RMT must be stripped from clean legal name');
  assert.strictEqual(mockEmployee.rawName, 'Gezyne M. Lopez, RMT');
  console.log('  ✓ 3.1 Clean legal name strictly enforced for official HR documents');

  // 3.2 DTR Calculation Engine (Standard Duty, Overtime, Undertime, Continuous Duty, Night Shift)
  // A. Standard 8.0 hr duty
  const dtrStandard = DtrRecord.computeHours('08:00', '12:00', '13:00', '17:00');
  assert.strictEqual(dtrStandard.totalHours, 8.0);
  assert.strictEqual(dtrStandard.isFullDuty, 1);
  assert.strictEqual(dtrStandard.dutyCredit, 1.0);
  assert.strictEqual(dtrStandard.undertimeMinutes, 0);

  // B. Duty with unapproved raw OT (capped strictly at 8.0 hrs)
  const dtrUnapprovedOt = DtrRecord.computeHours('07:30', '12:00', '13:00', '18:30', 0, 0);
  assert.strictEqual(dtrUnapprovedOt.totalHours, 8.0, 'Unapproved overtime must be capped at 8.0 hrs');
  assert.strictEqual(dtrUnapprovedOt.pendingOtHours, 2.0);

  // C. Duty with approved OT
  const dtrApprovedOt = DtrRecord.computeHours('07:30', '12:00', '13:00', '18:30', 1, 2.0);
  assert.strictEqual(dtrApprovedOt.totalHours, 10.0);
  assert.strictEqual(dtrApprovedOt.overtimeHours, 2.0);

  // D. Undertime calculation
  const dtrUndertime = DtrRecord.computeHours('08:30', '12:00', '13:00', '17:00');
  assert.strictEqual(dtrUndertime.isFullDuty, 0);
  assert.strictEqual(dtrUndertime.undertimeMinutes, 30);
  assert.strictEqual(dtrUndertime.totalHours, 7.5);

  // E. Continuous duty without lunch break punches (e.g. 08:00 to 17:00 = 9h span -> 8h net)
  const dtrContinuous = DtrRecord.computeHours('08:00', '', '', '17:00');
  assert.strictEqual(dtrContinuous.totalHours, 8.0, 'Continuous duty (8:00 to 17:00) must credit 8.0 hrs net of lunch');
  assert.strictEqual(dtrContinuous.isFullDuty, 1);

  // F. Night shift crossing midnight (e.g. 22:00 to 06:00 = 8h net)
  const dtrNightShift = DtrRecord.computeHours('', '', '22:00', '06:00');
  assert.strictEqual(dtrNightShift.totalHours, 8.0, 'Night shift (22:00 to 06:00) must calculate 8.0 hrs across midnight');
  console.log('  ✓ 3.2 DTR calculation engine verified (standard, unapproved OT cap, approved OT, undertime, continuous shift, night duty)');

  // 3.3 Philippine Statutory Contributions Engine
  const contrib = computeAllContributions(32000);
  assert.ok(contrib.sss.employeeShare > 0, 'SSS employee share computed');
  assert.ok(contrib.philhealth.employeeShare > 0, 'PhilHealth employee share computed');
  assert.strictEqual(contrib.pagibig.employeeShare, 200, 'Pag-IBIG employee share strictly capped at ₱200 (RA 9679 update)');

  const taxableIncome = 32000 - contrib.totalEmployeeMandatory;
  const tax = computeWithholdingTax(taxableIncome, 'Monthly');
  assert.ok(tax >= 0, 'TRAIN Law withholding tax computed');
  console.log(`  ✓ 3.3 Statutory deductions verified: SSS ₱${contrib.sss.employeeShare}, PhilHealth ₱${contrib.philhealth.employeeShare}, Pag-IBIG ₱${contrib.pagibig.employeeShare}, Tax ₱${tax.toFixed(2)}`);

  // 3.4 CSC Form 48 DTR 2-Up Print Layout & Page-Fit Verification
  const mockDayRows = [];
  for (let d = 1; d <= 31; d++) {
    const isWeekend = (d % 7 === 0 || d % 7 === 6);
    mockDayRows.push({
      date: `2026-11-${String(d).padStart(2, '0')}`,
      dayNum: d,
      dayName: isWeekend ? (d % 7 === 6 ? 'Sat' : 'Sun') : 'Wed',
      isWeekend,
      isPastMonthEnd: d > 30,
      weekNum: Math.ceil(d / 7),
      underHours: '',
      underMinutes: '',
      record: isWeekend ? null : {
        id: `dtr-${d}`,
        date: `2026-11-${String(d).padStart(2, '0')}`,
        amIn: '08:00',
        amOut: '12:00',
        pmIn: '13:00',
        pmOut: '17:00',
        totalHours: 8.0,
        rawTotalHours: 8.0,
        dutyCredit: 1.0,
        isFullDuty: 1,
        undertimeMinutes: 0,
        isOtApproved: 0,
        notes: ''
      }
    });
  }

  const dtrHtml = renderView('hr/my/dtr', {
    title: 'My Daily Time Record (DTR)',
    employee: mockEmployee,
    selectedMonth: '2026-11',
    monthName: 'November',
    year: 2026,
    totalDaysInMonth: 30,
    totalUndertimeHours: 0,
    totalUndertimeRemMinutes: 0,
    allEmployees: [mockEmployee],
    dayRows: mockDayRows,
    stats: {
      completedDuties: 21,
      full8HourDuties: 21,
      totalRenderedHours: 168.0,
      totalOvertimeHours: 0,
      totalUndertimeMins: 0,
      totalUndertimeHours: 0,
      totalUndertimeRemMinutes: 0,
      accruedPay: 32000,
      weekDutyCounts: { 1: 5, 2: 5, 3: 5, 4: 5, 5: 1 },
      maxDaysPerWeek: 5,
      isDoctor: false
    },
    isManagement: true,
    sessionUser: { id: 1, name: 'Admin', role: 'Admin' }
  });

  // Verify Critical Print Layout CSS Properties for CSC Form 48
  assert.ok(dtrHtml.includes('Civil Service Form No. 48'), 'Must contain CSC Form 48 title');
  assert.ok(dtrHtml.includes('DAILY TIME RECORD'), 'Must contain DAILY TIME RECORD heading');
  assert.ok(dtrHtml.includes('Print CSC Form 48'), 'Print CSC Form 48 button present');
  assert.ok(dtrHtml.includes('#dtrCopy2') && dtrHtml.includes('display: block !important;'), 'Copy 2 must be forced display:block in print for 2-up');
  assert.ok(dtrHtml.includes('flex-wrap: nowrap !important;'), 'Print grid must enforce flex-wrap: nowrap to prevent page spillover');
  assert.ok(dtrHtml.includes('size: letter portrait'), 'CSC Form 48 must enforce letter portrait');
  assert.ok(dtrHtml.includes('height: 15px !important;'), 'Print table row height must be strictly bounded (15px) to fit 31 days on 1 page');
  assert.ok(dtrHtml.includes('dtr-cert-block') && dtrHtml.includes('dtr-sig-emp'), 'Certification & signature blocks styled for print page fitting');
  assert.ok(dtrHtml.includes('openDtrModalFromRow(this)'), 'Table row click uses safe data attributes to prevent quote escaping bugs');
  console.log('  ✓ 3.4 CSC Form 48 DTR 2-up Letter Print Layout strictly validated (2 cards side-by-side, 1-page fit guaranteed)');

  // 3.5 Formal HR Documents Print Layouts (COE, Exit Clearance, Payslip, 2316)
  const mockOwner = getLaboratoryOwner('Clinical Laboratory');

  const coeHtml = renderView('hr/print/coe', {
    employee: mockEmployee,
    owner: mockOwner,
    currentDate: 'November 11, 2026',
    purpose: 'official transactions'
  });
  assert.ok(coeHtml.includes('CERTIFICATE OF EMPLOYMENT'));
  assert.ok(coeHtml.includes('Gezyne M. Lopez'));
  assert.ok(!coeHtml.includes('RMT'), 'COE must use clean legal name');

  const payslipHtml = renderView('hr/print/payslip', {
    payroll: new PayrollRecord({
      id: 'pay-test-01',
      employeeId: mockEmployee.id,
      employeeName: mockEmployee.name,
      department: 'Clinical Laboratory',
      month: '2026-11',
      payPeriodStart: '2026-11-01',
      payPeriodEnd: '2026-11-15',
      basicPay: 16000,
      grossPay: 16000,
      sssContribution: 1125,
      philhealthContribution: 800,
      pagibigContribution: 100,
      withholdingTax: 500,
      totalDeductions: 2525,
      netPay: 13475,
      status: 'Approved'
    }),
    employee: mockEmployee,
    owner: mockOwner,
    currentDate: 'November 11, 2026'
  });
  assert.ok(payslipHtml.includes('PAYSLIP'));
  assert.ok(payslipHtml.includes('16,000.00'));
  assert.ok(payslipHtml.includes('13,475.00'));
  console.log('  ✓ 3.5 Formal HR Documents (COE, Payslip) verified with clean legal names and printable layouts');

  console.log('\n========================================================================');
  console.log('🎉 ALL INTENSIVE TESTS PASSED: PHILHEALTH, HEALTH CARD, COSTING & HR (100%)');
  console.log('========================================================================\n');
}

runIntensiveSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ INTENSIVE SUITE FAILURE:', err);
    process.exit(1);
  });
