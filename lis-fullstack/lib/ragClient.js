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
 * @param {boolean} enableWeb - Whether to include live web search snippets (default: false)
 * @param {number} timeoutMs - Timeout before fallback (default: 4500ms)
 * @returns {Promise<{success: boolean, combinedContext: string, results: Array, webResults: Array, webSearchEnabled: boolean}|null>}
 */
async function queryRag({ question, topK = 4, enableWeb = false, timeoutMs = null }) {
  if (!question || !question.trim()) return null;

  const effectiveTimeout = timeoutMs || (enableWeb ? 15000 : 5000);

  const payload = JSON.stringify({
    question: question.trim(),
    top_k: topK,
    enable_web: !!enableWeb
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
        timeout: effectiveTimeout
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const data = JSON.parse(rawData);
              if (data && data.success) {
                return resolve({
                  success: true,
                  combinedContext: data.combined_context || '',
                  results: data.results || [],
                  webResults: data.web_results || [],
                  webSearchEnabled: !!data.web_search_enabled
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
 * Detailed status check of the Python RAG microservice
 * @param {number} timeoutMs
 * @returns {Promise<{online: boolean, totalChunks: number, service: string, engineReady: boolean}>}
 */
async function getRagStatus(timeoutMs = 1500) {
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
            if (data && data.status === 'healthy') {
              resolve({
                online: true,
                totalChunks: data.total_chunks || 0,
                service: data.service || 'lis-rag-service',
                engineReady: !!data.engine_ready
              });
            } else {
              resolve({ online: false, totalChunks: 0, service: 'lis-rag-service', engineReady: false });
            }
          } catch (e) {
            resolve({ online: false, totalChunks: 0, service: 'lis-rag-service', engineReady: false });
          }
        });
      }
    );
    req.on('timeout', () => { req.destroy(); resolve({ online: false, totalChunks: 0, service: 'lis-rag-service', engineReady: false }); });
    req.on('error', () => { resolve({ online: false, totalChunks: 0, service: 'lis-rag-service', engineReady: false }); });
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

  // 1. First check for compiled standalone executable (rag.exe)
  const exeCandidates = [
    path.join(__dirname, '..', '..', 'lis-rag-service', 'dist', 'rag', 'rag.exe'),
    path.join(__dirname, '..', '..', 'lis-rag-service', 'dist', 'rag.exe'),
    path.join(__dirname, '..', 'dist', 'rag', 'rag.exe'),
    path.join(__dirname, '..', 'dist', 'rag.exe'),
    path.join(process.cwd(), 'lis-rag-service', 'dist', 'rag', 'rag.exe'),
    path.join(process.cwd(), 'lis-rag-service', 'dist', 'rag.exe'),
    path.join(process.cwd(), 'dist', 'rag', 'rag.exe'),
    path.join(process.cwd(), 'dist', 'rag.exe'),
    path.join(process.cwd(), 'rag', 'rag.exe'),
    path.join(process.cwd(), 'rag.exe')
  ];

  if (process.resourcesPath) {
    exeCandidates.push(
      path.join(process.resourcesPath, 'rag', 'rag.exe'),
      path.join(process.resourcesPath, 'rag.exe')
    );
  }

  let ragExePath = null;
  for (let e of exeCandidates) {
    e = path.resolve(e);
    if (fs.existsSync(e)) {
      ragExePath = e;
      break;
    }
  }

  if (ragExePath) {
    console.log(`[RAG Client] Found compiled RAG executable: ${ragExePath}`);
    const exeDir = path.dirname(ragExePath);
    try {
      ragProcess = spawn(ragExePath, [], {
        cwd: exeDir,
        env: { ...process.env, RAG_HOST, RAG_PORT: String(RAG_PORT) },
        stdio: 'pipe',
        detached: false,
        windowsHide: true
      });

      ragProcess.stdout.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) console.log(`[RAG Exe Log] ${msg}`);
      });

      ragProcess.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (msg) console.warn(`[RAG Exe Err] ${msg}`);
      });

      ragProcess.on('exit', (code) => {
        console.log(`[RAG Client] rag.exe exited with code ${code}`);
        ragProcess = null;
        isStarting = false;
      });

      // Wait up to 5 seconds for health check to pass
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await checkHealth()) {
          console.log(`[RAG Client] rag.exe successfully ready on port ${RAG_PORT}`);
          isStarting = false;
          return true;
        }
      }
    } catch (err) {
      console.warn('[RAG Client] Could not launch rag.exe:', err.message);
    }
  }

  // 2. Fallback to Python script execution (app.py)
  const scriptCandidates = [
    path.join(__dirname, '..', '..', 'lis-rag-service', 'app.py'),
    path.join(__dirname, '..', 'lis-rag-service', 'app.py'),
    path.join(process.cwd(), 'lis-rag-service', 'app.py'),
    path.join(process.cwd(), '..', 'lis-rag-service', 'app.py'),
  ];

  let appPyPath = null;
  for (const c of scriptCandidates) {
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

/**
 * Gracefully stop the RAG microservice child process
 */
function stopRagService() {
  if (ragProcess) {
    try {
      ragProcess.kill();
      console.log('[RAG Client] Terminated RAG child process');
    } catch (e) {}
    ragProcess = null;
  }
}

process.on('exit', stopRagService);
process.on('SIGINT', stopRagService);
process.on('SIGTERM', stopRagService);

module.exports = {
  queryRag,
  checkHealth,
  getRagStatus,
  ensureRagServiceRunning,
  stopRagService,
  RAG_BASE_URL
};

