const https = require('https');
const { decryptSecret } = require('./cryptoHelper');
const ragClient = require('./ragClient');

/**
 * GezyneBot AI Service
 * Powered by OpenRouter with AES-256-GCM encrypted API key at rest.
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o-mini';

// Default reliable model options
const DEFAULT_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Fast & Accurate - Recommended)' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct' }
];

let cachedFreeModels = [];
let lastFetchTimestamp = 0;

function loadCachedFreeModelsFromDb() {
  try {
    if (global.db && typeof global.db.getSettings === 'function') {
      const s = global.db.getSettings() || {};
      if (Array.isArray(s.openrouterFreeModels) && s.openrouterFreeModels.length > 0) {
        cachedFreeModels = s.openrouterFreeModels;
        lastFetchTimestamp = s.openrouterLastModelFetch || 0;
      }
    }
  } catch (_) {}
}

const AVAILABLE_MODELS = new Proxy(DEFAULT_MODELS, {
  get(target, prop) {
    if (cachedFreeModels.length === 0) {
      loadCachedFreeModelsFromDb();
    }
    const combined = [...DEFAULT_MODELS, ...cachedFreeModels];
    if (prop === 'length') return combined.length;
    if (typeof prop === 'string' && !isNaN(prop)) return combined[prop];
    if (typeof combined[prop] === 'function') return combined[prop].bind(combined);
    return combined[prop];
  }
});

const fs = require('fs');
const path = require('path');
const os = require('os');

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
    const documentsLisDir = path.join(os.homedir(), 'Documents', 'LIS', 'data');
    candidates.push(path.join(documentsLisDir, '.env'));
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

let cachedManualContent = null;
let lastManualMtime = 0;

function resolveManualPath() {
  const candidates = [
    path.join(__dirname, '..', 'docs', 'USER_MANUAL.md'),
    path.join(process.cwd(), 'docs', 'USER_MANUAL.md'),
    path.join(process.cwd(), '..', 'docs', 'USER_MANUAL.md'),
    path.join(__dirname, '..', '..', 'docs', 'USER_MANUAL.md'),
  ];
  if (process.env.DATA_DIR) {
    candidates.unshift(path.join(process.env.DATA_DIR, 'USER_MANUAL.md'));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadUserManualContent() {
  try {
    const manualPath = resolveManualPath();
    if (!manualPath) return null;
    const stat = fs.statSync(manualPath);
    if (!cachedManualContent || stat.mtimeMs !== lastManualMtime) {
      cachedManualContent = fs.readFileSync(manualPath, 'utf8');
      lastManualMtime = stat.mtimeMs;
      console.log(`[GezyneBot] Loaded knowledge manual from: ${manualPath} (${cachedManualContent.length} bytes)`);
    }
    return cachedManualContent;
  } catch (err) {
    console.warn('[GezyneBot] Failed to read knowledge manual:', err.message);
    return cachedManualContent || null;
  }
}

/**
 * System Knowledge Context for Gezyne Clinical Laboratory & Information System
 * Dynamically populated from docs/USER_MANUAL.md
 */
function buildKnowledgeContext() {
  const manual = loadUserManualContent();

  const header = `=== GEZYNE CLINICAL LABORATORY INFORMATION SYSTEM (LIS) KNOWLEDGE BASE ===

You are "GezyneBot", the resident Clinical Laboratory, Quality Assurance, and LIS Expert Assistant for Gezyne Clinical Laboratory (LIS Version 2.6.3).
Your role is to assist laboratory staff, medical technologists, receptionists, encoders, quality managers, and doctors with both:
1. Navigating and operating the Gezyne LIS software smoothly across all modules (including Reception, Test Worksheets, Analyzer Capture, Reports, Signatures, Reagent Inventory, Equipment & Levey-Jennings QC, NEQAS Proficiency Testing, Clinical Consultations, Human Resources (HR) & Payroll, Financial Costing & Profitability, and User Permissions).
2. Answering clinical laboratory, phlebotomy, diagnostic testing, quality control, Westgard rules, NEQAS/EQA evaluation, outpatient consultation, Philippine statutory contributions (SSS, PhilHealth, Pag-IBIG, BIR tax), diagnostic cost-per-test economics, and medical reference questions accurately.

--- OFFICIAL SYSTEM USER MANUAL & REFERENCE GUIDE ---
`;

  const footer = `
--- COMMUNICATION STYLE & GUIDELINES ---
- Provide helpful, friendly, medically accurate, and concise answers.
- Format responses with clean Markdown (bold keywords, bullet points, and brief tables where useful).
- When writing mathematical, laboratory, or clinical calculation formulas (such as SDI, Levey-Jennings Mean/SD, BMI, LDL Friedewald, eGFR, Creatinine Clearance, or statutory payroll formulas), ALWAYS format them using standard LaTeX delimiters: use '$$...$$' for display/block equations and '$...$' or '\\(...\\)' for inline equations so they render beautifully with KaTeX.
- When a user asks about software features (e.g., Equipment & QC, Levey-Jennings, Westgard rules, NEQAS, Inventory, Reception), give clear step-by-step instructions with the exact buttons to click and workflows to follow (as documented in the User Manual).
- When answering medical or quality control questions, provide clear explanations with normal ranges, formulas, or clinical rationale, and advise clinical correlation.
`;

  if (manual) {
    return header + manual + footer;
  }

  // Graceful fallback if manual file is not found
  return header + `
[System Note: User manual file was not found on disk. Operating on baseline knowledge.]
- Core Modules: Reception (/reception), Tests (/tests), Reports (/reports), Signatures (/signatures), Equipment & QC (/equipment), Inventory (/inventory), Consultations (/consultations), HR & Payroll (/hr), Costing & P&L (/costing), Settings (/settings).
- Supported platforms: Full-Stack Web/LAN, Standalone Desktop Client (with offline 2-way sync), and Android Mobile companion app.
` + footer;
}

/**
 * System Knowledge Context dynamically constructed from ChromaDB vector search
 */
function buildRagKnowledgeContext(retrievedText) {
  const header = `=== GEZYNE CLINICAL LABORATORY INFORMATION SYSTEM (LIS) KNOWLEDGE BASE ===

You are "GezyneBot", the resident Clinical Laboratory, Quality Assurance, and LIS Expert Assistant for Gezyne Clinical Laboratory (LIS Version 2.6.3).
Your role is to assist laboratory staff, medical technologists, receptionists, encoders, quality managers, and doctors with navigating the software, answering clinical laboratory procedures, and quality assurance.

--- RELEVANT KNOWLEDGE BASE SECTIONS (RETRIEVED VIA CHROMADB VECTOR SEARCH) ---
${retrievedText}
`;

  const footer = `
--- COMMUNICATION STYLE & GUIDELINES ---
- Provide helpful, friendly, medically accurate, and concise answers.
- Format responses with clean Markdown (bold keywords, bullet points, and brief tables where useful).
- When writing mathematical, laboratory, or clinical calculation formulas (such as SDI, Levey-Jennings Mean/SD, BMI, LDL Friedewald, eGFR, Creatinine Clearance, or statutory payroll formulas), ALWAYS format them using standard LaTeX delimiters: use '$$...$$' for display/block equations and '$...$' or '\\(...\\)' for inline equations so they render beautifully with KaTeX.
- When a user asks about software features (e.g., Equipment & QC, Levey-Jennings, Westgard rules, NEQAS, Inventory, Reception), give clear step-by-step instructions with the exact buttons to click and workflows to follow (as documented in the User Manual).
- When answering medical or quality control questions, provide clear explanations with normal ranges, formulas, or clinical rationale, and advise clinical correlation.
`;

  return header + footer;
}

/**
 * Call OpenRouter API with user prompt and conversation history
 */
async function queryOpenRouter({ question, history = [], user = null, model = DEFAULT_MODEL, webSearch = false }) {
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

  // 1. System Prompt with RAG or Fallback Knowledge Base & Active User Context
  const userContext = user
    ? `\nCurrent logged-in staff member: ${user.name || user.email} (Role: ${user.role || 'Staff'})`
    : '';

  let knowledgeContext = null;
  let ragUsed = false;
  let ragChunks = 0;
  let webSearchUsed = false;
  let webSources = [];
  try {
    const ragResult = await ragClient.queryRag({ question, topK: 4, enableWeb: !!webSearch });
    if (ragResult && ragResult.success && ragResult.combinedContext) {
      knowledgeContext = buildRagKnowledgeContext(ragResult.combinedContext);
      ragUsed = true;
      ragChunks = (ragResult.results && ragResult.results.length) || 0;
      if (ragResult.webResults && ragResult.webResults.length > 0) {
        webSearchUsed = true;
        webSources = ragResult.webResults;
        console.log(`[GezyneBot] Augmented prompt with ${ragChunks} RAG chunks + ${webSources.length} web search snippets`);
      } else {
        console.log(`[GezyneBot] Augmented prompt with ${ragChunks} RAG chunks from ChromaDB`);
      }
    }
  } catch (ragErr) {
    // Non-blocking fallback
  }

  if (!knowledgeContext) {
    knowledgeContext = buildKnowledgeContext();
  }

  messages.push({
    role: 'system',
    content: knowledgeContext + userContext
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
                usage: data.usage || null,
                ragUsed,
                ragChunks,
                webSearchUsed,
                webSources
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

/**
 * Fetch latest free models from OpenRouter API
 */
async function fetchFreeOpenRouterModels(forceRefresh = false) {
  const THIRTY_MINUTES = 30 * 60 * 1000;
  if (!forceRefresh && cachedFreeModels.length > 0 && (Date.now() - lastFetchTimestamp < THIRTY_MINUTES)) {
    return cachedFreeModels;
  }

  return new Promise((resolve) => {
    const apiKey = resolveApiKey();
    const headers = {
      'User-Agent': 'Gezyne-LIS-Bot/2.6.3'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const req = https.get('https://openrouter.ai/api/v1/models', {
      headers,
      timeout: 12000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            console.warn('[GezyneBot] OpenRouter returned status ' + res.statusCode + ' while fetching models');
            if (cachedFreeModels.length === 0) loadCachedFreeModelsFromDb();
            return resolve(cachedFreeModels);
          }
          const parsed = JSON.parse(body);
          const rawModels = parsed.data || [];

          const freeList = rawModels.filter(m => {
            if (!m || !m.id) return false;
            const p = m.pricing;
            const isZeroPrice = p && (parseFloat(p.prompt) === 0 && parseFloat(p.completion) === 0);
            const hasFreeTag = m.id.endsWith(':free') || m.id === 'openrouter/free';
            const isExcluded = m.id.includes('lyria') || m.id.includes('diffusion') || m.id.includes('flux');
            return (isZeroPrice || hasFreeTag) && !isExcluded;
          }).map(m => {
            let label = m.name || m.id;
            if (!label.toLowerCase().includes('free') && m.id !== 'openrouter/free') {
              label = `${label} (Free)`;
            }
            return {
              id: m.id,
              name: label,
              isFree: true,
              context_length: m.context_length || null
            };
          });

          // Sort: openrouter/free first, then alphabetically
          freeList.sort((a, b) => {
            if (a.id === 'openrouter/free') return -1;
            if (b.id === 'openrouter/free') return 1;
            return a.name.localeCompare(b.name);
          });

          cachedFreeModels = freeList;
          lastFetchTimestamp = Date.now();

          // Persist to database settings
          try {
            if (global.db && typeof global.db.getSettings === 'function' && typeof global.db.saveSettings === 'function') {
              const currentSettings = global.db.getSettings() || {};
              currentSettings.openrouterFreeModels = cachedFreeModels;
              currentSettings.openrouterLastModelFetch = lastFetchTimestamp;
              global.db.saveSettings(currentSettings);
            }
          } catch (_) {}

          resolve(cachedFreeModels);
        } catch (err) {
          console.error('[GezyneBot] Failed parsing OpenRouter models:', err.message);
          if (cachedFreeModels.length === 0) loadCachedFreeModelsFromDb();
          resolve(cachedFreeModels);
        }
      });
    });

    req.on('error', (err) => {
      console.warn('[GezyneBot] Error fetching models from OpenRouter:', err.message);
      if (cachedFreeModels.length === 0) loadCachedFreeModelsFromDb();
      resolve(cachedFreeModels);
    });

    req.on('timeout', () => {
      req.destroy();
      console.warn('[GezyneBot] Timeout fetching models from OpenRouter');
      if (cachedFreeModels.length === 0) loadCachedFreeModelsFromDb();
      resolve(cachedFreeModels);
    });
  });
}

function getAvailableModels() {
  if (cachedFreeModels.length === 0) {
    loadCachedFreeModelsFromDb();
  }
  return {
    defaultModels: DEFAULT_MODELS,
    freeModels: cachedFreeModels,
    allModels: [...DEFAULT_MODELS, ...cachedFreeModels]
  };
}

module.exports = {
  AVAILABLE_MODELS,
  DEFAULT_MODELS,
  DEFAULT_MODEL,
  buildKnowledgeContext,
  queryOpenRouter,
  resolveApiKey,
  testOpenRouterConnection,
  fetchFreeOpenRouterModels,
  getAvailableModels
};

