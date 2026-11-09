/**
 * ============================================================================
 * GEZYNE LIS - BUILD METADATA STAMP GENERATOR
 * ============================================================================
 * 
 * Automatically captures git provenance, version synchronization, builder identity,
 * and UTC build timestamp, generating authoritative `build-metadata.json` files
 * prior to packaging the Windows setup installers.
 * 
 * Invoked via:
 *   node scripts/stamp-build-metadata.js --target server
 *   node scripts/stamp-build-metadata.js --target standalone
 *   node scripts/stamp-build-metadata.js --target all
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitInfo() {
  let commit = 'UNKNOWN_COMMIT';
  let branch = 'UNKNOWN_BRANCH';
  let isClean = false;

  try {
    commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    console.warn('[stamp-metadata] Warning: Could not retrieve git commit SHA:', e.message);
  }

  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch (e) {
    console.warn('[stamp-metadata] Warning: Could not retrieve git branch:', e.message);
  }

  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    isClean = status.length === 0;
  } catch (e) {
    isClean = false;
  }

  return { commit, branch, isClean };
}

function stamp(target = 'all') {
  const repoRoot = path.resolve(__dirname, '..');
  const fullstackPkgPath = path.join(repoRoot, 'lis-fullstack', 'package.json');
  const pkgVersion = fs.existsSync(fullstackPkgPath)
    ? JSON.parse(fs.readFileSync(fullstackPkgPath, 'utf8')).version
    : '3.1.0';

  const git = getGitInfo();
  const timestamp = new Date().toISOString();

  const metadata = {
    product: target === 'server' ? 'Gezyne LIS Server' : (target === 'standalone' ? 'Gezyne LIS Standalone' : 'Gezyne LIS Enterprise'),
    version: pkgVersion,
    gitCommit: git.commit,
    gitBranch: git.branch,
    buildTimestamp: timestamp,
    builderUser: 'Gezyne-Jamir Software Tech',
    publisher: 'Gezyne-Jamir Software Tech',
    isClean: git.isClean,
    target: target
  };

  const jsonStr = JSON.stringify(metadata, null, 2);

  const targetsWritten = [];

  if (target === 'server' || target === 'all') {
    const serverPaths = [
      path.join(repoRoot, 'lis-fullstack', 'build-metadata.json'),
      path.join(repoRoot, 'lis-fullstack', 'dist', 'build-metadata.json'),
      path.join(repoRoot, 'lis-fullstack', 'build', 'installer-resources', 'build-metadata.json'),
      path.join(repoRoot, 'lis-fullstack', 'tray', 'build-metadata.json')
    ];

    serverPaths.forEach(p => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, jsonStr, 'utf8');
      targetsWritten.push(path.relative(repoRoot, p));
    });
  }

  if (target === 'standalone' || target === 'all') {
    const standalonePaths = [
      path.join(repoRoot, 'lis-app-standalone', 'build-metadata.json'),
      path.join(repoRoot, 'lis-app-standalone', 'dist', 'build-metadata.json')
    ];

    standalonePaths.forEach(p => {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, jsonStr, 'utf8');
      targetsWritten.push(path.relative(repoRoot, p));
    });
  }

  console.log('======================================================================');
  console.log('  🏷️  GEZYNE LIS - BUILD METADATA STAMPED SUCCESSFULLY');
  console.log('======================================================================');
  console.log(`  Product        : ${metadata.product}`);
  console.log(`  Version        : v${metadata.version}`);
  console.log(`  Git Commit     : ${metadata.gitCommit}`);
  console.log(`  Git Branch     : ${metadata.gitBranch}`);
  console.log(`  Build Timestamp: ${metadata.buildTimestamp}`);
  console.log(`  Builder Entity : ${metadata.builderUser}`);
  console.log(`  Clean Tree     : ${metadata.isClean ? 'Yes (Clean)' : 'No (Local changes present)'}`);
  console.log('----------------------------------------------------------------------');
  console.log('  Files written:');
  targetsWritten.forEach(t => console.log(`    ✓ ${t}`));
  console.log('======================================================================\n');

  return metadata;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let target = 'all';
  const targetIdx = args.indexOf('--target');
  if (targetIdx !== -1 && args[targetIdx + 1]) {
    target = args[targetIdx + 1];
  }
  stamp(target);
}

module.exports = { stamp, getGitInfo };

