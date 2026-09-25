const { v4: uuidv4 } = require('uuid');

class LeaveRecord {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.employeeId = data.employeeId || '';
    this.leaveType = data.leaveType || 'Vacation'; // 'Vacation', 'Sick', 'Emergency', 'Maternity', 'Paternity', 'Bereavement'
    this.startDate = data.startDate || new Date().toISOString().slice(0, 10);
    this.endDate = data.endDate || this.startDate;
    this.totalDays = Number(data.totalDays) || 1;
    this.reason = data.reason || '';
    this.status = data.status || 'Pending'; // 'Pending', 'Approved', 'Rejected', 'Cancelled'
    this.approvedBy = data.approvedBy || null;
    this.approvedAt = data.approvedAt || null;
    this.notes = data.notes || '';
    // All leaves are unpaid per laboratory policy (Leave Without Pay / LWOP)
    this.isPaid = (data.isPaid !== undefined) ? Boolean(data.isPaid) : false;
    this.createdAt = data.createdAt || new Date().toISOString();

    this._employee = data._employee || null;
  }

  getEmployee() {
    if (this._employee) return this._employee;
    if (global.db && typeof global.db.getEmployeeById === 'function') {
      const emp = global.db.getEmployeeById(this.employeeId);
      if (emp) {
        const Employee = require('./Employee');
        this._employee = new Employee(emp);
      }
    }
    return this._employee;
  }

  async approve(approvedByUserId) {
    this.status = 'Approved';
    this.approvedBy = approvedByUserId || 'Admin';
    this.approvedAt = new Date().toISOString();

    // Deduct leave balance from employee if Vacation or Sick
    const emp = this.getEmployee();
    if (emp) {
      if (this.leaveType === 'Vacation') {
        emp.vacationLeaveBalance = Math.max(0, emp.vacationLeaveBalance - this.totalDays);
        await emp.save();
      } else if (this.leaveType === 'Sick') {
        emp.sickLeaveBalance = Math.max(0, emp.sickLeaveBalance - this.totalDays);
        await emp.save();
      }
    }

    return this.save();
  }

  async reject(rejectedByUserId, reason = '') {
    this.status = 'Rejected';
    this.approvedBy = rejectedByUserId || 'Admin';
    this.approvedAt = new Date().toISOString();
    if (reason) this.notes = (this.notes ? this.notes + '; ' : '') + 'Rejected: ' + reason;
    return this.save();
  }

  async save() {
    if (global.db && typeof global.db.saveLeaveRecord === 'function') {
      global.db.saveLeaveRecord(this);
    }
    return this;
  }

  toJSON() {
    const emp = this.getEmployee();
    return {
      ...this,
      employeeName: emp ? emp.name : 'Employee',
      employeeCode: emp ? emp.employeeCode : '',
      department: emp ? emp.department : ''
    };
  }

  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getLeaveRecordById === 'function') {
      const doc = global.db.getLeaveRecordById(id);
      return doc ? new LeaveRecord(doc) : null;
    }
    return null;
  }

  static async findByEmployeeId(employeeId) {
    if (!employeeId) return [];
    if (global.db && typeof global.db.getLeaveRecordsByEmployee === 'function') {
      const list = global.db.getLeaveRecordsByEmployee(employeeId) || [];
      return list.map(l => new LeaveRecord(l));
    }
    return [];
  }

  static async find(query = {}) {
    let list = [];
    if (global.db && typeof global.db.getLeaveRecords === 'function') {
      list = global.db.getLeaveRecords(query.employeeId) || [];
    }
    if (query.status) {
      list = list.filter(l => l.status === query.status);
    }
    if (query.leaveType) {
      list = list.filter(l => l.leaveType === query.leaveType);
    }
    return list.map(l => new LeaveRecord(l));
  }

  static async deleteById(id) {
    if (!id) return false;
    if (global.db && typeof global.db.deleteLeaveRecord === 'function') {
      return global.db.deleteLeaveRecord(id);
    }
    return false;
  }
}

module.exports = LeaveRecord;
