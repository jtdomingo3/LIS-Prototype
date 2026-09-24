const { v4: uuidv4 } = require('uuid');

class DtrRecord {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.employeeId = data.employeeId || '';
    this.date = data.date || new Date().toISOString().slice(0, 10);
    
    // 4 Punches: AM In, AM Out, PM In, PM Out
    this.amIn = data.amIn || '';
    this.amOut = data.amOut || '';
    this.pmIn = data.pmIn || '';
    this.pmOut = data.pmOut || '';

    // Auto-computed fields with strict 8-hour daily duty cap
    this.isOtApproved = Number(data.isOtApproved) || 0;
    this.approvedOtHours = Number(data.approvedOtHours) || 0;
    this.otApprovedBy = data.otApprovedBy || null;
    this.otApprovedAt = data.otApprovedAt || null;

    const computed = DtrRecord.computeHours(
      this.amIn, 
      this.amOut, 
      this.pmIn, 
      this.pmOut, 
      this.isOtApproved, 
      this.approvedOtHours
    );

    this.rawTotalHours = computed.rawTotalHours;
    this.amHours = computed.amHours;
    this.pmHours = computed.pmHours;
    this.totalHours = data.totalHours !== undefined && data.isManualAdjusted ? Number(data.totalHours) : computed.totalHours;
    this.isFullDuty = computed.isFullDuty; // 1 if >= 8.0 hrs, else 0
    this.dutyCredit = computed.dutyCredit; // 1.0 if full 8 hrs
    this.undertimeMinutes = computed.undertimeMinutes;
    this.overtimeHours = computed.overtimeHours;
    this.pendingOtHours = computed.pendingOtHours;
    this.isManualAdjusted = Number(data.isManualAdjusted) || 0;
    
    this.status = data.status || (this.isFullDuty ? '8-Hour Duty Completed' : (this.totalHours > 0 ? 'Undertime' : 'No Duty'));
    this.notes = data.notes || '';
    this.correctedBy = data.correctedBy || null;
    this.correctedAt = data.correctedAt || null;
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();

    this._employee = data._employee || null;
  }

  static computeHours(amIn, amOut, pmIn, pmOut, isOtApproved = 0, approvedOtHours = 0) {
    function timeToMinutes(t) {
      if (!t || typeof t !== 'string' || !t.includes(':')) return null;
      const parts = t.trim().split(':');
      if (parts.length < 2) return null;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return null;
      return h * 60 + m;
    }

    let amMins = 0;
    const amStart = timeToMinutes(amIn);
    const amEnd = timeToMinutes(amOut);
    if (amStart !== null && amEnd !== null && amEnd > amStart) {
      amMins = amEnd - amStart;
    }

    let pmMins = 0;
    const pmStart = timeToMinutes(pmIn);
    const pmEnd = timeToMinutes(pmOut);
    if (pmStart !== null && pmEnd !== null && pmEnd > pmStart) {
      pmMins = pmEnd - pmStart;
    }

    const totalMinutes = amMins + pmMins;
    const rawTotalHours = Math.round((totalMinutes / 60) * 100) / 100;
    
    // Standard clinical laboratory rule: valid duty is only 8.0 hours per day.
    // If raw rendered hours exceed 8 hours, it is capped at 8.0 hours unless approved by head/manager/owner.
    let totalHours = 0;
    let isFullDuty = 0;
    let dutyCredit = 0;
    let undertimeMinutes = 0;
    let overtimeHours = 0;
    let pendingOtHours = 0;

    if (rawTotalHours >= 8.0) {
      isFullDuty = 1;
      dutyCredit = 1.0;
      undertimeMinutes = 0;
      pendingOtHours = Math.max(0, Math.round((rawTotalHours - 8.0) * 100) / 100);

      if (isOtApproved && Number(approvedOtHours) > 0) {
        overtimeHours = Math.round(Number(approvedOtHours) * 100) / 100;
        totalHours = Math.round((8.0 + overtimeHours) * 100) / 100;
      } else {
        overtimeHours = 0;
        totalHours = 8.0; // Strictly count as 8.0 hours valid duty
      }
    } else {
      isFullDuty = 0;
      totalHours = rawTotalHours;
      dutyCredit = rawTotalHours > 0 ? Math.round((rawTotalHours / 8) * 100) / 100 : 0;
      undertimeMinutes = rawTotalHours > 0 ? Math.max(0, 480 - totalMinutes) : 0;
      overtimeHours = 0;
      pendingOtHours = 0;
    }

    return {
      rawTotalHours,
      amHours: Math.round((amMins / 60) * 100) / 100,
      pmHours: Math.round((pmMins / 60) * 100) / 100,
      totalMinutes,
      totalHours,
      isFullDuty,
      dutyCredit,
      undertimeMinutes,
      overtimeHours,
      pendingOtHours
    };
  }

  async save() {
    this.updatedAt = new Date().toISOString();
    if (global.db && typeof global.db.saveDtrRecord === 'function') {
      global.db.saveDtrRecord(this);
    }
    return this;
  }

  static async findByEmployeeAndMonth(employeeId, yearMonth) {
    if (!employeeId) return [];
    if (global.db && typeof global.db.getDtrRecords === 'function') {
      const rows = global.db.getDtrRecords(employeeId, yearMonth);
      return rows.map(r => new DtrRecord(r));
    }
    return [];
  }

  static async findByEmployeeAndDate(employeeId, date) {
    if (!employeeId || !date) return null;
    if (global.db && typeof global.db.getDtrRecordByDate === 'function') {
      const row = global.db.getDtrRecordByDate(employeeId, date);
      return row ? new DtrRecord(row) : null;
    }
    return null;
  }
}

module.exports = DtrRecord;
