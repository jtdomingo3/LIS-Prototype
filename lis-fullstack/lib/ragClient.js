/**
 * Client for Gezyne LIS Python RAG & Vector Search Microservice
 * Communicates with the local FastAPI + ChromaDB service on port 8765
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RAG_HOST = process.env.RAG_HOST || '127.0.0.1';
const RAG_PORT = parseInt(process.env.RAG_PORT || '8765', 10);
const RAG_BASE_URL = `http://${RAG_HOST}:${RAG_PORT}`;

let ragProcess = null;
let isStarting = false;

/**
 * Perform vector search query via Python RAG microservice
 * @param {string} question - Query text
 * @param {number} topK - Number of chunks to retrieve (default: 4)
 * @param {number} timeoutMs - Timeout before fallback (default: 2500ms)
 * @returns {Promise<{success: boolean, combinedContext: string, results: Array}|null>}
 */
async function queryRag({ question, topK = 4, timeoutMs = 2500 }) {
  if (!question || !question.trim()) return null;

  const payload = JSON.stringify({
    question: question.trim(),
    top_k: topK
  });

  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: RAG_HOST,
        port: RAG_PORT,
        path: '/rag/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: timeoutMs
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const data = JSON.parse(rawData);
              if (data && data.success && data.combined_context) {
                return resolve({
                  success: true,
                  combinedContext: data.combined_context,
                  results: data.results || []
                });
              }
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => {
      // Offline / Connection refused -> Graceful fallback
      resolve(null);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Check if the Python RAG service is running and healthy
 */
async function checkHealth(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        hostname: RAG_HOST,
        port: RAG_PORT,
        path: '/health',
        timeout: timeoutMs
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            resolve(data && data.status === 'healthy');
          } catch (e) {
            resolve(false);
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => { resolve(false); });
  });
}

/**
 * Spawn the Python RAG microservice if not already running
 */
async function ensureRagServiceRunning() {
  if (isStarting) return;

  const isHealthy = await checkHealth();
  if (isHealthy) {
    return true;
  }

  isStarting = true;

  // Resolve python service script location
  const candidates = [
    path.join(__dirname, '..', '..', 'lis-rag-service', 'app.py'),
    path.join(__dirname, '..', 'lis-rag-service', 'app.py'),
    path.join(process.cwd(), 'lis-rag-service', 'app.py'),
    path.join(process.cwd(), '..', 'lis-rag-service', 'app.py'),
  ];

  let appPyPath = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      appPyPath = c;
      break;
    }
  }

  if (!appPyPath) {
    isStarting = false;
    return false;
  }

  const serviceDir = path.dirname(appPyPath);
  console.log(`[RAG Client] Launching Python RAG Microservice from: ${appPyPath}`);

  try {
    ragProcess = spawn('python', ['app.py'], {
      cwd: serviceDir,
      env: { ...process.env, RAG_HOST, RAG_PORT: String(RAG_PORT) },
      stdio: 'pipe',
      detached: false,
      windowsHide: true
    });

    ragProcess.stdout.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.log(`[RAG Service Log] ${msg}`);
    });

    ragProcess.stderr.on('data', (d) => {
      const msg = d.toString().trim();
      if (msg) console.warn(`[RAG Service Err] ${msg}`);
    });

    ragProcess.on('exit', (code) => {
      console.log(`[RAG Client] Python RAG process exited with code ${code}`);
      ragProcess = null;
      isStarting = false;
    });

    // Wait up to 5 seconds for health check to pass
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      if (await checkHealth()) {
        console.log(`[RAG Client] Python RAG microservice successfully ready on port ${RAG_PORT}`);
        isStarting = false;
        return true;
      }
    }
  } catch (err) {
    console.warn('[RAG Client] Could not launch Python RAG process:', err.message);
  }

  isStarting = false;
  return false;
}

module.exports = {
  queryRag,
  checkHealth,
  ensureRagServiceRunning,
  RAG_BASE_URL
};
