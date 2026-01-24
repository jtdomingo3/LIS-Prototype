const { v4: uuidv4 } = require('uuid');

class Patient {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.patientId = data.patientId;
    this.patientCode = data.patientCode; // e.g., GCL-YYYY-MM-00000
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.dateOfBirth = data.dateOfBirth;
    this.physician = data.physician || data.physicianName || null;
    // If encoder supplied an age instead of DOB, store it here
    this.ageManual = data.ageManual || data.age || null;
    // Preserve payment history (if any)
    this.paymentHistory = Array.isArray(data.paymentHistory) ? data.paymentHistory : (data.paymentHistory ? data.paymentHistory : []);
    this.gender = data.gender;
    this.phone = data.phone;
    this.email = data.email;
    this.address = data.address;
    // list of reception areas this patient needs to go to (after Payment Area)
    this.requiredAreas = Array.isArray(data.requiredAreas) ? data.requiredAreas : (data.requiredAreas ? [data.requiredAreas] : []);
    // preserve selected tests list for extraction/processing visibility
    this.requestedTests = Array.isArray(data.requestedTests) ? data.requestedTests : (data.requestedTests ? [data.requestedTests] : []);
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.createdBy = data.createdBy;
  }

  // Virtual for full name
  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  }

  // Virtual for age
  get age() {
    if (!this.dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(this.dateOfBirth);
    if (isNaN(birthDate.getTime())) return null;
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  // Save to database
  async save() {
    this.updatedAt = new Date();
    const patients = global.db.getPatients();
    const index = patients.findIndex(p => p.id === this.id);
    if (index >= 0) {
      patients[index] = this;
    } else {
      patients.push(this);
    }
    global.db.savePatients(patients);
    return this;
  }

  // Convert to JSON with virtuals
  toJSON() {
    const obj = { ...this };
    // Ensure paymentHistory is present in serialized output
    obj.paymentHistory = Array.isArray(this.paymentHistory) ? this.paymentHistory : [];
    obj.fullName = this.fullName;
    // Prefer computed age from DOB; fallback to manual age if provided (preserve 0)
    if (this.age !== null && this.age !== undefined) {
      obj.age = this.age;
    } else if (this.ageManual !== undefined && this.ageManual !== null && String(this.ageManual).trim() !== '') {
      const maybeNum = Number(this.ageManual);
      obj.age = !isNaN(maybeNum) ? maybeNum : String(this.ageManual);
    } else {
      obj.age = null;
    }
    obj.physician = this.physician || null;
    // Preserve manual age as string so values like 0 are not treated as missing
    obj.ageManual = (this.ageManual !== undefined && this.ageManual !== null && String(this.ageManual).trim() !== '') ? String(this.ageManual) : null;
    obj.requiredAreas = this.requiredAreas || [];
    obj.requestedTests = Array.isArray(this.requestedTests) ? this.requestedTests : [];
    // Provide legacy `sex` alias for templates that expect `patient.sex`
    obj.sex = obj.gender || null;
    return obj;
  }

  // Static methods
  static async findById(id) {
    const patients = global.db.getPatients();
    const patient = patients.find(p => p.id === id);
    return patient ? new Patient(patient) : null;
  }

  static async find(query = {}) {
    let patients = global.db.getPatients();

    if (query.createdBy) {
      patients = patients.filter(p => p.createdBy === query.createdBy);
    }

    // Sorting
    patients.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return patients.map(p => new Patient(p));
  }

  static async findOne(query) {
    const patients = global.db.getPatients();
    let patient = null;

    if (query.patientId) {
      patient = patients.find(p => p.patientId === query.patientId);
    } else if (query._id || query.id) {
      patient = patients.find(p => p.id === (query._id || query.id));
    } else if (query.createdBy) {
      patient = patients.find(p => p.createdBy === query.createdBy);
    }

    return patient ? new Patient(patient) : null;
  }

  static async countDocuments(query = {}) {
    const patients = await this.find(query);
    return patients.length;
  }

  static async findOneAndUpdate(query, updateData, options = {}) {
    const patients = global.db.getPatients();
    let patient = null;

    if (query.patientId) {
      patient = patients.find(p => p.patientId === query.patientId);
    } else if (query._id || query.id) {
      patient = patients.find(p => p.id === (query._id || query.id));
    }

    if (patient) {
      Object.assign(patient, updateData, { updatedAt: new Date() });
      global.db.savePatients(patients);
      return options.new !== false ? new Patient(patient) : new Patient(patient);
    }

    return null;
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    return await this.findOneAndUpdate({ id }, updateData, options);
  }

  static async findByIdAndDelete(id) {
    const patients = global.db.getPatients();
    const index = patients.findIndex(p => p.id === id);
    if (index >= 0) {
      const deletedPatient = patients.splice(index, 1)[0];
      global.db.savePatients(patients);
      return new Patient(deletedPatient);
    }
    return null;
  }
}

module.exports = Patient;