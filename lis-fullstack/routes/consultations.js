const express = require('express');
const router = express.Router();
const Consultation = require('../models/Consultation');
const Patient = require('../models/Patient');
const Test = require('../models/Test');
const sseEmitter = require('../lib/sseEmitter');
const { requireAuth, canAccessPatient } = require('../middleware/auth');

// Helper to get configured doctor names
function getDoctorOptions() {
  const doctors = [];
  try {
    const s = global.db && typeof global.db.getSettings === 'function' ? global.db.getSettings() : {};
    const d1 = (s.doctor1Name || process.env.DOCTOR_1_NAME || 'Dr. Lorenzo').trim();
    const d2 = (s.doctor2Name || process.env.DOCTOR_2_NAME || 'Dr. Arcilla').trim();
    if (d1) doctors.push(d1);
    if (d2 && !doctors.includes(d2)) doctors.push(d2);
  } catch (_) {
    doctors.push('Dr. Lorenzo', 'Dr. Arcilla');
  }

  // Also include any users with Doctor role
  try {
    const allUsers = global.db && typeof global.db.getUsers === 'function' ? global.db.getUsers() : [];
    for (const u of allUsers) {
      if (u && (u.role === 'Doctor' || (u.name && u.name.toLowerCase().startsWith('dr.')))) {
        const docName = u.name || u.username;
        if (docName && !doctors.includes(docName)) {
          doctors.push(docName);
        }
      }
    }
  } catch (_) {}

  return doctors;
}

// Helper to extract doctor name from area title (e.g. "Doctor's Check-up - Dr. Lorenzo")
function extractDoctorFromArea(areaName) {
  if (!areaName) return null;
  const match = String(areaName).match(/doctor(?:'?s)?\s*check-?up\s*[-–—:]\s*(.+)/i);
  if (match && match[1] && match[1].trim()) {
    return match[1].trim();
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
    const areaDoctor = extractDoctorFromArea(areaParam) || (test.assignedDoctorName ? test.assignedDoctorName.trim() : null);
    const sessionDoctor = req.session && req.session.user && req.session.user.name ? req.session.user.name : null;
    const defaultDoctor = areaDoctor || sessionDoctor || (doctorOptions.length ? doctorOptions[0] : 'Dr. Lorenzo');

    // 4. Fetch previous consultations for this patient
    const allPatientConsultations = await Consultation.findByPatientId(patient.id);
    const previousConsultations = allPatientConsultations.filter(c => !consultation || c.id !== consultation.id);

    if (!consultation) {
      consultation = new Consultation({
        patientId: patient.id,
        testId: test.id,
        doctorName: defaultDoctor,
        visitType: previousConsultations.length > 0 ? 'Follow-up' : 'New',
        status: 'In Progress'
      });
      await consultation.save();
    }

    // 5. Fetch all laboratory test results for this patient
    let allTests = [];
    try {
      if (global.db && typeof global.db.getTestsByPatient === 'function') {
        allTests = global.db.getTestsByPatient(patient.id) || [];
      } else {
        allTests = await Test.find({ patient: patient.id }) || [];
      }
    } catch (_) {
      allTests = [];
    }

    // Format tests with dates and result summaries for display
    const formattedLabTests = allTests.map(t => {
      let resultsSummary = 'No results recorded';
      if (t.results) {
        if (typeof t.results === 'object') {
          const keys = Object.keys(t.results).filter(k => !k.startsWith('_') && k !== 'notes' && k !== 'remarks');
          if (keys.length) {
            resultsSummary = keys.slice(0, 4).map(k => `${k}: ${t.results[k]}`).join(', ');
            if (keys.length > 4) resultsSummary += ` (+${keys.length - 4} more)`;
          } else if (t.results.notes || t.results.remarks) {
            resultsSummary = t.results.notes || t.results.remarks;
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

    res.render('consultations/panel', {
      title: `Clinical Consultation — ${patient.firstName} ${patient.lastName}`,
      consultation,
      patient,
      test,
      formattedLabTests,
      previousConsultations,
      doctorOptions,
      areaName: areaParam || (areaDoctor ? `Doctor's Check-up - ${areaDoctor}` : "Doctor's Check-up"),
      user: req.session.user
    });
  } catch (err) {
    console.error('Error opening consultation panel:', err);
    req.flash('error_msg', 'Failed to open consultation panel: ' + err.message);
    res.redirect('/reception');
  }
});

// POST /consultations/:testId - Save Draft / Auto-save
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

    // Basic & Doctor fields
    if (b.patientId) consultation.patientId = b.patientId;
    if (b.doctorName) consultation.doctorName = b.doctorName.trim();
    if (b.doctorLicenseNumber !== undefined) consultation.doctorLicenseNumber = b.doctorLicenseNumber.trim();
    if (b.visitType) consultation.visitType = b.visitType;
    if (b.consultationDate) consultation.consultationDate = b.consultationDate;

    // Subjective
    if (b.chiefComplaint !== undefined) consultation.chiefComplaint = b.chiefComplaint;
    if (b.historyOfPresentIllness !== undefined) consultation.historyOfPresentIllness = b.historyOfPresentIllness;
    if (b.pastMedicalHistory !== undefined) consultation.pastMedicalHistory = b.pastMedicalHistory;
    if (b.currentMedications !== undefined) consultation.currentMedications = b.currentMedications;
    if (b.allergies !== undefined) consultation.allergies = b.allergies;
    if (b.reviewOfSystems !== undefined) consultation.reviewOfSystems = b.reviewOfSystems;
    if (b.familyHistory !== undefined) consultation.familyHistory = b.familyHistory;
    if (b.socialHistory !== undefined) consultation.socialHistory = b.socialHistory;

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
    consultation.recalculateBmi();

    // Objective — Physical Exam
    if (b.physicalExamFindings !== undefined) consultation.physicalExamFindings = b.physicalExamFindings;

    // Assessment
    if (b.primaryDiagnosis !== undefined) consultation.primaryDiagnosis = b.primaryDiagnosis;
    if (b.suspectedPathology !== undefined) consultation.suspectedPathology = b.suspectedPathology;
    if (b.clinicalImpression !== undefined) consultation.clinicalImpression = b.clinicalImpression;

    // Differential Diagnosis (parse JSON array or newline-delimited)
    if (b.differentialDiagnosis !== undefined) {
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

    // Apply any final fields submitted with complete action
    if (b.primaryDiagnosis) consultation.primaryDiagnosis = b.primaryDiagnosis;
    if (b.suspectedPathology) consultation.suspectedPathology = b.suspectedPathology;
    if (b.clinicalImpression) consultation.clinicalImpression = b.clinicalImpression;
    if (b.treatmentPlan) consultation.treatmentPlan = b.treatmentPlan;
    if (b.doctorName) consultation.doctorName = b.doctorName.trim();

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

// GET /consultations/:testId/print/lab-request - Printable Laboratory Request Form
router.get('/:testId/print/lab-request', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testId } = req.params;
    let test = await Test.findById(testId) || await Test.findOne({ testId: testId });
    if (!test) return res.status(404).send('Test record not found');

    const patientId = (test.patient && typeof test.patient === 'object') ? test.patient.id : test.patient;
    const patient = await Patient.findById(patientId) || (typeof test.patient === 'object' ? new Patient(test.patient) : null);
    const consultation = await Consultation.findByTestId(test.id) || await Consultation.findByTestId(testId) || new Consultation();
    const settings = (global.db && typeof global.db.getSettings === 'function') ? (global.db.getSettings() || {}) : {};

    res.render('consultations/print-lab-request', {
      layout: false,
      consultation,
      patient,
      test,
      settings,
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
    let test = await Test.findById(testId) || await Test.findOne({ testId: testId });
    if (!test) return res.status(404).send('Test record not found');

    const patientId = (test.patient && typeof test.patient === 'object') ? test.patient.id : test.patient;
    const patient = await Patient.findById(patientId) || (typeof test.patient === 'object' ? new Patient(test.patient) : null);
    const consultation = await Consultation.findByTestId(test.id) || await Consultation.findByTestId(testId) || new Consultation();
    const settings = (global.db && typeof global.db.getSettings === 'function') ? (global.db.getSettings() || {}) : {};

    res.render('consultations/print-prescription', {
      layout: false,
      consultation,
      patient,
      test,
      settings,
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
    let test = await Test.findById(testId) || await Test.findOne({ testId: testId });
    if (!test) return res.status(404).send('Test record not found');

    const patientId = (test.patient && typeof test.patient === 'object') ? test.patient.id : test.patient;
    const patient = await Patient.findById(patientId) || (typeof test.patient === 'object' ? new Patient(test.patient) : null);
    const consultation = await Consultation.findByTestId(test.id) || await Consultation.findByTestId(testId) || new Consultation();
    const settings = (global.db && typeof global.db.getSettings === 'function') ? (global.db.getSettings() || {}) : {};

    res.render('consultations/print-med-cert', {
      layout: false,
      consultation,
      patient,
      test,
      settings,
      inlineLogo: req.app.locals.inlineLogo || '/assets/gezyne-logo.png'
    });
  } catch (err) {
    console.error('Error rendering medical certificate print view:', err);
    res.status(500).send('Error generating Medical Certificate');
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
