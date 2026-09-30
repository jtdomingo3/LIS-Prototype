/**
 * Philippine Statutory Contribution Tables & Calculator
 * Compliant with 2024-2025 SSS, PhilHealth, Pag-IBIG (HDMF), and BIR TRAIN Law schedules.
 */

// SSS Contribution Computation (2024-2025 schedule: 14% total, 4.5% EE / 9.5% ER + EC + WISP)
function computeSss(monthlyBasicSalary) {
  const salary = Math.max(0, Number(monthlyBasicSalary) || 0);
  if (salary <= 0) {
    return { employeeShare: 0, employerShare: 0, ecShare: 0, wispEmployee: 0, wispEmployer: 0, totalContribution: 0 };
  }

  // Bracket MSC step: starts at 4,000 min, increments by 500 up to 30,000 max
  let msc = Math.min(30000, Math.max(4000, Math.round(salary / 500) * 500));
  if (salary < 4250) msc = 4000;

  // Regular MSC is capped at 20,000
  const regularMsc = Math.min(20000, msc);
  const regularEE = Math.round(regularMsc * 0.045 * 100) / 100;
  const regularER = Math.round(regularMsc * 0.095 * 100) / 100;

  // WISP (Mandatory Provident Fund) for MSC in excess of 20,000 up to 30,000
  let wispEE = 0;
  let wispER = 0;
  if (msc > 20000) {
    const wispMsc = msc - 20000;
    wispEE = Math.round(wispMsc * 0.045 * 100) / 100;
    wispER = Math.round(wispMsc * 0.095 * 100) / 100;
  }

  // Employees' Compensation (EC) paid 100% by employer
  const ecShare = msc < 15000 ? 10 : 30;

  const totalEE = Math.round((regularEE + wispEE) * 100) / 100;
  const totalER = Math.round((regularER + wispER + ecShare) * 100) / 100;

  return {
    monthlySalaryCredit: msc,
    employeeShare: totalEE,
    employerShare: totalER,
    ecShare,
    wispEmployee: wispEE,
    wispEmployer: wispER,
    totalContribution: Math.round((totalEE + totalER) * 100) / 100
  };
}

// PhilHealth Contribution (5% total premium rate: 2.5% EE / 2.5% ER, Floor 10k, Ceiling 100k)
function computePhilhealth(monthlyBasicSalary) {
  const salary = Math.max(0, Number(monthlyBasicSalary) || 0);
  if (salary <= 0) return { employeeShare: 0, employerShare: 0, totalContribution: 0 };

  const cappedSalary = Math.min(100000, Math.max(10000, salary));
  const totalPremium = Math.round(cappedSalary * 0.05 * 100) / 100;
  const share = Math.round((totalPremium / 2) * 100) / 100;

  return {
    cappedSalary,
    employeeShare: share,
    employerShare: share,
    totalContribution: Math.round((share * 2) * 100) / 100
  };
}

// Pag-IBIG (HDMF) Contribution (2% EE / 2% ER with statutory cap of ₱200 each)
function computePagibig(monthlyBasicSalary) {
  const salary = Math.max(0, Number(monthlyBasicSalary) || 0);
  if (salary <= 0) return { employeeShare: 0, employerShare: 0, totalContribution: 0 };

  // Current statutory mandatory cap is ₱200 for EE and ₱200 for ER
  const rateEE = salary <= 1500 ? 0.01 : 0.02;
  const eeShare = Math.min(200, Math.round(salary * rateEE * 100) / 100);
  const erShare = Math.min(200, Math.round(salary * 0.02 * 100) / 100);

  return {
    employeeShare: eeShare,
    employerShare: erShare,
    totalContribution: eeShare + erShare
  };
}

// BIR TRAIN Law Withholding Tax Calculator
// frequency: 'Monthly' | 'Semi-Monthly'
function computeWithholdingTax(taxableIncome, frequency = 'Monthly') {
  const income = Math.max(0, Number(taxableIncome) || 0);

  if (frequency === 'Semi-Monthly') {
    // Semi-Monthly Tax Table (TRAIN Law 2023+)
    if (income <= 10417) return 0;
    if (income <= 16667) return Math.round((income - 10417) * 0.15 * 100) / 100;
    if (income <= 33333) return Math.round((937.50 + (income - 16667) * 0.20) * 100) / 100;
    if (income <= 83333) return Math.round((4270.83 + (income - 33333) * 0.25) * 100) / 100;
    if (income <= 333333) return Math.round((16770.83 + (income - 83333) * 0.30) * 100) / 100;
    return Math.round((91770.83 + (income - 333333) * 0.35) * 100) / 100;
  }

  // Monthly Tax Table (TRAIN Law 2023+)
  if (income <= 20833) return 0;
  if (income <= 33333) return Math.round((income - 20833) * 0.15 * 100) / 100;
  if (income <= 66667) return Math.round((1875 + (income - 33333) * 0.20) * 100) / 100;
  if (income <= 166667) return Math.round((8541.80 + (income - 66667) * 0.25) * 100) / 100;
  if (income <= 666667) return Math.round((33541.80 + (income - 166667) * 0.30) * 100) / 100;
  return Math.round((183541.80 + (income - 666667) * 0.35) * 100) / 100;
}

/**
 * Compute all statutory deductions and employer contributions for a given salary and frequency
 */
function computeAllContributions(monthlyBasicSalary, frequency = 'Monthly') {
  const isSemi = frequency === 'Semi-Monthly';
  const divisor = isSemi ? 2 : 1;

  const sss = computeSss(monthlyBasicSalary);
  const philhealth = computePhilhealth(monthlyBasicSalary);
  const pagibig = computePagibig(monthlyBasicSalary);

  // Periodic shares
  const sssEE = Math.round((sss.employeeShare / divisor) * 100) / 100;
  const sssER = Math.round((sss.employerShare / divisor) * 100) / 100;
  const phEE = Math.round((philhealth.employeeShare / divisor) * 100) / 100;
  const phER = Math.round((philhealth.employerShare / divisor) * 100) / 100;
  const hdmfEE = Math.round((pagibig.employeeShare / divisor) * 100) / 100;
  const hdmfER = Math.round((pagibig.employerShare / divisor) * 100) / 100;

  const totalEE = Math.round((sssEE + phEE + hdmfEE) * 100) / 100;
  const totalER = Math.round((sssER + phER + hdmfER) * 100) / 100;

  return {
    monthlyBasicSalary,
    frequency,
    sss: { employeeShare: sssEE, employerShare: sssER, fullMonthlyEE: sss.employeeShare, fullMonthlyER: sss.employerShare },
    philhealth: { employeeShare: phEE, employerShare: phER, fullMonthlyEE: philhealth.employeeShare, fullMonthlyER: philhealth.employerShare },
    pagibig: { employeeShare: hdmfEE, employerShare: hdmfER, fullMonthlyEE: pagibig.employeeShare, fullMonthlyER: pagibig.employerShare },
    totalEmployeeMandatory: totalEE,
    totalEmployerShare: totalER
  };
}

module.exports = {
  computeSss,
  computePhilhealth,
  computePagibig,
  computeWithholdingTax,
  computeAllContributions
};
