const path = require('path');
const fs = require('fs');
const printHelper = require('../lib/printHelper');

async function run() {
  try {
    process.env.PRINT_DRY_RUN = '1';
    process.env.PRINT_DEBUG_PRINT_PAYLOAD = '1';

    const patient = {
      id: 'sim-patient-1',
      patientCode: 'SIM-12345',
      firstName: 'Sim',
      middleName: 'S',
      lastName: 'User',
      age: 30,
      toJSON() { return this; }
    };

    const createdTests = [{
      testId: 'SIM-0001',
      patient: patient.id,
      testType: 'Sim Test',
      testDate: (new Date()).toISOString(),
      status: 'Payment Area',
      requestedBy: 'sim-user',
      requestedTests: [
        { label: 'Blood Chemistry', amount: 200 },
        { label: 'For Send Out', amount: 0, remarks: 'bilirubin' },
        { label: 'Doctor Check-up', amount: 0 }
      ]
    }];

    console.log('Calling printHelper.printPatientReceipt with For Send Out + remarks + doctor check-up');
    const res = await printHelper.printPatientReceipt(patient, createdTests);
    console.log('printHelper result:', res && res.success ? 'success' : res);

    // find last print_spec_debug entry in print.log
    const logPath = path.join(__dirname, '..', 'logs', 'print.log');
    if (!fs.existsSync(logPath)) {
      console.error('Print log not found:', logPath);
      return;
    }
    const logRaw = fs.readFileSync(logPath, 'utf8');
    const lines = logRaw.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let found = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const idx = line.indexOf(']');
      if (idx === -1) continue;
      try {
        const json = JSON.parse(line.slice(idx + 1).trim());
        if (json && json.action === 'print_spec_debug') { found = json; break; }
      } catch (e) {}
    }
    if (!found) {
      console.error('No print_spec_debug entry found in log (check PRINT_DRY_RUN/PRINT_DEBUG_PRINT_PAYLOAD)');
      return;
    }
    const specPath = found.specPath;
    if (!specPath || !fs.existsSync(specPath)) {
      console.error('Spec file not found at', specPath);
      return;
    }
    const specRaw = fs.readFileSync(specPath, 'utf8');
    const outPath = path.join(__dirname, 'captured_print_spec_sim.json');
    fs.writeFileSync(outPath, specRaw, 'utf8');
    console.log('Captured spec saved to', outPath);

    // Verify presence of the desired strings in the spec JSON text
    const specText = specRaw;
    const checks = [
      { key: 'For Send Out', found: specText.includes('For Send Out') },
      { key: 'bilirubin', found: specText.toLowerCase().includes('bilirubin') },
      { key: 'Doctor Check-up', found: specText.includes('Doctor Check-up') }
    ];
    console.log('Verification results:');
    checks.forEach(c => console.log(` - ${c.key}: ${c.found ? 'FOUND' : 'MISSING'}`));

  } catch (e) {
    console.error('Runner error', e);
    process.exit(1);
  }
}

run();
