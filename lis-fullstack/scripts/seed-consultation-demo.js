/**
 * Seed script for Clinical Consultation demonstration data.
 * Populates realistic consultation encounters and prior lab history
 * for the active demo patient (Gezyne Test3).
 */
const { createDb } = require('../lib/sqliteDb');
const path = require('path');
const crypto = require('crypto');

const dbPath = path.resolve(__dirname, '..', 'lis-data.db');
const db = createDb(dbPath);

console.log('[Seed] Initializing demonstration data for Clinical Consultations...');

// 1. Find the target patient
const patients = db.getPatients();
let targetPatient = patients.find(p => 
  (p.firstName && p.firstName.toLowerCase().includes('gezyne') && p.lastName && p.lastName.toLowerCase().includes('test3')) ||
  p.id === '3a8b8bcd-b7bf-4566-a81d-044074ffd2d5'
);

if (!targetPatient) {
  console.log('[Seed] Gezyne Test3 not found by ID, searching for any test patient...');
  targetPatient = patients.find(p => p.patientId === 'P5894') || patients[0];
}

if (!targetPatient) {
  console.error('[Seed] No patient found to seed data for!');
  process.exit(1);
}

console.log(`[Seed] Target Patient: ${targetPatient.firstName} ${targetPatient.lastName} (ID: ${targetPatient.id}, Code: ${targetPatient.patientId || targetPatient.patientCode})`);

// 2. Find or identify active Doctor Check-up test
const allTests = db.getTests ? db.getTests() : [];
let activeTest = allTests.find(t => 
  t.patient === targetPatient.id && 
  (String(t.testType || '').toLowerCase().includes('doctor') || String(t.testId || '').startsWith('DC'))
);

const patientId = targetPatient.id;

// 3. Seed Prior Lab Tests for this patient (Dated 2 weeks ago: 2026-08-25)
const priorTest1Id = 'seed-lab-cbc-' + targetPatient.id.slice(0, 8);
const priorTest2Id = 'seed-lab-ua-' + targetPatient.id.slice(0, 8);

const priorCbcTest = {
  id: priorTest1Id,
  testId: 'HM0001832',
  patient: patientId,
  testType: 'hematology',
  panel: 'CBC with Platelet Count',
  status: 'Released',
  released: 1,
  testDate: '2026-08-25',
  createdAt: '2026-08-25T08:30:00.000Z',
  remarks: 'Normal adult CBC parameters',
  results: JSON.stringify({
    wbc: { value: '8.2', unit: 'x10^9/L', reference: '4.5 - 11.0' },
    rbc: { value: '4.8', unit: 'x10^12/L', reference: '4.0 - 5.5' },
    hemoglobin: { value: '13.8', unit: 'g/dL', reference: '12.0 - 16.0' },
    hematocrit: { value: '42.0', unit: '%', reference: '37.0 - 48.0' },
    platelet: { value: '285', unit: 'x10^9/L', reference: '150 - 450' },
    neutrophils: { value: '62', unit: '%', reference: '50 - 70' },
    lymphocytes: { value: '32', unit: '%', reference: '20 - 40' }
  })
};

const priorUaTest = {
  id: priorTest2Id,
  testId: 'UA0004953',
  patient: patientId,
  testType: 'urinalysis',
  panel: 'Routine Urinalysis',
  status: 'Released',
  released: 1,
  testDate: '2026-08-25',
  createdAt: '2026-08-25T08:45:00.000Z',
  remarks: 'Routine urinalysis unremarkable',
  results: JSON.stringify({
    color: 'Yellow',
    transparency: 'Clear',
    specificGravity: '1.020',
    ph: '6.0',
    protein: 'Negative',
    glucose: 'Negative',
    pusCells: '0-2 /hpf',
    rbc: '0-1 /hpf',
    epithelialCells: 'Few',
    mucusThreads: 'Rare'
  })
};

// Insert or update prior lab tests
if (typeof db.upsertTest === 'function') {
  db.upsertTest(priorCbcTest);
  db.upsertTest(priorUaTest);
  console.log('[Seed] Seeded 2 prior laboratory records (CBC: HM0001832, Urinalysis: UA0004953)');
} else if (typeof db.getTests === 'function' && typeof db.saveTests === 'function') {
  const tests = db.getTests();
  [priorCbcTest, priorUaTest].forEach(pt => {
    const idx = tests.findIndex(t => t.id === pt.id);
    if (idx >= 0) tests[idx] = pt; else tests.push(pt);
  });
  db.saveTests(tests);
  console.log('[Seed] Seeded 2 prior laboratory records via saveTests');
}

// 4. Seed Prior Completed Consultation (Dated 2026-08-25, Dr. Arcilla)
const priorConsultationId = 'seed-consult-' + targetPatient.id.slice(0, 8);
const priorConsultation = {
  id: priorConsultationId,
  patientId: patientId,
  testId: 'seed-test-doc-prior-' + targetPatient.id.slice(0, 8),
  doctorId: null,
  doctorName: 'Dr. Arcilla',
  doctorLicenseNumber: '0098234',
  visitType: 'New',
  consultationDate: '2026-08-25T09:30',
  status: 'Completed',
  chiefComplaint: 'Persistent dry cough x 2 weeks, low-grade fever on/off, fatigue',
  historyOfPresentIllness: 'Patient complains of 2-week history of cough initially non-productive, accompanied by intermittent low-grade fever and progressive malaise. Denies chest pain, dyspnea, hemoptysis, or weight loss.',
  pastMedicalHistory: 'Childhood bronchial asthma (dormant); Non-hypertensive, Non-diabetic',
  currentMedications: 'Salbutamol inhaler as needed; Vitamin C 500mg daily',
  allergies: 'Penicillin (developed skin rashes)',
  reviewOfSystems: 'Denies night sweats, chills, headache, nausea, or bowel changes.',
  familyHistory: 'Father (+) Hypertension; Mother (+) Type 2 Diabetes',
  socialHistory: 'Non-smoker, occasional social alcoholic drinks',
  vitalSigns: JSON.stringify({
    bloodPressureSystolic: '120',
    bloodPressureDiastolic: '80',
    pulseRate: '78',
    respiratoryRate: '19',
    temperature: '37.6',
    oxygenSaturation: '98',
    weight: '64.5',
    height: '165',
    bmi: '23.7',
    bmiCategory: 'Normal',
    painScale: '2',
    bloodGlucose: '96'
  }),
  physicalExamFindings: 'Conscious, coherent, ambulatory. Anicteric sclerae, pink palpebral conjunctivae. Symmetrical chest expansion, clear breath sounds with occasional rhonchi on right mid-lung zone. Normal S1/S2, no murmurs. Soft, non-tender abdomen, no organomegaly.',
  primaryDiagnosis: 'Acute Bronchitis; Rule out Community Acquired Pneumonia',
  differentialDiagnosis: JSON.stringify([
    'Community Acquired Pneumonia - Low Risk (CAP-LR)',
    'Upper Respiratory Tract Infection (URTI)',
    'Cough Variant Asthma'
  ]),
  suspectedPathology: 'Atypical bacterial vs viral tracheobronchial mucosal inflammation',
  clinicalImpression: 'Subacute tracheobronchial inflammation responsive to macrolide course and mucolytics.',
  treatmentPlan: 'Advised oral hydration (>2.5L/day), adequate rest, avoid dust/smoke triggers. Prescribed 5-day macrolide antibiotic course and mucolytics.',
  prescriptions: JSON.stringify([
    {
      drug: 'Azithromycin 500mg',
      dosage: '1 tablet',
      route: 'Oral',
      frequency: 'Once daily (OD)',
      duration: '5 days',
      instructions: '#5 with meals'
    },
    {
      drug: 'Acetylcysteine 600mg',
      dosage: '1 effervescent tablet',
      route: 'Oral',
      frequency: 'Once daily in PM',
      duration: '7 days',
      instructions: '#7 dissolved in 1 glass of water'
    },
    {
      drug: 'Paracetamol 500mg',
      dosage: '1 tablet',
      route: 'Oral',
      frequency: 'q4-6h PRN for fever',
      duration: '3 days',
      instructions: '#10 for fever > 37.8°C'
    }
  ]),
  labRequestTests: JSON.stringify([
    { testType: 'hematology', remarks: 'CBC with Platelet' },
    { testType: 'urinalysis', remarks: 'Routine Urinalysis' }
  ]),
  referrals: '',
  followUpDate: '2026-09-09',
  followUpNotes: 'Return for clinical evaluation after completing Azithromycin course.',
  createdAt: '2026-08-25T09:30:00.000Z',
  updatedAt: '2026-08-25T10:05:00.000Z',
  completedAt: '2026-08-25T10:05:00.000Z'
};

if (typeof db.saveConsultation === 'function') {
  db.saveConsultation(priorConsultation);
  console.log('[Seed] Seeded prior completed consultation encounter (Dr. Arcilla, 2026-08-25)');
}

// 5. Populate Active / Current Consultation (DC0000002 / Dr. Lorenzo)
if (activeTest) {
  let curConsult = db.getConsultationByTestId(activeTest.id);
  const curConsultId = curConsult ? curConsult.id : ('consult-' + activeTest.id);

  const updatedCurConsult = {
    id: curConsultId,
    patientId: patientId,
    testId: activeTest.id,
    doctorId: null,
    doctorName: 'Dr. Mark Joseph Yap Lorenzo',
    doctorLicenseNumber: '013104',
    visitType: 'Follow-up',
    consultationDate: new Date().toISOString().slice(0, 16),
    status: 'In Progress',
    chiefComplaint: 'Follow-up after antibiotic completion; significant improvement in cough',
    historyOfPresentIllness: 'Patient completed the 5-day course of Azithromycin prescribed on previous visit. Reports complete defervescence of fever, cough is now rare and dry. General feeling of well-being, good appetite, restful sleep.',
    pastMedicalHistory: 'Childhood bronchial asthma (dormant); Non-hypertensive, Non-diabetic',
    currentMedications: 'Multivitamins 1 capsule OD',
    allergies: 'Penicillin (rash)',
    reviewOfSystems: 'No active complaints. No fever, no headache, no shortness of breath.',
    familyHistory: 'Father (+) Hypertension; Mother (+) Type 2 Diabetes',
    socialHistory: 'Non-smoker, occasional social alcoholic drinks',
    vitalSigns: JSON.stringify({
      bloodPressureSystolic: '118',
      bloodPressureDiastolic: '78',
      pulseRate: '72',
      respiratoryRate: '18',
      temperature: '36.5',
      oxygenSaturation: '99',
      weight: '65.0',
      height: '165',
      bmi: '23.9',
      bmiCategory: 'Normal',
      painScale: '0',
      bloodGlucose: '98'
    }),
    physicalExamFindings: 'Vital signs completely normal and stable. Anicteric sclerae, pink conjunctivae. Symmetric chest, clear breath sounds bilaterally with no rales, wheezing, or rhonchi. Regular heart rhythm, no murmurs. Soft, non-tender abdomen.',
    primaryDiagnosis: 'Resolved Acute Bronchitis',
    differentialDiagnosis: JSON.stringify([
      'Post-infectious bronchial airway reactivity'
    ]),
    suspectedPathology: 'Resolving lower airway inflammatory changes; full recovery',
    clinicalImpression: 'Patient clinically cured and ready for discharge from follow-up.',
    treatmentPlan: 'Discontinue antibiotic therapy. Continue oral hydration, nutritious diet, regular exercise.',
    prescriptions: JSON.stringify([
      {
        drug: 'Ascorbic Acid + Zinc 500mg',
        dosage: '1 capsule',
        route: 'Oral',
        frequency: 'Once daily (OD)',
        duration: '30 days',
        instructions: '#30 after breakfast'
      }
    ]),
    labRequestTests: JSON.stringify([]),
    referrals: '',
    followUpDate: '',
    followUpNotes: 'Follow-up as needed (PRN) if symptoms recur.',
    createdAt: curConsult && curConsult.createdAt ? curConsult.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null
  };

  db.saveConsultation(updatedCurConsult);
  console.log(`[Seed] Updated current active consultation (${activeTest.testId}) with rich follow-up data`);
}

console.log('[Seed] Demonstration data seeding completed successfully!');
