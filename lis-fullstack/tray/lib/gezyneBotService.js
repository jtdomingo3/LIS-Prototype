const https = require('https');
const { decryptSecret } = require('./cryptoHelper');

/**
 * GezyneBot AI Service
 * Powered by OpenRouter with AES-256-GCM encrypted API key at rest.
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o-mini';

// Supported model options for user selection
const AVAILABLE_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Fast & Accurate - Recommended)' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (Very Fast)' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct' }
];

const fs = require('fs');
const path = require('path');

/**
 * Resolve OpenRouter API key from:
 * 1. Environment variables (OPENROUTER_ENCRYPTED_KEY / OPENROUTER_API_KEY)
 * 2. SQLite Database settings table (encrypted at rest)
 * 3. Persistent .env file in DATA_DIR or next to executable
 */
function resolveApiKey() {
  // 1. Check environment variables
  if (process.env.OPENROUTER_ENCRYPTED_KEY) {
    const decrypted = decryptSecret(process.env.OPENROUTER_ENCRYPTED_KEY);
    if (decrypted && decrypted.startsWith('sk-or-')) {
      process.env.OPENROUTER_API_KEY = decrypted;
      return decrypted;
    }
  }
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.startsWith('sk-or-')) {
    return process.env.OPENROUTER_API_KEY;
  }

  // 2. Check persistent SQLite database settings
  try {
    if (global.db && typeof global.db.getSettings === 'function') {
      const s = global.db.getSettings() || {};
      if (s.openrouterApiKeyEncrypted) {
        const decrypted = decryptSecret(s.openrouterApiKeyEncrypted);
        if (decrypted && decrypted.startsWith('sk-or-')) {
          process.env.OPENROUTER_API_KEY = decrypted;
          return decrypted;
        }
      }
      if (s.openrouterApiKey && s.openrouterApiKey.startsWith('sk-or-')) {
        process.env.OPENROUTER_API_KEY = s.openrouterApiKey;
        return s.openrouterApiKey;
      }
    }
  } catch (e) {
    console.warn('[GezyneBot] Failed reading key from database settings:', e.message);
  }

  // 3. Check persistent .env locations (DATA_DIR or next to executable)
  try {
    const candidates = [];
    if (process.env.DATA_DIR) {
      candidates.push(path.join(process.env.DATA_DIR, '.env'));
    }
    const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
    candidates.push(path.join(programDataBase, 'GezyneLIS', '.env'));
    if (process.execPath) {
      candidates.push(path.join(path.dirname(process.execPath), '.env'));
    }

    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const mEnc = content.match(/OPENROUTER_ENCRYPTED_KEY\s*=\s*["']?([^"'\r\n]+)/);
        if (mEnc && mEnc[1]) {
          const dec = decryptSecret(mEnc[1].trim());
          if (dec && dec.startsWith('sk-or-')) {
            process.env.OPENROUTER_API_KEY = dec;
            return dec;
          }
        }
        const mPlain = content.match(/OPENROUTER_API_KEY\s*=\s*["']?(sk-or-[^"'\r\n]+)/);
        if (mPlain && mPlain[1]) {
          process.env.OPENROUTER_API_KEY = mPlain[1].trim();
          return mPlain[1].trim();
        }
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Test OpenRouter API connection with a given key or currently resolved key
 */
async function testOpenRouterConnection(keyToTest, model = DEFAULT_MODEL) {
  const key = keyToTest || resolveApiKey();
  if (!key) {
    return { success: false, error: 'No OpenRouter API key provided or configured.' };
  }

  try {
    const postData = JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: [
        { role: 'user', content: 'Respond with exactly: OK' }
      ],
      max_tokens: 10
    });

    const parsedUrl = new URL(OPENROUTER_API_URL);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://gezyne.com',
        'X-Title': 'Gezyne Clinical Laboratory LIS',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, message: 'Connection successful! OpenRouter responded.' });
          } else {
            let errMsg = `OpenRouter HTTP ${res.statusCode}`;
            try {
              const errObj = JSON.parse(rawData);
              if (errObj.error && errObj.error.message) errMsg = errObj.error.message;
            } catch (_) {}
            resolve({ success: false, error: errMsg });
          }
        });
      });

      req.on('error', err => resolve({ success: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Connection timed out (10s).' }); });
      req.write(postData);
      req.end();
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * System Knowledge Context for Gezyne Clinical Laboratory & Information System
 */
function buildKnowledgeContext() {
  return `
=== GEZYNE CLINICAL LABORATORY INFORMATION SYSTEM (LIS) KNOWLEDGE BASE ===

You are "GezyneBot", the resident Clinical Laboratory and LIS Expert Assistant for Gezyne Clinical Laboratory.
Your role is to assist laboratory staff, medical technologists, receptionists, encoders, and doctors with both:
1. Navigating and operating the Gezyne LIS software smoothly.
2. Answering clinical laboratory, phlebotomy, diagnostic testing, and medical reference questions accurately.

--- LIS SOFTWARE WORKFLOW & OPERATION GUIDE ---
1. RECEPTION & QUEUEING (/reception):
   - Workflow starts at Reception where patient demographics, PhilHealth consent, and requested tests are entered.
   - Patients receive automated codes (e.g. GCL-YYYY-MM-00000).
   - Area routing stations: Payment Area -> Extraction Area -> Special areas (Drug Test, Ultrasound, 2D Echo, X-ray, ECG, Doctor's Check-up) -> Releasing of Result.
   - The queue updates live across the LAN via Server-Sent Events (/reception/stream).
   - Waiting room TV screens run full-screen at /kiosk (or /reception/assigned?kiosk=1) with automated chime and spoken voice announcements (Google TTS).
   - "Stashed" status is used when a patient is temporarily unavailable (e.g. stepped out) without losing their spot.

2. SPECIMEN COLLECTION & TRACKING:
   - Specimen codes can be assigned per department (e.g., CBC-001, U-001).
   - Barcodes are printed with thermal or standard printers for tubes and sample containers.

3. TEST WORKSHEETS & RESULTS ENTRY (/tests):
   - Departments: Hematology (CBC, Differential, ESR, Blood Typing), Clinical Chemistry, Urinalysis, Fecalysis, Serology / Immunology, Thyroid, Coagulation (PT / APTT), Imaging (X-Ray, Ultrasound, 2D Echo, ECG).
   - Analyzer Direct Import: In clinical chemistry, clicking "Import from Analyzer" parses the MS Access database (Analyser.MDB) from the chemistry machine and auto-fills FBS, BUN, Creatinine, Lipid profile, AST/SGOT, ALT/SGPT, etc.
   - Result Guard / Lock: Once a test is set to "Completed" or "Released", the system locks the test so it cannot be accidentally reverted to a pending state.

4. DIAGNOSTIC REPORTS & PRINTING (/reports):
   - Automatically renders high-resolution clinical reports using Puppeteer-core and the host's Microsoft Edge Chromium browser.
   - PDFs are saved to ~/Documents/LIS/reports/Lab_Report_<testId>.pdf for instant download.
   - Out-of-range abnormal results are automatically flagged and highlighted.

5. SIGNATURES & MULTI-CLIENT SYNC (/signatures):
   - Medical Technologists and Pathologists upload digital signatures under /signatures.
   - Digital signatures are stamped directly onto reports.
   - Remote/standalone workstations synchronize signatures with the main server via /api/signatures/sync.

6. AUTOMATED SYSTEM BACKUPS:
   - The server performs automated daily backups at 3:00 PM with SQLite WAL checkpointing into ~/Documents/LIS/backup/.
   - Generates both binary .db snapshots and JSON files with rolling 30-day retention.

--- CLINICAL LABORATORY & MEDICAL REFERENCE GUIDE ---
1. PHLEBOTOMY ORDER OF DRAW (CLSI Guidelines):
   1st: Blood Culture bottles (SPS) or sterile tubes (prevent contamination).
   2nd: Sodium Citrate (Light Blue top, 3.2% ratio 1:9) - Coagulation tests (PT, INR, APTT). Must be filled to the line!
   3rd: Serum Tubes (Red top plain glass/plastic, Gold/Tiger top SST with clot activator & gel separator) - Chemistry, Serology, Immunology, Thyroid.
   4th: Heparin (Green top, Lithium or Sodium Heparin) - Stat Chemistry, Troponin, Electrolytes.
   5th: EDTA (Lavender / Purple top, K2 or K3 EDTA) - Hematology, CBC, Platelet count, Peripheral Blood Smear, Blood Typing, HbA1c. Mix gently 8-10 times to prevent microclots!
   6th: Sodium Fluoride / Potassium Oxalate (Gray top) - Glucose, Lactic Acid (inhibits glycolysis).

2. PATIENT PREPARATION & FASTING:
   - Fasting Blood Sugar (FBS): 8 to 10 hours overnight fasting. Water is permitted; no coffee, smoking, or gum.
   - Lipid Profile (Total Cholesterol, Triglycerides, HDL, LDL): 10 to 12 hours fasting. Avoid heavy alcohol intake 24h prior.
   - Uric Acid / Creatinine / BUN: 8 hours fasting recommended. Avoid strenuous exercise before creatinine test.
   - Oral Glucose Tolerance Test (OGTT): Fasting sample first, followed by 75g glucose drink, with timed blood draws at 1 hour and 2 hours.

3. COMMON NORMAL REFERENCE RANGES (Adult Guidelines):
   - Fasting Blood Sugar: 70 - 99 mg/dL (Normal); 100 - 125 mg/dL (Impaired/Prediabetes); >= 126 mg/dL (Diabetes indicator).
   - HbA1c: < 5.7% (Normal); 5.7 - 6.4% (Prediabetes); >= 6.5% (Diabetes).
   - Serum Creatinine: Male: 0.7 - 1.3 mg/dL | Female: 0.6 - 1.1 mg/dL.
   - Blood Urea Nitrogen (BUN): 7 - 20 mg/dL.
   - Serum Uric Acid: Male: 3.5 - 7.2 mg/dL | Female: 2.6 - 6.0 mg/dL.
   - Total Cholesterol: < 200 mg/dL (Desirable).
   - Triglycerides: < 150 mg/dL (Normal).
   - HDL Cholesterol: > 40 mg/dL (Male) | > 50 mg/dL (Female).
   - LDL Cholesterol: < 100 mg/dL (Optimal).
   - AST (SGOT): 10 - 40 U/L | ALT (SGPT): 7 - 56 U/L.
   - Hemoglobin (Hb): Male: 13.5 - 17.5 g/dL | Female: 12.0 - 15.5 g/dL.
   - Hematocrit (Hct): Male: 41% - 50% | Female: 36% - 46%.
   - White Blood Cells (WBC): 4,500 - 11,000 /uL.
   - Platelets: 150,000 - 450,000 /uL.

4. CRITICAL / PANIC VALUES (Immediate Physician Notification Required!):
   - Glucose: < 45 mg/dL (Severe Hypoglycemia) or > 400 mg/dL (Severe Hyperglycemia / DKA).
   - Potassium (K+): < 2.8 mmol/L (Severe Hypokalemia) or > 6.0 mmol/L (Severe Hyperkalemia - Life-threatening cardiac arrest risk).
   - Sodium (Na+): < 120 mmol/L or > 160 mmol/L.
   - Platelet Count: < 20,000 /uL (Spontaneous bleeding risk) or > 1,000,000 /uL.
   - Hemoglobin: < 7.0 g/dL (Severe anemia requiring transfusion evaluation).
   - PT / INR: INR > 4.5 (High hemorrhage risk).
   *PROTOCOL*: When a panic value is encountered, the MedTech must recheck/retest, immediately verify sample integrity (check for clot, hemolysis, or lipemia), and contact the attending physician/pathologist immediately.

--- COMMUNICATION STYLE & GUIDELINES ---
- Provide helpful, friendly, medically accurate, and concise answers.
- Format responses with clean Markdown (bold keywords, bullet points, and brief tables where useful).
- When a user asks about software features, give clear step-by-step instructions.
- When answering medical questions, provide clear explanations with normal ranges or clinical rationale, and advise clinical correlation.
`;
}

/**
 * Call OpenRouter API with user prompt and conversation history
 */
async function queryOpenRouter({ question, history = [], user = null, model = DEFAULT_MODEL }) {
  const apiKey = resolveApiKey();

  if (!apiKey) {
    return {
      success: false,
      error: 'OpenRouter API key is missing or invalid. Please check your .env configuration.',
      answer: 'Hello! I am **GezyneBot**, your LIS and clinical laboratory assistant. However, my OpenRouter API key has not been configured yet. Please ensure the server administrator configures `OPENROUTER_ENCRYPTED_KEY` in the server environment.'
    };
  }

  // Format messages
  const messages = [];

  // 1. System Prompt with Knowledge Base & Active User Context
  const userContext = user
    ? `\nCurrent logged-in staff member: ${user.name || user.email} (Role: ${user.role || 'Staff'})`
    : '';

  messages.push({
    role: 'system',
    content: buildKnowledgeContext() + userContext
  });

  // 2. Add recent conversation history (max 8 messages for token efficiency)
  if (Array.isArray(history) && history.length > 0) {
    const recent = history.slice(-8);
    for (const msg of recent) {
      if (msg && msg.role && msg.content) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: String(msg.content).trim()
        });
      }
    }
  }

  // 3. User's active question
  messages.push({
    role: 'user',
    content: String(question).trim()
  });

  const payload = JSON.stringify({
    model: model || DEFAULT_MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 1200
  });

  return new Promise((resolve) => {
    const parsedUrl = new URL(OPENROUTER_API_URL);
    const req = https.request(
      {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://gezyne-clinical-lab.local',
          'X-Title': 'Gezyne LIS Assistant'
        },
        timeout: 45000
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => {
          rawData += chunk;
        });

        res.on('end', () => {
          try {
            const data = JSON.parse(rawData);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const choice = data.choices && data.choices[0];
              const answer = choice && choice.message && choice.message.content
                ? choice.message.content.trim()
                : 'I processed your question, but no response text was returned.';
              
              resolve({
                success: true,
                answer,
                model: data.model || model,
                usage: data.usage || null
              });
            } else {
              const errMsg = data && data.error && (data.error.message || data.error)
                ? String(data.error.message || data.error)
                : `OpenRouter API error (HTTP ${res.statusCode})`;
              console.error('[GezyneBot] OpenRouter returned error:', errMsg);
              resolve({
                success: false,
                error: errMsg,
                answer: `I encountered an issue connecting to the AI model (${errMsg}). Please try again in a moment.`
              });
            }
          } catch (parseErr) {
            console.error('[GezyneBot] Failed to parse OpenRouter response:', parseErr.message, rawData);
            resolve({
              success: false,
              error: 'Invalid response from OpenRouter',
              answer: 'I received an unparseable response from the AI provider. Please try again.'
            });
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('[GezyneBot] Network error:', err.message);
      resolve({
        success: false,
        error: err.message,
        answer: 'I could not connect to OpenRouter due to a network connection error. Please verify your internet connection.'
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        success: false,
        error: 'Request timed out',
        answer: 'The request to the AI model timed out after 45 seconds. Please try again with a shorter question.'
      });
    });

    req.write(payload);
    req.end();
  });
}

module.exports = {
  AVAILABLE_MODELS,
  DEFAULT_MODEL,
  queryOpenRouter,
  resolveApiKey,
  testOpenRouterConnection
};
