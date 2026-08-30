#!/usr/bin/env node
// Simple Node.js ESC/POS thermal printer test (Windows)
// Usage:
//   node thermal_test.js                # lists printers and prompts
//   node thermal_test.js --printer "Name"
//   node thermal_test.js --receipt --dry-run

// Load environment variables from node/.env when present
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch (e) {}
let printer = null;
try { printer = require('printer'); } catch (e) { printer = null; }
const iconv = require('iconv-lite');
const argv = require('process').argv.slice(2);
const { spawnSync, execSync } = require('child_process');
const path = require('path');

function parseArgs() {
  const args = { printer: null, receipt: false, dryRun: false, service: false, json: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--printer' || a === '-p') args.printer = argv[++i];
    else if (a === '--receipt') args.receipt = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--service') args.service = true;
    else if (a === '--json' || a === '-j') args.json = argv[++i];
  }
  return args;
}

function getPrinters() {
  // Use native module when available
  if (printer && typeof printer.getPrinters === 'function') {
    try {
      return printer.getPrinters();
    } catch (err) {
      console.error('Failed to call native printer.getPrinters():', err.message);
      // fall through to fallback
    }
  }

  // Windows fallback: use WMIC to enumerate printer names
  try {
    const out = execSync('wmic printer get name 2>nul', { encoding: 'utf8' });
    const lines = out.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length <= 1) return [];
    const names = lines.slice(1);
    return names.map(n => ({ name: n }));
  } catch (err) {
    console.error('Printer module unavailable and WMIC fallback failed:', err.message);
    return [];
  }
}

function getDefaultPrinterName(printers) {
  // Prefer native getter if available
  if (printer && typeof printer.getDefaultPrinterName === 'function') {
    try {
      const name = printer.getDefaultPrinterName();
      if (name) return name;
    } catch (err) {
      console.error('Failed to call native printer.getDefaultPrinterName():', err.message);
    }
  }

  if (!printers || printers.length === 0) return null;
  // printers is an array of strings here (we map to .name earlier)
  const first = printers[0];
  return typeof first === 'string' ? first : (first && first.name) ? first.name : String(first);
}

function makeText(s) {
  // encode to CP437 which many ESC/POS printers expect
  return iconv.encode(s, 'cp437');
}

function formatMoney(v) { return v.toFixed(2); }

function createSampleReceipt() {
  const ESC = Buffer.from([0x1b]);
  const GS = Buffer.from([0x1d]);
  const init = Buffer.concat([ESC, Buffer.from('@')]);
  const feed = Buffer.from('\n\n\n\n');
  const cut = Buffer.concat([GS, Buffer.from('V\x00')]);

  const lines = [];
  lines.push(Buffer.concat([ESC, Buffer.from('a'), Buffer.from([0x01]), GS, Buffer.from('!'), Buffer.from([0x11]), makeText('MY STORE\n')]));
  lines.push(Buffer.from([0x1d,0x21,0x00]));
  lines.push(Buffer.concat([ESC, Buffer.from('a'), Buffer.from([0x01]), makeText('123 Main St\nCity, ST 12345\n\n')]));

  const items = [['Coffee',2,2.50], ['Bagel',1,1.75], ['Donut',3,0.99]];
  let subtotal = 0;
  lines.push(makeText('Item                QTY   Price   Total\n'));
  lines.push(makeText('----------------------------------------\n'));
  items.forEach(it => {
    const name = (it[0].slice(0,16)).padEnd(16, ' ');
    const qty = String(it[1]).padStart(3, ' ');
    const price = formatMoney(it[2]).padStart(7, ' ');
    const total = formatMoney(it[1]*it[2]).padStart(8, ' ');
    subtotal += it[1]*it[2];
    lines.push(makeText(`${name}${qty}${price}${total}\n`));
  });
  const tax = subtotal * 0.07;
  const total = subtotal + tax;
  lines.push(makeText('\n'));
  lines.push(makeText(`Subtotal:${String(formatMoney(subtotal)).padStart(28,' ')}\n`));
  lines.push(makeText(`Tax (7%):${String(formatMoney(tax)).padStart(27,' ')}\n`));
  lines.push(makeText(`TOTAL:${String(formatMoney(total)).padStart(31,' ')}\n`));
  lines.push(makeText(`\n${new Date().toISOString().replace('T',' ').slice(0,19)}\n`));
  lines.push(Buffer.concat([ESC, Buffer.from('a'), Buffer.from([0x01]), makeText('Thank you!\n')]));

  return Buffer.concat([init].concat(lines).concat([feed, cut]));
}

function buildPayloadFromJson(spec, cashDrawerEnabled = true) {
  const ESC = Buffer.from([0x1b]);
  const GS = Buffer.from([0x1d]);
  const init = Buffer.concat([ESC, Buffer.from('@')]);
  const chunks = [init];

  function alignCmd(a) {
    if (a === 'center') return Buffer.concat([ESC, Buffer.from('a'), Buffer.from([0x01])]);
    if (a === 'right') return Buffer.concat([ESC, Buffer.from('a'), Buffer.from([0x02])]);
    return Buffer.concat([ESC, Buffer.from('a'), Buffer.from([0x00])]);
  }

  function boldCmd(on) { return Buffer.concat([ESC, Buffer.from('E'), Buffer.from([on ? 0x01 : 0x00])]); }
  function underlineCmd(on) { return Buffer.concat([ESC, Buffer.from('-'), Buffer.from([on ? 0x01 : 0x00])]); }
  function sizeCmd(size) {
    // size: normal|double|quad
    if (size === 'double') return Buffer.from([0x1d,0x21,0x11]);
    if (size === 'quad') return Buffer.from([0x1d,0x21,0x22]);
    return Buffer.from([0x1d,0x21,0x00]);
  }

  for (const item of spec) {
    if (!item || !item.type) continue;
    if (item.type === 'cash_drawer' && !cashDrawerEnabled) continue;
    if (item.type === 'text') {
      if (item.align) chunks.push(alignCmd(item.align));
      if (item.size) chunks.push(sizeCmd(item.size));
      if (item.bold) chunks.push(boldCmd(true));
      if (item.underline) chunks.push(underlineCmd(true));
      chunks.push(makeText(item.text + (item.nl !== false ? '\n' : '')));
      if (item.bold) chunks.push(boldCmd(false));
      if (item.underline) chunks.push(underlineCmd(false));
      if (item.size) chunks.push(sizeCmd('normal'));
    } else if (item.type === 'feed') {
      const n = item.count || 1;
      chunks.push(Buffer.from('\n'.repeat(n)));
    } else if (item.type === 'hr') {
      // horizontal rule: repeat '-' for a printable line
      if (item.align) chunks.push(alignCmd(item.align));
      const count = item.count || 32;
      chunks.push(makeText('-'.repeat(count) + '\n'));
    } else if (item.type === 'cut') {
      chunks.push(Buffer.from([0x1d,0x56,0x00]));
    } else if (item.type === 'raw') {
      // hex string
      const hex = item.hex.replace(/\s+/g, '');
      chunks.push(Buffer.from(hex, 'hex'));
    } else if (item.type === 'cash_drawer') {
      // ESC p m t1 t2 - open cash drawer
      const m = item.drawer || 0; // drawer number 0 or 1
      const t1 = item.on_time || 50; // on time in 2ms units (50 = 100ms)
      const t2 = item.off_time || 100; // off time in 2ms units (100 = 200ms)
      chunks.push(Buffer.concat([ESC, Buffer.from('p'), Buffer.from([m, t1, t2])]));
    }
  }

  // always feed and cut at end if not present
  chunks.push(Buffer.from('\n\n'));
  chunks.push(Buffer.from([0x1d,0x56,0x00]));
  return Buffer.concat(chunks);
}

function main() {
  const args = parseArgs();
  // Cash drawer pulse disabled project-wide (not used)
  const cashDrawerEnabled = false;
  const printers = getPrinters().map(p => (typeof p === 'string' ? p : p.name));
  if (!printers.length) {
    console.error('No printers found');
    process.exit(1);
  }

  const PREFERRED = 'Xprinter XP-230H';
  // Allow environment override
  const ENV_PRINTER = process.env.PRINTER_NAME || process.env.PRINTER || null;
  let printerName = args.printer || ENV_PRINTER || null;

  // If no explicit printer, prefer Xprinter, else default
  if (!printerName) {
    if (printers.includes(PREFERRED)) printerName = PREFERRED;
    else {
      const defaultPrinter = getDefaultPrinterName(printers);
      printerName = defaultPrinter || printers[0];
    }
  }

  if (args.service) {
    if (!args.receipt && !args.json) args.receipt = true;
    console.log(`Service mode: using printer '${printerName}' and printing on start.`);
  }

  let payload;
  if (args.json) {
    const fs = require('fs');
    let specRaw;
    try {
      specRaw = fs.readFileSync(path.resolve(args.json), 'utf8');
    } catch (e) {
      console.error('Failed to read JSON file:', e.message);
      process.exit(1);
    }
    let spec;
    try { spec = JSON.parse(specRaw); } catch (e) { console.error('Invalid JSON:', e.message); process.exit(1); }
    payload = buildPayloadFromJson(spec, cashDrawerEnabled);
  } else if (args.receipt) payload = createSampleReceipt();
  else {
    const ESC = Buffer.from([0x1b]);
    const init = Buffer.concat([ESC, Buffer.from('@')]);
    const bold_on = Buffer.concat([ESC, Buffer.from('E'), Buffer.from([0x01])]);
    const bold_off = Buffer.concat([ESC, Buffer.from('E'), Buffer.from([0x00])]);
    const underline_on = Buffer.concat([ESC, Buffer.from('-'), Buffer.from([0x01])]);
    const underline_off = Buffer.concat([ESC, Buffer.from('-'), Buffer.from([0x00])]);
    const feed = Buffer.from('\n\n\n\n');
    const cut = Buffer.from([0x1d, 0x56, 0x00]);
    const text = makeText('*** PRINTER TEST ***\nHello from thermal_test.js\nPrinting sample lines to verify feed, text, and cut.\n');
    payload = Buffer.concat([init, bold_on, text, bold_off, underline_on, makeText('Underline test\n'), underline_off, feed, cut]);
  }

  if (args.dryRun) {
    console.log('--- Printable preview ---');
    console.log(iconv.decode(payload, 'cp437'));
    console.log('--- Payload (hex) ---');
    console.log(payload.toString('hex'));
    console.log(`Payload length: ${payload.length} bytes`);
    process.exit(0);
  }
  // If the native `printer` module is available, use it. Otherwise, call PowerShell, then Python script as fallback.
  if (printer) {
    try {
      printer.printDirect({
        data: payload,
        printer: printerName,
        type: 'RAW',
        success: function(jobID){ console.log('Sent to printer', printerName, 'jobID:', jobID); },
        error: function(err){ console.error('Print failed:', err); process.exit(1); }
      });
    } catch (e) {
      console.error('Failed to send to printer via native module:', e);
      process.exit(1);
    }
  } else {
    // Attempt PowerShell raw-print fallback first (uses Win32 API via Add-Type)
    const fs = require('fs');
    const os = require('os');
    const tmp = require('path');
    const tempDir = os.tmpdir();
    const dataPath = tmp.join(tempDir, `thermal_payload_${Date.now()}.bin`);
    fs.writeFileSync(dataPath, payload);

    const psScriptPath = tmp.join(tempDir, `thermal_send_${Date.now()}.ps1`);
    const psScript = `param($printerName, $filePath)
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
  public static extern bool OpenPrinter(string src, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter")] public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA")] public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter")] public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter")] public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter")] public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter")] public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

  public static bool SendBytesToPrinter(string szPrinterName, byte[] pBytes, int dwCount) {
    IntPtr hPrinter = IntPtr.Zero;
    DOCINFOA di = new DOCINFOA();
    di.pDocName = "Raw Document";
    di.pDataType = "RAW";
    if(!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) return false;
    int written = 0;
    bool bSuccess = StartDocPrinter(hPrinter, 1, di);
    bSuccess = bSuccess && StartPagePrinter(hPrinter);
    GCHandle handle = GCHandle.Alloc(pBytes, GCHandleType.Pinned);
    try {
      IntPtr pUnmanagedBytes = handle.AddrOfPinnedObject();
      bSuccess = bSuccess && WritePrinter(hPrinter, pUnmanagedBytes, dwCount, out written);
    } finally {
      handle.Free();
    }
    bSuccess = bSuccess && EndPagePrinter(hPrinter);
    bSuccess = bSuccess && EndDocPrinter(hPrinter);
    ClosePrinter(hPrinter);
    return bSuccess;
  }
}
"@
$bytes = [System.IO.File]::ReadAllBytes($filePath)
$ok = [RawPrinterHelper]::SendBytesToPrinter($printerName, $bytes, $bytes.Length)
if (-not $ok) { exit 2 } else { exit 0 }
`;

    fs.writeFileSync(psScriptPath, psScript, { encoding: 'utf8' });
    console.log('Attempting PowerShell raw print fallback...');
    const psRes = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScriptPath, printerName, dataPath], { stdio: 'inherit' });
    try { fs.unlinkSync(psScriptPath); } catch (e) {}
    try { fs.unlinkSync(dataPath); } catch (e) {}
    if (!psRes.error && psRes.status === 0) {
      console.log(`PowerShell raw print succeeded to printer: ${printerName}`);
      process.exit(0);
    }

    // PowerShell fallback failed — try Python script as last fallback.
    console.error('PowerShell raw print failed, trying Python script...');
    const pythonPath = path.join(__dirname, '..', 'scripts', 'thermal_test.py');
    const pythonArgs = [pythonPath, '--printer', printerName];
    if (args.json) pythonArgs.push('--json', args.json);
    else if (args.receipt) pythonArgs.push('--receipt');
    const pyRes = spawnSync('python', pythonArgs, { stdio: 'inherit' });
    if (!pyRes.error && pyRes.status === 0) {
      console.log(`Python script succeeded for printer: ${printerName}`);
      process.exit(0);
    }

    console.error('All print methods failed.');
    process.exit(1);
  }
}

main();
