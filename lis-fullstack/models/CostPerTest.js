const { v4: uuidv4 } = require('uuid');

class CostPerTest {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.testType = data.testType || '';
    // inventoryItems is an array of { inventoryId, name, quantityPerTest, unit, unitCost }
    let items = data.inventoryItems;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch (_) { items = []; }
    }
    this.inventoryItems = Array.isArray(items) ? items : [];
    this.estimatedCost = Number(data.estimatedCost) || 0;
    this.notes = data.notes || '';
    this.updatedBy = data.updatedBy || 'System';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  // Recalculate cost based on current inventory items unit costs
  recalculateCost() {
    let sum = 0;
    for (const it of this.inventoryItems) {
      const qty = Number(it.quantityPerTest) || 0;
      const cost = Number(it.unitCost) || 0;
      sum += (qty * cost);
    }
    this.estimatedCost = Math.round(sum * 100) / 100;
    return this.estimatedCost;
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    if (global.db && typeof global.db.saveCostPerTest === 'function') {
      global.db.saveCostPerTest(this);
    }
    return this;
  }

  toJSON() {
    return { ...this };
  }

  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getCostPerTestById === 'function') {
      const doc = global.db.getCostPerTestById(id);
      return doc ? new CostPerTest(doc) : null;
    }
    return null;
  }

  static async findByTestType(testType) {
    if (!testType) return null;
    if (global.db && typeof global.db.getCostPerTestByType === 'function') {
      const doc = global.db.getCostPerTestByType(testType);
      return doc ? new CostPerTest(doc) : null;
    }
    return null;
  }

  static async find(query = {}) {
    let list = [];
    if (global.db && typeof global.db.getCostPerTests === 'function') {
      list = global.db.getCostPerTests() || [];
    }
    if (query.testType) {
      list = list.filter(c => c.testType === query.testType);
    }
    return list.map(c => new CostPerTest(c));
  }

  static async deleteById(id) {
    if (!id) return false;
    if (global.db && typeof global.db.deleteCostPerTest === 'function') {
      return global.db.deleteCostPerTest(id);
    }
    return false;
  }
}

module.exports = CostPerTest;
