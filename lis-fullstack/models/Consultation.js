const { v4: uuidv4 } = require('uuid');

// DOH Philippines / Asia-Pacific (PhilPEN & FNRI) adult BMI classification:
// Underweight: < 18.5
// Normal: 18.5 – 22.9
// Overweight (At Risk): 23.0 – 24.9
// Obese Class I: 25.0 – 29.9
// Obese Class II: ≥ 30.0
function calculateBmi(weightKg, heightCm) {
  const w = parseFloat(weightKg);
  const h = parseFloat(heightCm);
  if (!w || !h || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return { bmi: null, category: '' };
  const hM = h / 100.0;
  const val = +(w / (hM * hM)).toFixed(1);
  let cat = 'Normal';
  if (val < 18.5) cat = 'Underweight';
  else if (val <= 22.9) cat = 'Normal';
  else if (val <= 24.9) cat = 'Overweight';
  else if (val <= 29.9) cat = 'Obese I';
  else cat = 'Obese II';
  return { bmi: val, category: cat };
}

function safeJsonParse(val, fallback) {
  if (val === undefined || val === null) return fallback;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        return JSON.parse(trimmed);
      } catch (_) {
        return fallback;
      }
    }
  }
  return val;
}

class Consultation {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.patientId = data.patientId || null;
    this.testId = data.testId || null;
    this.doctorId = data.doctorId || null;
    this.doctorName = data.doctorName || '';
    this.doctorLicenseNumber = data.doctorLicenseNumber || '';
    this.doctorDesignation = data.doctorDesignation || '';

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
    const rawSmoking = safeJsonParse(data.smoking, {}) || {};
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
    const rawAlcohol = safeJsonParse(data.alcohol, {}) || {};
    this.alcohol = {
      status: rawAlcohol.status || data.alcoholStatus || 'Non-drinker',
      frequency: rawAlcohol.frequency || data.alcoholFrequency || '',
      drinksPerSession: rawAlcohol.drinksPerSession !== undefined ? rawAlcohol.drinksPerSession : (data.alcoholDrinksPerSession || ''),
      bingeDrinking: rawAlcohol.bingeDrinking !== undefined ? rawAlcohol.bingeDrinking : (data.alcoholBingeDrinking || 'No'),
      notes: rawAlcohol.notes || data.alcoholNotes || ''
    };

    // DOH Familial NCD Screening (Hereditary Diseases)
    const rawFamily = safeJsonParse(data.familyHistory, null);
    if (typeof rawFamily === 'object' && rawFamily !== null && !Array.isArray(rawFamily)) {
      this.familyHistory = {
        diseases: Array.isArray(rawFamily.diseases) ? rawFamily.diseases : [],
        notes: rawFamily.notes || ''
      };
    } else {
      this.familyHistory = {
        diseases: Array.isArray(data.familyHistoryDiseases) ? data.familyHistoryDiseases : (Array.isArray(rawFamily) ? rawFamily : []),
        notes: typeof data.familyHistory === 'string' ? data.familyHistory : (data.familyHistoryNotes || '')
      };
    }

    // DOH Social & Lifestyle History
    const rawSocial = safeJsonParse(data.socialHistory, null);
    if (typeof rawSocial === 'object' && rawSocial !== null && !Array.isArray(rawSocial)) {
      this.socialHistory = {
        occupation: rawSocial.occupation || data.occupation || '',
        physicalActivity: rawSocial.physicalActivity || data.physicalActivity || 'Active (≥150 mins/week)',
        dietaryHabits: rawSocial.dietaryHabits || data.dietaryHabits || '',
        notes: rawSocial.notes || ''
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
    const rawVitals = safeJsonParse(data.vitalSigns, {}) || {};
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
    const rawDifferential = safeJsonParse(data.differentialDiagnosis, data.differentialDiagnosis);
    this.differentialDiagnosis = Array.isArray(rawDifferential)
      ? rawDifferential
      : (rawDifferential ? [String(rawDifferential)] : []);
    this.suspectedPathology = data.suspectedPathology || '';
    this.clinicalImpression = data.clinicalImpression || '';

    // SOAP: Plan
    this.treatmentPlan = data.treatmentPlan || '';
    const rawRx = safeJsonParse(data.prescriptions, data.prescriptions);
    this.prescriptions = Array.isArray(rawRx) ? rawRx : [];
    const rawLab = safeJsonParse(data.labRequestTests, data.labRequestTests);
    this.labRequestTests = Array.isArray(rawLab) ? rawLab : [];
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

  recalculateBmi() {
    this.vitalSigns = this.vitalSigns || {};
    const w = this.vitalSigns.weight;
    const h = this.vitalSigns.height;
    const res = calculateBmi(w, h);
    this.vitalSigns.bmi = res.bmi !== null ? res.bmi : '';
    this.vitalSigns.bmiCategory = res.category || '';
    return res;
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
