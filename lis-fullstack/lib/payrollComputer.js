/**
 * Payroll Computation Engine
 * Computes earnings, deductions, withholding tax, and employer shares for an employee.
 */
const { computeAllContributions, computeWithholdingTax } = require('./philippineContributions');

/**
 * Compute payroll record for an employee given period and parameter overrides
 * @param {Object} employee - Employee model/object
 * @param {Object} opts - Pay calculation parameters
 *   - payPeriodStart (ISO date string)
 *   - payPeriodEnd (ISO date string)
 *   - payDate (optional)
 *   - frequency ('Monthly' | 'Semi-Monthly')
 *   - overtimeHours (number)
 *   - holidayHours (number)
 *   - nightDiffHours (number)
 *   - adjustments (number, + or -)
 *   - adjustmentNotes (string)
 *   - sssLoan (number)
 *   - pagibigLoan (number)
 *   - otherDeductions (number)
 *   - otherDeductionNotes (string)
 *   - computedBy (userId)
 */
function computePayrollForEmployee(employee, opts = {}) {
  if (!employee) throw new Error('Employee object is required');

  const frequency = opts.frequency || employee.salaryFrequency || 'Monthly';
  const isSemi = frequency === 'Semi-Monthly';
  const divisor = isSemi ? 2 : 1;

  // Duty rate determination: daily rate per duty
  const dailyRate = Number(employee.dailyRate) > 0
    ? Number(employee.dailyRate)
    : (Number(employee.basicSalary) > 0 ? Math.round((Number(employee.basicSalary) / 22) * 100) / 100 : 0);

  const monthlyBasic = Number(employee.basicSalary) > 0
    ? Number(employee.basicSalary)
    : Math.round(dailyRate * 22 * 100) / 100;

  // Basic pay: Fixed Monthly (Pathologist/Doctors) vs Daily Duty (Staff)
  let basicPay = 0;
  const isFixedMonthly = employee.payType === 'Fixed Monthly';

  if (opts.basicPay !== undefined) {
    basicPay = Number(opts.basicPay);
  } else if (isFixedMonthly) {
    basicPay = Math.round((monthlyBasic / divisor) * 100) / 100;
  } else if (opts.dutiesWorked !== undefined || opts.daysWorked !== undefined) {
    const days = Number(opts.dutiesWorked || opts.daysWorked) || 0;
    basicPay = Math.round(days * dailyRate * 100) / 100;
  } else if (dailyRate > 0) {
    const standardDays = isSemi ? 11 : 22;
    basicPay = Math.round(standardDays * dailyRate * 100) / 100;
  } else {
    basicPay = Math.round((monthlyBasic / divisor) * 100) / 100;
  }

  // Hourly rate determination: dailyRate / 8 or monthly / (22 * 8)
  const hourlyRate = Number(employee.hourlyRate) > 0
    ? Number(employee.hourlyRate)
    : (dailyRate > 0 ? Math.round((dailyRate / 8) * 100) / 100 : (monthlyBasic > 0 ? Math.round((monthlyBasic / (22 * 8)) * 100) / 100 : 0));

  // Overtime pay (regular OT: 125% of hourly rate)
  const overtimeHours = Number(opts.overtimeHours) || 0;
  const overtimePay = opts.overtimePay !== undefined
    ? Number(opts.overtimePay)
    : Math.round(overtimeHours * (hourlyRate * 1.25) * 100) / 100;

  // Holiday pay (regular holiday: 200%, special non-working: 130%)
  const holidayHours = Number(opts.holidayHours) || 0;
  const holidayPay = opts.holidayPay !== undefined
    ? Number(opts.holidayPay)
    : Math.round(holidayHours * (hourlyRate * 1.0) * 100) / 100;

  // Night Differential (10% premium for 10PM - 6AM)
  const nightDiffHours = Number(opts.nightDiffHours) || 0;
  const nightDifferential = opts.nightDifferential !== undefined
    ? Number(opts.nightDifferential)
    : Math.round(nightDiffHours * (hourlyRate * 0.10) * 100) / 100;

  // Allowances (divided if semi-monthly)
  const riceAllowance = Math.round(((Number(employee.riceAllowance) || 0) / divisor) * 100) / 100;
  const transportAllowance = Math.round(((Number(employee.transportAllowance) || 0) / divisor) * 100) / 100;
  const mealAllowance = Math.round(((Number(employee.mealAllowance) || 0) / divisor) * 100) / 100;
  const otherAllowances = Math.round(((Number(employee.otherAllowances) || 0) / divisor) * 100) / 100;

  const adjustments = Number(opts.adjustments) || 0;
  const adjustmentNotes = opts.adjustmentNotes || '';

  // Gross Pay
  const grossPay = Math.round((
    basicPay +
    overtimePay +
    holidayPay +
    nightDifferential +
    riceAllowance +
    transportAllowance +
    mealAllowance +
    otherAllowances +
    adjustments
  ) * 100) / 100;

  // Statutory Deductions
  const contributions = computeAllContributions(monthlyBasic, frequency);

  const sssContribution = opts.sssContribution !== undefined ? Number(opts.sssContribution) : contributions.sss.employeeShare;
  const sssEmployerShare = opts.sssEmployerShare !== undefined ? Number(opts.sssEmployerShare) : contributions.sss.employerShare;

  const philhealthContribution = opts.philhealthContribution !== undefined ? Number(opts.philhealthContribution) : contributions.philhealth.employeeShare;
  const philhealthEmployerShare = opts.philhealthEmployerShare !== undefined ? Number(opts.philhealthEmployerShare) : contributions.philhealth.employerShare;

  const pagibigContribution = opts.pagibigContribution !== undefined ? Number(opts.pagibigContribution) : contributions.pagibig.employeeShare;
  const pagibigEmployerShare = opts.pagibigEmployerShare !== undefined ? Number(opts.pagibigEmployerShare) : contributions.pagibig.employerShare;

  // Taxable Income = Gross Taxable Pay - Mandatory Deductions (De minimis allowances excluded)
  // Standard de minimis in PH (rice, meal, transport) are generally non-taxable up to limits
  const totalMandatory = sssContribution + philhealthContribution + pagibigContribution;
  const nonTaxableAllowances = riceAllowance + mealAllowance + transportAllowance;
  const taxableIncome = Math.max(0, grossPay - totalMandatory - nonTaxableAllowances);

  // Withholding Tax (0 if employee is marked Tax Exempt)
  const isTaxExempt = !!(employee.isTaxExempt === 1 || employee.isTaxExempt === true || employee.isTaxExempt === '1' || employee.isTaxExempt === 'on');
  const withholdingTax = opts.withholdingTax !== undefined
    ? Number(opts.withholdingTax)
    : (isTaxExempt ? 0 : computeWithholdingTax(taxableIncome, frequency));

  // Loans & Other Deductions
  const sssLoan = Number(opts.sssLoan) || 0;
  const pagibigLoan = Number(opts.pagibigLoan) || 0;
  const otherDeductions = Number(opts.otherDeductions) || 0;
  const otherDeductionNotes = opts.otherDeductionNotes || '';

  const totalDeductions = Math.round((
    sssContribution +
    philhealthContribution +
    pagibigContribution +
    withholdingTax +
    sssLoan +
    pagibigLoan +
    otherDeductions
  ) * 100) / 100;

  const netPay = Math.round((grossPay - totalDeductions) * 100) / 100;
  const totalEmployerCost = Math.round((grossPay + sssEmployerShare + philhealthEmployerShare + pagibigEmployerShare) * 100) / 100;

  const now = new Date().toISOString();
  const periodEnd = opts.payPeriodEnd || now;
  const month = opts.month || periodEnd.slice(0, 7);

  return {
    employeeId: employee.id,
    payPeriodStart: opts.payPeriodStart || now,
    payPeriodEnd: periodEnd,
    payDate: opts.payDate || null,
    month,
    basicPay,
    overtimePay,
    overtimeHours,
    holidayPay,
    nightDifferential,
    riceAllowance,
    transportAllowance,
    mealAllowance,
    otherAllowances,
    adjustments,
    adjustmentNotes,
    grossPay,
    sssContribution,
    sssEmployerShare,
    philhealthContribution,
    philhealthEmployerShare,
    pagibigContribution,
    pagibigEmployerShare,
    withholdingTax,
    sssLoan,
    pagibigLoan,
    otherDeductions,
    otherDeductionNotes,
    totalDeductions,
    netPay,
    totalEmployerCost,
    status: opts.status || 'Draft',
    approvedBy: opts.approvedBy || null,
    approvedAt: opts.approvedAt || null,
    paidVia: opts.paidVia || 'Bank Transfer',
    notes: opts.notes || '',
    computedBy: opts.computedBy || 'System'
  };
}

module.exports = {
  computePayrollForEmployee
};
