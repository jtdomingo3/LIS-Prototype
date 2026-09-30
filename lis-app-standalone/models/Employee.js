const { v4: uuidv4 } = require('uuid');
const { computeAllContributions } = require('../lib/philippineContributions');

class Employee {
  constructor(data = {}) {
    this.id = data.id || data.userId || uuidv4();
    this.userId = data.userId || this.id;
    this._name = data.rawName || data.name || '';
    this._email = data.email || '';
    this._role = data.role || '';
    this.employeeCode = data.employeeCode || '';
    this.department = data.department || 'Clinical Laboratory';
    this.position = data.position || '';
    this.employmentType = data.employmentType || 'Regular'; // 'Regular', 'Probationary', 'Contractual', 'Part-Time', 'Consultant'
    this.dateHired = data.dateHired || null;
    this.dateRegularized = data.dateRegularized || null;
    this.dateResigned = data.dateResigned || data.endDate || null;
    this.dateTerminated = data.dateTerminated || this.dateResigned || null;
    this.endDate = this.dateResigned || this.dateTerminated || null;
    this.resignationReason = data.resignationReason || data.separationReason || null;
    this.employmentStatus = data.employmentStatus || 'Active'; // 'Active', 'Resigned', 'AWOL', 'Terminated', 'On Leave'

    // System Account flag (e.g. IT User, Reception, generic service accounts excluded from employee directory & payroll)
    this.isSystemAccount = (data.isSystemAccount === 1 || data.isSystemAccount === true || data.isSystemAccount === '1' || data.isSystemAccount === 'true') ? 1 : 0;

    // Role & Pay Classification
    const isDoc = (data.position && (data.position.toLowerCase().includes('doctor') || data.position.toLowerCase().includes('patholog') || data.position.toLowerCase().includes('internist'))) ||
                  (data.role && (data.role.toLowerCase().includes('doctor') || data.role.toLowerCase().includes('patholog'))) ||
                  (data.employeeCode && data.employeeCode.toLowerCase().includes('dr.'));

    // Compensation Types: 'Daily Duty' (staff) | 'Fixed Monthly' (pathologist/doctor) | 'Commission Only' (exempt doctor)
    this.payType = data.payType || (isDoc ? 'Fixed Monthly' : 'Daily Duty');
    this.isPayrollExempt = (data.isPayrollExempt === 1 || data.isPayrollExempt === true || data.isPayrollExempt === '1' || this.payType === 'Commission Only') ? 1 : 0;
    this.maxDaysPerWeek = data.maxDaysPerWeek !== undefined ? Number(data.maxDaysPerWeek) : (isDoc ? 0 : 5);

    // Compensation: Daily Rate for staff; or Basic/Retainer for Fixed Monthly Doctors
    this.dailyRate = Number(data.dailyRate) || (this.payType === 'Daily Duty' && Number(data.basicSalary) > 0 ? Math.round((Number(data.basicSalary) / 22) * 100) / 100 : 0);
    this.basicSalary = Number(data.basicSalary) || (this.dailyRate > 0 ? Math.round(this.dailyRate * 22 * 100) / 100 : 0);
    this.hourlyRate = Number(data.hourlyRate) || (this.dailyRate > 0 ? Math.round((this.dailyRate / 8) * 100) / 100 : (this.basicSalary > 0 ? Math.round((this.basicSalary / (22 * 8)) * 100) / 100 : 0));
    this.salaryFrequency = data.salaryFrequency || (this.payType === 'Fixed Monthly' ? 'Monthly' : 'Per Duty / Day');
    this.isTaxExempt = (data.isTaxExempt === 1 || data.isTaxExempt === true || data.isTaxExempt === '1' || data.isTaxExempt === 'true' || data.isTaxExempt === 'on') ? 1 : 0;

    // Allowances
    this.riceAllowance = Number(data.riceAllowance) || 0;
    this.transportAllowance = Number(data.transportAllowance) || 0;
    this.mealAllowance = Number(data.mealAllowance) || 0;
    this.otherAllowances = Number(data.otherAllowances) || 0;
    this.allowancesNotes = data.allowancesNotes || '';

    // Government IDs
    this.sssNumber = data.sssNumber || '';
    this.philhealthNumber = data.philhealthNumber || '';
    this.pagibigNumber = data.pagibigNumber || '';
    this.tinNumber = data.tinNumber || '';

    // Bank Details
    this.bankName = data.bankName || '';
    this.bankAccountNumber = data.bankAccountNumber || '';
    this.bankAccountName = data.bankAccountName || '';

    // Emergency Contact
    this.emergencyContactName = data.emergencyContactName || '';
    this.emergencyContactPhone = data.emergencyContactPhone || '';
    this.emergencyContactRelation = data.emergencyContactRelation || '';

    // Personal Information
    this.birthDate = data.birthDate || null;
    this.civilStatus = data.civilStatus || 'Single'; // 'Single', 'Married', 'Widowed', 'Separated'
    this.numberOfDependents = parseInt(data.numberOfDependents, 10) || 0;
    this.permanentAddress = data.permanentAddress || '';
    this.presentAddress = data.presentAddress || '';
    this.contactPhone = data.contactPhone || '';

    // Leave Balances
    this.vacationLeaveBalance = Number(data.vacationLeaveBalance) !== undefined ? Number(data.vacationLeaveBalance) : 5;
    this.sickLeaveBalance = Number(data.sickLeaveBalance) !== undefined ? Number(data.sickLeaveBalance) : 5;

    this.notes = data.notes || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();

    // Cache attached user profile
    this._user = data._user || null;
  }

  get totalAllowances() {
    return this.riceAllowance + this.transportAllowance + this.mealAllowance + this.otherAllowances;
  }

  get grossMonthlySalary() {
    return this.basicSalary + this.totalAllowances;
  }

  get estimatedEmployerContributions() {
    if (this.basicSalary <= 0) return 0;
    const contrib = computeAllContributions(this.basicSalary, 'Monthly');
    return contrib.totalEmployerShare;
  }

  get fullMonthlyPersonnelCost() {
    return Math.round((this.grossMonthlySalary + this.estimatedEmployerContributions) * 100) / 100;
  }

  // Resolves the associated User account from database
  getUser() {
    if (this._user) return this._user;
    if (global.db && typeof global.db.getUserById === 'function') {
      this._user = global.db.getUserById(this.userId);
    }
    return this._user;
  }

  /**
   * Helper to clean professional titles, medical degrees, and suffixes from HR forms
   * (e.g. "Jeff Louine Jamir T. Domingo, RMT, PMSDA" -> "Jeff Louine Jamir T. Domingo")
   */
  static cleanName(name) {
    if (!name || typeof name !== 'string') return '';
    let cleaned = name.trim();
    // Strip honorific prefixes (Dr., Dra., Doctor, Atty., Engr.)
    cleaned = cleaned.replace(/^(Dr\.|Dra\.|Doctor|Dr|Atty\.|Engr\.)\s+/i, '');
    // Iteratively strip credential suffixes separated by comma
    const credentialPattern = /,\s*(?:RMT|PMSDA|RXT|M\.?D\.?|MSDA|D\.?P\.?B\.?R\.?|F\.?P\.?C\.?R\.?|FPSP|F\.?P\.?S\.?P\.?|RPh|RN|MT|MLS|CLS|MBA|Ph\.?D\.?|PhD|MD-FPSP|FPSMS|MD-FPCR|MD-DPBR)\b\.?/gi;
    let prev;
    do {
      prev = cleaned;
      cleaned = cleaned.replace(credentialPattern, '').trim();
    } while (cleaned !== prev);
    cleaned = cleaned.replace(/,(?:RMT|PMSDA|RXT|M\.?D\.?|MSDA|DPBR|FPCR|FPSP|RPh|RN|MT|MLS|CLS|MBA|Ph\.?D\.?|PhD)\b\.?/gi, '').trim();
    cleaned = cleaned.replace(/,\s*$/, '').trim();
    return cleaned || name.trim();
  }

  get rawName() {
    const u = this.getUser();
    return u ? u.name : (this._name || this.bankAccountName || this.employeeCode || 'Employee');
  }

  get name() {
    return Employee.cleanName(this.rawName);
  }

  get email() {
    const u = this.getUser();
    return u ? u.email : (this._email || '');
  }

  get role() {
    const u = this.getUser();
    return u ? u.role : (this._role || 'Staff');
  }

  isDoctorOrPathologist() {
    const pos = (this.position || '').toLowerCase();
    const r = (this.role || '').toLowerCase();
    const code = (this.employeeCode || '').toLowerCase();
    const rawN = (this.rawName || '').toLowerCase();
    const n = (this.name || '').toLowerCase();
    return pos.includes('doctor') || pos.includes('patholog') || pos.includes('internist') || pos.includes('physician') ||
           pos.includes('cardio') || pos.includes('radio') || pos.includes('sonolog') || pos.includes('pulmonolog') ||
           pos.includes('gynecolog') || pos.includes('pediatric') || pos.includes('neurolog') || pos.includes('surgeon') ||
           r.includes('doctor') || r.includes('patholog') || r.includes('cardio') || r.includes('radio') ||
           r.includes('sonolog') || r.includes('internist') || r.includes('pulmonolog') || r.includes('gynecolog') ||
           r.includes('pediatric') || r.includes('neurolog') || r.includes('surgeon') || r.includes('physician') ||
           code.includes('dr.') || rawN.startsWith('dr.') || rawN.startsWith('dr ') || n.startsWith('dr.') || n.startsWith('dr ');
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    if (global.db && typeof global.db.saveEmployee === 'function') {
      global.db.saveEmployee(this);
    }
    return this;
  }

  toJSON() {
    const u = this.getUser();
    return {
      ...this,
      name: this.name,
      rawName: this.rawName,
      isSystemAccount: this.isSystemAccount,
      userName: u ? u.name : '',
      userEmail: u ? u.email : '',
      userRole: u ? u.role : '',
      userStatus: u ? u.status : ''
    };
  }

  // Safe JSON for non-admin viewers (e.g. self-service) hiding sensitive account numbers
  toSafeJSON() {
    const raw = this.toJSON();
    return {
      id: raw.id,
      userId: raw.userId,
      employeeCode: raw.employeeCode,
      department: raw.department,
      position: raw.position,
      employmentType: raw.employmentType,
      dateHired: raw.dateHired,
      employmentStatus: raw.employmentStatus,
      dateResigned: raw.dateResigned,
      dateTerminated: raw.dateTerminated,
      endDate: raw.endDate,
      resignationReason: raw.resignationReason,
      isSystemAccount: raw.isSystemAccount,
      basicSalary: raw.basicSalary,
      salaryFrequency: raw.salaryFrequency,
      riceAllowance: raw.riceAllowance,
      transportAllowance: raw.transportAllowance,
      mealAllowance: raw.mealAllowance,
      otherAllowances: raw.otherAllowances,
      vacationLeaveBalance: raw.vacationLeaveBalance,
      sickLeaveBalance: raw.sickLeaveBalance,
      name: raw.name,
      userName: raw.userName,
      userEmail: raw.userEmail,
      userRole: raw.userRole
    };
  }

  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getEmployeeById === 'function') {
      const doc = global.db.getEmployeeById(id);
      return doc ? new Employee(doc) : null;
    }
    return null;
  }

  static async findByUserId(userId) {
    if (!userId) return null;
    if (global.db && typeof global.db.getEmployeeByUserId === 'function') {
      const doc = global.db.getEmployeeByUserId(userId);
      return doc ? new Employee(doc) : null;
    }
    return null;
  }

  static async findByCode(code) {
    if (!code) return null;
    if (global.db && typeof global.db.getEmployeeByCode === 'function') {
      const doc = global.db.getEmployeeByCode(code);
      return doc ? new Employee(doc) : null;
    }
    return null;
  }

  static async find(query = {}) {
    let list = [];
    if (global.db && typeof global.db.getEmployees === 'function') {
      list = global.db.getEmployees() || [];
    }
    if (query.department) {
      list = list.filter(e => e.department === query.department);
    }
    if (query.employmentStatus) {
      list = list.filter(e => e.employmentStatus === query.employmentStatus);
    }
    if (query.employmentType) {
      list = list.filter(e => e.employmentType === query.employmentType);
    }
    if (query.isSystemAccount !== undefined) {
      const target = (query.isSystemAccount === 1 || query.isSystemAccount === true || query.isSystemAccount === '1' || query.isSystemAccount === 'true') ? 1 : 0;
      list = list.filter(e => {
        const val = (e.isSystemAccount === 1 || e.isSystemAccount === true || e.isSystemAccount === '1' || e.isSystemAccount === 'true') ? 1 : 0;
        return val === target;
      });
    }
    return list.map(e => new Employee(e));
  }

  static async findAll() {
    return this.find();
  }

  static async deleteById(id) {
    if (!id) return false;
    if (global.db && typeof global.db.deleteEmployee === 'function') {
      return global.db.deleteEmployee(id);
    }
    return false;
  }
}

module.exports = Employee;
