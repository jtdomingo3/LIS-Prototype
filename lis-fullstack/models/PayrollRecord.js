const { v4: uuidv4 } = require('uuid');

class PayrollRecord {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.employeeId = data.employeeId || '';
    this.payPeriodStart = data.payPeriodStart || new Date().toISOString();
    this.payPeriodEnd = data.payPeriodEnd || new Date().toISOString();
    this.payDate = data.payDate || null;
    this.month = data.month || (this.payPeriodEnd ? this.payPeriodEnd.slice(0, 7) : new Date().toISOString().slice(0, 7));

    // Earnings
    this.basicPay = Number(data.basicPay) || 0;
    this.overtimePay = Number(data.overtimePay) || 0;
    this.overtimeHours = Number(data.overtimeHours) || 0;
    this.holidayPay = Number(data.holidayPay) || 0;
    this.nightDifferential = Number(data.nightDifferential) || 0;
    this.riceAllowance = Number(data.riceAllowance) || 0;
    this.transportAllowance = Number(data.transportAllowance) || 0;
    this.mealAllowance = Number(data.mealAllowance) || 0;
    this.otherAllowances = Number(data.otherAllowances) || 0;
    this.adjustments = Number(data.adjustments) || 0;
    this.adjustmentNotes = data.adjustmentNotes || '';
    this.grossPay = Number(data.grossPay) || (
      this.basicPay + this.overtimePay + this.holidayPay + this.nightDifferential +
      this.riceAllowance + this.transportAllowance + this.mealAllowance + this.otherAllowances + this.adjustments
    );

    // Deductions
    this.sssContribution = Number(data.sssContribution) || 0;
    this.sssEmployerShare = Number(data.sssEmployerShare) || 0;
    this.philhealthContribution = Number(data.philhealthContribution) || 0;
    this.philhealthEmployerShare = Number(data.philhealthEmployerShare) || 0;
    this.pagibigContribution = Number(data.pagibigContribution) || 0;
    this.pagibigEmployerShare = Number(data.pagibigEmployerShare) || 0;
    this.withholdingTax = Number(data.withholdingTax) || 0;
    this.sssLoan = Number(data.sssLoan) || 0;
    this.pagibigLoan = Number(data.pagibigLoan) || 0;
    this.otherDeductions = Number(data.otherDeductions) || 0;
    this.otherDeductionNotes = data.otherDeductionNotes || '';
    this.totalDeductions = Number(data.totalDeductions) || (
      this.sssContribution + this.philhealthContribution + this.pagibigContribution +
      this.withholdingTax + this.sssLoan + this.pagibigLoan + this.otherDeductions
    );

    // Net Pay
    this.netPay = Number(data.netPay) !== undefined ? Number(data.netPay) : (this.grossPay - this.totalDeductions);

    // Status & Metadata
    this.status = data.status || 'Draft'; // 'Draft', 'Approved', 'Paid', 'Cancelled'
    this.approvedBy = data.approvedBy || null;
    this.approvedAt = data.approvedAt || null;
    this.paidVia = data.paidVia || 'Bank Transfer'; // 'Bank Transfer', 'Cash', 'Check'
    this.notes = data.notes || '';
    this.computedBy = data.computedBy || 'System';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();

    // Cache employee info
    const Employee = require('./Employee');
    if (data._employee instanceof Employee) {
      this._employee = data._employee;
    } else if (data._employee && typeof data._employee === 'object') {
      this._employee = new Employee(data._employee);
    } else {
      this._employee = null;
    }
  }

  get totalEmployerCost() {
    return Math.round((
      this.grossPay +
      this.sssEmployerShare +
      this.philhealthEmployerShare +
      this.pagibigEmployerShare
    ) * 100) / 100;
  }

  getEmployee() {
    const Employee = require('./Employee');
    if (this.employeeId && global.db && typeof global.db.getEmployeeById === 'function') {
      const emp = global.db.getEmployeeById(this.employeeId);
      if (emp) {
        this._employee = new Employee(emp);
        return this._employee;
      }
    }
    if (this._employee instanceof Employee) return this._employee;
    if (this._employee && typeof this._employee === 'object') {
      this._employee = new Employee(this._employee);
      return this._employee;
    }
    return null;
  }

  get employeeName() {
    const emp = this.getEmployee();
    return emp ? emp.name : 'Staff';
  }

  get employeeCode() {
    const emp = this.getEmployee();
    return emp ? emp.employeeCode : '';
  }

  get department() {
    const emp = this.getEmployee();
    return emp ? emp.department : '';
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    if (!this.month && this.payPeriodEnd) {
      this.month = this.payPeriodEnd.slice(0, 7);
    }
    if (global.db && typeof global.db.savePayrollRecord === 'function') {
      const toSave = { ...this };
      delete toSave._employee;
      global.db.savePayrollRecord(toSave);
    }
    return this;
  }

  toJSON() {
    const emp = this.getEmployee();
    return {
      ...this,
      employeeName: emp ? emp.name : 'Unknown Employee',
      employeeCode: emp ? emp.employeeCode : '',
      department: emp ? emp.department : '',
      position: emp ? emp.position : ''
    };
  }

  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getPayrollRecordById === 'function') {
      const doc = global.db.getPayrollRecordById(id);
      return doc ? new PayrollRecord(doc) : null;
    }
    return null;
  }

  static async findByEmployeeId(employeeId) {
    if (!employeeId) return [];
    if (global.db && typeof global.db.getPayrollRecordsByEmployee === 'function') {
      const list = global.db.getPayrollRecordsByEmployee(employeeId) || [];
      return list.map(p => new PayrollRecord(p));
    }
    return [];
  }

  static async findByMonth(month) {
    return PayrollRecord.find({ month });
  }

  static async find(query = {}) {
    let list = [];
    if (global.db && typeof global.db.getPayrollRecords === 'function') {
      list = global.db.getPayrollRecords(query.month, query.employeeId) || [];
    }
    if (query.status) {
      list = list.filter(p => p.status === query.status);
    }
    if (query.department) {
      list = list.filter(p => {
        const rec = new PayrollRecord(p);
        const emp = rec.getEmployee();
        return emp && emp.department === query.department;
      });
    }
    return list.map(p => new PayrollRecord(p));
  }

  static async deleteById(id) {
    if (!id) return false;
    if (global.db && typeof global.db.deletePayrollRecord === 'function') {
      return global.db.deletePayrollRecord(id);
    }
    return false;
  }
}

module.exports = PayrollRecord;
