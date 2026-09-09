const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', 'tray/dist', '.system_generated', 'logs'];
const EXCLUDE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.ico', '.db', '.db-shm', '.db-wal', '.lock'];

const SUSPICIOUS_PATTERNS = [
  /password\s*[:=]\s*['"`][^'"`\n]+['"`]/i,
  /secret\s*[:=]\s*['"`][^'"`\n]+['"`]/i,
  /api[_-]?key\s*[:=]\s*['"`][^'"`\n]+['"`]/i,
  /defaultPassword\s*[:=]\s*['"`][^'"`\n]+['"`]/i,
  /BEGIN\s+(RSA|OPENSSH|PGP|PRIVATE)\s+KEY/i,
  /password123/i
];

function scanDir(dir) {
  let results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (EXCLUDE_DIRS.some(ex => fullPath.includes(ex))) continue;
      if (entry.isDirectory()) {
        results = results.concat(scanDir(fullPath));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (EXCLUDE_EXTS.includes(ext) || entry.name.endsWith('package-lock.json')) continue;
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            for (const pattern of SUSPICIOUS_PATTERNS) {
              if (pattern.test(line)) {
                // Ignore type definitions, standard schemas, bcrypt calls
                if (line.includes('password:') && (line.includes('String') || line.includes('type:') || line.includes('TEXT') || line.includes('candidatePassword') || line.includes('bcrypt') || line.includes('confirmPassword') || line.includes('currentPassword') || line.includes('newPassword') || line.includes('req.body.password'))) continue;
                results.push({ file: fullPath, line: idx + 1, content: line.trim() });
                break;
              }
            }
          });
        } catch (_) {}
      }
    }
  } catch (_) {}
  return results;
}

const found = scanDir('.');
console.log('=== AUDIT RESULTS: POTENTIAL PASSWORD LEAKS & HARDCODED CREDENTIALS ===');
console.log(`Total occurrences found: ${found.length}\n`);
found.forEach(f => {
  console.log(`[${f.file}:${f.line}] ${f.content.slice(0, 120)}`);
});
