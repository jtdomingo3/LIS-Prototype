const { v4: uuidv4 } = require('uuid');

class PhilhealthRecord {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.controlNo = data.controlNo || null; // e.g., PH-YYYY-MM-00001
    this.patientId = data.patientId;
    this.recordDate = data.recordDate || (new Date()).toISOString().slice(0, 10);
    this.firstName = data.firstName || '';
    this.middleName = data.middleName || '';
    this.lastName = data.lastName || '';
    this.pinNo = data.pinNo || '';
    this.agency = data.agency || '';
    this.pcuError = data.pcuError || '';
    // procedures is an array of selected test objects:
    // [{ key, label, category, remarks, forSendOut, targetArea }]
    this.procedures = Array.isArray(data.procedures) ? data.procedures : [];
    this.status = data.status || 'Pending Approval'; // 'Pending Approval' | 'Approved' | 'Completed' | 'Cancelled'
    this.tranche1Encoded = data.tranche1Encoded || 'Pending'; // 'Pending' | 'Completed'
    this.tranche2Encoded = data.tranche2Encoded || 'Pending'; // 'Pending' | 'Completed'
    this.ekas = data.ekas || 'Pending'; // 'Pending' | 'Completed'
    this.tranche1Paid = data.tranche1Paid || 'Not Paid'; // 'Not Paid' | 'Paid'
    this.tranche2Paid = data.tranche2Paid || 'Not Paid'; // 'Not Paid' | 'Paid'
    this.soaRef = data.soaRef || '';
    this.paidDate = data.paidDate || '';
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
      this.controlNo = PhilhealthRecord.getNextControlNo(this.recordDate || this.createdAt);
    }
    if (global.db && typeof global.db.savePhilhealthRecord === 'function') {
      global.db.savePhilhealthRecord(this);
    }
    return this;
  }

  toJSON() {
    return {
      ...this,
      fullName: this.fullName
    };
  }

  // Generate control number in format PH-YYYY-MM-00001
  static getNextControlNo(recordDate) {
    try {
      let d = new Date();
      if (recordDate) {
        const parsed = new Date(recordDate);
        if (!isNaN(parsed.getTime())) d = parsed;
      }
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const key = `philhealth-${yyyy}${mm}`;
      const counters = (global.db && typeof global.db.getCounters === 'function') ? (global.db.getCounters() || {}) : {};
      const next = (counters[key] || 0) + 1;
      counters[key] = next;
      if (global.db && typeof global.db.saveCounters === 'function') {
        global.db.saveCounters(counters);
      }
      return `PH-${yyyy}-${mm}-${String(next).padStart(5, '0')}`;
    } catch (e) {
      const now = new Date();
      return `PH-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-5)}`;
    }
  }

  static async find(query = {}) {
    let records = [];
    if (global.db && typeof global.db.getPhilhealthRecords === 'function') {
      records = global.db.getPhilhealthRecords(query) || [];
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
      if (query.pinNo) {
        records = records.filter(r => r.pinNo === query.pinNo);
      }
      if (query.tranche1Paid) {
        records = records.filter(r => r.tranche1Paid === query.tranche1Paid);
      }
      if (query.tranche2Paid) {
        records = records.filter(r => r.tranche2Paid === query.tranche2Paid);
      }
      if (query.search) {
        const s = String(query.search).toLowerCase().trim();
        records = records.filter(r => {
          const fn = String(r.firstName || '').toLowerCase();
          const mn = String(r.middleName || '').toLowerCase();
          const ln = String(r.lastName || '').toLowerCase();
          const c = String(r.controlNo || '').toLowerCase();
          const pin = String(r.pinNo || '').toLowerCase();
          const pcu = String(r.pcuError || '').toLowerCase();
          const ag = String(r.agency || '').toLowerCase();
          return fn.includes(s) || mn.includes(s) || ln.includes(s) || c.includes(s) || pin.includes(s) || pcu.includes(s) || ag.includes(s);
        });
      }
    }

    // Sort by createdAt descending
    records.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return records.map(r => new PhilhealthRecord(r));
  }

  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getPhilhealthRecordById === 'function') {
      const rec = global.db.getPhilhealthRecordById(id);
      if (rec) return new PhilhealthRecord(rec);
    }
    const all = await this.find();
    const found = all.find(r => r.id === id || r.controlNo === id);
    return found ? new PhilhealthRecord(found) : null;
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
    if (existing && global.db && typeof global.db.deletePhilhealthRecord === 'function') {
      global.db.deletePhilhealthRecord(existing.id);
      return existing;
    }
    return null;
  }
}

module.exports = PhilhealthRecord;
