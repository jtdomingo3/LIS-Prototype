const express = require('express');
const router = express.Router();
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Test = require('../models/Test');
const sseEmitter = require('../lib/sseEmitter');
const { requireAuth, canAccessPatient } = require('../middleware/auth');

// Helper to get configured doctor names
// Check if a user account represents a medical doctor / physician
function isDoctorUser(u) {
  if (!u) return false;
  const r = (u.role || '').toLowerCase();
  const n = (u.name || '').toLowerCase();
  const doctorRoles = ['doctor', 'internist', 'physician', 'pediatrician', 'cardiologist', 'radiologist', 'pathologist', 'general practitioner', 'consultant', 'specialist'];
  if (doctorRoles.includes(r)) return true;
  if (n.startsWith('dr.') || n.startsWith('dr ') || n.includes(', md') || n.includes(' md') || n.includes(', m.d.')) return true;
  return false;
}

// Get official designation from user account (e.g. Internist, Radiologist, Attending Physician)
function getDoctorDesignation(u) {
  if (!u) return 'Attending Physician';
  if (u.designation && String(u.designation).trim()) return String(u.designation).trim();
  const r = (u.role || '').trim();
  if (r && r.toLowerCase() !== 'doctor') return r; // e.g. 'Internist', 'Radiologist', 'Pathologist'
  return 'Attending Physician';
}

// Build a comprehensive directory of doctor accounts with their license and designation
function getDoctorDirectory() {
  const directory = {};
  try {
    const allUsers = global.db && typeof global.db.getUsers === 'function' ? global.db.getUsers() : [];
    for (const u of allUsers) {
      if (isDoctorUser(u)) {
        const info = {
          id: u.id,
          name: u.name || u.username,
          licenseNumber: u.licenseNumber || '',
          designation: getDoctorDesignation(u),
          role: u.role || 'Doctor'
        };
        if (info.name) {
          directory[info.name] = info;
          const lower = info.name.toLowerCase();
          if (lower.includes('lorenzo')) {
            directory['Dr. Lorenzo'] = info;
          }
          if (lower.includes('arcilla')) {
            directory['Dr. Arcilla'] = info;
          }
          if (lower.includes('cundangan')) {
            directory['Dr. Cundangan'] = info;
            directory['Dr. Melissa'] = info;
          }
          if (lower.includes('espiritu')) {
            directory['Dr. Espiritu'] = info;
          }
          if (lower.includes('gabriel')) {
            directory['Dr. Gabriel'] = info;
          }
          if (lower.includes('braga')) {
            directory['Dr. Braga'] = info;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error building doctor directory:', err);
  }
  return directory;
}

// Helper to extract distinctive name keywords / surnames
function extractDoctorKeywords(docName) {
  if (!docName) return [];
  const clean = String(docName)
    .replace(/^dr\.?\s+/i, '')
    .replace(/,\s*(?:md|m\.d\.|rmt|fpcr|dpbr|pmsda)\b/gi, '')
    .replace(/\b(?:md|m\.d\.|rmt|fpcr|dpbr|pmsda)\b/gi, '')
    .trim();
  return clean.split(/\s+/).map(w => w.toLowerCase().replace(/[^a-z0-9]/gi, '')).filter(w => w.length >= 3);
}

// Resolve doctor details by name or alias
function resolveDoctorInfo(docName) {
  if (!docName) return null;
  const dir = getDoctorDirectory();
  const clean = String(docName).trim();
  if (dir[clean]) return dir[clean];

  const lower = clean.toLowerCase();
  for (const [k, v] of Object.entries(dir)) {
    if (k.toLowerCase() === lower || (v.name && v.name.toLowerCase() === lower)) {
      return v;
    }
  }

  // Check keyword / surname token matching
  const searchKeywords = extractDoctorKeywords(docName);
  for (const [k, v] of Object.entries(dir)) {
    const candidateName = (v.name || k).toLowerCase();
    for (const kw of searchKeywords) {
      if (candidateName.includes(kw)) {
        return v;
      }
    }
  }

  return null;
}

// Helper to get configured doctor names for dropdowns
function getDoctorOptions() {
  const doctors = [];
  const dir = getDoctorDirectory();

  const hasDoctor = (name) => {
    if (!name) return true;
    const clean = String(name).trim().toLowerCase();
    return doctors.some(d => String(d).trim().toLowerCase() === clean);
  };

  const addDoctor = (name) => {
    if (!name) return;
    const trimmed = String(name).trim();
    if (trimmed && !hasDoctor(trimmed)) {
      doctors.push(trimmed);
    }
  };

  // 1. Settings or room-configured doctors: map to user account if one exists, otherwise keep room name (e.g. Dr. Arcilla)
  try {
    const s = global.db && typeof global.db.getSettings === 'function' ? global.db.getSettings() : {};
    const rawD1 = (s.doctor1Name || process.env.DOCTOR_1_NAME || 'Dr. Lorenzo').trim();
    const rawD2 = (s.doctor2Name || process.env.DOCTOR_2_NAME || 'Dr. Arcilla').trim();

    const match1 = resolveDoctorInfo(rawD1);
    const match2 = resolveDoctorInfo(rawD2);

    addDoctor(match1 ? match1.name : rawD1);
    addDoctor(match2 ? match2.name : rawD2);
  } catch (_) {}

  // 2. Add all doctor accounts from user directory (deduplicating)
  for (const docName of Object.keys(dir)) {
    const info = dir[docName];
    if (info && info.name) {
      addDoctor(info.name);
    }
  }

  // 3. Fallbacks if no doctors found in database
  if (doctors.length === 0) {
    doctors.push('Dr. Mark Joseph Yap Lorenzo', 'Dr. Melissa Cundangan');
  }

  return doctors;
}

// Helper to extract doctor name from area title (e.g. "Doctor's Check-up - Dr. Lorenzo")
function extractDoctorFromArea(areaName) {
  if (!areaName) return null;
  const match = String(areaName).match(/doctor(?:'?s)?\s*check-?up\s*[-–—:]\s*(.+)/i);
  if (match && match[1] && match[1].trim()) {
    const rawName = match[1].trim();
    const info = resolveDoctorInfo(rawName);
    return info ? info.name : rawName;
  }
  return null;
}

// GET /consultations/:testId - Open the Clinical Consultation panel
router.get('/:testId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testId } = req.params;
    const areaParam = req.query.area || '';

    // 1. Find test by ID or testId
    let test = await Test.findById(testId);
    if (!test) {
      test = await Test.findOne({ testId: testId });
    }
    if (!test) {
      req.flash('error_msg', 'Test record not found for consultation');
      return res.redirect('/reception');
    }

    // 2. Find patient
    const patientId = (test.patient && typeof test.patient === 'object') ? test.patient.id : test.patient;
    let patient = await Patient.findById(patientId);
    if (!patient && test.patient && typeof test.patient === 'object') {
      patient = new Patient(test.patient);
    }
    if (!patient) {
      req.flash('error_msg', 'Patient record not found for consultation');
      return res.redirect('/reception');
    }

    // 3. Load or create consultation
    let consultation = await Consultation.findByTestId(test.id);
    if (!consultation && test.testId) {
      consultation = await Consultation.findByTestId(test.testId);
    }

    const doctorOptions = getDoctorOptions();
    const doctorDirectory = getDoctorDirectory();
    const areaDoctor = extractDoctorFromArea(areaParam) || (test.assignedDoctorName ? test.assignedDoctorName.trim() : null);
    
    // Check if the currently logged-in user is a doctor
    const sessionUser = req.session && req.session.user ? req.session.user : null;
    const sessionIsDoctor = isDoctorUser(sessionUser);

    // If logged in as a doctor, auto-capture their name, license, and designation
    let resolvedDoctorName = null;
    let resolvedLicense = '';
    let resolvedDesignation = '';

    if (sessionIsDoctor && sessionUser) {
      resolvedDoctorName = sessionUser.name ? sessionUser.name.trim() : (sessionUser.username || '');
      resolvedLicense = sessionUser.licenseNumber || '';
      resolvedDesignation = getDoctorDesignation(sessionUser);
    } else if (areaDoctor) {
      const info = resolveDoctorInfo(areaDoctor);
      resolvedDoctorName = info ? info.name : areaDoctor;
      resolvedLicense = info ? info.licenseNumber : '';
      resolvedDesignation = info ? info.designation : 'Attending Physician';
    } else {
      const defaultName = doctorOptions.length ? doctorOptions[0] : 'Dr. Mark Joseph Yap Lorenzo';
      const info = resolveDoctorInfo(defaultName);
      resolvedDoctorName = info ? info.name : defaultName;
      resolvedLicense = info ? info.licenseNumber : '';
      resolvedDesignation = info ? info.designation : 'Attending Physician';
    }

    // 4. Fetch previous consultations for this patient
    const allPatientConsultations = await Consultation.findByPatientId(patient.id);
    const previousConsultations = allPatientConsultations.filter(c => !consultation || c.id !== consultation.id);

    if (!consultation) {
      consultation = new Consultation({
        patientId: patient.id,
        testId: test.id,
        doctorId: (sessionIsDoctor && sessionUser) ? sessionUser.id : null,
        doctorName: resolvedDoctorName,
        doctorLicenseNumber: resolvedLicense,
        doctorDesignation: resolvedDesignation,
        visitType: previousConsultations.length > 0 ? 'Follow-up' : 'New',
        status: 'In Progress'
      });
      await consultation.save();
    } else {
      // If a doctor opened their patient's consultation and it's not finalized yet, automatically set them as attending physician
      let shouldUpdateExisting = false;
      if (sessionIsDoctor && sessionUser && consultation.status !== 'Completed') {
        consultation.doctorId = sessionUser.id;
        consultation.doctorName = resolvedDoctorName;
        consultation.doctorLicenseNumber = resolvedLicense || consultation.doctorLicenseNumber || '';
        consultation.doctorDesignation = resolvedDesignation || consultation.doctorDesignation || '';
        shouldUpdateExisting = true;
      } else {
        // Ensure license and designation are filled if known and missing
        if (!consultation.doctorLicenseNumber || !consultation.doctorDesignation) {
          const docInfo = resolveDoctorInfo(consultation.doctorName);
          if (docInfo) {
            if (docInfo.name && docInfo.name !== consultation.doctorName) {
              consultation.doctorName = docInfo.name;
              shouldUpdateExisting = true;
            }
            if (!consultation.doctorLicenseNumber && docInfo.licenseNumber) {
              consultation.doctorLicenseNumber = docInfo.licenseNumber;
              shouldUpdateExisting = true;
            }
            if (!consultation.doctorDesignation && docInfo.designation) {
              consultation.doctorDesignation = docInfo.designation;
              shouldUpdateExisting = true;
            }
          }
        }
      }
      if (shouldUpdateExisting) {
        await consultation.save();
      }
    }

    // 5. Fetch all laboratory test results for this patient (excluding clinical consultations / doctor check-up encounters)
    let allTests = [];
    try {
      if (global.db && typeof global.db.queryTests === 'function') {
        allTests = global.db.queryTests({ patient: patient.id }) || [];
      } else {
        allTests = await Test.find({ patient: patient.id }) || [];
      }
    } catch (_) {
      allTests = [];
    }

    // Helper to detect if a test is a doctor check-up / clinical consultation encounter
    const isConsultationTest = (t) => {
      if (!t) return false;
      const tt = String(t.testType || '').toLowerCase();
      const tid = String(t.testId || '').toUpperCase();
      if (tt.includes('doctor') || tt.includes('consultation') || tt.includes('check-up') || tt.includes('checkup')) return true;
      if (tid.startsWith('DC')) return true;
      if (Array.isArray(t.requestedTests) && t.requestedTests.some(rr => {
        const s = String((rr && (rr.label || rr.key || rr.testType)) || '').toLowerCase();
        return s.includes('doctor') || s.includes('consultation') || s.includes('check-up') || s.includes('checkup');
      })) {
        return true;
      }
      return false;
    };

    // Keep only true laboratory diagnostic tests in the lab history tab
    const labOnlyTests = allTests.filter(t => !isConsultationTest(t));

    // Format tests with dates and result summaries for display
    const formattedLabTests = labOnlyTests.map(t => {
      let resultsSummary = 'No results recorded';
      if (t.results) {
        let resObj = t.results;
        if (typeof resObj === 'string') {
          try { resObj = JSON.parse(resObj); } catch (_) {}
        }
        if (typeof resObj === 'object' && resObj !== null) {
          const keys = Object.keys(resObj).filter(k => !k.startsWith('_') && k !== 'notes' && k !== 'remarks');
          if (keys.length) {
            resultsSummary = keys.slice(0, 4).map(k => {
              const val = resObj[k];
              if (val && typeof val === 'object' && val.value !== undefined) {
                return `${k.toUpperCase()}: ${val.value}${val.unit ? ' ' + val.unit : ''}`;
              }
              return `${k}: ${val}`;
            }).join(', ');
            if (keys.length > 4) resultsSummary += ` (+${keys.length - 4} more)`;
          } else if (resObj.notes || resObj.remarks) {
            resultsSummary = resObj.notes || resObj.remarks;
          }
        } else if (typeof t.results === 'string' && t.results.trim()) {
          resultsSummary = t.results.length > 80 ? t.results.substring(0, 77) + '...' : t.results;
        }
      }
      return {
        id: t.id,
        testId: t.testId,
        testType: t.testType || 'Laboratory Test',
        date: t.testDate || t.createdAt,
        status: t.status || 'Pending',
        released: !!t.released,
        summary: resultsSummary
      };
    });

    // 6. Map doctor licenses and directory for auto-filling
    const doctorLicenses = {};
    for (const [name, info] of Object.entries(doctorDirectory)) {
      if (info && info.licenseNumber) {
        doctorLicenses[name] = info.licenseNumber;
      }
    }

    if (consultation && typeof consultation.recalculateBmi === 'function') {
      consultation.recalculateBmi();
    }

    res.render('consultations/panel', {
      title: `Clinical Consultation — ${patient.firstName} ${patient.lastName}`,
      consultation,
      patient,
      test,
      formattedLabTests,
      previousConsultations,
      doctorOptions,
      doctorLicenses,
      doctorDirectory,
      areaName: areaParam || (areaDoctor ? `Doctor's Check-up - ${areaDoctor}` : "Doctor's Check-up"),
      user: req.session.user
    });
  } catch (err) {
    console.error('Error opening consultation panel:', err);
    req.flash('error_msg', 'Failed to open consultation panel: ' + err.message);
    res.redirect('/reception');
  }
});

// Helper to apply consultation payload to consultation model
function applyConsultationPayload(consultation, b) {
  if (!consultation || !b) return;

  // Basic & Doctor fields
  if (b.patientId) consultation.patientId = b.patientId;
  if (b.doctorName) consultation.doctorName = b.doctorName.trim();
  if (b.doctorLicenseNumber !== undefined) consultation.doctorLicenseNumber = b.doctorLicenseNumber.trim();
  if (b.doctorDesignation !== undefined) consultation.doctorDesignation = b.doctorDesignation.trim();

  // Auto-resolve license or designation if missing but doctor name is provided
  if (consultation.doctorName && (!consultation.doctorLicenseNumber || !consultation.doctorDesignation)) {
    const docInfo = resolveDoctorInfo(consultation.doctorName);
    if (docInfo) {
      if (!consultation.doctorLicenseNumber && docInfo.licenseNumber) {
        consultation.doctorLicenseNumber = docInfo.licenseNumber;
      }
      if (!consultation.doctorDesignation && docInfo.designation) {
        consultation.doctorDesignation = docInfo.designation;
      }
    }
  }

  if (b.visitType) consultation.visitType = b.visitType;
  if (b.consultationDate) consultation.consultationDate = b.consultationDate;

  // Subjective
  if (b.chiefComplaint !== undefined) consultation.chiefComplaint = b.chiefComplaint;
  if (b.historyOfPresentIllness !== undefined) consultation.historyOfPresentIllness = b.historyOfPresentIllness;
  if (b.pastMedicalHistory !== undefined) consultation.pastMedicalHistory = b.pastMedicalHistory;
  if (b.currentMedications !== undefined) consultation.currentMedications = b.currentMedications;
  if (b.allergies !== undefined) consultation.allergies = b.allergies;
  if (b.reviewOfSystems !== undefined) consultation.reviewOfSystems = b.reviewOfSystems;

  // DOH PhilPEN: Smoking / Tobacco
  consultation.smoking = consultation.smoking || {};
  if (b.smokingStatus !== undefined) consultation.smoking.status = b.smokingStatus;
  if (b.smokingSticksPerDay !== undefined) consultation.smoking.sticksPerDay = b.smokingSticksPerDay;
  if (b.smokingYears !== undefined) consultation.smoking.years = b.smokingYears;
  if (b.smokingPackYears !== undefined) consultation.smoking.packYears = b.smokingPackYears;
  else if (b.smokingSticksPerDay && b.smokingYears) {
    const spd = parseFloat(b.smokingSticksPerDay);
    const yrs = parseFloat(b.smokingYears);
    if (!isNaN(spd) && !isNaN(yrs)) consultation.smoking.packYears = +((spd / 20) * yrs).toFixed(1);
  }
  if (b.smokingQuitYears !== undefined) consultation.smoking.quitYears = b.smokingQuitYears;
  if (b.smokingNotes !== undefined) consultation.smoking.notes = b.smokingNotes;

  // DOH PhilPEN: Alcohol Consumption
  consultation.alcohol = consultation.alcohol || {};
  if (b.alcoholStatus !== undefined) consultation.alcohol.status = b.alcoholStatus;
  if (b.alcoholFrequency !== undefined) consultation.alcohol.frequency = b.alcoholFrequency;
  if (b.alcoholDrinksPerSession !== undefined) consultation.alcohol.drinksPerSession = b.alcoholDrinksPerSession;
  if (b.alcoholBingeDrinking !== undefined) consultation.alcohol.bingeDrinking = b.alcoholBingeDrinking;
  if (b.alcoholNotes !== undefined) consultation.alcohol.notes = b.alcoholNotes;

  // DOH Familial NCD History
  consultation.familyHistory = (typeof consultation.familyHistory === 'object' && consultation.familyHistory !== null && !Array.isArray(consultation.familyHistory))
    ? consultation.familyHistory
    : { diseases: [], notes: typeof consultation.familyHistory === 'string' ? consultation.familyHistory : '' };
  if (b.familyHistoryDiseases !== undefined) {
    consultation.familyHistory.diseases = Array.isArray(b.familyHistoryDiseases)
      ? b.familyHistoryDiseases.filter(Boolean)
      : [String(b.familyHistoryDiseases)].filter(Boolean);
  }
  if (b.familyHistoryNotes !== undefined) {
    const rawFNotes = String(b.familyHistoryNotes).trim();
    consultation.familyHistory.notes = (rawFNotes === '[object Object]') ? '' : rawFNotes;
  } else if (b.familyHistory !== undefined && typeof b.familyHistory === 'string') {
    consultation.familyHistory.notes = (b.familyHistory.trim() === '[object Object]') ? '' : b.familyHistory.trim();
  }

  // DOH Social & Lifestyle History
  consultation.socialHistory = (typeof consultation.socialHistory === 'object' && consultation.socialHistory !== null && !Array.isArray(consultation.socialHistory))
    ? consultation.socialHistory
    : { occupation: '', physicalActivity: 'Active (≥150 mins/week)', dietaryHabits: '', notes: typeof consultation.socialHistory === 'string' ? consultation.socialHistory : '' };
  if (b.occupation !== undefined) consultation.socialHistory.occupation = b.occupation;
  if (b.physicalActivity !== undefined) consultation.socialHistory.physicalActivity = b.physicalActivity;
  if (b.dietaryHabits !== undefined) consultation.socialHistory.dietaryHabits = b.dietaryHabits;
  if (b.socialHistoryNotes !== undefined) {
    const rawSNotes = String(b.socialHistoryNotes).trim();
    consultation.socialHistory.notes = (rawSNotes === '[object Object]') ? '' : rawSNotes;
  } else if (b.socialHistory !== undefined && typeof b.socialHistory === 'string') {
    consultation.socialHistory.notes = (b.socialHistory.trim() === '[object Object]') ? '' : b.socialHistory.trim();
  }

  // Objective — Vital Signs
  consultation.vitalSigns = consultation.vitalSigns || {};
  if (b.bloodPressureSystolic !== undefined) consultation.vitalSigns.bloodPressureSystolic = b.bloodPressureSystolic;
  if (b.bloodPressureDiastolic !== undefined) consultation.vitalSigns.bloodPressureDiastolic = b.bloodPressureDiastolic;
  if (b.pulseRate !== undefined) consultation.vitalSigns.pulseRate = b.pulseRate;
  if (b.respiratoryRate !== undefined) consultation.vitalSigns.respiratoryRate = b.respiratoryRate;
  if (b.temperature !== undefined) consultation.vitalSigns.temperature = b.temperature;
  if (b.oxygenSaturation !== undefined) consultation.vitalSigns.oxygenSaturation = b.oxygenSaturation;
  if (b.weight !== undefined) consultation.vitalSigns.weight = b.weight;
  if (b.height !== undefined) consultation.vitalSigns.height = b.height;
  if (b.painScale !== undefined) consultation.vitalSigns.painScale = b.painScale;
  if (b.bloodGlucose !== undefined) consultation.vitalSigns.bloodGlucose = b.bloodGlucose;
  if (b.waistCircumference !== undefined) consultation.vitalSigns.waistCircumference = b.waistCircumference;
  if (typeof consultation.recalculateBmi === 'function') {
    consultation.recalculateBmi();
  } else {
    const w = parseFloat(consultation.vitalSigns.weight);
    const h = parseFloat(consultation.vitalSigns.height);
    if (w > 0 && h > 0) {
      const hM = h / 100.0;
      const bmi = +(w / (hM * hM)).toFixed(1);
      consultation.vitalSigns.bmi = bmi;
      if (bmi < 18.5) consultation.vitalSigns.bmiCategory = 'Underweight';
      else if (bmi <= 22.9) consultation.vitalSigns.bmiCategory = 'Normal';
      else if (bmi <= 24.9) consultation.vitalSigns.bmiCategory = 'Overweight';
      else if (bmi <= 29.9) consultation.vitalSigns.bmiCategory = 'Obese I';
      else consultation.vitalSigns.bmiCategory = 'Obese II';
    }
  }

  // Objective — Physical Exam
  if (b.physicalExamFindings !== undefined) consultation.physicalExamFindings = b.physicalExamFindings;

  // Assessment
  if (b.primaryDiagnosis !== undefined) consultation.primaryDiagnosis = b.primaryDiagnosis;
  if (b.suspectedPathology !== undefined) consultation.suspectedPathology = b.suspectedPathology;
  if (b.clinicalImpression !== undefined) consultation.clinicalImpression = b.clinicalImpression;

  // Differential Diagnosis (parse items array or JSON array or newline-delimited)
  if (b.differential_items !== undefined) {
    consultation.differentialDiagnosis = Array.isArray(b.differential_items)
      ? b.differential_items.map(s => String(s).trim()).filter(Boolean)
      : [String(b.differential_items).trim()].filter(Boolean);
  } else if (b.differentialDiagnosis !== undefined) {
    if (Array.isArray(b.differentialDiagnosis)) {
      consultation.differentialDiagnosis = b.differentialDiagnosis.filter(Boolean);
    } else if (typeof b.differentialDiagnosis === 'string') {
      try {
        const parsed = JSON.parse(b.differentialDiagnosis);
        consultation.differentialDiagnosis = Array.isArray(parsed) ? parsed.filter(Boolean) : [b.differentialDiagnosis];
      } catch (_) {
        consultation.differentialDiagnosis = b.differentialDiagnosis.split('\n').map(s => s.trim()).filter(Boolean);
      }
    }
  }

  // Plan — Prescriptions
  if (b.prescriptions !== undefined) {
    if (Array.isArray(b.prescriptions)) {
      consultation.prescriptions = b.prescriptions;
    } else if (typeof b.prescriptions === 'string') {
      try {
        consultation.prescriptions = JSON.parse(b.prescriptions);
      } catch (_) {
        consultation.prescriptions = [];
      }
    }
  }

  // Plan — Lab Request Tests
  if (b.labRequestTests !== undefined) {
    if (Array.isArray(b.labRequestTests)) {
      consultation.labRequestTests = b.labRequestTests;
    } else if (typeof b.labRequestTests === 'string') {
      try {
        consultation.labRequestTests = JSON.parse(b.labRequestTests);
      } catch (_) {
        consultation.labRequestTests = [];
      }
    }
  }

  if (b.treatmentPlan !== undefined) consultation.treatmentPlan = b.treatmentPlan;
  if (b.referrals !== undefined) consultation.referrals = b.referrals;
  if (b.followUpDate !== undefined) consultation.followUpDate = b.followUpDate;
  if (b.followUpNotes !== undefined) consultation.followUpNotes = b.followUpNotes;
}

// POST /consultations/:testId - Save or update consultation draft
router.post('/:testId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testId } = req.params;
    let consultation = await Consultation.findByTestId(testId);
    if (!consultation) {
      const test = await Test.findById(testId) || await Test.findOne({ testId: testId });
      if (test) {
        consultation = await Consultation.findByTestId(test.id);
      }
    }

    if (!consultation) {
      consultation = new Consultation({ testId: testId });
    }

    const b = req.body || {};
    applyConsultationPayload(consultation, b);

    await consultation.save();

    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message: 'Consultation saved as draft', consultation });
    }

    req.flash('success_msg', 'Consultation draft saved successfully');
    return res.redirect(`/consultations/${testId}?area=${encodeURIComponent(b.areaName || '')}`);
  } catch (err) {
    console.error('Error saving consultation:', err);
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, message: 'Failed to save consultation: ' + err.message });
    }
    req.flash('error_msg', 'Failed to save consultation');
    return res.redirect('/reception');
  }
});

// POST /consultations/:testId/complete - Finalize consultation and advance reception pipeline
router.post('/:testId/complete', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testId } = req.params;
    const b = req.body || {};
    const areaName = b.areaName || "Doctor's Check-up";

    // 1. Find test
    let test = await Test.findById(testId);
    if (!test) test = await Test.findOne({ testId: testId });
    if (!test) {
      return res.status(404).json({ success: false, message: 'Test record not found' });
    }

    // 2. Find or load consultation
    let consultation = await Consultation.findByTestId(test.id);
    if (!consultation && test.testId) consultation = await Consultation.findByTestId(test.testId);
    if (!consultation) consultation = new Consultation({ testId: test.id });

    // Apply any updated fields submitted with complete action
    applyConsultationPayload(consultation, b);

    consultation.status = 'Completed';
    consultation.completedAt = new Date().toISOString();
    await consultation.save();

    // 3. Complete the doctor test in the reception pipeline
    // For doctor check-up areas, set test status to 'Checked' (which completes the doctor station)
    const prevStatus = test.status || 'Doctor\'s Check-up';
    test.status = 'Checked';
    test.assignedDoctorName = consultation.doctorName;
    if (!test.completedAt) test.completedAt = new Date().toISOString();

    // Store consultation key findings in test.results
    test.results = {
      consultationId: consultation.id,
      doctorName: consultation.doctorName,
      doctorLicenseNumber: consultation.doctorLicenseNumber,
      primaryDiagnosis: consultation.primaryDiagnosis,
      suspectedPathology: consultation.suspectedPathology,
      clinicalImpression: consultation.clinicalImpression,
      vitalSigns: consultation.vitalSigns,
      prescriptionsCount: (consultation.prescriptions || []).length,
      completedAt: consultation.completedAt
    };

    const userName = (req.session && req.session.user && req.session.user.name) || consultation.doctorName || 'Doctor';
    test.addStatusEntry({
      from: prevStatus,
      to: 'Checked',
      user: userName,
      area: "Doctor's Check-up",
      timestamp: new Date().toISOString(),
      notes: `Clinical Consultation completed by ${consultation.doctorName || userName}`
    });
    await test.save();

    // 4. Advance remaining pending tests for this patient (pipeline continuity)
    const patientId = (test.patient && typeof test.patient === 'object') ? test.patient.id : test.patient;
    if (patientId) {
      try {
        let allPatientTests = [];
        if (global.db && typeof global.db.getTestsByPatient === 'function') {
          allPatientTests = global.db.getTestsByPatient(patientId) || [];
        } else {
          allPatientTests = await Test.find({ patient: patientId }) || [];
        }

        // Emit complete update for the completed doctor test
        sseEmitter.emit('update', {
          action: 'complete',
          testId: test.testId,
          status: test.status,
          patient: test.patient,
          time: new Date().toISOString()
        });
      } catch (errAdv) {
        console.warn('Pipeline advancement error after consultation complete:', errAdv);
      }
    }

    const redirectUrl = areaName ? `/reception/area/${encodeURIComponent(areaName)}` : '/reception';

    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({
        success: true,
        message: 'Clinical Consultation completed successfully! Patient record updated.',
        redirectUrl
      });
    }

    req.flash('success_msg', 'Clinical Consultation completed successfully!');
    return res.redirect(redirectUrl);
  } catch (err) {
    console.error('Error completing consultation:', err);
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, message: 'Error completing consultation: ' + err.message });
    }
    req.flash('error_msg', 'Error completing consultation');
    return res.redirect('/reception');
  }
});

// Helper to resolve test, consultation, and patient from either test ID or consultation ID
async function resolveEncounterForPrint(identifier) {
  if (!identifier) return null;
  let test = await Test.findById(identifier) || await Test.findOne({ testId: identifier });
  let consultation = null;

  if (test) {
    consultation = await Consultation.findByTestId(test.id) || await Consultation.findByTestId(test.testId);
  }
  if (!consultation) {
    consultation = await Consultation.findById(identifier);
    if (consultation && !test && consultation.testId) {
      test = await Test.findById(consultation.testId) || await Test.findOne({ testId: consultation.testId });
    }
  }

  if (!consultation && !test) return null;

  consultation = consultation || new Consultation();
  if (!test) {
    test = new Test({
      id: consultation.testId || identifier,
      testId: consultation.testId || identifier,
      patient: consultation.patientId
    });
  }

  const patientId = (test.patient && typeof test.patient === 'object') ? test.patient.id : (test.patient || consultation.patientId);
  let patient = null;
  if (patientId) {
    patient = await Patient.findById(patientId);
  }
  if (!patient && test.patient && typeof test.patient === 'object') {
    patient = new Patient(test.patient);
  }
  patient = patient || new Patient();

  return { test, consultation, patient };
}

// GET /consultations/:testId/print/lab-request - Printable Laboratory Request Form
router.get('/:testId/print/lab-request', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testId } = req.params;
    const encounter = await resolveEncounterForPrint(testId);
    if (!encounter) return res.status(404).send('Encounter record not found');
    const { test, consultation, patient } = encounter;

    const settings = (global.db && typeof global.db.getSettings === 'function') ? (global.db.getSettings() || {}) : {};
    const docInfo = resolveDoctorInfo(consultation.doctorName);
    const doctorDesignation = consultation.doctorDesignation || (docInfo && docInfo.designation) || 'Attending Physician';
    if (!consultation.doctorLicenseNumber && docInfo && docInfo.licenseNumber) {
      consultation.doctorLicenseNumber = docInfo.licenseNumber;
    }

    res.render('consultations/print-lab-request', {
      layout: false,
      consultation,
      patient,
      test,
      settings,
      doctorDesignation,
      inlineLogo: req.app.locals.inlineLogo || '/assets/gezyne-logo.png'
    });
  } catch (err) {
    console.error('Error rendering lab request print view:', err);
    res.status(500).send('Error generating Laboratory Request Form');
  }
});

// GET /consultations/:testId/print/prescription - Printable Prescription (Rx)
router.get('/:testId/print/prescription', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testId } = req.params;
    const encounter = await resolveEncounterForPrint(testId);
    if (!encounter) return res.status(404).send('Encounter record not found');
    const { test, consultation, patient } = encounter;

    const settings = (global.db && typeof global.db.getSettings === 'function') ? (global.db.getSettings() || {}) : {};
    const docInfo = resolveDoctorInfo(consultation.doctorName);
    const doctorDesignation = consultation.doctorDesignation || (docInfo && docInfo.designation) || 'Attending Physician';
    if (!consultation.doctorLicenseNumber && docInfo && docInfo.licenseNumber) {
      consultation.doctorLicenseNumber = docInfo.licenseNumber;
    }

    res.render('consultations/print-prescription', {
      layout: false,
      consultation,
      patient,
      test,
      settings,
      doctorDesignation,
      inlineLogo: req.app.locals.inlineLogo || '/assets/gezyne-logo.png'
    });
  } catch (err) {
    console.error('Error rendering prescription print view:', err);
    res.status(500).send('Error generating Prescription document');
  }
});

// GET /consultations/:testId/print/med-cert - Printable Medical Certificate
router.get('/:testId/print/med-cert', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testId } = req.params;
    const encounter = await resolveEncounterForPrint(testId);
    if (!encounter) return res.status(404).send('Encounter record not found');
    const { test, consultation, patient } = encounter;

    const settings = (global.db && typeof global.db.getSettings === 'function') ? (global.db.getSettings() || {}) : {};
    const docInfo = resolveDoctorInfo(consultation.doctorName);
    const doctorDesignation = consultation.doctorDesignation || (docInfo && docInfo.designation) || 'Attending Physician';
    if (!consultation.doctorLicenseNumber && docInfo && docInfo.licenseNumber) {
      consultation.doctorLicenseNumber = docInfo.licenseNumber;
    }

    res.render('consultations/print-med-cert', {
      layout: false,
      consultation,
      patient,
      test,
      settings,
      doctorDesignation,
      inlineLogo: req.app.locals.inlineLogo || '/assets/gezyne-logo.png'
    });
  } catch (err) {
    console.error('Error rendering medical certificate print view:', err);
    res.status(500).send('Error generating Medical Certificate');
  }
});

// GET /consultations/:testId/print/chart - Printable Patient Medical Chart / Encounter Record
router.get('/:testId/print/chart', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testId } = req.params;
    const encounter = await resolveEncounterForPrint(testId);
    if (!encounter) return res.status(404).send('Encounter record not found');
    const { test, consultation, patient } = encounter;

    const settings = (global.db && typeof global.db.getSettings === 'function') ? (global.db.getSettings() || {}) : {};
    const docInfo = resolveDoctorInfo(consultation.doctorName);
    const doctorDesignation = consultation.doctorDesignation || (docInfo && docInfo.designation) || 'Attending Physician';
    if (!consultation.doctorLicenseNumber && docInfo && docInfo.licenseNumber) {
      consultation.doctorLicenseNumber = docInfo.licenseNumber;
    }

    res.render('consultations/print-chart', {
      layout: false,
      consultation,
      patient,
      test,
      settings,
      doctorDesignation,
      inlineLogo: req.app.locals.inlineLogo || '/assets/gezyne-logo.png'
    });
  } catch (err) {
    console.error('Error rendering patient medical chart print view:', err);
    res.status(500).send('Error generating Patient Medical Chart');
  }
});

// GET /consultations/api/patient/:patientId - JSON history for "Previous Visits"
router.get('/api/patient/:patientId', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { patientId } = req.params;
    const consultations = await Consultation.findByPatientId(patientId);
    res.json({ success: true, consultations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
