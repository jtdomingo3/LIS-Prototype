const { v4: uuidv4 } = require('uuid');

class HealthCardRecord {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.controlNo = data.controlNo || null; // e.g., HC-YYYY-MM-00001
    this.patientId = data.patientId || '';
    this.recordDate = data.recordDate || (new Date()).toISOString().slice(0, 10);
    this.firstName = data.firstName || '';
    this.middleName = data.middleName || '';
    this.lastName = data.lastName || '';
    this.hmoProvider = data.hmoProvider || ''; // e.g., Maxicare, Intellicare, Medicard
    this.cardNumber = data.cardNumber || ''; // Member ID / Card No.
    this.company = data.company || ''; // Corporate account / Employer
    this.loaNumber = data.loaNumber || ''; // Letter of Authorization #
    this.loaDate = data.loaDate || ''; // Date LOA was issued
    this.loaExpiry = data.loaExpiry || ''; // LOA validity/expiry date
    this.availmentType = data.availmentType || 'Outpatient Diagnostic'; // Outpatient, Consultation, Executive Checkup, etc.
    this.diagnosis = data.diagnosis || ''; // Clinical diagnosis / ICD-10
    this.physician = data.physician || ''; // Requesting/Attending Doctor

    // procedures is an array of selected test objects:
    // [{ key, label, category, amount, hmoCovered, patientExcess, remarks, forSendOut, targetArea }]
    this.procedures = Array.isArray(data.procedures) ? data.procedures : [];

    // Financial breakdown
    this.grossAmount = Number(data.grossAmount || 0);
    this.hmoCoveredAmount = Number(data.hmoCoveredAmount || 0);
    this.patientExcessAmount = Number(data.patientExcessAmount || 0);

    // Lifecycle status: 'Pending LOA' | 'Approved' | 'Billed' | 'Paid' | 'Denied' | 'Cancelled'
    this.status = data.status || 'Pending LOA';

    // Billing & HMO settlement tracking
    this.soaRef = data.soaRef || ''; // Billing statement / Transmittal SOA number
    this.billedDate = data.billedDate || ''; // Date claim was submitted/billed to HMO
    this.paidDate = data.paidDate || ''; // Date payment was received from HMO
    this.paymentRef = data.paymentRef || ''; // Check # or remittance ref #
    this.ewtAmount = Number(data.ewtAmount || 0); // 2% BIR Expanded Withholding Tax
    this.netAmount = Number(data.netAmount || 0); // Net amount paid

    this.testIds = Array.isArray(data.testIds) ? data.testIds : [];
    this.approvedBy = data.approvedBy || null;
    this.approvedAt = data.approvedAt || null;
    this.notes = data.notes || '';
    this.createdAt = data.createdAt || (new Date()).toISOString();
    this.updatedAt = data.updatedAt || (new Date()).toISOString();
  }

  get fullName() {
    const m = (this.middleName || '').toString().trim();
    if (m) return `${this.firstName} ${m} ${this.lastName}`;
    return `${this.firstName} ${this.lastName}`;
  }

  async save() {
    this.updatedAt = (new Date()).toISOString();
    if (!this.controlNo) {
      this.controlNo = HealthCardRecord.getNextControlNo(this.recordDate || this.createdAt);
    }
    if (global.db && typeof global.db.saveHealthCardRecord === 'function') {
      global.db.saveHealthCardRecord(this);
    }
    return this;
  }

  toJSON() {
    return {
      ...this,
      fullName: this.fullName
    };
  }

  // Generate control number in format HC-YYYY-MM-00001
  static getNextControlNo(recordDate) {
    try {
      let d = new Date();
      if (recordDate) {
        const parsed = new Date(recordDate);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const key = `healthcard-${yyyy}${mm}`;
      const counters = (global.db && typeof global.db.getCounters === 'function') ? (global.db.getCounters() || {}) : {};
      const next = (counters[key] || 0) + 1;
      counters[key] = next;
      if (global.db && typeof global.db.saveCounters === 'function') {
        global.db.saveCounters(counters);
      }
      return `HC-${yyyy}-${mm}-${String(next).padStart(5, '0')}`;
    } catch (e) {
      const now = new Date();
      return `HC-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-5)}`;
    }
  }

  static async find(query = {}) {
    let records = [];
    if (global.db && typeof global.db.getHealthCardRecords === 'function') {
      records = global.db.getHealthCardRecords(query) || [];
    }

    if (query && typeof query === 'object') {
      if (query.status) {
        records = records.filter(r => r.status === query.status);
      }
      if (query.patientId) {
        records = records.filter(r => String(r.patientId) === String(query.patientId));
      }
      if (query.controlNo) {
        records = records.filter(r => r.controlNo === query.controlNo);
      }
      if (query.hmoProvider) {
        records = records.filter(r => (r.hmoProvider || '').toLowerCase() === String(query.hmoProvider).toLowerCase());
      }
      if (query.cardNumber) {
        records = records.filter(r => r.cardNumber === query.cardNumber);
      }
      if (query.loaNumber) {
        records = records.filter(r => r.loaNumber === query.loaNumber);
      }
      if (query.search) {
        const s = String(query.search).toLowerCase().trim();
        records = records.filter(r => {
          const fn = String(r.firstName || '').toLowerCase();
          const mn = String(r.middleName || '').toLowerCase();
          const ln = String(r.lastName || '').toLowerCase();
          const c = String(r.controlNo || '').toLowerCase();
          const hmo = String(r.hmoProvider || '').toLowerCase();
          const card = String(r.cardNumber || '').toLowerCase();
          const loa = String(r.loaNumber || '').toLowerCase();
          const cmp = String(r.company || '').toLowerCase();
          const diag = String(r.diagnosis || '').toLowerCase();
          return fn.includes(s) || mn.includes(s) || ln.includes(s) || c.includes(s) || hmo.includes(s) || card.includes(s) || loa.includes(s) || cmp.includes(s) || diag.includes(s);
        });
      }
    }

    // Sort by createdAt descending
    records.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return records.map(r => new HealthCardRecord(r));
  }

  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getHealthCardRecordById === 'function') {
      const rec = global.db.getHealthCardRecordById(id);
      if (rec) return new HealthCardRecord(rec);
    }
    const all = await this.find();
    const found = all.find(r => r.id === id || r.controlNo === id);
    return found ? new HealthCardRecord(found) : null;
  }

  static async findOne(query = {}) {
    const list = await this.find(query);
    return list.length ? list[0] : null;
  }

  static async findByIdAndUpdate(id, updates = {}) {
    const rec = await this.findById(id);
    if (!rec) return null;
    Object.assign(rec, updates);
    await rec.save();
    return rec;
  }

  static async findByIdAndDelete(id) {
    if (!id) return null;
    const existing = await this.findById(id);
    if (existing && global.db && typeof global.db.deleteHealthCardRecord === 'function') {
      global.db.deleteHealthCardRecord(existing.id);
      return existing;
    }
    return null;
  }
}

module.exports = HealthCardRecord;
