const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const PRINT_LOG_PATH = path.join(__dirname, '..', 'logs', 'print.log');

function appendPrintLog(entry) {
  try {
    const ts = new Date().toISOString();
    const data = `[${ts}] ${entry}\n`;
    fs.appendFileSync(PRINT_LOG_PATH, data, { encoding: 'utf8' });
  } catch (e) {
    // ignore
  }
}

function sanitizeText(s) {
  if (s == null) return '';
  let out = String(s);
  out = out.replace(/₱/g, 'PHP ');
  out = out.replace(/[–—−]/g, '-');
  out = out.replace(/•/g, '-');
  out = out.replace(/[^\u0000-\u007f]/g, '');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

async function printPatientReceipt(patient, testOrTests) {
  try {
    const patientObj = (patient && typeof patient.toJSON === 'function') ? patient.toJSON() : patient || {};
    const now = new Date();
    const currentDate = now.toISOString().replace('T', ' ').slice(0, 19);
    const fullName = `${patientObj.firstName || ''} ${patientObj.middleName ? patientObj.middleName + ' ' : ''}${patientObj.lastName || ''}`.trim();
    const age = patientObj.ageManual || patientObj.age || 'N/A';

    // testOrTests can be a single test or an array
    const tests = Array.isArray(testOrTests) ? testOrTests : (testOrTests ? [testOrTests] : []);
    const requested = [];
    tests.forEach(t => {
      if (t && Array.isArray(t.requestedTests) && t.requestedTests.length) {
        requested.push(...t.requestedTests);
      }
      // fallback to test.testType
      else if (t && t.testType) {
        requested.push({ label: t.testType, amount: (t.requestedAmount || 0) });
      }
    });

    const total = requested.reduce((s, r) => s + (Number((r && (r.amount || r.amount === 0) ? r.amount : 0) || 0)), 0);

    const spec = [];
    spec.push({ type: 'text', align: 'center', size: 'double', bold: true, text: sanitizeText(patientObj.patientCode || patientObj.patientId || '') });
    spec.push({ type: 'text', align: 'center', text: currentDate });
    spec.push({ type: 'feed', count: 1 });
    spec.push({ type: 'text', text: 'Name: ' + sanitizeText(fullName) });
    spec.push({ type: 'text', text: 'Age: ' + sanitizeText(age) });
    spec.push({ type: 'feed', count: 1 });
    spec.push({ type: 'text', size: 'normal', text: 'Laboratory Request:' });
    if (requested.length) {
      requested.forEach(r => {
        const label = sanitizeText(r.label || r.key || '');
        const amt = (r && (r.amount || r.amount === 0)) ? Number(r.amount) : 0;
        let line = `- ${label}`;
        if (amt) line += ` - PHP ${Number(amt).toFixed(2)}`;
        spec.push({ type: 'text', text: line });
      });
    } else {
      spec.push({ type: 'text', text: '- (No tests specified)' });
    }
    spec.push({ type: 'feed', count: 1 });
    spec.push({ type: 'text', text: 'Amount: PHP ' + Number(total || 0).toFixed(2) });
    spec.push({ type: 'feed', count: 4 });
    spec.push({ type: 'cut' });

    const tmp = os.tmpdir();
    const specPath = path.join(tmp, `patient_receipt_${Date.now()}.json`);
    fs.writeFileSync(specPath, JSON.stringify(spec), { encoding: 'utf8' });

    const scriptPath = path.join(__dirname, '..', 'scripts', 'thermal_test.js');
    const args = [scriptPath, '--json', specPath];
    const ENV_PRINTER = process.env.PRINTER_NAME || process.env.PRINTER || null;
    if (ENV_PRINTER) args.push('--printer', ENV_PRINTER);

    const proc = spawnSync(process.execPath, args, { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    try { fs.unlinkSync(specPath); } catch (e) {}

    const entry = {
      action: 'patient_receipt_print_helper',
      patientId: patientObj.id || patientObj._id || null,
      patientCode: patientObj.patientCode || patientObj.patientId || null,
      args,
      exitCode: proc.status != null ? proc.status : null,
      error: proc.error ? String(proc.error) : null,
      stdout: proc.stdout || null,
      stderr: proc.stderr || null,
      timestamp: new Date().toISOString()
    };
    appendPrintLog(JSON.stringify(entry));

    if (proc.error || proc.status !== 0) {
      return { success: false, error: proc.stderr || proc.stdout || String(proc.error), exitCode: proc.status || null };
    }
    return { success: true, output: proc.stdout };
  } catch (e) {
    appendPrintLog(JSON.stringify({ action: 'print_helper_error', error: String(e), timestamp: new Date().toISOString() }));
    return { success: false, error: String(e) };
  }
}

module.exports = { printPatientReceipt };
