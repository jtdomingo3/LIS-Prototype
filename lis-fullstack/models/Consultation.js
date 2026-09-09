const { v4: uuidv4 } = require('uuid');

function calculateBmi(weightKg, heightCm) {
  const w = parseFloat(weightKg);
  const h = parseFloat(heightCm);
  if (!w || !h || w <= 0 || h <= 0) return { bmi: null, category: '' };
  const hM = h / 100.0;
  const val = +(w / (hM * hM)).toFixed(1);
  let cat = 'Normal';
  if (val < 18.5) cat = 'Underweight';
  else if (val < 25.0) cat = 'Normal';
  else if (val < 30.0) cat = 'Overweight';
  else cat = 'Obese';
  return { bmi: val, category: cat };
}

class Consultation {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.patientId = data.patientId || null;
    this.testId = data.testId || null;
    this.doctorId = data.doctorId || null;
    this.doctorName = data.doctorName || '';
    this.doctorLicenseNumber = data.doctorLicenseNumber || '';

    this.visitType = data.visitType || 'New';
    this.consultationDate = data.consultationDate || new Date().toISOString();
    this.status = data.status || 'In Progress';

    // SOAP: Subjective
    this.chiefComplaint = data.chiefComplaint || '';
    this.historyOfPresentIllness = data.historyOfPresentIllness || '';
    this.pastMedicalHistory = data.pastMedicalHistory || '';
    this.currentMedications = data.currentMedications || '';
    this.allergies = data.allergies || '';
    this.reviewOfSystems = data.reviewOfSystems || '';

    // DOH PhilPEN: Smoking / Tobacco Reporting
    const rawSmoking = data.smoking || {};
    this.smoking = {
      status: rawSmoking.status || data.smokingStatus || 'Never Smoked',
      sticksPerDay: rawSmoking.sticksPerDay !== undefined ? rawSmoking.sticksPerDay : (data.smokingSticksPerDay || ''),
      years: rawSmoking.years !== undefined ? rawSmoking.years : (data.smokingYears || ''),
      packYears: rawSmoking.packYears !== undefined ? rawSmoking.packYears : (data.smokingPackYears || ''),
      quitYears: rawSmoking.quitYears !== undefined ? rawSmoking.quitYears : (data.smokingQuitYears || ''),
      notes: rawSmoking.notes || data.smokingNotes || ''
    };
    if ((this.smoking.packYears === '' || this.smoking.packYears === undefined) && this.smoking.sticksPerDay && this.smoking.years) {
      const spd = parseFloat(this.smoking.sticksPerDay);
      const yrs = parseFloat(this.smoking.years);
      if (!isNaN(spd) && !isNaN(yrs)) {
        this.smoking.packYears = +((spd / 20) * yrs).toFixed(1);
      }
    }

    // DOH PhilPEN: Alcohol Consumption Reporting
    const rawAlcohol = data.alcohol || {};
    this.alcohol = {
      status: rawAlcohol.status || data.alcoholStatus || 'Non-drinker',
      frequency: rawAlcohol.frequency || data.alcoholFrequency || '',
      drinksPerSession: rawAlcohol.drinksPerSession !== undefined ? rawAlcohol.drinksPerSession : (data.alcoholDrinksPerSession || ''),
      bingeDrinking: rawAlcohol.bingeDrinking !== undefined ? rawAlcohol.bingeDrinking : (data.alcoholBingeDrinking || 'No'),
      notes: rawAlcohol.notes || data.alcoholNotes || ''
    };

    // DOH Familial NCD Screening (Hereditary Diseases)
    if (typeof data.familyHistory === 'object' && data.familyHistory !== null && !Array.isArray(data.familyHistory)) {
      this.familyHistory = {
        diseases: Array.isArray(data.familyHistory.diseases) ? data.familyHistory.diseases : [],
        notes: data.familyHistory.notes || ''
      };
    } else {
      this.familyHistory = {
        diseases: Array.isArray(data.familyHistoryDiseases) ? data.familyHistoryDiseases : [],
        notes: typeof data.familyHistory === 'string' ? data.familyHistory : (data.familyHistoryNotes || '')
      };
    }

    // DOH Social & Lifestyle History
    if (typeof data.socialHistory === 'object' && data.socialHistory !== null && !Array.isArray(data.socialHistory)) {
      this.socialHistory = {
        occupation: data.socialHistory.occupation || data.occupation || '',
        physicalActivity: data.socialHistory.physicalActivity || data.physicalActivity || 'Active (≥150 mins/week)',
        dietaryHabits: data.socialHistory.dietaryHabits || data.dietaryHabits || '',
        notes: data.socialHistory.notes || ''
      };
    } else {
      this.socialHistory = {
        occupation: data.occupation || '',
        physicalActivity: data.physicalActivity || 'Active (≥150 mins/week)',
        dietaryHabits: data.dietaryHabits || '',
        notes: typeof data.socialHistory === 'string' ? data.socialHistory : (data.socialHistoryNotes || '')
      };
    }

    // SOAP: Objective — Vital Signs
    const rawVitals = data.vitalSigns || {};
    const weight = rawVitals.weight !== undefined ? rawVitals.weight : (data.weight !== undefined ? data.weight : '');
    const height = rawVitals.height !== undefined ? rawVitals.height : (data.height !== undefined ? data.height : '');
    const { bmi: computedBmi, category: computedCat } = calculateBmi(weight, height);

    this.vitalSigns = {
      bloodPressureSystolic: rawVitals.bloodPressureSystolic !== undefined ? rawVitals.bloodPressureSystolic : (data.bloodPressureSystolic || ''),
      bloodPressureDiastolic: rawVitals.bloodPressureDiastolic !== undefined ? rawVitals.bloodPressureDiastolic : (data.bloodPressureDiastolic || ''),
      pulseRate: rawVitals.pulseRate !== undefined ? rawVitals.pulseRate : (data.pulseRate || ''),
      respiratoryRate: rawVitals.respiratoryRate !== undefined ? rawVitals.respiratoryRate : (data.respiratoryRate || ''),
      temperature: rawVitals.temperature !== undefined ? rawVitals.temperature : (data.temperature || ''),
      oxygenSaturation: rawVitals.oxygenSaturation !== undefined ? rawVitals.oxygenSaturation : (data.oxygenSaturation || ''),
      weight: weight,
      height: height,
      bmi: computedBmi !== null ? computedBmi : (rawVitals.bmi || data.bmi || ''),
      bmiCategory: computedCat || rawVitals.bmiCategory || '',
      painScale: rawVitals.painScale !== undefined ? rawVitals.painScale : (data.painScale || ''),
      bloodGlucose: rawVitals.bloodGlucose !== undefined ? rawVitals.bloodGlucose : (data.bloodGlucose || ''),
      waistCircumference: rawVitals.waistCircumference !== undefined ? rawVitals.waistCircumference : (data.waistCircumference || '')
    };

    // SOAP: Objective — Physical Exam
    this.physicalExamFindings = data.physicalExamFindings || '';

    // SOAP: Assessment
    this.primaryDiagnosis = data.primaryDiagnosis || '';
    this.differentialDiagnosis = Array.isArray(data.differentialDiagnosis)
      ? data.differentialDiagnosis
      : (data.differentialDiagnosis ? [String(data.differentialDiagnosis)] : []);
    this.suspectedPathology = data.suspectedPathology || '';
    this.clinicalImpression = data.clinicalImpression || '';

    // SOAP: Plan
    this.treatmentPlan = data.treatmentPlan || '';
    this.prescriptions = Array.isArray(data.prescriptions) ? data.prescriptions : [];
    this.labRequestTests = Array.isArray(data.labRequestTests) ? data.labRequestTests : [];
    this.referrals = data.referrals || '';
    this.followUpDate = data.followUpDate || '';
    this.followUpNotes = data.followUpNotes || '';

    // Metadata
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.completedAt = data.completedAt || null;
  }

  // Recalculate BMI helper on demand
  recalculateBmi() {
    const { bmi, category } = calculateBmi(this.vitalSigns.weight, this.vitalSigns.height);
    if (bmi !== null) {
      this.vitalSigns.bmi = bmi;
      this.vitalSigns.bmiCategory = category;
    }
  }

  // Save to database
  async save() {
    this.updatedAt = new Date().toISOString();
    this.recalculateBmi();

    if (this.status === 'Completed' && !this.completedAt) {
      this.completedAt = new Date().toISOString();
    }

    if (global.db && typeof global.db.saveConsultation === 'function') {
      global.db.saveConsultation(this);
    }
    return this;
  }

  toJSON() {
    return { ...this };
  }

  // Static methods
  static async findById(id) {
    if (!id) return null;
    if (global.db && typeof global.db.getConsultationById === 'function') {
      const doc = global.db.getConsultationById(id);
      return doc ? new Consultation(doc) : null;
    }
    return null;
  }

  static async findByTestId(testId) {
    if (!testId) return null;
    if (global.db && typeof global.db.getConsultationByTestId === 'function') {
      const doc = global.db.getConsultationByTestId(testId);
      return doc ? new Consultation(doc) : null;
    }
    return null;
  }

  static async findByPatientId(patientId) {
    if (!patientId) return [];
    if (global.db && typeof global.db.getConsultationsByPatientId === 'function') {
      const list = global.db.getConsultationsByPatientId(patientId) || [];
      return list.map(c => new Consultation(c));
    }
    return [];
  }

  static async find(query = {}) {
    let list = [];
    if (global.db && typeof global.db.getConsultations === 'function') {
      list = global.db.getConsultations() || [];
    }
    if (query.patientId) {
      list = list.filter(c => c.patientId === query.patientId);
    }
    if (query.testId) {
      list = list.filter(c => c.testId === query.testId);
    }
    if (query.status) {
      list = list.filter(c => c.status === query.status);
    }
    return list.map(c => new Consultation(c));
  }
}

module.exports = Consultation;
