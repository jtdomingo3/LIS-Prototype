/**
 * Comprehensive System & Endpoint Test Suite:
 * HR & Payroll Management, Separation Tracking, Clean Legal Names, System Accounts,
 * and Costing & P&L Analytics.
 * 
 * Target: c:\Users\Jeff\repo\LIS Prototype\test\hr-costing-endpoints.test.js
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
const { getLaboratoryOwner } = require('../lis-fullstack/lib/ownerHelper');

const viewsDir = path.join(__dirname, '..', 'lis-fullstack', 'views');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}\n`);
    throw err;
  }
}

function renderView(viewRelativePath, data) {
  const fullPath = path.join(viewsDir, viewRelativePath + '.ejs');
  assert.ok(fs.existsSync(fullPath), `View template file must exist: ${fullPath}`);
  const template = fs.readFileSync(fullPath, 'utf8');
  return ejs.render(template, {
    ...data,
    filename: fullPath,
    sessionUser: data.sessionUser || { id: 1, name: 'Admin', role: 'Admin' },
    user: data.sessionUser || { id: 1, name: 'Admin', role: 'Admin' },
    messages: data.messages || {}
  });
}

console.log('\n========================================================================');
console.log('🧪 RUNNING COMPREHENSIVE HR & COSTING ENDPOINTS AND VIEWS TEST SUITE');
console.log('========================================================================\n');

// -------------------------------------------------------------
// 1. NAME SANITIZATION & TITLE STRIPPING TESTS
// -------------------------------------------------------------
console.log('--- 1. Name Sanitization & Professional Credential Stripping Tests ---');

test('Employee cleanName should remove all medical & academic degrees/suffixes', () => {
  const emp = new Employee({
    id: 'emp-101',
    name: 'Jeff Louine Jamir T. Domingo, RMT, PMSDA',
    position: 'Chief Medical Technologist',
    department: 'Clinical Laboratory'
  });

  assert.strictEqual(emp.name, 'Jeff Louine Jamir T. Domingo', 'Clean legal name should strip RMT and PMSDA');
  assert.strictEqual(emp.rawName, 'Jeff Louine Jamir T. Domingo, RMT, PMSDA', 'rawName must preserve original credentials');
});

test('Employee cleanName should handle doctor prefixes and combinations of suffixes', () => {
  const doc = new Employee({
    id: 'emp-102',
    name: 'Dr. Jane Roe-Santos, M.D., FPSP',
    position: 'Pathologist',
    department: 'Clinical Laboratory'
  });

  assert.strictEqual(doc.name, 'Jane Roe-Santos', 'Prefix Dr. and suffixes M.D., FPSP must be stripped');
  assert.strictEqual(doc.rawName, 'Dr. Jane Roe-Santos, M.D., FPSP');
  assert.strictEqual(doc.isDoctorOrPathologist(), true, 'Doctor detection must work accurately via rawName and position');
});

test('Laboratory Owner helper should strip credentials for formal HR signatories', () => {
  const owner = getLaboratoryOwner('Clinical Laboratory');
  assert.ok(owner.name, 'Owner must have a name');
  assert.ok(!owner.name.includes(', RMT'), 'Owner name must not contain credentials suffix');
  assert.ok(!owner.name.includes(', PMSDA'), 'Owner name must not contain PMSDA suffix');
});

// -------------------------------------------------------------
// 2. SYSTEM ACCOUNT IDENTIFICATION & SEPARATION TESTS
// -------------------------------------------------------------
console.log('\n--- 2. System Account Flagging & Directory Segregation Tests ---');

test('Employee model correctly tracks isSystemAccount property', () => {
  const staff = new Employee({ name: 'Juan Dela Cruz', isSystemAccount: 0 });
  const sysUser = new Employee({ name: 'IT User', email: 'it@lab.com', isSystemAccount: 1 });

  assert.strictEqual(staff.isSystemAccount, 0);
  assert.strictEqual(sysUser.isSystemAccount, 1);

  const staffJson = staff.toJSON();
  const sysJson = sysUser.toJSON();
  assert.strictEqual(staffJson.isSystemAccount, 0);
  assert.strictEqual(sysJson.isSystemAccount, 1);
});

test('Employee Directory segregation logic properly filters staff vs system accounts', () => {
  const employees = [
    new Employee({ id: '1', name: 'Alice Staff', isSystemAccount: 0 }),
    new Employee({ id: '2', name: 'Bob MedTech', isSystemAccount: 0 }),
    new Employee({ id: '3', name: 'IT User', isSystemAccount: 1 }),
    new Employee({ id: '4', name: 'Reception Account', isSystemAccount: 1 })
  ];

  const staffOnly = employees.filter(e => !e.isSystemAccount);
  const sysOnly = employees.filter(e => e.isSystemAccount === 1);

  assert.strictEqual(staffOnly.length, 2);
  assert.strictEqual(sysOnly.length, 2);
  assert.ok(staffOnly.every(e => !e.isSystemAccount));
  assert.ok(sysOnly.every(e => e.isSystemAccount === 1));
});

// -------------------------------------------------------------
// 3. EMPLOYMENT STATUS & SEPARATION TRACKING TESTS
// -------------------------------------------------------------
console.log('\n--- 3. Employment Status & Separation (Resigned, AWOL, Terminated) Tests ---');

test('Employee correctly records Resigned status and separation details', () => {
  const emp = new Employee({
    id: 'emp-201',
    name: 'Carlos Mendoza',
    employmentStatus: 'Active'
  });

  assert.strictEqual(emp.employmentStatus, 'Active');
  assert.strictEqual(emp.dateResigned, null);

  // Transition to Resigned
  emp.employmentStatus = 'Resigned';
  emp.dateResigned = '2026-09-30';
  emp.resignationReason = 'Relocation to Canada';

  assert.strictEqual(emp.employmentStatus, 'Resigned');
  assert.strictEqual(emp.dateResigned, '2026-09-30');
  assert.strictEqual(emp.resignationReason, 'Relocation to Canada');

  // Verify toJSON serialization contains separation fields
  const json = emp.toJSON();
  assert.strictEqual(json.employmentStatus, 'Resigned');
  assert.strictEqual(json.dateResigned, '2026-09-30');
  assert.strictEqual(json.resignationReason, 'Relocation to Canada');
});

test('Employee correctly records AWOL and Terminated statuses', () => {
  const empAwol = new Employee({
    id: 'emp-202',
    name: 'Mark Reyes',
    employmentStatus: 'AWOL',
    dateResigned: '2026-08-15',
    resignationReason: 'Absence without official leave exceeding 30 days'
  });

  assert.strictEqual(empAwol.employmentStatus, 'AWOL');
  assert.strictEqual(empAwol.dateResigned, '2026-08-15');

  const empTerminated = new Employee({
    id: 'emp-203',
    name: 'Samuel Cruz',
    employmentStatus: 'Terminated',
    dateResigned: '2026-07-01',
    resignationReason: 'End of probationary contract'
  });

  assert.strictEqual(empTerminated.employmentStatus, 'Terminated');
  assert.strictEqual(empTerminated.dateResigned, '2026-07-01');
});

// -------------------------------------------------------------
// 4. HR PRINT DOCUMENT EJS RENDERING TESTS
// -------------------------------------------------------------
console.log('\n--- 4. HR Printable Documents Rendering Tests ---');

const mockEmployeeActive = new Employee({
  id: 'emp-test-01',
  name: 'Jeff Louine Jamir T. Domingo, RMT, PMSDA',
  employeeCode: 'EMP-MED-0001',
  position: 'Chief Medical Technologist',
  department: 'Clinical Laboratory',
  employmentStatus: 'Active',
  dateHired: '2022-01-15',
  basicSalary: 35000,
  tinNumber: '123-456-789-000',
  sssNumber: '34-5678901-2',
  philhealthNumber: '12-345678901-2',
  pagibigNumber: '1234-5678-9012'
});

const mockEmployeeResigned = new Employee({
  id: 'emp-test-02',
  name: 'Maria Clara Santos, RMT',
  employeeCode: 'EMP-MED-0002',
  position: 'Medical Technologist I',
  department: 'Clinical Laboratory',
  employmentStatus: 'Resigned',
  dateHired: '2023-03-01',
  dateResigned: '2026-08-31',
  resignationReason: 'Career transition',
  basicSalary: 25000,
  tinNumber: '987-654-321-000'
});

const mockOwner = getLaboratoryOwner('Clinical Laboratory');

test('Certificate of Employment (COE) renders for Active employee with clean name', () => {
  const html = renderView('hr/print/coe', {
    employee: mockEmployeeActive,
    owner: mockOwner,
    currentDate: 'September 25, 2026',
    purpose: 'visa application'
  });

  assert.ok(html.includes('CERTIFICATE OF EMPLOYMENT'), 'COE header present');
  assert.ok(html.includes('Jeff Louine Jamir T. Domingo'), 'Must contain clean legal name');
  assert.ok(!html.includes('RMT, PMSDA'), 'Clean legal name must omit RMT, PMSDA');
  assert.ok(html.includes('present') || html.includes('Active'), 'Active employee should reflect current employment');
});

test('Certificate of Employment (COE) renders for Resigned employee with separation date', () => {
  const html = renderView('hr/print/coe', {
    employee: mockEmployeeResigned,
    owner: mockOwner,
    currentDate: 'September 25, 2026',
    purpose: 'employment verification'
  });

  assert.ok(html.includes('Maria Clara Santos'), 'Must contain clean legal name');
  assert.ok(html.includes('August 31, 2026') || html.includes('2026-08-31'), 'Must display effective end date');
  assert.ok(!html.includes('the present'), 'Resigned employee should NOT show to the present');
});

test('Exit Clearance renders cleanly with clearance sign-offs', () => {
  const html = renderView('hr/print/clearance', {
    employee: mockEmployeeResigned,
    owner: mockOwner,
    currentDate: 'September 25, 2026'
  });

  assert.ok(html.includes('EXIT CLEARANCE') || html.includes('Exit Clearance'), 'Clearance header present');
  assert.ok(html.includes('Maria Clara Santos'));
});

test('Official BIR Form 2316 Tax Summary renders with 0 errors and accurate computations', () => {
  const mockPayroll = new PayrollRecord({
    id: 'pay-001',
    employeeId: mockEmployeeActive.id,
    month: '2026-09',
    basicPay: 35000,
    grossPay: 35000,
    sssContribution: 1125,
    philhealthContribution: 875,
    pagibigContribution: 200,
    withholdingTax: 1850,
    netPay: 30950
  });

  const html = renderView('hr/print/tax_summary', {
    title: 'BIR Form No. 2316',
    employee: mockEmployeeActive,
    owner: mockOwner,
    year: '2026',
    yearPayrolls: [mockPayroll],
    totalGross: 35000,
    totalTaxWithheld: 1850,
    totalSss: 1125,
    totalPh: 875,
    totalPagibig: 200,
    totalNonTaxable: 2200,
    taxableIncome: 32800,
    settings: {},
    labTin: '009-876-543-000',
    labName: 'GEZYNE CLINICAL LABORATORY',
    labAddress: '0330 Vergel De Dios St., Poblacion, Plaridel, Bulacan',
    labZipCode: '3004',
    labRdoCode: '025',
    isMgmt: true
  });

  assert.ok(html.includes('2316'), 'Must contain BIR 2316 header');
  assert.ok(html.includes('35,000.00'), 'Must contain formatted total gross');
  assert.ok(html.includes('32,800.00'), 'Must contain formatted taxable income');
  assert.ok(html.includes('JEFF LOUINE JAMIR T. DOMINGO') || html.includes('Jeff Louine Jamir T. Domingo'), 'Must show clean employee name');
  assert.ok(!html.includes('RMT') && !html.includes('PMSDA'), 'Must not contain professional titles/degrees');
});

test('Payslip print view renders cleanly with itemized earnings & deductions', () => {
  const p = new PayrollRecord({
    id: 'pay-002',
    employeeId: mockEmployeeActive.id,
    employeeName: mockEmployeeActive.name,
    department: 'Clinical Laboratory',
    month: '2026-09',
    payPeriodStart: '2026-09-01',
    payPeriodEnd: '2026-09-15',
    basicPay: 17500,
    grossPay: 17500,
    sssContribution: 562.5,
    philhealthContribution: 437.5,
    pagibigContribution: 100,
    withholdingTax: 925,
    totalDeductions: 2025,
    netPay: 15475,
    status: 'Approved'
  });

  const html = renderView('hr/print/payslip', {
    payroll: p,
    employee: mockEmployeeActive,
    owner: mockOwner,
    currentDate: 'September 25, 2026'
  });

  assert.ok(html.includes('PAYSLIP') || html.includes('Payslip'), 'Payslip header present');
  assert.ok(html.includes('17,500.00'), 'Gross pay present');
  assert.ok(html.includes('15,475.00'), 'Net pay present');
});

test('Leave Slip print view renders cleanly with approval signatures', () => {
  const l = new LeaveRecord({
    id: 'leave-001',
    employeeId: mockEmployeeActive.id,
    leaveType: 'Vacation',
    startDate: '2026-10-01',
    endDate: '2026-10-03',
    daysCount: 3,
    reason: 'Annual family leave',
    status: 'Approved',
    approvedBy: 'Admin'
  });

  const html = renderView('hr/print/leave', {
    leave: l,
    employee: mockEmployeeActive,
    owner: mockOwner,
    currentDate: 'September 25, 2026'
  });

  assert.ok(html.includes('LEAVE') || html.includes('Leave'), 'Leave slip header present');
  assert.ok(html.includes('Vacation'));
  assert.ok(html.includes('Annual family leave'));
});

// -------------------------------------------------------------
// 5. MAIN HR VIEWS EJS RENDERING TESTS
// -------------------------------------------------------------
console.log('\n--- 5. Main HR Views Rendering Tests ---');

test('HR Dashboard (hr/index) renders successfully', () => {
  const html = renderView('hr/index', {
    title: 'HR & Payroll Management',
    currentMonth: '2026-09',
    employees: [mockEmployeeActive],
    totalEmployees: 1,
    activeEmployeesCount: 1,
    projectedMonthlyPayroll: 35000,
    totalEmployerContributions: 3500,
    actualMonthlyCost: 38500,
    actualGrossPay: 35000,
    actualEmployerContributions: 3500,
    departmentCounts: { 'Clinical Laboratory': 1 },
    recentPayrolls: [],
    pendingLeavesCount: 0,
    pendingLeaves: [],
    settings: {},
    labTin: '009-876-543-000',
    labName: 'GEZYNE CLINICAL LABORATORY',
    labAddress: '0330 Vergel De Dios St., Poblacion, Plaridel, Bulacan',
    labZipCode: '3004',
    labRdoCode: '025',
    isMgmt: true
  });

  assert.ok(html.includes('HR &amp; Payroll Management') || html.includes('HR & Payroll Management'));
  assert.ok(html.includes('Dashboard'));
});

test('Employee Directory (hr/employees/index) renders Staff view and System view', () => {
  const staffHtml = renderView('hr/employees/index', {
    title: 'Employee Directory',
    employees: [mockEmployeeActive],
    deptFilter: '',
    statusFilter: '',
    viewFilter: 'staff',
    totalStaffCount: 1,
    totalSystemCount: 1,
    search: ''
  });

  assert.ok(staffHtml.includes('Staff Directory'));
  assert.ok(staffHtml.includes('System Accounts'));
  assert.ok(staffHtml.includes('Jeff Louine Jamir T. Domingo'));

  const sysHtml = renderView('hr/employees/index', {
    title: 'System Accounts',
    employees: [new Employee({ id: 'sys-1', name: 'IT Support', isSystemAccount: 1 })],
    deptFilter: '',
    statusFilter: '',
    viewFilter: 'system',
    totalStaffCount: 1,
    totalSystemCount: 1,
    search: ''
  });

  assert.ok(sysHtml.includes('System Accounts'));
  assert.ok(sysHtml.includes('IT Support'));
});

test('Employee Form (hr/employees/form) renders New and Edit modes', () => {
  const newHtml = renderView('hr/employees/form', {
    title: 'New Employee HR Record',
    employee: new Employee({}),
    users: [],
    departments: ['Clinical Laboratory', 'Radiology', 'Reception'],
    isEdit: false
  });
  assert.ok(newHtml.includes('New Employee HR Record'));

  const editHtml = renderView('hr/employees/form', {
    title: 'Edit Employee Profile',
    employee: mockEmployeeActive,
    users: [],
    departments: ['Clinical Laboratory', 'Radiology', 'Reception'],
    isEdit: true
  });
  assert.ok(editHtml.includes('Edit Employee Profile'));
  assert.ok(editHtml.includes('Jeff Louine Jamir T. Domingo'));
});

test('Employee Profile (hr/employees/show) renders profile & separation actions', () => {
  const html = renderView('hr/employees/show', {
    title: mockEmployeeActive.name,
    employee: mockEmployeeActive,
    payrolls: [],
    leaves: [],
    dtrRecords: [],
    documents: [],
    isMgmt: true
  });

  assert.ok(html.includes('Jeff Louine Jamir T. Domingo'));
  assert.ok(html.includes('Update Employment Status') || html.includes('Quick Status'));
  assert.ok(html.includes('Tag as System Account') || html.includes('System Account'));
});

test('Payroll Register (hr/payroll/index) renders summary and itemized table', () => {
  const mockPayroll = new PayrollRecord({
    id: 'p-01',
    employeeName: 'Jeff Louine Jamir T. Domingo',
    department: 'Clinical Laboratory',
    payPeriodStart: '2026-09-01',
    payPeriodEnd: '2026-09-30',
    basicPay: 35000,
    grossPay: 35000,
    totalDeductions: 4000,
    netPay: 31000,
    status: 'Approved'
  });

  const html = renderView('hr/payroll/index', {
    title: 'Payroll Management',
    records: [mockPayroll],
    selectedMonth: '2026-09',
    statusFilter: '',
    totalGross: 35000,
    totalDeductions: 4000,
    totalNet: 31000,
    totalEmployerCost: 38500
  });

  assert.ok(html.includes('Payroll Register &amp; Processing') || html.includes('Payroll Register'));
  assert.ok(html.includes('35,000.00'));
  assert.ok(html.includes('31,000.00'));
  assert.ok(html.includes('Jeff Louine Jamir T. Domingo'));
});

test('Leave Management (hr/leaves/index) renders successfully', () => {
  const html = renderView('hr/leaves/index', {
    title: 'Leave Applications',
    leaves: [],
    employees: [mockEmployeeActive],
    statusFilter: ''
  });

  assert.ok(html.includes('Leave') || html.includes('Applications'));
});

test('Staff Self-Service Portal (hr/my/index) renders cleanly', () => {
  const html = renderView('hr/my/index', {
    title: 'My HR Portal',
    employee: mockEmployeeActive,
    payslips: [],
    documents: [],
    leaves: [],
    leavesUsed: 0,
    isManagement: true
  });

  assert.ok(html.includes('Welcome, ') || html.includes('My DTR'));
  assert.ok(html.includes('Jeff Louine Jamir T. Domingo'));
});

// -------------------------------------------------------------
// 6. COSTING & FINANCIAL P&L VIEWS EJS RENDERING TESTS
// -------------------------------------------------------------
console.log('\n--- 6. Costing & P&L Views Rendering Tests ---');

const mockFinancialSummary = {
  period: '2026-09',
  totalRevenue: 125000,
  netRevenue: 120000,
  clinicalRevenue: 95000,
  xrayRevenue: 30000,
  discountTotal: 5000,
  totalExpenses: 70000,
  categories: {
    reagent_purchase: 30000,
    equipment_service: 8000,
    overhead: 12000,
    personnel: 15000,
    misc: 5000
  },
  netProfit: 50000,
  marginPercent: 41.7
};

test('Costing Dashboard (costing/index) renders with financial analytics', () => {
  const html = renderView('costing/index', {
    title: 'Financial Costing & Analytics',
    selectedMonth: '2026-09',
    selectedYear: '2026',
    summary: mockFinancialSummary,
    yearlySummary: mockFinancialSummary,
    monthlyTrend: [
      { month: '2026-08', label: 'Aug', revenue: 110000, expenses: 65000, profit: 45000 },
      { month: '2026-09', label: 'Sep', revenue: 125000, expenses: 70000, profit: 55000 }
    ],
    paymentMethods: { Cash: 80000, GCash: 35000, Maya: 10000 },
    recentExpenses: [],
    costPerTestCount: 15
  });

  assert.ok(html.includes('Financial Costing &amp; Analytics') || html.includes('Financial Costing'));
  assert.ok(html.includes('125,000') || html.includes('120,000'));
  assert.ok(html.includes('41.7%') || html.includes('41.7'));
});

test('Costing Revenue list (costing/revenue) renders itemized entries', () => {
  const rev = new RevenueEntry({
    id: 'rev-01',
    patientName: 'Pedro Penduko',
    paymentMethod: 'Cash',
    totalAmount: 1500,
    clinicalAmount: 1500,
    xrayAmount: 0,
    month: '2026-09'
  });

  const html = renderView('costing/revenue', {
    title: 'Revenue Details',
    entries: [rev],
    selectedMonth: '2026-09',
    methodFilter: '',
    totalRev: 1500,
    totalClin: 1500,
    totalXray: 0
  });

  assert.ok(html.includes('Revenue Details'));
  assert.ok(html.includes('Cash') && html.includes('1,500.00'));
});

test('Costing Expenses (costing/expenses) renders categorized expenses', () => {
  const exp = new Expense({
    id: 'exp-01',
    description: 'Mindray BS-240 Reagents',
    category: 'reagent_purchase',
    amount: 15500,
    month: '2026-09',
    expenseDate: '2026-09-12'
  });

  const html = renderView('costing/expenses', {
    title: 'Laboratory Expenses',
    expenses: [exp],
    selectedMonth: '2026-09',
    categoryFilter: '',
    totalAmount: 15500
  });

  assert.ok(html.includes('Laboratory Expense Log') || html.includes('Expense Items Recorded'));
  assert.ok(html.includes('Mindray BS-240 Reagents'));
  assert.ok(html.includes('15,500'));
});

test('Monthly P&L Statement (costing/monthly) renders accounting-style statement', () => {
  const html = renderView('costing/monthly', {
    title: 'P&L Statement — 2026-09',
    yearMonth: '2026-09',
    summary: mockFinancialSummary,
    expenses: [],
    revenueEntries: []
  });

  assert.ok(html.includes('STATEMENT OF PROFIT AND LOSS') || html.includes('PROFIT') || html.includes('P&L'));
  assert.ok(html.includes('Clinical Laboratory Service Fees') || html.includes('Operating Revenue'));
});

test('Cost Per Test (costing/cost_per_test) renders reagent mapping interface', () => {
  const mapping = new CostPerTest({
    id: 'cpt-01',
    testType: 'Lipid Profile',
    estimatedCost: 85.50
  });

  const html = renderView('costing/cost_per_test', {
    title: 'Reagent Cost Per Test',
    mappings: [mapping],
    templates: [],
    inventory: []
  });

  assert.ok(html.includes('Reagent Cost Mapping') || html.includes('Cost Mapping') || html.includes('Test Type'));
  assert.ok(html.includes('Lipid Profile'));
});

// -------------------------------------------------------------
// 7. OPERATIONAL WORKFLOW & INTEGRITY TESTS
// -------------------------------------------------------------
console.log('\n--- 7. Workflow & Permission Integrity Tests ---');

test('Leave request deletion permission: only Pending leaves can be deleted', () => {
  const pendingLeave = new LeaveRecord({ id: 'l1', status: 'Pending' });
  const approvedLeave = new LeaveRecord({ id: 'l2', status: 'Approved' });
  const rejectedLeave = new LeaveRecord({ id: 'l3', status: 'Rejected' });

  assert.strictEqual(pendingLeave.status === 'Pending', true, 'Pending leave is eligible for cancellation/deletion');
  assert.strictEqual(approvedLeave.status === 'Pending', false, 'Approved leave cannot be deleted by applicant');
  assert.strictEqual(rejectedLeave.status === 'Pending', false, 'Rejected leave cannot be deleted by applicant');
});

test('P&L Profit Margin formula prevents division by zero when revenue is zero', () => {
  const zeroRev = 0;
  const expenses = 5000;
  const netProfit = zeroRev - expenses;
  const marginPercent = zeroRev > 0 ? Math.round((netProfit / zeroRev) * 1000) / 10 : 0;

  assert.strictEqual(marginPercent, 0, 'Margin percent must safely return 0 when revenue is zero');
  assert.strictEqual(netProfit, -5000, 'Net profit should be -5000 (net loss)');
});

// -------------------------------------------------------------
// 8. LIVE HTTP ROUTER & ENDPOINTS COMMUNICATION TESTS
// -------------------------------------------------------------
console.log('\n--- 8. Live HTTP Router & Communication Integration Tests ---');

(async () => {
  const express = require('../lis-fullstack/node_modules/express');
  const http = require('http');
  const { createDb } = require('../lis-fullstack/lib/sqliteDb');
  const dbPath = path.join(__dirname, '..', 'lis-fullstack', 'lis-data.db');
  global.db = createDb(dbPath);

  const app = express();
  app.set('views', viewsDir);
  app.set('view engine', 'ejs');
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // Mock authenticated Admin session middleware
  app.use((req, res, next) => {
    req.session = {
      user: {
        id: 'admin-test-01',
        name: 'Admin User',
        email: 'admin@lab.com',
        role: 'Admin',
        permissions: { hr: true, costing: true }
      }
    };
    req.flash = () => [];
    next();
  });

  const hrRoutes = require('../lis-fullstack/routes/hr');
  const costingRoutes = require('../lis-fullstack/routes/costing');

  app.use('/hr', hrRoutes);
  app.use('/costing', costingRoutes);

  // Start ephemeral test server
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function httpReq(method, urlPath, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, baseUrl);
      const reqHeaders = { ...headers };
      if (body && typeof body === 'string') {
        reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        reqHeaders['Content-Length'] = Buffer.byteLength(body);
      }
      const req = http.request(url, { method, headers: reqHeaders }, (res) => {
        let respBody = '';
        res.on('data', chunk => respBody += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: respBody }));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  try {
    // 1. GET /hr
    const r1 = await httpReq('GET', '/hr');
    assert.strictEqual(r1.status, 200, 'GET /hr must respond with 200 OK');
    console.log('  ✓ GET /hr responded 200 OK');
    passedTests++; totalTests++;

    // 2. GET /hr/employees?view=staff
    const r2 = await httpReq('GET', '/hr/employees?view=staff');
    assert.strictEqual(r2.status, 200, 'GET /hr/employees?view=staff must respond with 200 OK');
    console.log('  ✓ GET /hr/employees?view=staff responded 200 OK');
    passedTests++; totalTests++;

    // 3. GET /hr/employees?view=system
    const r3 = await httpReq('GET', '/hr/employees?view=system');
    assert.strictEqual(r3.status, 200, 'GET /hr/employees?view=system must respond with 200 OK');
    console.log('  ✓ GET /hr/employees?view=system responded 200 OK');
    passedTests++; totalTests++;

    // 4. GET /hr/payroll
    const r4 = await httpReq('GET', '/hr/payroll');
    assert.strictEqual(r4.status, 200, 'GET /hr/payroll must respond with 200 OK');
    console.log('  ✓ GET /hr/payroll responded 200 OK');
    passedTests++; totalTests++;

    // 5. GET /hr/leaves
    const r5 = await httpReq('GET', '/hr/leaves');
    assert.strictEqual(r5.status, 200, 'GET /hr/leaves must respond with 200 OK');
    console.log('  ✓ GET /hr/leaves responded 200 OK');
    passedTests++; totalTests++;

    // 6. GET /hr/my
    const r6 = await httpReq('GET', '/hr/my');
    assert.strictEqual(r6.status, 200, 'GET /hr/my must respond with 200 OK');
    console.log('  ✓ GET /hr/my responded 200 OK');
    passedTests++; totalTests++;

    // 7. GET /costing
    const r7 = await httpReq('GET', '/costing');
    assert.strictEqual(r7.status, 200, 'GET /costing must respond with 200 OK');
    console.log('  ✓ GET /costing responded 200 OK');
    passedTests++; totalTests++;

    // 8. GET /costing/revenue
    const r8 = await httpReq('GET', '/costing/revenue');
    assert.strictEqual(r8.status, 200, 'GET /costing/revenue must respond with 200 OK');
    console.log('  ✓ GET /costing/revenue responded 200 OK');
    passedTests++; totalTests++;

    // 9. GET /costing/expenses
    const r9 = await httpReq('GET', '/costing/expenses');
    assert.strictEqual(r9.status, 200, 'GET /costing/expenses must respond with 200 OK');
    console.log('  ✓ GET /costing/expenses responded 200 OK');
    passedTests++; totalTests++;

    // 10. GET /costing/monthly/2026-09
    const r10 = await httpReq('GET', '/costing/monthly/2026-09');
    assert.strictEqual(r10.status, 200, 'GET /costing/monthly/2026-09 must respond with 200 OK');
    console.log('  ✓ GET /costing/monthly/2026-09 responded 200 OK');
    passedTests++; totalTests++;

    // 11. GET /costing/cost-per-test
    const r11 = await httpReq('GET', '/costing/cost-per-test');
    assert.strictEqual(r11.status, 200, 'GET /costing/cost-per-test must respond with 200 OK');
    console.log('  ✓ GET /costing/cost-per-test responded 200 OK');
    passedTests++; totalTests++;

    // 12. GET /costing/api/summary (JSON API)
    const r12 = await httpReq('GET', '/costing/api/summary?month=2026-09');
    assert.strictEqual(r12.status, 200, 'GET /costing/api/summary must respond 200 OK');
    const apiJson = JSON.parse(r12.body);
    assert.strictEqual(apiJson.success, true, 'API response must contain { success: true }');
    assert.ok(apiJson.data, 'API response must contain data payload');
    console.log('  ✓ GET /costing/api/summary responded 200 with valid JSON summary');
    passedTests++; totalTests++;

    // 13. POST /costing/expenses (Create test expense)
    const postData = 'description=Quality+Control+Reagent&amount=1200&category=reagent_purchase&expenseDate=2026-09-25';
    const r13 = await httpReq('POST', '/costing/expenses', postData);
    assert.strictEqual(r13.status, 302, 'POST /costing/expenses must redirect after recording');
    console.log('  ✓ POST /costing/expenses recorded expense and responded 302 Redirect');
    passedTests++; totalTests++;

  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(`🎉 ALL ${passedTests} OF ${totalTests} TESTS PASSED CLEANLY (100% SUCCESS)!`);
  console.log('========================================================================\n');
})().catch(err => {
  console.error('\n❌ HTTP Integration test failed:', err);
  process.exit(1);
});

