const { v4: uuidv4 } = require('uuid');

class HrDocument {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.employeeId = data.employeeId || '';
    this.documentType = data.documentType || 'Other'; // 'COE', 'Payslip', 'Clearance', 'TaxForm', 'Contract', 'Memo', 'Other'
    this.title = data.title || '';
    this.description = data.description || '';
    this.filePath = data.filePath || null;
    this.fileSize = parseInt(data.fileSize, 10) || 0;
    this.mimeType = data.mimeType || '';
    this.forPeriod = data.forPeriod || null; // 'YYYY-MM' or 'YYYY'
    this.generatedBy = data.generatedBy || 'System';
    this.isGenerated = data.isGenerated ? 1 : 0;
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  async save() {
    if (global.db && typeof global.db.saveHrDocument === 'function') {
      global.db.saveHrDocument(this);
    }
    return this;
  }

  toJSON() {
    return { ...this };
  }

  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getHrDocumentById === 'function') {
      const doc = global.db.getHrDocumentById(id);
      return doc ? new HrDocument(doc) : null;
    }
    return null;
  }

  static async findByEmployeeId(employeeId) {
    if (!employeeId) return [];
    if (global.db && typeof global.db.getHrDocumentsByEmployee === 'function') {
      const list = global.db.getHrDocumentsByEmployee(employeeId) || [];
      return list.map(d => new HrDocument(d));
    }
    return [];
  }

  static async find(query = {}) {
    let list = [];
    if (global.db && typeof global.db.getHrDocuments === 'function') {
      list = global.db.getHrDocuments(query.employeeId) || [];
    }
    if (query.documentType) {
      list = list.filter(d => d.documentType === query.documentType);
    }
    if (query.forPeriod) {
      list = list.filter(d => d.forPeriod === query.forPeriod);
    }
    return list.map(d => new HrDocument(d));
  }

  static async deleteById(id) {
    if (!id) return false;
    if (global.db && typeof global.db.deleteHrDocument === 'function') {
      return global.db.deleteHrDocument(id);
    }
    return false;
  }
}

module.exports = HrDocument;
