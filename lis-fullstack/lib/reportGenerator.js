/**
 * Report PDF generator — uses puppeteer-core with the system Edge browser.
 *
 * Edge (Chromium) is pre-installed on every Windows 10/11 PC, so there is
 * nothing extra to download.  PDFs are pre-generated in the background
 * (on test save + server startup) and stored at:
 *
 *   ~/Documents/LIS/reports/Lab_Report_<testId>.pdf
 *
 * When a user clicks "Download" the file is served straight from disk — instant.
 */
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const ejs  = require('ejs');
const { getResultTemplate } = require('./templateResolver');
const { sanitizeTestSignatures } = require('./signatureResolver');

const reportsDir = path.join(os.homedir(), 'Documents', 'LIS', 'reports');

function ensureDir() {
  try { fs.mkdirSync(reportsDir, { recursive: true }); } catch (e) {}
}

// ── find system browser (Edge → Chrome → bundled Chromium) ─────────────
function findBrowserExe() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (e) {}
  }
  // fallback: let puppeteer/puppeteer-core figure it out
  return undefined;
}

// ── singleton browser instance with idle timer ─────────────────────────
let _browser = null;
let _browserLaunchPromise = null;
let _browserIdleTimer = null;

function resetBrowserIdleTimer() {
  if (_browserIdleTimer) clearTimeout(_browserIdleTimer);
  _browserIdleTimer = setTimeout(async () => {
    try {
      if (_browser) {
        console.log('[reportGenerator] closing idle browser instance to conserve RAM');
        await _browser.close();
        _browser = null;
      }
    } catch (_) {}
  }, 60000);
}

async function getBrowser() {
  resetBrowserIdleTimer();
  if (_browser && _browser.isConnected()) return _browser;
  if (_browserLaunchPromise) return _browserLaunchPromise;
  _browserLaunchPromise = (async () => {
    let puppeteer;
    try { puppeteer = require('puppeteer-core'); } catch (e) {
      try { puppeteer = require('puppeteer'); } catch (ee) {
        return null;
      }
    }
    const executablePath = findBrowserExe();
    if (!executablePath) return null;
    console.log(`[reportGenerator] launching browser: ${executablePath || '(default)'}`);
    try {
      _browser = await puppeteer.launch({
        headless: 'new',
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-extensions',
        ],
      });
      _browser.on('disconnected', () => { _browser = null; _browserLaunchPromise = null; });
    } catch (launchErr) {
      console.warn('[reportGenerator] browser launch failed:', launchErr && launchErr.message);
      _browser = null;
    }
    _browserLaunchPromise = null;
    return _browser;
  })();
  return _browserLaunchPromise;
}

// ── escapeHtml + highlight helper (mirrors server.js res.locals.hl) ──
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function highlightResult(text) {
  if (text == null) return '';
  var s = String(text);
  var containsTags = /<\/?[a-z][\s\S]*>/i.test(s);
  if (!containsTags) {
    var out = escapeHtml(s);
    out = out.replace(/\b(Positive|Reactive|trace)\b/gi, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
    out = out.replace(/(\+{1,4})/g, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
    return out;
  }
  var escaped = s;
  escaped = escaped.replace(/\b(Positive|Reactive|trace)\b/gi, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
  escaped = escaped.replace(/(\+{1,4})/g, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
  return escaped;
}

// ── inline logo cache ──────────────────────────────────────────────────
let _cachedInlineLogo;
function getInlineLogo() {
  if (typeof _cachedInlineLogo !== 'undefined') return _cachedInlineLogo;
  try {
    const p = path.join(__dirname, '..', 'assets', 'gezyne-logo.png');
    const buf = fs.readFileSync(p);
    _cachedInlineLogo = 'data:image/png;base64,' + buf.toString('base64');
  } catch (e) {
    _cachedInlineLogo = null;
  }
  return _cachedInlineLogo;
}

// ── path helpers ───────────────────────────────────────────────────────
function getReportPath(test) {
  const id = String(test.testId || test.id || test._id || 'unknown');
  return path.join(reportsDir, `Lab_Report_${id}.pdf`);
}

function reportExists(test) {
  try { return fs.existsSync(getReportPath(test)); } catch (e) { return false; }
}

// ── populate a raw test with patient/user data for rendering ───────────
async function populateTestForPdf(test) {
  const Patient = require('../models/Patient');
  const User    = require('../models/User');

  const patient     = test.patient     ? await Patient.findById(test.patient)     : null;
  const requestedBy = test.requestedBy ? await User.findById(test.requestedBy)    : null;
  const performedBy = test.performedBy ? await User.findById(test.performedBy)    : null;

  const isMedical = requestedBy && ['Radiologist', 'Doctor', 'Pathologist'].includes(requestedBy.role);

  const populated = {
    ...test,
    patient:     patient     ? (typeof patient.toJSON === 'function' ? patient.toJSON() : patient) : null,
    requestedBy: isMedical   ? { name: requestedBy.name, role: requestedBy.role } : null,
    performedBy: performedBy ? { name: performedBy.name } : null
  };

  if ((!populated.requestedBy || !populated.requestedBy.name) && populated.results && populated.results.requestedByName) {
    populated.requestedBy = { name: populated.results.requestedByName, license: populated.results.requestedByLicense || null };
  }
  if ((!populated.performedBy || !populated.performedBy.name) && populated.results && populated.results.performedByName) {
    populated.performedBy = { name: populated.results.performedByName, license: populated.results.performedByLicense || null };
  }

  sanitizeTestSignatures(populated);

  return populated;
}

// ── inline all /assets/signature/ images as base64 data URIs ───────────
const _sigCache = {};
function inlineSignatureImages(html) {
  const sigDir = path.join(__dirname, '..', 'assets', 'signature');
  return html.replace(/src=["']\/assets\/signature\/([^"']+)["']/gi, (match, filename) => {
    if (_sigCache[filename]) return `src="${_sigCache[filename]}"`;
    try {
      const filePath = path.join(sigDir, filename);
      if (fs.existsSync(filePath)) {
        const ext = path.extname(filename).toLowerCase().replace('.', '');
        const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext;
        const b64 = fs.readFileSync(filePath).toString('base64');
        const dataUri = `data:${mime};base64,${b64}`;
        _sigCache[filename] = dataUri;
        return `src="${dataUri}"`;
      }
    } catch (e) {}
    return match;
  });
}

// ── render HTML for a fully-populated test ─────────────────────────────
async function renderHtmlForTest(populatedTest, templateName) {
  const resultView  = path.join(__dirname, '..', 'views', 'reports', 'results', `${templateName}.ejs`);
  const wrapperView = path.join(__dirname, '..', 'views', 'reports', 'print.ejs');
  const inlineLogo  = getInlineLogo();

  const renderedResult = await new Promise((resolve, reject) => {
    ejs.renderFile(resultView, { title: 'Result', test: populatedTest, layout: false, inlineLogo, hl: highlightResult }, (err, str) => {
      if (err) return reject(err);
      resolve(str);
    });
  });

  const finalHtml = await new Promise((resolve, reject) => {
    ejs.renderFile(wrapperView, {
      title: 'Print Report',
      test: populatedTest,
      currentDate: new Date().toLocaleDateString(),
      renderedResultHtml: renderedResult,
      layout: false,
      inlineLogo,
      hl: highlightResult
    }, (err, str) => {
      if (err) return reject(err);
      resolve(str);
    });
  });

  // Replace /assets/signature/... URLs with inline base64 so PDF renderer can resolve them
  return inlineSignatureImages(finalHtml);
}

// ── convert HTML → PDF using Edge/Chrome via puppeteer-core ────────────
async function generatePdfBufferFromHtml(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const buf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.2in', bottom: '0.2in', left: '0.2in', right: '0.2in' },
    });
    return buf;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── serialized job queue (one PDF at a time to keep resource usage low) ─
let _queue = Promise.resolve();

function enqueue(fn) {
  _queue = _queue.then(fn, fn);
  return _queue;
}

// ── generate a single test's PDF and write to disk (with disk mtime caching) ──
async function generatePdfForTest(rawTest, forceRegenerate = false) {
  return enqueue(async () => {
    try {
      ensureDir();
      const populated    = await populateTestForPdf(rawTest);
      const outPath      = getReportPath(populated);

      // Fast path: if PDF exists on disk and is newer than test.updatedAt, serve cached
      if (!forceRegenerate && fs.existsSync(outPath)) {
        try {
          const stat = fs.statSync(outPath);
          const testUpdatedAt = rawTest.updatedAt ? new Date(rawTest.updatedAt).getTime() : 0;
          if (stat.mtimeMs >= testUpdatedAt && stat.size > 1000) {
            return outPath;
          }
        } catch (_) {}
      }

      const templateName = getResultTemplate(populated);
      const html         = await renderHtmlForTest(populated, templateName);
      const buf          = await generatePdfBufferFromHtml(html);
      fs.writeFileSync(outPath, buf);
      console.log(`[reportGenerator] wrote ${path.basename(outPath)}`);
      return outPath;
    } catch (e) {
      console.error(`[reportGenerator] failed for testId=${rawTest.testId || rawTest.id}:`, e && e.message);
      return null;
    }
  });
}

// ── startup scan: generate any missing PDFs for Completed/Released tests
async function generateAllMissing() {
  const Test = require('../models/Test');
  ensureDir();

  const allTests = await Test.find({});
  const eligible = (allTests || []).filter(t =>
    t && (t.status === 'Completed' || t.status === 'Released') && t.results
  );

  let generated = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const t of eligible) {
    if (reportExists(t)) { skipped++; continue; }
    try {
      await generatePdfForTest(t);
      generated++;
    } catch (e) {
      failed++;
      console.error(`[reportGenerator] startup gen failed testId=${t.testId || t.id}:`, e && e.message);
    }
  }

  console.log(`[reportGenerator] startup scan done — ${generated} generated, ${skipped} already existed, ${failed} failed (${eligible.length} total eligible)`);

  // close the browser after batch to free memory — it will re-launch on next request
  try { if (_browser) { await _browser.close(); _browser = null; } } catch (e) {}
}

module.exports = { reportsDir, getReportPath, reportExists, generatePdfForTest, generateAllMissing };
