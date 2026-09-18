const { v4: uuidv4 } = require('uuid');

class Patient {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.patientId = data.patientId;
    this.patientCode = data.patientCode; // e.g., GCL-YYYY-MM-00000
    this.firstName = data.firstName;
    this.middleName = data.middleName || '';
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
    this.company = data.company || '';
    this.philhealthConsent = !!data.philhealthConsent;
    this.philhealthId = data.philhealthId || '';
    this.healthInsuranceConsent = !!(data.healthInsuranceConsent === '1' || data.healthInsuranceConsent === 1 || data.healthInsuranceConsent === true || data.healthInsuranceConsent === 'true');
    this.healthInsuranceProvider = data.healthInsuranceProvider || data.healthCardProvider || '';
    this.healthInsuranceId = data.healthInsuranceId || data.healthCardNumber || '';
    this.client_id = data.client_id || data.clientId || null;
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.createdBy = data.createdBy;
  }

  // Virtual for full name
  get fullName() {
    const m = (this.middleName || '').toString().trim();
    if (m) return `${this.firstName} ${m} ${this.lastName}`;
    return `${this.firstName} ${this.lastName}`;
  }

  // Virtual for age
  get age() {
    // 1. If manual age is provided, prioritize it (supports numeric e.g. 32 or text e.g. '5 mos', '28 days')
    if (this.ageManual !== undefined && this.ageManual !== null && String(this.ageManual).trim() !== '') {
      const trimmed = String(this.ageManual).trim();
      const maybeNum = Number(trimmed);
      return (!isNaN(maybeNum) && /^\d+$/.test(trimmed)) ? maybeNum : trimmed;
    }

    // 2. Compute from dateOfBirth
    if (this.dateOfBirth) {
      let birthDate = null;
      if (typeof this.dateOfBirth === 'string') {
        const str = this.dateOfBirth.trim();
        // Check MM/DD/YYYY format
        const mmddMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mmddMatch) {
          birthDate = new Date(parseInt(mmddMatch[3], 10), parseInt(mmddMatch[1], 10) - 1, parseInt(mmddMatch[2], 10));
        } else if (str.includes('-')) {
          const parts = str.split('T')[0].split('-');
          if (parts.length === 3) {
            birthDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          }
        }
      }
      if (!birthDate || isNaN(birthDate.getTime())) {
        birthDate = new Date(this.dateOfBirth);
      }

      if (birthDate && !isNaN(birthDate.getTime())) {
        const today = new Date();
        let years = today.getFullYear() - birthDate.getFullYear();
        let months = today.getMonth() - birthDate.getMonth();
        let days = today.getDate() - birthDate.getDate();

        if (days < 0) {
          months--;
          const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
          days += prevMonth.getDate();
        }
        if (months < 0) {
          years--;
          months += 12;
        }

        if (years >= 1) {
          return years;
        } else if (months >= 1) {
          return `${months} ${months === 1 ? 'mo' : 'mos'}`;
        } else {
          const dCount = Math.max(0, days);
          return `${dCount} ${dCount === 1 ? 'day' : 'days'}`;
        }
      }
    }
    return null;
  }

  // Save to database
  async save() {
    this.updatedAt = new Date();
    const patients = global.db && global.db.getPatients ? global.db.getPatients() : [];
    if (!this.patientId) {
      const maxNum = patients.reduce((max, p) => {
        const n = parseInt((p.patientId || 'P0').replace(/\D/g, '')) || 0;
        return Math.max(max, n);
      }, 0);
      this.patientId = 'P' + String(maxNum + 1).padStart(3, '0');
    }
    if (global.db && typeof global.db.upsertPatient === 'function') {
      global.db.upsertPatient(this);
    } else if (global.db && typeof global.db.savePatients === 'function') {
      const index = patients.findIndex(p => p.id === this.id);
      if (index >= 0) {
        patients[index] = this;
      } else {
        patients.push(this);
      }
      global.db.savePatients(patients);
    }
    return this;
  }

  // Convert to JSON with virtuals
  toJSON() {
    const obj = { ...this };
    // Ensure paymentHistory is present in serialized output
    obj.paymentHistory = Array.isArray(this.paymentHistory) ? this.paymentHistory : [];
    obj.fullName = this.fullName;
    obj.middleName = this.middleName || '';
    // Age property (supports number or string e.g. '5 mos')
    obj.age = (this.age !== null && this.age !== undefined && this.age !== '') ? this.age : null;
    obj.physician = this.physician || null;
    // Preserve manual age as string or number so infant ages like '5 mos' are not lost
    obj.ageManual = (this.ageManual !== undefined && this.ageManual !== null && String(this.ageManual).trim() !== '') ? String(this.ageManual).trim() : null;
    obj.requiredAreas = this.requiredAreas || [];
    obj.requestedTests = Array.isArray(this.requestedTests) ? this.requestedTests : [];
    // Provide legacy `sex` alias for templates that expect `patient.sex`
    obj.sex = obj.gender || null;
    // Optional company / PhilHealth fields
    obj.company = this.company || '';
    obj.philhealthConsent = !!this.philhealthConsent;
    obj.philhealthId = this.philhealthId || null;
    obj.healthInsuranceConsent = !!this.healthInsuranceConsent;
    obj.healthInsuranceProvider = this.healthInsuranceProvider || '';
    obj.healthInsuranceId = this.healthInsuranceId || '';
    return obj;
  }

  // Static methods
  static async findById(id) {
    if (!id) return null;
    if (global.db) {
      if (typeof global.db.getPatientById === 'function') {
        const patient = global.db.getPatientById(id);
        if (patient) return new Patient(patient);
      }
      if (typeof global.db.getPatientByCode === 'function') {
        const patient = global.db.getPatientByCode(id);
        if (patient) return new Patient(patient);
      }
      if (typeof global.db.getPatientByPatientId === 'function') {
        const patient = global.db.getPatientByPatientId(id);
        if (patient) return new Patient(patient);
      }
    }
    const patients = global.db && global.db.getPatients ? global.db.getPatients() : [];
    let patient = patients.find(p => p.id === id);
    if (!patient) patient = patients.find(p => p.patientId === id || p.patientCode === id);
    return patient ? new Patient(patient) : null;
  }

  static async find(query = {}) {
    if (global.db && typeof global.db.queryPatients === 'function') {
      const results = global.db.queryPatients(query);
      return results.map(p => new Patient(p));
    }
    let patients = global.db && global.db.getPatients ? global.db.getPatients() : [];

    if (query.createdBy) {
      patients = patients.filter(p => p.createdBy === query.createdBy);
    }

    // Sorting
    patients.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return patients.map(p => new Patient(p));
  }

  static async findOne(query = {}) {
    if (!query) return null;
    if (global.db) {
      if (query.patientId && typeof global.db.getPatientByPatientId === 'function') {
        const patient = global.db.getPatientByPatientId(query.patientId);
        if (patient) return new Patient(patient);
      }
      if (query.patientCode && typeof global.db.getPatientByCode === 'function') {
        const patient = global.db.getPatientByCode(query.patientCode);
        if (patient) return new Patient(patient);
      }
      if ((query._id || query.id) && typeof global.db.getPatientById === 'function') {
        const patient = global.db.getPatientById(query._id || query.id);
        if (patient) return new Patient(patient);
      }
      if (typeof global.db.queryPatients === 'function') {
        const results = global.db.queryPatients(query, { limit: 1 });
        if (results && results.length) return new Patient(results[0]);
      }
    }
    const patients = global.db && global.db.getPatients ? global.db.getPatients() : [];
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
    if (global.db && typeof global.db.countPatients === 'function' && !Object.keys(query).length) {
      return global.db.countPatients();
    }
    const patients = await this.find(query);
    return patients.length;
  }

  static async findOneAndUpdate(query, updateData, options = {}) {
    let patient = await this.findOne(query);

    if (patient) {
      Object.assign(patient, updateData, { updatedAt: new Date() });
      if (global.db && typeof global.db.upsertPatient === 'function') {
        global.db.upsertPatient(patient);
      } else {
        const patients = global.db.getPatients();
        const index = patients.findIndex(p => p.id === patient.id);
        if (index >= 0) patients[index] = patient;
        global.db.savePatients(patients);
      }
      return options.new !== false ? new Patient(patient) : new Patient(patient);
    }

    return null;
  }

  static async findByIdAndUpdate(id, updateData, options = {}) {
    return await this.findOneAndUpdate({ id }, updateData, options);
  }

  static async findByIdAndDelete(id) {
    if (!id) return null;
    let existing = null;
    if (global.db && typeof global.db.getPatientById === 'function') {
      existing = global.db.getPatientById(id);
    }
    if (!existing) {
      const patients = global.db.getPatients();
      existing = patients.find(p => p.id === id || p.patientId === id);
    }

    if (existing) {
      if (global.db && typeof global.db.deletePatient === 'function') {
        global.db.deletePatient(existing.id);
      } else {
        const patients = global.db.getPatients();
        const index = patients.findIndex(p => p.id === existing.id);
        if (index >= 0) {
          patients.splice(index, 1);
          global.db.savePatients(patients);
        }
      }
      return new Patient(existing);
    }
    return null;
  }
}

module.exports = Patient;