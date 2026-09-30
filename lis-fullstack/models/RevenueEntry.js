const { v4: uuidv4 } = require('uuid');

class RevenueEntry {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.patientId = data.patientId || null;
    this.testId = data.testId || null;
    this.paymentMethod = data.paymentMethod || 'Cash'; // 'Cash', 'PhilHealth', 'Health Card'
    this.clinicalAmount = Number(data.clinicalAmount) || 0;
    this.xrayAmount = Number(data.xrayAmount) || 0;
    this.totalAmount = Number(data.totalAmount) || (this.clinicalAmount + this.xrayAmount);
    this.discountAmount = Number(data.discountAmount) || 0;
    this.discountType = data.discountType || 'None'; // 'Senior Citizen', 'PWD', 'Employee', 'Promo', 'None'
    this.revenueDate = data.revenueDate || new Date().toISOString();
    this.month = data.month || (this.revenueDate ? this.revenueDate.slice(0, 7) : new Date().toISOString().slice(0, 7));
    this.notes = data.notes || '';
    this.recordedBy = data.recordedBy || 'System';
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  get netAmount() {
    return Math.max(0, this.totalAmount - this.discountAmount);
  }

  get formattedAmount() {
    return '₱' + (this.netAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async save() {
    if (!this.month && this.revenueDate) {
      this.month = this.revenueDate.slice(0, 7);
    }
    if (global.db && typeof global.db.saveRevenueEntry === 'function') {
      global.db.saveRevenueEntry(this);
    }
    return this;
  }

  toJSON() {
    return { ...this };
  }

  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getRevenueEntryById === 'function') {
      const doc = global.db.getRevenueEntryById(id);
      return doc ? new RevenueEntry(doc) : null;
    }
    return null;
  }

  static async find(query = {}) {
    let list = [];
    if (global.db && typeof global.db.getRevenueEntries === 'function') {
      list = global.db.getRevenueEntries(query.month) || [];
    }
    if (query.patientId) {
      list = list.filter(r => r.patientId === query.patientId);
    }
    if (query.paymentMethod) {
      list = list.filter(r => r.paymentMethod === query.paymentMethod);
    }
    if (query.fromDate) {
      list = list.filter(r => r.revenueDate >= query.fromDate);
    }
    if (query.toDate) {
      list = list.filter(r => r.revenueDate <= query.toDate);
    }
    return list.map(r => new RevenueEntry(r));
  }

  static async findByMonth(month) {
    return RevenueEntry.find({ month });
  }

  static async deleteById(id) {
    if (!id) return false;
    if (global.db && typeof global.db.deleteRevenueEntry === 'function') {
      return global.db.deleteRevenueEntry(id);
    }
    return false;
  }

  static async aggregateByPaymentMethod(month = null) {
    const list = await RevenueEntry.find(month ? { month } : {});
    const map = { Cash: 0, PhilHealth: 0, 'Health Card': 0, Other: 0 };
    for (const r of list) {
      const pm = r.paymentMethod || 'Cash';
      if (pm.toLowerCase().includes('cash')) map.Cash += (r.totalAmount || 0);
      else if (pm.toLowerCase().includes('philhealth')) map.PhilHealth += (r.totalAmount || 0);
      else if (pm.toLowerCase().includes('health card') || pm.toLowerCase().includes('hmo')) map['Health Card'] += (r.totalAmount || 0);
      else map.Other += (r.totalAmount || 0);
    }
    return map;
  }

  static async aggregateMonthly(year = new Date().getFullYear().toString()) {
    const all = await RevenueEntry.find();
    const result = {
      clinical: {},
      xray: {},
      total: {}
    };
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const key = `${year}-${mm}`;
      result.clinical[key] = 0;
      result.xray[key] = 0;
      result.total[key] = 0;
    }
    for (const rev of all) {
      if (rev.month && rev.month.startsWith(year)) {
        result.clinical[rev.month] = (result.clinical[rev.month] || 0) + (Number(rev.clinicalAmount) || 0);
        result.xray[rev.month] = (result.xray[rev.month] || 0) + (Number(rev.xrayAmount) || 0);
        result.total[rev.month] = (result.total[rev.month] || 0) + (Number(rev.totalAmount) || 0);
      }
    }
    return result;
  }
}

module.exports = RevenueEntry;
