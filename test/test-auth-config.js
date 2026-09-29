const fs = require('fs');
const path = require('path');

/**
 * Loads test credentials securely from:
 * 1. CLI arguments (--password=..., --email=... or positional args)
 * 2. Environment variables (TEST_ADMIN_PASSWORD, ADMIN_PASSWORD)
 * 3. Local gitignored .env / .env.test files
 * 
 * Never hardcodes plain text passwords into version control.
 */
function getTestCredentials() {
  const envCandidates = [
    path.join(__dirname, '.env'),
    path.join(__dirname, '.env.test'),
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', 'lis-fullstack', '.env')
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)?$/);
          if (match) {
            const key = match[1];
            let value = (match[2] || '').trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            if (process.env[key] === undefined) {
              process.env[key] = value;
            }
          }
        });
      } catch (_) {}
    }
  }

  const args = process.argv.slice(2);
  let cliEmail = null;
  let cliPassword = null;

  for (const arg of args) {
    if (arg.startsWith('--email=')) {
      cliEmail = arg.split('=')[1];
    } else if (arg.startsWith('--password=')) {
      cliPassword = arg.split('=')[1];
    } else if (!cliEmail && arg.includes('@')) {
      cliEmail = arg;
    } else if (!cliPassword && !arg.startsWith('--')) {
      cliPassword = arg;
    }
  }

  const email = cliEmail || process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'admin@lab.com';
  const password = cliPassword || process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('\n❌ Security Error: No admin test password configured.');
    console.error('To run automated tests without exposing passwords in source control, use one of:');
    console.error('  1. Local gitignored test/.env file: TEST_ADMIN_PASSWORD=your_password');
    console.error('  2. Environment variable: $env:TEST_ADMIN_PASSWORD="your_password" (PowerShell)');
    console.error('  3. Command line argument: node <script>.js --password=your_password\n');
    process.exit(1);
  }

  return { email, password };
}

module.exports = { getTestCredentials };
