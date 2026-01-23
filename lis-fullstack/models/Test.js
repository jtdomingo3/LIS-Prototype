const { v4: uuidv4 } = require('uuid');

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
    // Flag indicating all requested tests are awaiting-only (no routing)
    this.awaitingOnly = !!data.awaitingOnly;
  }

  // Save to database
  async save() {
    this.updatedAt = new Date();
    if (this.status === 'Completed' && !this.completedAt) {
      this.completedAt = new Date();
    }
    const tests = global.db.getTests();
    const index = tests.findIndex(t => t.id === this.id);
    if (index >= 0) {
      tests[index] = this;
    } else {
      tests.push(this);
    }
    global.db.saveTests(tests);
    return this;
  }

  // Convert to JSON
  toJSON() {
    return { ...this };
  }

  // Static methods
  static async findById(id) {
    const tests = global.db.getTests();
    const test = tests.find(t => t.id === id);
    return test ? new Test(test) : null;
  }

  static async find(query = {}) {
    let tests = global.db.getTests();

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

  static async findOne(query) {
    const tests = global.db.getTests();
    let test = null;

    if (query.testId) {
      test = tests.find(t => t.testId === query.testId);
    } else if (query._id || query.id) {
      test = tests.find(t => t.id === (query._id || query.id));
    } else if (query.patient) {
      test = tests.find(t => t.patient === query.patient);
    }

    return test ? new Test(test) : null;
  }

  static async countDocuments(query = {}) {
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
    }

    if (test) {
      Object.assign(test, updateData, { updatedAt: new Date() });
      global.db.saveTests(tests);
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
      global.db.saveTests(tests);
      return new Test(deletedTest);
    }
    return null;
  }
}

module.exports = Test;