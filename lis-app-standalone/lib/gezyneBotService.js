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

  const messages = [];

  const userContext = user
    ? `\nCurrent logged-in staff member: ${user.name || user.email} (Role: ${user.role || 'Staff'})`
    : '';

  messages.push({
    role: 'system',
    content: buildKnowledgeContext() + userContext
  });

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
