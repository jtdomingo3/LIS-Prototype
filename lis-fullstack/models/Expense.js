const { v4: uuidv4 } = require('uuid');

class Expense {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.category = data.category || 'misc'; // 'reagent_purchase', 'equipment_service', 'overhead', 'personnel', 'misc'
    this.subcategory = data.subcategory || '';
    this.description = data.description || '';
    this.amount = Number(data.amount) || 0;
    this.currency = data.currency || 'PHP';
    this.vendorSupplier = data.vendorSupplier || '';
    this.referenceId = data.referenceId || null;
    this.referenceType = data.referenceType || 'manual'; // 'inventory_transaction', 'equipment_log', 'payroll', 'manual'
    this.expenseDate = data.expenseDate || new Date().toISOString();
    this.month = data.month || (this.expenseDate ? this.expenseDate.slice(0, 7) : new Date().toISOString().slice(0, 7));
    this.receiptUrl = data.receiptUrl || null;
    this.notes = data.notes || '';
    this.recordedBy = data.recordedBy || 'System';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  get formattedAmount() {
    return '₱' + (this.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    if (!this.month && this.expenseDate) {
      this.month = this.expenseDate.slice(0, 7);
    }
    if (global.db && typeof global.db.saveExpense === 'function') {
      global.db.saveExpense(this);
    }
    return this;
  }

  toJSON() {
    return { ...this };
  }

  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getExpenseById === 'function') {
      const doc = global.db.getExpenseById(id);
      return doc ? new Expense(doc) : null;
    }
    return null;
  }

  static async find(query = {}) {
    let list = [];
    if (global.db && typeof global.db.getExpenses === 'function') {
      list = global.db.getExpenses(query.month, query.category) || [];
    }
    if (query.subcategory) {
      list = list.filter(e => e.subcategory === query.subcategory);
    }
    if (query.vendorSupplier) {
      list = list.filter(e => e.vendorSupplier && e.vendorSupplier.toLowerCase().includes(query.vendorSupplier.toLowerCase()));
    }
    if (query.fromDate) {
      list = list.filter(e => e.expenseDate >= query.fromDate);
    }
    if (query.toDate) {
      list = list.filter(e => e.expenseDate <= query.toDate);
    }
    return list.map(e => new Expense(e));
  }

  static async findByMonth(month) {
    return Expense.find({ month });
  }

  static async deleteById(id) {
    if (!id) return false;
    if (global.db && typeof global.db.deleteExpense === 'function') {
      return global.db.deleteExpense(id);
    }
    return false;
  }

  static async aggregateByCategory(month = null) {
    const expenses = await Expense.find(month ? { month } : {});
    const map = {};
    for (const exp of expenses) {
      const cat = exp.category || 'misc';
      map[cat] = (map[cat] || 0) + (Number(exp.amount) || 0);
    }
    return map;
  }

  static async aggregateMonthly(year = new Date().getFullYear().toString()) {
    const all = await Expense.find();
    const result = {};
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      result[`${year}-${mm}`] = 0;
    }
    for (const exp of all) {
      if (exp.month && exp.month.startsWith(year)) {
        result[exp.month] = (result[exp.month] || 0) + (Number(exp.amount) || 0);
      }
    }
    return result;
  }
}

module.exports = Expense;
