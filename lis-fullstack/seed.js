const path = require('path');
const fs = require('fs');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Test = require('./models/Test');
const Template = require('./models/Template');

const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  const initialData = {
    users: [],
    patients: [],
    tests: [],
    templates: []
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// Simple file-based database functions
const db = {
  read: () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')),
  write: (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)),
  getUsers: () => db.read().users,
  getPatients: () => db.read().patients,
  getTests: () => db.read().tests,
  getTemplates: () => db.read().templates,
  saveUsers: (users) => { const data = db.read(); data.users = users; db.write(data); },
  savePatients: (patients) => { const data = db.read(); data.patients = patients; db.write(data); },
  saveTests: (tests) => { const data = db.read(); data.tests = tests; db.write(data); },
  saveTemplates: (templates) => { const data = db.read(); data.templates = templates; db.write(data); }
};

// Make db available globally
global.db = db;

async function seedDatabase() {
  try {
    console.log('Starting database seeding...');

    // Create admin user
    const adminUser = new User({
      name: 'Admin User',
      email: 'admin@lab.com',
      password: 'password123',
      role: 'Admin',
      status: 'Active'
    });
    await adminUser.save();
    console.log('Created admin user');

    // Create sample users
    const users = [
      {
        name: 'Dr. Sarah Chen',
        email: 'sarah@lab.com',
        password: 'password123',
        role: 'Doctor',
        status: 'Active'
      },
      {
        name: 'Tech Michael Brown',
        email: 'mike@lab.com',
        password: 'password123',
        role: 'Technician',
        status: 'Active'
      },
      {
        name: 'Jane Receptionist',
        email: 'jane@lab.com',
        password: 'password123',
        role: 'Receptionist',
        status: 'Active'
      }
    ];

    for (const userData of users) {
      const user = new User(userData);
      await user.save();
    }
    console.log('Created sample users');

    // Create sample patients
    const patients = [
      {
        patientId: 'P001',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: new Date('1990-05-15'),
        gender: 'Male',
        phone: '+1 (555) 123-4567',
        email: 'john.doe@email.com',
        address: '123 Main Street, New York, NY 10001',
        createdBy: adminUser.id
      },
      {
        patientId: 'P002',
        firstName: 'Maria',
        lastName: 'Garcia',
        dateOfBirth: new Date('1985-08-22'),
        gender: 'Female',
        phone: '+1 (555) 234-5678',
        email: 'maria.garcia@email.com',
        address: '456 Oak Avenue, Los Angeles, CA 90001',
        createdBy: adminUser.id
      },
      {
        patientId: 'P003',
        firstName: 'Robert',
        lastName: 'Johnson',
        dateOfBirth: new Date('1992-03-10'),
        gender: 'Male',
        phone: '+1 (555) 345-6789',
        email: 'robert.j@email.com',
        address: '789 Pine Road, Chicago, IL 60601',
        createdBy: adminUser.id
      }
    ];

    const savedPatients = [];
    for (const patientData of patients) {
      const patient = new Patient(patientData);
      const saved = await patient.save();
      savedPatients.push(saved);
    }
    console.log('Created sample patients');

    // Create sample tests
    const tests = [
      {
        testId: 'T001',
        patient: savedPatients[0].id,
        testType: 'Blood Test',
        testDate: new Date('2026-01-15'),
        status: 'Completed',
        results: 'Hemoglobin: 14.5 g/dL\nRed Blood Cells: 4.8 M/uL\nWhite Blood Cells: 7.2 K/uL\nPlatelets: 250 K/uL\nGlucose: 95 mg/dL',
        requestedBy: adminUser.id,
        performedBy: adminUser.id,
        completedAt: new Date('2026-01-15')
      },
      {
        testId: 'T002',
        patient: savedPatients[1].id,
        testType: 'X-Ray',
        testDate: new Date('2026-01-14'),
        status: 'Completed',
        results: 'Chest X-Ray: Normal. No abnormalities detected. Heart size normal. Lungs clear bilaterally.',
        requestedBy: adminUser.id,
        performedBy: adminUser.id,
        completedAt: new Date('2026-01-14')
      },
      {
        testId: 'T003',
        patient: savedPatients[2].id,
        testType: 'Ultrasound',
        testDate: new Date('2026-01-13'),
        status: 'In Progress',
        results: 'Abdominal ultrasound in progress. Liver normal size, no focal lesions detected.',
        requestedBy: adminUser.id
      },
      {
        testId: 'T004',
        patient: savedPatients[0].id,
        testType: 'ECG',
        testDate: new Date('2026-01-12'),
        status: 'Completed',
        results: 'Normal sinus rhythm. Heart rate: 72 bpm. No ST changes. Normal axis.',
        requestedBy: adminUser.id,
        performedBy: adminUser.id,
        completedAt: new Date('2026-01-12')
      }
    ];

    for (const testData of tests) {
      const test = new Test(testData);
      await test.save();
    }
    console.log('Created sample tests');

    // Create sample templates
    const templates = [
      {
        name: 'Blood Test Standard',
        testType: 'Blood Test',
        fields: [
          { name: 'Hemoglobin (g/dL)', type: 'number', required: true },
          { name: 'Red Blood Cells (M/uL)', type: 'number', required: true },
          { name: 'White Blood Cells (K/uL)', type: 'number', required: true },
          { name: 'Platelets (K/uL)', type: 'number', required: true },
          { name: 'Glucose (mg/dL)', type: 'number', required: true }
        ],
        footerNotes: 'Reference ranges for adult population. Patient advised to maintain healthy lifestyle.',
        createdBy: adminUser.id
      },
      {
        name: 'Ultrasound Report',
        testType: 'Ultrasound',
        fields: [
          { name: 'Organ Examined', type: 'text', required: true },
          { name: 'Findings', type: 'textarea', required: true },
          { name: 'Measurements', type: 'textarea', required: false },
          { name: 'Impression', type: 'textarea', required: true },
          { name: 'Recommendations', type: 'textarea', required: false }
        ],
        footerNotes: 'Follow-up as recommended. Schedule appointment if needed.',
        createdBy: adminUser.id
      }
    ];

    for (const templateData of templates) {
      const template = new Template(templateData);
      await template.save();
    }
    console.log('Created sample templates');

    console.log('Database seeded successfully!');
    console.log('\nLogin credentials:');
    console.log('Admin: admin@lab.com / password123');
    console.log('Doctor: sarah@lab.com / password123');
    console.log('Technician: mike@lab.com / password123');
    console.log('Receptionist: jane@lab.com / password123');

  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

// Run the seed function
seedDatabase();