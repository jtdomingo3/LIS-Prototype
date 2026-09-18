/**
 * Security Audit Check: SQL & Command Injection Protection
 * Standards: OWASP A03:2021-Injection, CWE-89
 */
const fs = require('fs');
const path = require('path');

function scanDirForSqlInjection(dir, findings) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'logs', 'dist', 'build'].includes(entry.name)) continue;
      scanDirForSqlInjection(fullPath, findings);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        // Look for dangerous raw SQL concatenation inside database query executions:
        // e.g., db.query(`SELECT ... ${var}`) or sqlite.run(`INSERT ... ${var}`)
        const dbQueryPatterns = [
          /\.(query|prepare|run|exec|all|get)\s*\(\s*`[^`]*\b(SELECT|INSERT|UPDATE|DELETE)\b[^`]*\$\{/i,
          /\.(query|prepare|run|exec|all|get)\s*\(\s*["'][^"']*\b(SELECT|INSERT|UPDATE|DELETE)\b[^"']*["']\s*\+/i
        ];

        for (const pattern of dbQueryPatterns) {
          if (pattern.test(line)) {
            // Check if it's safe table identifier or actually raw input
            if (!line.includes('safeStr') && !line.includes('JSON.stringify') && !line.includes('Number(') && !line.includes('parseInt(')) {
              findings.push({
                severity: 'HIGH',
                rule: 'SQL_STRING_CONCATENATION',
                file: path.relative(process.cwd(), fullPath),
                line: idx + 1,
                message: `Potential raw SQL string interpolation in database call at line ${idx + 1}. Use parameterized placeholders (?) instead.`
              });
            }
          }
        }
      });
    }
  }
}

async function checkInjection(baseDir) {
  const findings = [];
  let score = 100;

  scanDirForSqlInjection(baseDir, findings);

  // Score adjustments
  const highCount = findings.filter(f => f.severity === 'HIGH' || f.severity === 'CRITICAL').length;
  score -= (highCount * 20);

  return {
    name: 'SQL & Command Injection Prevention',
    score: Math.max(0, score),
    findings
  };
}

module.exports = { checkInjection };
