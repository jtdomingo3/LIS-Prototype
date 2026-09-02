const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { logReportError } = require('../lib/reportLogger');
const reportGenerator = require('../lib/reportGenerator');

class Test {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.testId = data.testId;
    this.patient = data.patient;
    this.testType = data.testType;
    this.testDate = data.testDate;
    this.status = data.status || 'Pending';
    // specimenNumbers is a mapping of areaName -> specimenCode (string)
    this.specimenNumbers = data.specimenNumbers || {};
    // assigned doctor info (optional)
    this.assignedDoctorId = data.assignedDoctorId || data.assignedDoctor || null;
    this.assignedDoctorName = data.assignedDoctorName || data.assignedDoctorName || null;
    this.results = data.results;
    this.notes = data.notes;
    this.priority = data.priority || 'Normal';
    this.requestedBy = data.requestedBy;
    this.performedBy = data.performedBy;
    this.completedAt = data.completedAt;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    // Preserve requestedTests (array of { key,label,amount,lab }) when provided
    this.requestedTests = Array.isArray(data.requestedTests) ? data.requestedTests : (data.requestedTests || []);
    this.paid = !!data.paid;
    this.price = data.price !== undefined ? data.price : 0;
    this.department = data.department || '';
    // Flag indicating test results have been released (cleared from Releasing of Result queue)
    this.released = !!data.released;
    // Flag indicating test results are stashed (patient unavailable, held at reception)
    this.stashed = !!data.stashed;
    // Flag indicating all requested tests are awaiting-only (no routing)
    this.awaitingOnly = !!data.awaitingOnly;
    // statusHistory: array of { from, to, user, area, timestamp }
    this.statusHistory = Array.isArray(data.statusHistory) ? data.statusHistory : (data.statusHistory || []);
  }

  // Save to database
  async save() {
    this.updatedAt = new Date();
    // normalize to ISO string so disk comparisons are consistent
    try { this.updatedAt = new Date().toISOString(); } catch (e) { this.updatedAt = String(new Date()); }
    if (this.status === 'Completed' && !this.completedAt) {
      try { this.completedAt = new Date().toISOString(); } catch (e) { this.completedAt = String(new Date()); }
    }
    const tests = global.db.getTests();
    if (!this.testId) {
      const maxNum = tests.reduce((max, t) => {
        const n = parseInt((t.testId || 'T0').replace(/\D/g, '')) || 0;
        return Math.max(max, n);
      }, 0);
      this.testId = 'T' + String(maxNum + 1).padStart(3, '0');
    }
    const index = tests.findIndex(t => t.id === this.id);
    // Ensure initial statusHistory entry exists for new records
    if (index < 0) {
      if (!Array.isArray(this.statusHistory) || this.statusHistory.length === 0) {
        this.statusHistory = [{ from: null, to: this.status || null, user: null, area: this.status || null, timestamp: (new Date()).toISOString() }];
      }
      tests.push(this);
    } else {
      // If updating, ensure we don't duplicate history entries — only add if last entry differs
      const prev = tests[index];
      // Guard: once a test is Completed or Released, do not allow reverting to a non-completed state
      try {
        const lockedStates = new Set(['Completed', 'Released']);
        if (prev && prev.status && lockedStates.has(prev.status) && !(this.status && lockedStates.has(this.status))) {
          // attempted revert detected
          const msg = `Attempted to revert locked test id=${this.id} from ${prev.status} to ${this.status}`;
          console.warn('[GUARD]', msg);
          try { logReportError(msg, 'guard:revert-test'); } catch (e) {}
          // enforce previous completed/released status
          this.status = prev.status;
          // keep completedAt from prev
          this.completedAt = prev.completedAt || this.completedAt;
        }
      } catch (e) {}
      const last = Array.isArray(this.statusHistory) && this.statusHistory.length ? this.statusHistory[this.statusHistory.length - 1] : null;
      const prevStatus = prev && prev.status ? prev.status : null;
      if (prevStatus !== this.status) {
        // Only append if last recorded 'to' is different
        if (!last || last.to !== this.status) {
          const entry = { from: prevStatus, to: this.status, user: null, area: this.status, timestamp: (new Date()).toISOString() };
          this.statusHistory = Array.isArray(this.statusHistory) ? this.statusHistory : [];
          this.statusHistory.push(entry);
        }
      }
      tests[index] = this;
    }
    global.db.saveTests(tests);
    // After persisting, if the test is Completed/Released and has results, regenerate PDF
    try {
      const lockedStates = new Set(['Completed', 'Released']);
      if (lockedStates.has(this.status) && this.results) {
        // generate asynchronously — do not block save
        const testRef = this;
        setImmediate(async () => {
          try {
            await reportGenerator.generatePdfForTest(testRef);
            console.log(`[Test.save] auto-generated PDF for testId=${testRef.testId || testRef.id}`);
          } catch (e) {
            try { logReportError(e, 'auto-generate-pdf'); } catch (er) {}
          }
        });
      }
    } catch (e) {}

    return this;
  }

  // Add a status history entry with optional user/area and do not save automatically
  addStatusEntry(entry) {
    try {
      this.statusHistory = Array.isArray(this.statusHistory) ? this.statusHistory : [];
      const e = Object.assign({}, entry || {});
      if (!e.timestamp) e.timestamp = (new Date()).toISOString();
      this.statusHistory.push(e);
    } catch (e) {}
  }

  // Convert to JSON
  toJSON() {
    return { ...this };
  }

  // Static methods
  static async findById(id) {
    if (!id) return null;
    if (global.db) {
      if (typeof global.db.getTestById === 'function') {
        const test = global.db.getTestById(id);
        if (test) return new Test(test);
      }
      if (typeof global.db.getTestByTestId === 'function') {
        const test = global.db.getTestByTestId(id);
        if (test) return new Test(test);
      }
    }
    const tests = global.db && global.db.getTests ? global.db.getTests() : [];
    let test = tests.find(t => t.id === id);
    if (!test) test = tests.find(t => t.testId === id);
    return test ? new Test(test) : null;
  }

  static async find(query = {}) {
    if (global.db && typeof global.db.queryTests === 'function') {
      const results = global.db.queryTests(query);
      return results.map(t => new Test(t));
    }
    let tests = global.db && global.db.getTests ? global.db.getTests() : [];

    if (query.patient) {
      tests = tests.filter(t => t.patient === query.patient);
    }

    if (query.status) {
      tests = tests.filter(t => t.status === query.status);
    }

    // Sorting
    tests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return tests.map(t => new Test(t));
  }

  static async findOne(query = {}) {
    if (!query) return null;
    if (global.db) {
      if (query.testId && typeof global.db.getTestByTestId === 'function') {
        const test = global.db.getTestByTestId(query.testId);
        if (test) return new Test(test);
      }
      if ((query._id || query.id) && typeof global.db.getTestById === 'function') {
        const test = global.db.getTestById(query._id || query.id);
        if (test) return new Test(test);
      }
      if (typeof global.db.queryTests === 'function') {
        const results = global.db.queryTests(query, { limit: 1 });
        if (results && results.length) return new Test(results[0]);
      }
    }
    const tests = global.db && global.db.getTests ? global.db.getTests() : [];
    let test = null;

    if (query.testId) {
      test = tests.find(t => t.testId === query.testId);
    } else if (query._id || query.id) {
      test = tests.find(t => t.id === (query._id || query.id));
      if (!test) test = tests.find(t => t.testId === (query._id || query.id));
    } else if (query.patient) {
      test = tests.find(t => t.patient === query.patient);
    }

    return test ? new Test(test) : null;
  }

  static async countDocuments(query = {}) {
    if (global.db && typeof global.db.countTests === 'function') {
      return global.db.countTests(query);
    }
    const tests = await this.find(query);
    return tests.length;
  }

  static async findOneAndUpdate(query, updateData, options = {}) {
    const tests = global.db.getTests();
    let test = null;

    if (query.testId) {
      test = tests.find(t => t.testId === query.testId);
    } else if (query._id || query.id) {
      test = tests.find(t => t.id === (query._id || query.id));
      if (!test) test = tests.find(t => t.testId === (query._id || query.id));
    }

    if (test) {
      // Instrumentation: set/normalize incoming updatedAt
      const incoming = Object.assign({}, updateData);
      if (!incoming.updatedAt) {
        try { incoming.updatedAt = new Date().toISOString(); } catch (e) { incoming.updatedAt = String(new Date()); }
      }

      // Stale-update guard: if disk has newer updatedAt, skip apply
      try {
        const diskTs = test && test.updatedAt ? Date.parse(test.updatedAt) : 0;
        const incTs = incoming && incoming.updatedAt ? Date.parse(incoming.updatedAt) : 0;
        if (diskTs && incTs && incTs < diskTs) {
          console.log(`[DEBUG Test.findOneAndUpdate] skipping stale update id=${test.id} incoming=${new Date(incTs).toISOString()} disk=${new Date(diskTs).toISOString()}`);
          return options.new !== false ? new Test(test) : new Test(test);
        }
      } catch (e) {}

      // Guard: prevent reverting Completed/Released via findOneAndUpdate
      try {
        const locked = new Set(['Completed', 'Released']);
        if (test && test.status && locked.has(test.status) && incoming && incoming.status && !locked.has(incoming.status)) {
          const msg = `Attempted to revert locked test id=${test.id} from ${test.status} to ${incoming.status} (findOneAndUpdate)`;
          console.warn('[GUARD]', msg);
          try { logReportError(msg, 'guard:revert-test'); } catch (e) {}
          // drop incoming.status to preserve locked state
          delete incoming.status;
          // don't touch completedAt
          if (incoming.completedAt) delete incoming.completedAt;
        }
      } catch (e) {}

      console.log(`[DEBUG Test.findOneAndUpdate] id=${test.id} beforeStatus=${test.status} update=${JSON.stringify(incoming).slice(0,200)}`);
      Object.assign(test, incoming);
      // ensure updatedAt normalization on disk object
      test.updatedAt = incoming.updatedAt;
      global.db.saveTests(tests);
      console.log(`[DEBUG Test.findOneAndUpdate] id=${test.id} afterStatus=${test.status} updatedAt=${test.updatedAt}`);

      // Auto-generate PDF if test is Completed/Released and has results
      try {
        const lockedStates2 = new Set(['Completed', 'Released']);
        if (lockedStates2.has(test.status) && test.results) {
          const testRef = new Test(test);
          setImmediate(async () => {
            try {
              const pdfPath = await reportGenerator.generatePdfForTest(testRef);
              if (pdfPath) {
                console.log(`[Test.findOneAndUpdate] auto-generated PDF for testId=${testRef.testId || testRef.id}`);
              }
            } catch (e) {
              try { logReportError(e, 'auto-generate-pdf-findOneAndUpdate'); } catch (er) {}
            }
          });
        }
      } catch (e) {}

      return options.new !== false ? new Test(test) : new Test(test);
    }

    return null;
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    return await this.findOneAndUpdate({ id }, updateData, options);
  }

  static async findByIdAndDelete(id) {
    const tests = global.db.getTests();
    const index = tests.findIndex(t => t.id === id);
    if (index >= 0) {
      const deletedTest = tests.splice(index, 1)[0];
      // Persist deletion by writing the full data object directly to disk.
      // `db.saveTests` performs a merge overlay which can unintentionally
      // preserve entries that were removed from the incoming array. For
      // deletions we must replace the on-disk tests list with the updated
      // array to ensure the removed test does not remain.
      try {
        const data = global.db.read();
        data.tests = tests;
        global.db.write(data);
      } catch (e) {
        // Fallback to the existing API if direct write fails
        try { global.db.saveTests(tests); } catch (e2) { console.error('Failed to persist deleted test:', e2); }
      }
      return new Test(deletedTest);
    }
    return null;
  }
}

module.exports = Test;