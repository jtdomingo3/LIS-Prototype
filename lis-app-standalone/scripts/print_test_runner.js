const path = require('path');
const fs = require('fs');
const printHelper = require('../lib/printHelper');

async function run() {
  try {
    // ensure debug dry-run
    process.env.PRINT_DRY_RUN = '1';

    const patient = {
      id: 'test-patient-1',
      patientCode: 'TEST-0001',
      firstName: 'Test',
      middleName: 'T',
      lastName: 'User',
      age: 42,
      toJSON() { return this; }
    };

    const tests = [{
      testId: 'TT-0001',
      testType: 'Sample Test',
      requestedTests: [
        { label: 'Blood Chemistry', amount: 200 },
        { label: 'Xray', amount: 150 }
      ]
    }];

    console.log('Calling printHelper.printPatientReceipt...');
    const res = await printHelper.printPatientReceipt(patient, tests);
    console.log('printHelper result:', res && res.success ? 'success' : res);

    // read print log to find print_spec_debug entry
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
      } catch (e) { /* ignore */ }
    }
    if (!found) {
      console.error('No print_spec_debug entry found in log');
      return;
    }
    const specPath = found.specPath;
    if (!specPath || !fs.existsSync(specPath)) {
      console.error('Spec file not found at', specPath);
      return;
    }
    const specRaw = fs.readFileSync(specPath, 'utf8');
    const outPath = path.join(__dirname, 'captured_print_spec.json');
    fs.writeFileSync(outPath, specRaw, 'utf8');
    console.log('Captured spec saved to', outPath);
  } catch (e) {
    console.error('Runner error', e);
    process.exit(1);
  }
}

run();
