/**
 * Report HTML renderer — generates standalone HTML matching the original
 * lis-fullstack EJS result templates.  Each test-type gets a specific
 * body renderer; unknown types fall back to a generic key-value table.
 *
 * Usage:  renderReportHtml(test, patient, baseUrl)
 *   - test:     the tests row  (with parsed results JSON)
 *   - patient:  the patients row
 *   - baseUrl:  backend origin for absolute asset URLs (e.g. "http://localhost:3020")
 */

import * as fs from 'fs';
import * as path from 'path';
import { getResultTemplate } from './templateResolver';

// ── helpers ────────────────────────────────────────────────────────────

function esc(v: any): string {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Highlight abnormal results (Positive, Reactive, trace, +) in red */
function hl(v: any): string {
  if (v == null) return '';
  let s = esc(String(v));
  s = s.replace(/\b(Positive|Reactive|trace)\b/gi, m => `<span class="result-highlight">${m}</span>`);
  s = s.replace(/(\+{1,4})/g, m => `<span class="result-highlight">${m}</span>`);
  return s;
}

function fmtDate(d: any): string {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleDateString();
}

function fmtTime(d: any): string {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString();
}

function calcAge(dob: any, ageManual?: any): string {
  if (dob) {
    const born = new Date(dob);
    if (!isNaN(born.getTime())) return String(Math.max(0, new Date().getFullYear() - born.getFullYear()));
  }
  return ageManual ? String(ageManual) : '';
}

function flagValue(val: any, min?: number, max?: number): string {
  if (val == null || String(val).trim() === '') return '';
  const n = parseFloat(String(val).replace(/[^0-9.+\-eE]/g, ''));
  if (isNaN(n)) return '';
  if (min != null && n < min) return 'L';
  if (max != null && n > max) return 'H';
  return '';
}

function flagSpan(val: any, min?: number, max?: number): string {
  const f = flagValue(val, min, max);
  return f ? `<span class="flag">${f}</span>` : '';
}

// ── inline logo cache ──────────────────────────────────────────────────

let _cachedInlineLogo: string | null | undefined;

function getInlineLogo(): string {
  if (typeof _cachedInlineLogo !== 'undefined') return _cachedInlineLogo || '';
  try {
    // Try several locations (dev: src/lib → ../../assets, prod: dist/lib → ../../assets, cwd fallback)
    const candidates = [
      path.join(__dirname, '..', '..', 'assets', 'gezyne-logo.png'),
      path.join(__dirname, '..', 'assets', 'gezyne-logo.png'),
      path.join(process.cwd(), 'assets', 'gezyne-logo.png'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        _cachedInlineLogo = 'data:image/png;base64,' + buf.toString('base64');
        return _cachedInlineLogo!;
      }
    }
  } catch (_) {}
  _cachedInlineLogo = null;
  return '';
}

function getSignatureDataUri(filename: string): string {
  try {
    const candidates = [
      path.join(__dirname, '..', '..', 'assets', 'signature', filename),
      path.join(__dirname, '..', 'assets', 'signature', filename),
      path.join(process.cwd(), 'assets', 'signature', filename),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const ext = path.extname(filename).toLowerCase().replace('.', '');
        const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext;
        return 'data:' + mime + ';base64,' + fs.readFileSync(p).toString('base64');
      }
    }
  } catch (_) {}
  return '';
}

// ── types ──────────────────────────────────────────────────────────────

interface TestRow {
  test_id?: string;
  test_type?: string;
  test_date?: string;
  completed_at?: string;
  results?: any;
  template?: string;
  [k: string]: any;
}

interface PatientRow {
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  date_of_birth?: string;
  age_manual?: any;
  gender?: string;
  physician?: string;
  patient_id?: string;
  patient_code?: string;
  [k: string]: any;
}

// ── shared CSS ─────────────────────────────────────────────────────────

const SHARED_CSS = `
@page { size: Letter; margin: 0.25in; }
body { margin:0; padding:0; box-sizing:border-box; font-family: 'Times New Roman', Times, serif; color:#000; font-size:12px; }
*, *:before, *:after { box-sizing:inherit; }
.report-page{ position:relative; width:100%; max-width:calc(8.5in - 0.5in); margin:0 auto; padding:8px; }
.report-container{ position:relative; z-index:1; }
.header{ display:flex; align-items:flex-start; gap:8px; }
.logo{ width:68px; height:auto; margin-right:6px; }
.lab-title{ text-align:center; flex:1; min-width:0; }
.lab-title h1{ margin:0; font-size:20px; color:#009957; letter-spacing:1px; }
.lab-sub{ font-size:9px; margin-top:3px; color:#009957; }
.date-table{ min-width:180px; font-size:12px; text-align:right; }
.date-table table{ border-collapse:collapse; width:100%; font-size:12px; }
.date-table td{ border:1px solid #000; padding:4px; }
.patient-box{ margin-top:6px; width:100%; border-collapse:collapse; font-size:11px; }
.patient-box td{ padding:3px 5px; border:1px solid #000; }
.section-title{ text-align:center; margin:10px 0; font-size:15px; font-weight:bold; }
.results-frame{ width:100%; border:2px solid #000; border-collapse:collapse; margin-top:6px; }
.results-frame th, .results-frame td{ border:1px solid #000; padding:4px; vertical-align:middle; font-size:11px; }
.test-col{ width:50%; font-size:12px; font-weight:400; padding-left:8px; text-align:left; }
.result-col{ width:50%; font-size:12px; text-align:center; text-transform:uppercase; font-weight:700; }
.center{ text-align:center; }
.flag{ display:inline-block; min-width:18px; margin-left:4px; color:#d00; font-weight:700; }
.note{ margin-top:8px; font-size:11px; }
.note-text{ color:#c00; }
.result-highlight{ color:#d00; font-weight:700; }
.signatures{ display:flex; justify-content:space-between; margin-top:28px; }
.sig{ position:relative; text-align:center; width:32%; min-height:80px; }
.sig-line{ border-top:1px solid #000; height:10px; margin-bottom:6px; }
.sig .name{ font-weight:700; }
.sig .role{ font-size:11px; }
.sig .license{ font-size:10px; }
.signature-overlay{ position:absolute; pointer-events:none; left:50%; transform-origin:center; max-height:96px; z-index:2; }
.watermark{ position:absolute; left:50%; top:44%; transform:translate(-50%,-50%); width:52%; opacity:0.06; pointer-events:none; z-index:0; }
.normal-small{ font-size:11px; color:#333; }
.two-col{ display:flex; }
.col{ width:50%; padding:6px; }
.inner-table{ width:100%; border-collapse:collapse; }
.inner-table td, .inner-table th{ padding:4px 6px; border-bottom:1px dotted #999; font-size:12px; }
.inner-table th{ font-weight:700; }
.blood-results th{ padding:4px 8px; font-size:inherit; font-weight:700; }
.blood-results td{ padding:4px 8px; font-size:inherit; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

// ── header + patient info ──────────────────────────────────────────────

function renderHeader(test: TestRow, patient: PatientRow, baseUrl: string): string {
  const logo = getInlineLogo() || `${baseUrl}/assets/gezyne-logo.png`;
  const sex = esc(patient.gender || '');
  const dob = fmtDate(patient.date_of_birth);
  const age = calcAge(patient.date_of_birth, patient.age_manual);
  const patientName = patient.last_name ? `${esc(patient.last_name)}, ${esc(patient.first_name)}` : '';
  const physician = esc(patient.physician || '');

  return `
    <div class="header">
      <div><img src="${logo}" class="logo" alt="logo"></div>
      <div class="lab-title">
        <h1>GEZYNE CLINICAL LABORATORY</h1>
        <div class="lab-sub">0330 VERGEL DE DIOS ST POBLACION PLARIDEL</div>
        <div class="lab-sub">NEAR MUNICIPAL BASKETBALL COURT</div>
        <div class="lab-sub">0917-649-0807 / 0960-390-0921 / 795-5007</div>
        <div class="lab-sub">Lic. No. 03-435-15CL-20</div>
      </div>
      <div class="date-table">
        <table>
          <tr><td>Date:</td><td>${fmtDate(test.test_date) || fmtDate(new Date())}</td></tr>
          <tr><td>Time Requested:</td><td>${fmtTime(test.test_date)}</td></tr>
          <tr><td>Time Released:</td><td>${fmtTime(test.completed_at)}</td></tr>
        </table>
      </div>
    </div>

    <table class="patient-box">
      <tr>
        <td style="width:20%">Patient's Reference No. :</td>
        <td style="width:30%"><strong>${esc(test.test_id)}</strong></td>
        <td style="width:15%">DOB:</td>
        <td style="width:15%"><strong>${dob}</strong></td>
        <td style="width:10%">Sex:</td>
        <td style="width:10%"><strong>${sex}</strong></td>
      </tr>
      <tr>
        <td>Name:</td>
        <td colspan="3"><strong>${patientName}</strong></td>
        <td>Age:</td>
        <td><strong>${age}</strong></td>
      </tr>
      <tr>
        <td>Physician:</td>
        <td colspan="5"><strong>${physician}</strong></td>
      </tr>
    </table>`;
}

// ── signatures ─────────────────────────────────────────────────────────

function findSig(results: any, displayName: string) {
  if (!displayName || !results?.signatures) return null;
  const sigs = results.signatures;
  for (const k of Object.keys(sigs)) {
    const s = sigs[k];
    if (s?.name && String(s.name).trim() === String(displayName).trim()) return s;
  }
  return null;
}

function renderSigBlock(name: string, license: string, role: string, results: any, baseUrl: string): string {
  const sig = findSig(results, name);
  let sigImg = '';
  if (sig?.filename) {
    const dataUri = getSignatureDataUri(sig.filename);
    const src = dataUri || `${baseUrl}/assets/signature/${sig.filename}`;
    const p = sig.placement || { x: 0, y: -56, scale: 1.25 };
    sigImg = `<img src="${src}" class="signature-overlay" style="top:${p.y || -56}px; transform:translateX(-50%) scale(${p.scale || 1.25}); max-height:96px;" alt="signature">`;
  }
  return `
    <div class="sig">
      ${sigImg}
      <div class="sig-line"></div>
      <div class="name"><strong>${esc(name)}</strong></div>
      ${license ? `<div class="license"><strong>Lic. No. ${esc(license)}</strong></div>` : ''}
      <div class="role">${esc(role)}</div>
    </div>`;
}

function renderSignatures(results: any, baseUrl: string): string {
  const r = results || {};
  const performedName = r.performedByName || '';
  const performedLic = r.performedByLicense || '';
  const validatedName = r.validatedByName || '';
  const validatedLic = r.validatedByLicense || '';
  const requestedName = r.requestedByName || '';
  const requestedLic = r.requestedByLicense || '';

  return `
    <div class="signatures">
      ${renderSigBlock(performedName, performedLic, 'Medical Technologist', results, baseUrl)}
      ${renderSigBlock(validatedName, validatedLic, 'Validated By', results, baseUrl)}
      ${renderSigBlock(requestedName, requestedLic, 'Pathologist', results, baseUrl)}
    </div>`;
}

// ── watermark ──────────────────────────────────────────────────────────

function renderWatermark(baseUrl: string): string {
  const logo = getInlineLogo() || `${baseUrl}/assets/gezyne-logo.png`;
  return `<img class="watermark" src="${logo}" alt="">`;
}

// ── wrap full document ─────────────────────────────────────────────────

function wrapDocument(body: string, print = false): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Laboratory Report</title>
<style>${SHARED_CSS}</style>
</head><body>${body}
${print ? '<script>setTimeout(function(){ window.print(); },300);</script>' : ''}
</body></html>`;
}

// ═══════════════════════════════════════════════════════════════════════
//  RESULT BODY RENDERERS  (one per test type)
// ═══════════════════════════════════════════════════════════════════════

// ── URINALYSIS ─────────────────────────────────────────────────────────

function renderUrinalysis(r: any): string {
  return `
    <div class="section-title">URINALYSIS</div>
    <table class="results-frame">
      <tr>
        <td style="width:50%; vertical-align:top;">
          <table style="width:100%; border-collapse:collapse;">
            <tr>
              <th style="text-align:left; padding:6px; border:1px solid #000;">PHYSICAL / CHEMICAL ANALYSIS</th>
              <th style="text-align:center; padding:6px; border:1px solid #000; width:20%">Results</th>
              <th style="text-align:center; padding:6px; border:1px solid #000; width:20%">Reference Interval</th>
            </tr>
            <tr><td style="padding-left:8px">Color</td><td class="center">${hl(r.color)}</td><td class="center"></td></tr>
            <tr><td style="padding-left:8px">Transparency</td><td class="center">${hl(r.appearance)}</td><td class="center"></td></tr>
            <tr><td style="padding-left:8px">pH</td><td class="center">${hl(r.ph)}</td><td class="center">5.0 - 7.0</td></tr>
            <tr><td style="padding-left:8px">Sp. Gravity</td><td class="center">${hl(r.specificGravity)}</td><td class="center">1.005 - 1.025</td></tr>
            <tr><td style="padding-left:8px">Glucose</td><td class="center">${hl(r.glucose)}</td><td class="center">Negative</td></tr>
            <tr><td style="padding-left:8px">Protein</td><td class="center">${hl(r.protein)}</td><td class="center">Negative</td></tr>
            <tr><td style="padding-left:8px">Leukocyte</td><td class="center">${hl(r.leukocyte)}</td><td class="center">Negative</td></tr>
            <tr><td style="padding-left:8px">Nitrite</td><td class="center">${hl(r.nitrite)}</td><td class="center">Negative</td></tr>
            <tr><td style="padding-left:8px">Urobilinogen</td><td class="center">${hl(r.urobilinogen)}</td><td class="center">Negative</td></tr>
            <tr><td style="padding-left:8px">Blood</td><td class="center">${hl(r.blood)}</td><td class="center">Negative</td></tr>
          </table>
        </td>
        <td style="width:50%; vertical-align:top;">
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="padding-left:8px">Ketones</td><td class="center">${hl(r.ketones)}</td><td class="center">Negative</td></tr>
            <tr><td style="padding-left:8px">Bilirubin</td><td class="center">${hl(r.bilirubin)}</td><td class="center">Negative</td></tr>
            <tr>
              <th style="text-align:left; padding:6px; border:1px solid #000">MICROSCOPIC ANALYSIS</th>
              <th style="text-align:center; padding:6px; border:1px solid #000; width:20%">Results</th>
              <th style="text-align:center; padding:6px; border:1px solid #000; width:20%">Reference Interval</th>
            </tr>
            <tr><td style="padding-left:8px">WBC</td><td class="center">${hl(r.wbc)}</td><td class="center">0-3 / hpf</td></tr>
            <tr><td style="padding-left:8px">RBC</td><td class="center">${hl(r.rbc)}</td><td class="center">0-5 / hpf</td></tr>
            <tr><td style="padding-left:8px">Epithelial Cells</td><td class="center">${hl(r.epithelial)}</td><td class="center"></td></tr>
            <tr><td style="padding-left:8px">Mucus Threads</td><td class="center">${hl(r.mucus)}</td><td class="center"></td></tr>
            <tr><td style="padding-left:8px">Amorphous Crystals</td><td class="center">${hl(r.amorphous)}</td><td class="center"></td></tr>
            <tr><td style="padding-left:8px">Bacteria</td><td class="center">${hl(r.bacteria)}</td><td class="center"></td></tr>
            <tr><td style="padding-left:8px">Others</td><td class="center">${hl(r.others)}</td><td class="center"></td></tr>
          </table>
        </td>
      </tr>
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── HEMATOLOGY / CBC ───────────────────────────────────────────────────

function renderHematology(r: any, sex: string): string {
  const _sex = (sex || '').toLowerCase();
  function sexRow(key: string, mRange: string, fRange: string, mMin: number, mMax: number, fMin: number, fMax: number): string {
    const val = r[key] ?? '';
    const isMale = _sex === 'male';
    const isFemale = _sex === 'female';
    const activeMin = isMale ? mMin : fMin;
    const activeMax = isMale ? mMax : fMax;
    return `<td class="center">
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="min-height:18px;display:flex;align-items:center;justify-content:center;">
          ${isMale ? `<strong>${esc(val)}</strong>${flagSpan(val, mMin, mMax)}` : '&nbsp;'}
        </div>
        <div style="min-height:18px;display:flex;align-items:center;justify-content:center;margin-top:4px;">
          ${isFemale ? `<strong>${esc(val)}</strong>${flagSpan(val, fMin, fMax)}` : '&nbsp;'}
        </div>
      </div>
    </td>
    <td class="normal-small">
      <div style="display:flex;flex-direction:column;align-items:flex-end;">
        <div style="white-space:nowrap">Male&nbsp;&nbsp;${mRange}</div>
        <div style="white-space:nowrap;margin-top:4px;">Female&nbsp;&nbsp;${fRange}</div>
      </div>
    </td>`;
  }

  function simpleRow(label: string, key: string, ref: string, min?: number, max?: number): string {
    const val = r[key] ?? '';
    return `<tr><td>${label}</td><td class="center"><strong>${esc(val)}</strong>${flagSpan(val, min, max)}</td><td class="normal-small" style="text-align:right">${ref}</td></tr>`;
  }

  return `
    <div class="section-title" style="text-decoration:underline;font-size:22px">HEMATOLOGY</div>
    <table class="results-frame"><tr><td>
      <div class="two-col">
        <div class="col">
          <table class="inner-table">
            <tr><th style="width:50%"></th><th style="width:15%">Result</th><th style="width:35%">Normal Values</th></tr>
            ${simpleRow('RBC ct. (x 10^6/µL)', 'rbc', '3.8-5.8', 3.8, 5.8)}
            <tr><td>Hemoglobin (g/dL)</td>${sexRow('hemoglobin', '130-160', '120-140', 130, 160, 120, 140)}</tr>
            <tr><td>Hematocrit (%)</td>${sexRow('hematocrit', '0.38-0.49', '0.36-0.44', 0.38, 0.49, 0.36, 0.44)}</tr>
            ${simpleRow('MCV (µm³)', 'mcv', '83.0-98.0', 83, 98)}
            ${simpleRow('MCH (pg)', 'mch', '27.0-32.2', 27, 32.2)}
            ${simpleRow('MCHC (g/dL)', 'mchc', '31.8-33.7', 31.8, 33.7)}
          </table>
        </div>
        <div class="col">
          <table class="inner-table">
            <tr><th style="width:50%"></th><th style="width:15%">Result</th><th style="width:35%">Normal Values</th></tr>
            ${simpleRow('WBC ct.(x10⁹/L)', 'wbc', '5.0-10.0', 5, 10)}
            ${simpleRow('Neutrophils (%)', 'neutrophils', '43.0-76.0', 43, 76)}
            ${simpleRow('Lymphocyte (%)', 'lymphocyte', '17.0-48.0', 17, 48)}
            ${simpleRow('Monocyte (%)', 'monocyte', '0-10.0', 0, 10)}
            ${simpleRow('Eosinophils (%)', 'eosinophils', '0.5-5.0', 0.5, 5)}
            ${simpleRow('Basophils (%)', 'basophils', '0-1', 0, 1)}
            ${simpleRow('Platelet ct.(x10⁹/L)', 'platelets', '150-350', 150, 350)}
          </table>
        </div>
      </div>
    </td></tr></table>`;
}

// ── BLOOD CHEMISTRY (generic — adapts to present analytes) ─────────────

interface Analyte { key: string; label: string; unit: string; ref: string; min: number; max: number }

const BLOOD_CHEM_ANALYTES: Analyte[] = [
  { key: 'fbs',        label: 'FBS',                unit: 'mg/dL',  ref: '70.00 - 110.00',  min: 70,   max: 110 },
  { key: 'rbs',        label: 'RBS',                unit: 'mg/dL',  ref: '80.00 - 130.00',  min: 80,   max: 130 },
  { key: 'firstHour',  label: '1st Hour',           unit: 'mg/dL',  ref: '90.00 - 140.00',  min: 90,   max: 140 },
  { key: 'secondHour', label: '2nd Hour',           unit: 'mg/dL',  ref: '80.00 - 120.00',  min: 80,   max: 120 },
  { key: 'cholesterol', label: 'Cholesterol',       unit: 'mg/dL',  ref: '0.00 - 200.00',   min: 0,    max: 200 },
  { key: 'tg',         label: 'Triglyceride',       unit: 'mg/dL',  ref: '60.00 - 150.00',  min: 60,   max: 150 },
  { key: 'hdl',        label: 'HDL-C',              unit: 'mg/dL',  ref: '35.00 - 80.00',   min: 35,   max: 80 },
  { key: 'ldl',        label: 'LDL',                unit: 'mg/dL',  ref: '66.00 - 178.00',  min: 66,   max: 178 },
  { key: 'vldl',       label: 'VLDL',               unit: 'mg/dL',  ref: '0.00 - 30.00',    min: 0,    max: 30 },
  { key: 'uricAcid',   label: 'Uric Acid',          unit: 'mg/dL',  ref: '2.40 - 5.70',    min: 2.4,  max: 5.7 },
  { key: 'creatinine', label: 'Creatinine',          unit: 'mg/dL',  ref: '0.50 - 1.00',    min: 0.5,  max: 1.0 },
  { key: 'urea',       label: 'Urea',               unit: 'mg/dL',  ref: '10.00 - 50.00',   min: 10,   max: 50 },
  { key: 'bun',        label: 'BUN',                unit: 'mg/dL',  ref: '4.67 - 23.36',    min: 4.67, max: 23.36 },
  { key: 'sgpt',       label: 'SGPT (ALT)',         unit: 'U/L',    ref: '0.00 - 32.00',    min: 0,    max: 32 },
  { key: 'sgot',       label: 'SGOT (AST)',         unit: 'U/L',    ref: '0.00 - 31.00',    min: 0,    max: 31 },
  { key: 'sodium',     label: 'Sodium',             unit: 'mmol/L', ref: '136.00 - 148.00',  min: 136,  max: 148 },
  { key: 'potassium',  label: 'Potassium',          unit: 'mmol/L', ref: '3.50 - 5.10',     min: 3.5,  max: 5.1 },
  { key: 'chloride',   label: 'Chloride',           unit: 'mmol/L', ref: '98.00 - 107.00',   min: 98,   max: 107 },
  { key: 'hba1c',      label: 'HbA1c',              unit: '%',      ref: '4.00 - 6.50',     min: 4,    max: 6.5 },
  { key: 'alb',        label: 'ALB',                unit: 'g/L',    ref: '3.00 - 6.00',     min: 3,    max: 6 },
];

function renderBloodChemistry(r: any, title: string): string {
  const present = BLOOD_CHEM_ANALYTES
    .filter(a => r[a.key] != null && String(r[a.key]).trim() !== '')
    .map(a => ({ ...a, value: String(r[a.key]) }));

  const count = present.length;

  function chemRow(a: { label: string; value: string; unit: string; ref: string; min: number; max: number }): string {
    return `<tr><td>${a.label}</td><td class="center" style="font-weight:700">${esc(a.value)}${flagSpan(a.value, a.min, a.max)}</td><td class="center">${a.unit}</td><td class="center" style="white-space:nowrap">${a.ref}</td></tr>`;
  }

  let body: string;
  if (count === 0) {
    body = `<p class="normal-small" style="padding:12px;">No analytes available for this test.</p>`;
  } else if (count <= 6) {
    const fontSize = count <= 3 ? '20px' : '14px';
    body = `<div style="width:100%;display:flex;justify-content:center;">
      <table class="results-frame blood-results" style="width:90%;font-size:${fontSize};">
        <tr><th style="width:50%">TEST</th><th style="width:20%">RESULT</th><th style="width:15%">UNIT</th><th style="width:15%;white-space:nowrap">REFERENCE</th></tr>
        ${present.map(chemRow).join('')}
      </table></div>`;
  } else {
    const mid = Math.ceil(count / 2);
    const left = present.slice(0, mid);
    const right = present.slice(mid);
    const fontSize = count <= 10 ? '13px' : '10px';
    body = `<div style="display:flex;gap:10px;">
      <table class="results-frame blood-results" style="width:50%;font-size:${fontSize};">
        <tr><th style="width:45%">TEST</th><th style="width:20%">RESULT</th><th style="width:15%">UNIT</th><th style="width:20%">REFERENCE</th></tr>
        ${left.map(chemRow).join('')}
      </table>
      <table class="results-frame blood-results" style="width:50%;font-size:${fontSize};">
        <tr><th style="width:45%">TEST</th><th style="width:20%">RESULT</th><th style="width:15%">UNIT</th><th style="width:20%">REFERENCE</th></tr>
        ${right.map(chemRow).join('')}
      </table></div>`;
  }

  return `<div class="section-title">${esc(title)}</div>${body}`;
}

// ── FECALYSIS ──────────────────────────────────────────────────────────

function renderFecalysis(r: any): string {
  function row(label: string, key: string): string {
    return `<tr><td class="test-col" style="padding-left:8px">${label}</td><td class="result-col">${hl(r[key])}</td></tr>`;
  }
  return `
    <div class="section-title">ROUTINE FECALYSIS</div>
    <table class="results-frame">
      <tr><th class="test-col" style="text-align:center"><strong>TEST</strong></th><th class="result-col">RESULT</th></tr>
      ${row('Color', 'color')}
      ${row('Consistency', 'consistency')}
      <tr><td colspan="2" style="padding:4px 8px;border:1px solid #000;font-weight:700;background:#f9f9f9;">MICROSCOPIC EXAMINATION</td></tr>
      ${row('WBC (/hpf)', 'wbc')}
      ${row('RBC (/hpf)', 'rbc')}
      ${row('Fat Globules', 'fatGlobules')}
      ${row('Yeast Cells', 'yeastCells')}
      ${row('Bacteria', 'bacteria')}
      ${row('Muscle Fibers', 'muscleFibers')}
      ${row('Pus Cells', 'pusCells')}
      <tr><td class="test-col" style="padding-left:8px">Ova / Parasite</td><td class="result-col">${hl(r.ovaParasite)}${r.ovaSpecies ? ` <span style="font-style:italic;text-transform:none;font-weight:400">(${esc(r.ovaSpecies)})</span>` : ''}</td></tr>
      ${row('Others', 'others')}
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── FECAL OCCULT BLOOD TEST ────────────────────────────────────────────

function renderFecalOccultBlood(r: any): string {
  return `
    <div class="section-title">FECAL OCCULT BLOOD TEST (FOBT)</div>
    <table class="results-frame" style="width:60%;margin:12px auto;">
      <tr><th class="test-col" style="text-align:center">TEST</th><th class="result-col">RESULT</th></tr>
      <tr><td class="test-col" style="padding-left:8px;font-size:14px">Fecal Occult Blood</td><td class="result-col" style="font-size:16px">${hl(r.fobtResult || r.result)}</td></tr>
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── PREGNANCY TEST ─────────────────────────────────────────────────────

function renderPregnancyTest(r: any): string {
  return `
    <div class="section-title">PREGNANCY TEST</div>
    <table class="results-frame" style="width:60%;margin:12px auto;">
      <tr><th class="test-col" style="text-align:center">TEST</th><th class="result-col">RESULT</th></tr>
      <tr><td class="test-col" style="padding-left:8px;font-size:14px">hCG (Urine)</td><td class="result-col" style="font-size:16px">${hl(r.hcgResult || r.result)}</td></tr>
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── BLOOD TYPING ───────────────────────────────────────────────────────

function renderBloodTyping(r: any): string {
  return `
    <div class="section-title">BLOOD TYPING</div>
    <table class="results-frame" style="width:60%;margin:12px auto;">
      <tr><th class="test-col" style="text-align:center">TEST</th><th class="result-col">RESULT</th></tr>
      <tr><td class="test-col" style="padding-left:8px;font-size:14px">ABO Blood Type</td><td class="result-col" style="font-size:20px;color:#d00;">${hl(r.bloodType || r.aboType || r.result)}</td></tr>
      <tr><td class="test-col" style="padding-left:8px;font-size:14px">Rh Factor</td><td class="result-col" style="font-size:16px">${hl(r.rhFactor || '')}</td></tr>
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── SEROLOGY ───────────────────────────────────────────────────────────

function renderSerology(r: any): string {
  const tests: { label: string; key: string }[] = [
    { label: 'HBsAg', key: 'hbsag' },
    { label: 'Anti-HBs', key: 'antiHbs' },
    { label: 'Anti-HAV (IgM)', key: 'antiHavIgm' },
    { label: 'Anti-HCV', key: 'antiHcv' },
    { label: 'VDRL/RPR', key: 'vdrl' },
    { label: 'HIV Screening', key: 'hiv' },
    { label: 'Typhidot IgM', key: 'typhidotIgm' },
    { label: 'Typhidot IgG', key: 'typhidotIgg' },
    { label: 'ASO (Titer)', key: 'aso' },
    { label: 'RF Latex', key: 'rfLatex' },
    { label: 'CRP', key: 'crp' },
  ];
  const present = tests.filter(t => r[t.key] != null && String(r[t.key]).trim() !== '');

  if (present.length === 0) {
    // Fallback: show all result keys
    return renderGenericBody(r, 'SEROLOGY');
  }

  return `
    <div class="section-title">SEROLOGY</div>
    <table class="results-frame" style="width:80%;margin:6px auto;">
      <tr><th class="test-col" style="text-align:center">TEST</th><th class="result-col">RESULT</th></tr>
      ${present.map(t => `<tr><td class="test-col" style="padding-left:8px">${t.label}</td><td class="result-col">${hl(r[t.key])}</td></tr>`).join('')}
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── X-RAY ──────────────────────────────────────────────────────────────

function renderXray(r: any): string {
  return `
    <div class="section-title">X-RAY REPORT</div>
    <table class="results-frame" style="margin-top:8px;">
      ${r.type ? `<tr><td style="padding:6px;font-weight:700;width:30%;border:1px solid #000">Type / View:</td><td style="padding:6px;border:1px solid #000">${esc(r.type)}</td></tr>` : ''}
      <tr><td style="padding:6px;font-weight:700;width:30%;border:1px solid #000">Findings:</td><td style="padding:12px;border:1px solid #000;white-space:pre-wrap;line-height:1.6;font-size:13px">${esc(r.findings || r.result || '')}</td></tr>
      ${r.impression ? `<tr><td style="padding:6px;font-weight:700;border:1px solid #000">Impression:</td><td style="padding:12px;border:1px solid #000;white-space:pre-wrap;line-height:1.6;font-size:13px">${esc(r.impression)}</td></tr>` : ''}
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── ESR ────────────────────────────────────────────────────────────────

function renderEsr(r: any): string {
  return `
    <div class="section-title">ERYTHROCYTE SEDIMENTATION RATE (ESR)</div>
    <table class="results-frame" style="width:70%;margin:12px auto;">
      <tr><th style="text-align:center;padding:6px;border:1px solid #000;width:40%">TEST</th><th style="text-align:center;padding:6px;border:1px solid #000;width:30%">RESULT</th><th style="text-align:center;padding:6px;border:1px solid #000;width:30%">REFERENCE</th></tr>
      <tr><td style="padding:8px;text-align:left">ESR (Westergren)</td><td class="center" style="font-weight:700;font-size:16px">${esc(r.esr || r.result || '')} mm/hr</td><td class="center normal-small">Male: 0-15 mm/hr<br>Female: 0-20 mm/hr</td></tr>
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── DENGUE DUO ─────────────────────────────────────────────────────────

function renderDengueDuo(r: any): string {
  return `
    <div class="section-title">DENGUE DUO (NS1 Ag / IgG / IgM)</div>
    <table class="results-frame" style="width:70%;margin:12px auto;">
      <tr><th class="test-col" style="text-align:center">TEST</th><th class="result-col">RESULT</th></tr>
      <tr><td class="test-col" style="padding-left:8px">NS1 Antigen</td><td class="result-col">${hl(r.ns1)}</td></tr>
      <tr><td class="test-col" style="padding-left:8px">IgG</td><td class="result-col">${hl(r.igg)}</td></tr>
      <tr><td class="test-col" style="padding-left:8px">IgM</td><td class="result-col">${hl(r.igm)}</td></tr>
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── CT & BT ────────────────────────────────────────────────────────────

function renderCtBt(r: any): string {
  return `
    <div class="section-title">CLOTTING TIME &amp; BLEEDING TIME</div>
    <table class="results-frame" style="width:70%;margin:12px auto;">
      <tr><th style="text-align:center;padding:6px;border:1px solid #000;width:40%">TEST</th><th style="text-align:center;padding:6px;border:1px solid #000;width:30%">RESULT</th><th style="text-align:center;padding:6px;border:1px solid #000;width:30%">REFERENCE</th></tr>
      <tr><td style="padding:8px">Clotting Time (CT)</td><td class="center" style="font-weight:700">${esc(r.ct || r.clottingTime || '')}</td><td class="center normal-small">3 - 6 min</td></tr>
      <tr><td style="padding:8px">Bleeding Time (BT)</td><td class="center" style="font-weight:700">${esc(r.bt || r.bleedingTime || '')}</td><td class="center normal-small">1 - 3 min</td></tr>
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── THYROID PANEL ──────────────────────────────────────────────────────

function renderThyroidPanel(r: any): string {
  const tests = [
    { label: 'TSH', key: 'tsh', unit: 'mIU/L', ref: '0.35 - 5.50' },
    { label: 'Free T3', key: 'freeT3', unit: 'pg/mL', ref: '2.30 - 4.20' },
    { label: 'Free T4', key: 'freeT4', unit: 'ng/dL', ref: '0.89 - 1.76' },
    { label: 'T3', key: 't3', unit: 'ng/dL', ref: '60.00 - 181.00' },
    { label: 'T4', key: 't4', unit: 'µg/dL', ref: '4.50 - 10.90' },
  ];
  const present = tests.filter(t => r[t.key] != null && String(r[t.key]).trim() !== '');
  return `
    <div class="section-title">THYROID FUNCTION TEST</div>
    <table class="results-frame" style="width:80%;margin:6px auto;">
      <tr><th style="width:35%;padding:6px;border:1px solid #000;">TEST</th><th style="width:20%;text-align:center;padding:6px;border:1px solid #000;">RESULT</th><th style="width:20%;text-align:center;padding:6px;border:1px solid #000;">UNIT</th><th style="width:25%;text-align:center;padding:6px;border:1px solid #000;">REFERENCE</th></tr>
      ${present.map(t => `<tr><td style="padding:6px">${t.label}</td><td class="center" style="font-weight:700">${esc(r[t.key])}</td><td class="center">${t.unit}</td><td class="center normal-small">${t.ref}</td></tr>`).join('')}
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── DRUG TEST ──────────────────────────────────────────────────────────

function renderDrugTest(r: any): string {
  const tests = [
    { label: 'Methamphetamine (Shabu)', key: 'methamphetamine' },
    { label: 'Tetrahydrocannabinol (Marijuana)', key: 'thc' },
    { label: 'Cocaine', key: 'cocaine' },
    { label: 'Morphine/Opiate', key: 'morphine' },
    { label: 'Benzodiazepine', key: 'benzodiazepine' },
    { label: 'Ecstasy (MDMA)', key: 'ecstasy' },
  ];
  const present = tests.filter(t => r[t.key] != null && String(r[t.key]).trim() !== '');
  return `
    <div class="section-title">DRUG TEST SCREENING</div>
    <table class="results-frame" style="width:80%;margin:6px auto;">
      <tr><th class="test-col" style="text-align:center">SUBSTANCE</th><th class="result-col">RESULT</th></tr>
      ${present.map(t => `<tr><td class="test-col" style="padding-left:8px">${t.label}</td><td class="result-col">${hl(r[t.key])}</td></tr>`).join('')}
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ── GENERIC FALLBACK ───────────────────────────────────────────────────

const META_KEYS = new Set([
  'performedByName', 'performedByLicense',
  'validatedByName', 'validatedByLicense',
  'requestedByName', 'requestedByLicense',
  'entryDate', 'timeRequested', 'timeReleased',
  'mtName', 'mtLicense', 'pathName', 'pathLicense',
  'signatures', 'note',
]);

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

function renderGenericBody(r: any, title: string): string {
  const keys = Object.keys(r).filter(k => !META_KEYS.has(k) && r[k] != null && String(r[k]).trim() !== '');
  if (keys.length === 0) {
    return `<div class="section-title">${esc(title)}</div><p class="normal-small" style="padding:12px">No results recorded.</p>`;
  }
  return `
    <div class="section-title">${esc(title)}</div>
    <table class="results-frame" style="width:90%;margin:6px auto;">
      <tr><th style="width:50%;text-align:left;padding:6px;border:1px solid #000">TEST</th><th style="width:50%;text-align:center;padding:6px;border:1px solid #000">RESULT</th></tr>
      ${keys.map(k => `<tr><td style="padding:6px 8px">${formatLabel(k)}</td><td class="center" style="font-weight:700">${hl(r[k])}</td></tr>`).join('')}
    </table>
    ${r.note ? `<div class="note"><strong>NOTE:</strong> <span class="note-text">${esc(r.note)}</span></div>` : ''}`;
}

// ═══════════════════════════════════════════════════════════════════════
//  DISPATCH
// ═══════════════════════════════════════════════════════════════════════

function renderBody(template: string, results: any, sex: string, testType: string): string {
  const r = results || {};
  switch (template) {
    case 'urinalysis':                    return renderUrinalysis(r);
    case 'hematology':                    return renderHematology(r, sex);
    case 'blood-chemistry':               return renderBloodChemistry(r, 'BLOOD CHEMISTRY');
    case 'blood-chemistry-lipid-profile': return renderBloodChemistry(r, 'BLOOD CHEMISTRY — LIPID PROFILE');
    case 'blood-chemistry-albumin':       return renderBloodChemistry(r, 'BLOOD CHEMISTRY — ALBUMIN');
    case 'blood-chemistry-sgpt-sgot':     return renderBloodChemistry(r, 'BLOOD CHEMISTRY — SGPT/SGOT');
    case 'blood-chemistry-electrolytes':  return renderBloodChemistry(r, 'BLOOD CHEMISTRY — ELECTROLYTES');
    case 'blood-chemistry-bun-crea':      return renderBloodChemistry(r, 'BLOOD CHEMISTRY — BUN/CREATININE');
    case 'blood-chemistry-blood-sugar':   return renderBloodChemistry(r, 'BLOOD CHEMISTRY — BLOOD SUGAR');
    case 'blood-chemistry-hba1c':         return renderBloodChemistry(r, 'BLOOD CHEMISTRY — HbA1c');
    case 'fecalysis':                     return renderFecalysis(r);
    case 'fecal-occult-blood':            return renderFecalOccultBlood(r);
    case 'pregnancy-test':                return renderPregnancyTest(r);
    case 'blood-typing':                  return renderBloodTyping(r);
    case 'serology':                      return renderSerology(r);
    case 'xray':                          return renderXray(r);
    case 'esr':                           return renderEsr(r);
    case 'dengue-duo':                    return renderDengueDuo(r);
    case 'ct-bt':                         return renderCtBt(r);
    case 'thyroid-panel':                 return renderThyroidPanel(r);
    case 'drugtest':                      return renderDrugTest(r);
    default:                              return renderGenericBody(r, (testType || template || 'LABORATORY TEST').toUpperCase());
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════

export function renderReportHtml(
  test: TestRow,
  patient: PatientRow,
  baseUrl: string,
  options?: { print?: boolean }
): string {
  const results = typeof test.results === 'string' ? JSON.parse(test.results) : (test.results || {});
  const template = getResultTemplate({ test_type: test.test_type, template: test.template });
  const sex = patient.gender || '';

  const header = renderHeader(test, patient, baseUrl);
  const body = renderBody(template, results, sex, test.test_type || '');
  const sigs = renderSignatures(results, baseUrl);
  const watermark = renderWatermark(baseUrl);

  const page = `
<div class="report-page">
  <div class="report-container">
    ${header}
    ${body}
    ${sigs}
  </div>
  ${watermark}
</div>`;

  return wrapDocument(page, options?.print);
}
