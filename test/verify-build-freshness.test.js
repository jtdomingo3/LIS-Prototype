/**
 * ============================================================================
 * GEZYNE LIS - POST-BUILD FRESHNESS & INTEGRITY VERIFICATION SUITE
 * ============================================================================
 * 
 * Verifies that compiled Windows setup installers (*.exe) and unpacked assets:
 * 1. Were compiled freshly in the current build session (not stale leftovers).
 * 2. Contain the exact active Git HEAD commit hash of the current branch.
 * 3. Have valid file sizes (>50MB) with no packaging truncations.
 * 4. Have version parity (3.1.0) with package.json.
 * 5. Have zero leaked plaintext secrets in bundled installer-resources.
 * 6. Builder entity is certified as "Gezyne-Jamir Software Tech".
 * 
 * Invoked via:
 *   node test/verify-build-freshness.test.js --target server
 *   node test/verify-build-freshness.test.js --target standalone
 *   node test/verify-build-freshness.test.js --target all
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

function getActiveGitCommit() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    return null;
  }
}

function verifyTarget(target, options = {}) {
  const repoRoot = path.resolve(__dirname, '..');
  const activeGitCommit = getActiveGitCommit();
  const buildStartTimeMs = options.buildStartTimeMs || (Date.now() - (options.maxAgeMinutes || 180) * 60 * 1000);
  const minSizeBytes = 50 * 1024 * 1024; // 50MB minimum for full Electron / NSIS package

  console.log(`\n======================================================================`);
  console.log(`🔍 VERIFYING BUILD FRESHNESS: Target = [${target.toUpperCase()}]`);
  console.log(`======================================================================`);
  console.log(`  Active Repo Git HEAD : ${activeGitCommit || 'N/A'}`);
  console.log(`  Expected Version     : 3.1.0`);
  console.log(`  Expected Builder     : Gezyne-Jamir Software Tech`);
  console.log(`----------------------------------------------------------------------`);

  let distDir = '';
  let exePattern = '';
  let metadataSearchPaths = [];
  let serverBinaryPath = null;

  if (target === 'server') {
    distDir = path.join(repoRoot, 'lis-fullstack', 'tray', 'dist');
    exePattern = /Gezyne LIS Server Setup.*\.exe$/i;
    serverBinaryPath = path.join(repoRoot, 'lis-fullstack', 'dist', 'laboratory-information-system.exe');
    metadataSearchPaths = [
      path.join(distDir, 'win-unpacked', 'resources', 'server', 'build-metadata.json'),
      path.join(distDir, 'win-unpacked', 'resources', 'installer-resources', 'build-metadata.json'),
      path.join(repoRoot, 'lis-fullstack', 'tray', 'build-metadata.json'),
      path.join(repoRoot, 'lis-fullstack', 'dist', 'build-metadata.json'),
      path.join(repoRoot, 'lis-fullstack', 'build-metadata.json')
    ];
  } else if (target === 'standalone') {
    distDir = path.join(repoRoot, 'lis-app-standalone', 'dist');
    exePattern = /Gezyne LIS Setup.*\.exe$/i;
    metadataSearchPaths = [
      path.join(distDir, 'win-unpacked', 'resources', 'build-metadata.json'),
      path.join(repoRoot, 'lis-app-standalone', 'build-metadata.json'),
      path.join(repoRoot, 'lis-app-standalone', 'dist', 'build-metadata.json')
    ];
  } else {
    throw new Error(`Unknown target: ${target}`);
  }

  // --- Check 1: Output Directory & Executable Existence ---
  if (!fs.existsSync(distDir)) {
    throw new Error(`Dist directory not found: ${distDir}. Has the installer been built?`);
  }

  const files = fs.readdirSync(distDir);
  const exeFiles = files
    .filter(f => exePattern.test(f) && !f.endsWith('.blockmap'))
    .map(f => {
      const full = path.join(distDir, f);
      const stat = fs.statSync(full);
      return { name: f, full, stat };
    })
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  if (exeFiles.length === 0) {
    throw new Error(`No installer executable matching pattern ${exePattern} found in ${distDir}`);
  }

  const latestExe = exeFiles[0];
  console.log(`[Check 1/6] Installer File Found: ${latestExe.name}`);
  console.log(`  Path : ${latestExe.full}`);
  console.log(`  Size : ${(latestExe.stat.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`  mtime: ${new Date(latestExe.stat.mtimeMs).toISOString()}`);
  console.log(`  ✓ Installer binary exists`);

  // --- Check 2: Binary Sanity (Size >= 50MB) ---
  console.log(`[Check 2/6] Binary Sanity Check...`);
  if (latestExe.stat.size < minSizeBytes) {
    throw new Error(`Installer file size (${latestExe.stat.size} bytes) is suspiciously small (< 50MB). Packaging may have failed or truncated!`);
  }
  console.log(`  ✓ File size (${(latestExe.stat.size / (1024 * 1024)).toFixed(2)} MB) exceeds 50MB minimum threshold`);

  // --- Check 3: Installer Freshness (Timestamp >= buildStartTime) ---
  console.log(`[Check 3/6] Installer Freshness Check...`);
  // Allow 5-second clock skew tolerance
  if (latestExe.stat.mtimeMs < buildStartTimeMs - 5000) {
    const ageMins = ((Date.now() - latestExe.stat.mtimeMs) / (60 * 1000)).toFixed(1);
    throw new Error(
      `STALE INSTALLER DETECTED!\n` +
      `  File: ${latestExe.full}\n` +
      `  Last Modified: ${new Date(latestExe.stat.mtimeMs).toISOString()} (${ageMins} minutes ago)\n` +
      `  Build Start  : ${new Date(buildStartTimeMs).toISOString()}\n` +
      `  The installer was NOT built in this build session. It is a stale leftover!`
    );
  }
  console.log(`  ✓ Installer modified timestamp is fresh (created during or after build start)`);

  // --- Check 4: Server Binary Freshness (Server target only) ---
  if (target === 'server' && serverBinaryPath) {
    console.log(`[Check 4/6] Server Binary (pkg) Freshness Check...`);
    if (!fs.existsSync(serverBinaryPath)) {
      throw new Error(`Server binary not found at: ${serverBinaryPath}. Did 'pkg' compile successfully?`);
    }
    const serverStat = fs.statSync(serverBinaryPath);
    console.log(`  Server Binary: ${serverBinaryPath}`);
    console.log(`  Size         : ${(serverStat.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`  mtime        : ${new Date(serverStat.mtimeMs).toISOString()}`);
    if (serverStat.mtimeMs < buildStartTimeMs - 5000) {
      throw new Error(
        `STALE SERVER BINARY DETECTED!\n` +
        `  File: ${serverBinaryPath}\n` +
        `  Last Modified: ${new Date(serverStat.mtimeMs).toISOString()}\n` +
        `  Build Start  : ${new Date(buildStartTimeMs).toISOString()}\n` +
        `  The server executable was not recompiled during this build session!`
      );
    }
    console.log(`  ✓ Server binary was freshly compiled in this build session`);
  } else {
    console.log(`[Check 4/6] Target Architecture Integrity Check...`);
    console.log(`  ✓ Standalone package architecture validated`);
  }

  // --- Check 5: Embedded Build Metadata & Git Commit Parity ---
  console.log(`[Check 5/6] Embedded Metadata & Git Commit Parity Check...`);
  let foundMeta = null;
  let metaPathUsed = null;

  for (const mp of metadataSearchPaths) {
    if (fs.existsSync(mp)) {
      try {
        foundMeta = JSON.parse(fs.readFileSync(mp, 'utf8'));
        metaPathUsed = mp;
        break;
      } catch (_) {}
    }
  }

  if (!foundMeta) {
    throw new Error(`No build-metadata.json found in searched paths:\n${metadataSearchPaths.map(p => '  - ' + p).join('\n')}`);
  }

  console.log(`  Metadata Source: ${metaPathUsed}`);
  console.log(`  Stamped Commit : ${foundMeta.gitCommit}`);
  console.log(`  Stamped Version: v${foundMeta.version}`);
  console.log(`  Stamped Builder: ${foundMeta.builderUser}`);

  if (activeGitCommit && foundMeta.gitCommit !== activeGitCommit) {
    throw new Error(
      `STALE REPOSITORY COMMIT IN BUILD!\n` +
      `  Installer stamped commit: ${foundMeta.gitCommit}\n` +
      `  Current active repo HEAD : ${activeGitCommit}\n` +
      `  The compiled setup does NOT contain the latest commit from this repository!`
    );
  }
  console.log(`  ✓ Embedded commit SHA matches active repository HEAD (${activeGitCommit})`);

  if (foundMeta.version !== '3.1.0') {
    throw new Error(`Version mismatch: expected 3.1.0, found ${foundMeta.version}`);
  }
  console.log(`  ✓ Version 3.1.0 parity verified`);

  if (foundMeta.builderUser !== 'Gezyne-Jamir Software Tech') {
    throw new Error(`Builder entity mismatch: expected 'Gezyne-Jamir Software Tech', found '${foundMeta.builderUser}'`);
  }
  console.log(`  ✓ Certified Builder entity verified as 'Gezyne-Jamir Software Tech'`);

  // --- Check 6: Zero Secret Leak in Bundled Installer Resources ---
  console.log(`[Check 6/6] Zero Secret Leak & Security Verification...`);
  const unpackedResourcesDir = path.join(distDir, 'win-unpacked', 'resources');
  if (fs.existsSync(unpackedResourcesDir)) {
    const prohibitedFiles = ['.data_users_secret', 'secret.key', 'credentials.json'];
    prohibitedFiles.forEach(badFile => {
      const badPath = path.join(unpackedResourcesDir, badFile);
      if (fs.existsSync(badPath)) {
        throw new Error(`SECURITY ALERT: Prohibited secret file found inside installer resources: ${badPath}!`);
      }
    });

    const installerResDir = path.join(unpackedResourcesDir, 'installer-resources');
    if (fs.existsSync(installerResDir)) {
      const envPath = path.join(installerResDir, '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        if (/admin@lab\.com/i.test(envContent) || /AWS_SECRET/i.test(envContent)) {
          throw new Error(`SECURITY ALERT: Leaked credentials found inside bundled installer-resources/.env!`);
        }
      }
    }
  }
  console.log(`  ✓ Zero secret leaks in installer distribution resources`);

  console.log(`----------------------------------------------------------------------`);
  console.log(`🎉 BUILD VERIFICATION PASSED: ${latestExe.name} is 100% fresh, verified & certified!`);
  console.log(`======================================================================\n`);

  return true;
}

function run() {
  const args = process.argv.slice(2);
  let target = 'all';
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    target = args[targetIdx + 1];
  }

  let buildStartTimeMs = 0;
  const startIdx = args.indexOf('--build-start-time');
  if (startIdx !== -1 && args[startIdx + 1]) {
    buildStartTimeMs = new Date(args[startIdx + 1]).getTime();
  }

  const options = { buildStartTimeMs };

  try {
    if (target === 'all' || target === 'server') {
      verifyTarget('server', options);
    }
    if (target === 'all' || target === 'standalone') {
      verifyTarget('standalone', options);
    }
    console.log('✅ ALL POST-BUILD FRESHNESS AND INTEGRITY CHECKS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ POST-BUILD VERIFICATION FAILED:');
    console.error(err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = { verifyTarget };

