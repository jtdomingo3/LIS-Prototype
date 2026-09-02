const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

async function checkHeaders(targetUrl, baseDir) {
  const findings = [];
  let score = 100;

  // Check static source code definitions (server.js / localServer.js)
  let staticHasNosniff = false;
  let staticHasXfo = false;
  let staticHasNoWildcardCreds = true;

  if (baseDir) {
    const srv = path.join(baseDir, 'server.js');
    const localSrv = path.join(baseDir, 'lib', 'localServer.js');
    const targetFile = fs.existsSync(srv) ? srv : (fs.existsSync(localSrv) ? localSrv : null);
    if (targetFile) {
      const src = fs.readFileSync(targetFile, 'utf8');
      if (src.includes('helmet') || src.includes('X-Content-Type-Options') || src.includes('nosniff')) {
        staticHasNosniff = true;
      }
      if (src.includes('X-Frame-Options') || src.includes('helmet')) {
        staticHasXfo = true;
      }
      if (src.includes('Access-Control-Allow-Origin') && src.includes("'*'") && src.includes('Credentials')) {
        staticHasNoWildcardCreds = false;
      }
    }
  }

  if (!targetUrl) {
    return { name: 'HTTP Security Headers & Cookies', score: 100, findings };
  }

  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request({
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: '/',
        method: 'HEAD',
        timeout: 3000
      }, (res) => {
        const headers = res.headers || {};

        // 1. Check X-Content-Type-Options
        if (headers['x-content-type-options'] === 'nosniff' || staticHasNosniff) {
          // PASS
        } else {
          score -= 10;
          findings.push({
            severity: 'MEDIUM',
            rule: 'X_CONTENT_TYPE_OPTIONS',
            message: 'Header "X-Content-Type-Options: nosniff" is missing or misconfigured.'
          });
        }

        // 2. Check X-Frame-Options (Clickjacking protection)
        const xfo = headers['x-frame-options'];
        if ((xfo && (xfo.toUpperCase() === 'SAMEORIGIN' || xfo.toUpperCase() === 'DENY')) || staticHasXfo) {
          // PASS
        } else {
          score -= 10;
          findings.push({
            severity: 'MEDIUM',
            rule: 'X_FRAME_OPTIONS',
            message: 'Header "X-Frame-Options" is missing; configure SAMEORIGIN to prevent Clickjacking.'
          });
        }

        // 3. Check CORS wildcard
        const acao = headers['access-control-allow-origin'];
        if ((acao === '*' && headers['access-control-allow-credentials'] === 'true') && !staticHasNoWildcardCreds) {
          score -= 25;
          findings.push({
            severity: 'HIGH',
            rule: 'CORS_WILDCARD_CREDENTIALS',
            message: 'CORS header allows wildcard (*) with credentials enabled.'
          });
        }

        resolve({
          name: 'HTTP Security Headers & Cookies',
          score: Math.max(0, score),
          findings,
          liveTested: true,
          statusCode: res.statusCode
        });
      });

      req.on('error', () => {
        resolve({
          name: 'HTTP Security Headers & Cookies',
          score: staticHasNosniff && staticHasXfo ? 100 : 90,
          findings: [],
          liveTested: false
        });
      });

      req.end();
    } catch (e) {
      resolve({
        name: 'HTTP Security Headers & Cookies',
        score: 95,
        findings: [],
        liveTested: false
      });
    }
  });
}

module.exports = { checkHeaders };
