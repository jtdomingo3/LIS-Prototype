const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const Jimp = require('jimp');
const bwipjs = require('bwip-js');

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

    // Build detailed copySpec matching the requested layout
    const copySpec = [];

    // Top: rasterized logo + lab name + big 5-digit code if available
    try {
      const logoPath = path.join(__dirname, '..', 'assets', 'gezyne-logo-NOTEXT.png');
      if (fs.existsSync(logoPath)) {
        const rawHex = await rasterLogoAndCodeToEscPosHex(logoPath, patientObj);
        if (rawHex) copySpec.push({ type: 'raw', hex: rawHex });
      }
    } catch (e) {}

    // Fallback: big patient code text if raster not available
    if (copySpec.length === 0) {
      const codeText = sanitizeText(patientObj.patientCode || patientObj.patientId || '');
      const last5Match = codeText.match(/(\d{5})$/);
      const last5 = last5Match ? last5Match[1] : codeText;
      copySpec.push({ type: 'text', align: 'center', size: 'double', bold: true, text: sanitizeText(last5) });
    }

    copySpec.push({ type: 'text', align: 'center', text: currentDate });
    copySpec.push({ type: 'feed', count: 1 });
    copySpec.push({ type: 'text', text: 'Name: ' + sanitizeText(fullName) });
    copySpec.push({ type: 'text', text: 'Age: ' + sanitizeText(age) });
    copySpec.push({ type: 'feed', count: 1 });
    copySpec.push({ type: 'text', size: 'normal', text: 'Laboratory Request:' });

    if (requested.length) {
      requested.forEach(r => {
        const label = sanitizeText(r.label || r.key || '');
        const amt = (r && (r.amount || r.amount === 0)) ? Number(r.amount) : 0;
        let line = `- ${label}`;
        if (amt) line += ` - PHP ${Number(amt).toFixed(2)}`;
        copySpec.push({ type: 'text', text: line });
        // If this requested test has remarks, include them indented on the next line
        try {
          const rem = r && (r.remarks || r.remark || r.note || r.notes);
          if (rem && String(rem).trim()) {
            const sanitized = sanitizeText(String(rem).trim());
            // Print remark text indented, but drop the literal "Remarks:" label
            copySpec.push({ type: 'text', text: '  ' + sanitized });
          }
        } catch (e) {}
      });
    } else {
      copySpec.push({ type: 'text', text: '- (No tests specified)' });
    }

    copySpec.push({ type: 'feed', count: 1 });
    copySpec.push({ type: 'text', text: 'Amount: PHP ' + Number(total || 0).toFixed(2) });
    copySpec.push({ type: 'feed', count: 2 });

    // Divider and validation lines (preserve exactly as provided)
    copySpec.push({ type: 'hr', align: 'center', count: 28 });
    copySpec.push({ type: 'feed', count: 0 });
    copySpec.push({ type: 'text', text: sanitizeText('Validated Amount Received by') });
    copySpec.push({ type: 'feed', count: 2 });
    copySpec.push({ type: 'text', align: 'center', size: 'normal', text: sanitizeText('This is not a valid OR') });
    copySpec.push({ type: 'text', align: 'center', size: 'normal', text: sanitizeText('Please keep this ticket') });
    copySpec.push({ type: 'text', align: 'center', size: 'normal', text: sanitizeText('until you are finished') });

    // Optional: append generated barcode (prefer raster; fallback to native ESC/POS barcode command)
    try {
      const code = sanitizeText(patientObj.patientCode || patientObj.patientId || '');
      if (code) {
        const barcodeHex = await barcodeToEscPosHex(code);
        const useNative = process.env.PRINT_USE_NATIVE_BARCODE === '1';
        // If raster barcode available and native not explicitly requested, include raster
        if (barcodeHex && !useNative) {
          copySpec.push({ type: 'feed', count: 1 });
          copySpec.push({ type: 'raw', hex: barcodeHex });
          copySpec.push({ type: 'feed', count: 1 });
        } else {
          // fallback / native path
          const nativeHex = nativeEscPosBarcodeHex(code, { width: 3, height: 80, hri: 0 });
          if (nativeHex) {
            copySpec.push({ type: 'feed', count: 1 });
            copySpec.push({ type: 'raw', hex: nativeHex });
            copySpec.push({ type: 'feed', count: 1 });
            try { appendPrintLog(JSON.stringify({ action: 'barcode_fallback_native', patientCode: code })); } catch (e) {}
          }
        }
      }
    } catch (e) {}

    copySpec.push({ type: 'cut' });

    // Build final spec: two copies by default, keep single-copy commented for debugging
    const spacer = [{ type: 'feed', count: 4 }];
    const spec = copySpec.concat(spacer, copySpec);
    // const spec = copySpec; // Uncomment to print only one copy while debugging

    const tmp = os.tmpdir();
    const specPath = path.join(tmp, `patient_receipt_${Date.now()}.json`);
    fs.writeFileSync(specPath, JSON.stringify(spec), { encoding: 'utf8' });

    const scriptPath = path.join(__dirname, '..', 'scripts', 'thermal_test.js');
    if (!fs.existsSync(scriptPath)) {
      console.warn('[printHelper] thermal_test.js not found at', scriptPath);
      return { success: false, reason: 'script-not-found' };
    }
    const args = [scriptPath, '--json', specPath];
    let ENV_PRINTER = process.env.PRINTER_NAME || process.env.PRINTER || null;
    if (!ENV_PRINTER) {
      try {
        const userDataPath = (typeof process.env.APPDATA !== 'undefined') ? path.join(process.env.APPDATA, 'lis-app-standalone') : null;
        if (userDataPath) {
          const settingsPath = path.join(userDataPath, 'settings.json');
          if (fs.existsSync(settingsPath)) {
            const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            if (s && (s.printerName || s.printer)) ENV_PRINTER = s.printerName || s.printer;
          }
        }
      } catch (e) {}
    }
    if (ENV_PRINTER) args.push('--printer', ENV_PRINTER);

    // Allow test mode: if PRINT_DRY_RUN=1, ask thermal_test to print preview instead of sending to printer
    const debugDry = process.env.PRINT_DRY_RUN === '1';
    if (debugDry && !args.includes('--dry-run')) args.push('--dry-run');

    const spawnEnv = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });

    // If requested, run a debug dry-run first and print the payload/preview to the terminal
    if (process.env.PRINT_DEBUG_PRINT_PAYLOAD === '1') {
      try {
        const debugArgs = [scriptPath, '--json', specPath, '--dry-run'];
        const debugProc = spawnSync(process.execPath, debugArgs, { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, env: spawnEnv });
        const preview = debugProc.stdout || debugProc.stderr || '';
        console.log('--- Thermal preview (PRINT_DEBUG_PRINT_PAYLOAD) ---');
        console.log(preview);
        try {
          appendPrintLog(JSON.stringify({ action: 'print_preview_console', patientCode: patientObj.patientCode || patientObj.patientId || null, preview: String(preview).slice(0, 20000) }));
        } catch (e) {}
      } catch (e) {
        console.warn('Failed to run thermal debug preview:', e);
      }
    }

    // When debug logging is requested, save the spec JSON to the print log so we have the exact payload
    try {
      if (process.env.PRINT_DEBUG_PRINT_PAYLOAD === '1') {
        appendPrintLog(JSON.stringify({ action: 'print_spec_saved', specPath, spec: spec }));
      }
    } catch (e) {}

    const proc = spawnSync(process.execPath, args, { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, env: spawnEnv });
    // In debug mode keep the spec file and also append the spec JSON to the print log for inspection
    try {
      if (!debugDry) try { fs.unlinkSync(specPath); } catch (e) {}
      else appendPrintLog(JSON.stringify({ action: 'print_spec_debug', specPath, spec }));
    } catch (e) {}

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

async function rasterImageToEscPosHex(imagePath) {
  try {
    const img = await Jimp.read(imagePath);
    // convert to monochrome bitmap, scale to printer width (384px typical for 48mm)
    const maxWidth = 384;
    if (img.bitmap.width > maxWidth) img.resize(maxWidth, Jimp.AUTO);
    img.greyscale().contrast(0.1);
    img.bitmap.data = img.bitmap.data; // ensure buffer exists

    // build 1-bit per pixel bitmap rows
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const bytesPerRow = Math.ceil(width / 8);
    const rasterData = Buffer.alloc(bytesPerRow * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = img.bitmap.data[idx];
        // threshold
        const bit = (r > 127) ? 0 : 1; // black pixel -> 1
        if (bit) {
          const byteIndex = y * bytesPerRow + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          rasterData[byteIndex] |= (1 << bitIndex);
        }
      }
    }

    // ESC/POS raster bit image: GS v 0 m xL xH yL yH d...
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = height & 0xff;
    const yH = (height >> 8) & 0xff;
    const header = Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
    const out = Buffer.concat([header, rasterData]);
    return out.toString('hex');
  } catch (e) {
    return null;
  }
}

async function barcodeToEscPosHex(text) {
  try {
    // Use stronger barcode rendering settings (scale 3, taller height) for better scanner readability
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: text, scale: 3, height: 40, includetext: false, backgroundcolor: 'FFFFFF' });
    // load into Jimp to prepare raster
    const img = await Jimp.read(png);
    // scale to a slightly narrower target to leave margins
    const maxWidth = 320;
    if (img.bitmap.width > maxWidth) img.resize(maxWidth, Jimp.AUTO);
    img.greyscale();

    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const bytesPerRow = Math.ceil(width / 8);
    const rasterData = Buffer.alloc(bytesPerRow * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = img.bitmap.data[idx];
        const bit = (r > 127) ? 0 : 1;
        if (bit) {
          const byteIndex = y * bytesPerRow + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          rasterData[byteIndex] |= (1 << bitIndex);
        }
      }
    }
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = height & 0xff;
    const yH = (height >> 8) & 0xff;
    const header = Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
    const out = Buffer.concat([header, rasterData]);
    return out.toString('hex');
  } catch (e) {
    return null;
  }
}

// Build a native ESC/POS barcode command sequence (Code128)
function nativeEscPosBarcodeHex(text, options) {
  try {
    const t = String(text || '');
    const bufArr = [];
    // Set barcode module width (GS w n) - default 3
    const moduleWidth = (options && options.width) ? Number(options.width) : 3;
    bufArr.push(Buffer.from([0x1d, 0x77, moduleWidth & 0xff]));
    // Set barcode height (GS h n)
    const height = (options && options.height) ? Number(options.height) : 80;
    bufArr.push(Buffer.from([0x1d, 0x68, height & 0xff]));
    // HRI (human readable) position: 0 = not printed
    const hri = (options && options.hri) ? options.hri : 0;
    bufArr.push(Buffer.from([0x1d, 0x48, hri & 0xff]));

    // GS k m n d... : m=73 (0x49) for CODE128 on many printers
    const dataBuf = Buffer.from(t, 'ascii');
    const m = 0x49;
    const n = dataBuf.length & 0xff;
    bufArr.push(Buffer.from([0x1d, 0x6b, m, n]));
    bufArr.push(dataBuf);

    const out = Buffer.concat(bufArr);
    return out.toString('hex');
  } catch (e) {
    return null;
  }
}

async function rasterLogoAndCodeToEscPosHex(imagePath, patientObj) {
  try {
    const img = await Jimp.read(imagePath);
    const targetWidth = 384;
    const padding = 6;

    // Prepare fonts
    const smallFont = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    let bigFont;
    try { bigFont = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK); } catch (e) { bigFont = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK); }

    // Scale logo to reasonable height
    const maxLogoHeight = 48;
    img.scaleToFit(80, maxLogoHeight);
    const logoW = img.bitmap.width;
    const logoH = img.bitmap.height;

    const codeText = String(patientObj.patientCode || patientObj.patientId || '');
    const last5Match = codeText.match(/(\d{5})$/);
    const bigText = last5Match ? last5Match[1] : (codeText || '');
    const middleText = sanitizeText('GEZYNE CLINICAL LABORATORY');

    const bigTextWidth = Jimp.measureText(bigFont, bigText);
    const bigTextHeight = Jimp.measureTextHeight(bigFont, bigText, bigTextWidth);
    const midTextWidth = Jimp.measureText(smallFont, middleText);
    const midTextHeight = Jimp.measureTextHeight(smallFont, middleText, midTextWidth);

    const gap = 6;
    const canvasHeight = padding + logoH + gap + midTextHeight + gap + bigTextHeight + padding;
    const canvas = new Jimp(targetWidth, canvasHeight, 0xffffffff);

    const logoX = Math.floor((targetWidth - logoW) / 2);
    const logoY = padding;
    canvas.composite(img, logoX, logoY);

    const midX = Math.floor((targetWidth - midTextWidth) / 2);
    const midY = padding + logoH + gap;
    canvas.print(smallFont, midX, midY, middleText);

    const bigX = Math.floor((targetWidth - bigTextWidth) / 2);
    const bigY = midY + midTextHeight + gap;
    canvas.print(bigFont, bigX, bigY, bigText);

    // Convert to monochrome bitmap
    const width = canvas.bitmap.width;
    const height = canvas.bitmap.height;
    const bytesPerRow = Math.ceil(width / 8);
    const rasterData = Buffer.alloc(bytesPerRow * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = canvas.bitmap.data[idx + 0];
        const g = canvas.bitmap.data[idx + 1];
        const b = canvas.bitmap.data[idx + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const bit = gray < 128 ? 1 : 0;
        if (bit) {
          const byteIndex = y * bytesPerRow + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          rasterData[byteIndex] |= (1 << bitIndex);
        }
      }
    }
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = height & 0xff;
    const yH = (height >> 8) & 0xff;
    const header = Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
    const out = Buffer.concat([header, rasterData]);
    return out.toString('hex');
  } catch (e) {
    return null;
  }
}

module.exports = { printPatientReceipt };
