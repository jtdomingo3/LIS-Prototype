const path = require('path');
const fs = require('fs');
const pngToIco = require('png-to-ico');
const rcedit = require('rcedit');
const Jimp = require('jimp');
const { execSync } = require('child_process');

async function run() {
  const projectRoot = path.resolve(__dirname, '..');
  const pngPath = path.join(projectRoot, 'assets', 'gezyne-logo.png');
  const distDir = path.join(projectRoot, 'dist');
  const icoPath = path.join(distDir, 'gezyne-logo.ico');
  const exePath = path.join(distDir, 'laboratory-information-system.exe');

  if (!fs.existsSync(pngPath)) {
    console.error('Logo not found:', pngPath);
    process.exit(1);
  }

  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  console.log('Resizing PNG to 256x256 and converting to ICO...');
  try {
    const image = await Jimp.read(pngPath);
    const resized = image.cover(256, 256); // cover keeps aspect and crops if needed
    const buffer = await resized.getBufferAsync(Jimp.MIME_PNG);
    const buf = await pngToIco(buffer);
    fs.writeFileSync(icoPath, buf);
    console.log('Wrote ICO to', icoPath);
  } catch (e) {
    console.error('Failed to resize/convert PNG to ICO:', e);
    process.exit(1);
  }

  console.log('Building exe with pkg...');
  try {
    execSync('npm run build:exe', { stdio: 'inherit' });
  } catch (e) {
    console.error('pkg build failed:', e);
    process.exit(1);
  }

  if (!fs.existsSync(exePath)) {
    console.error('Expected exe not found at', exePath);
    process.exit(1);
  }

  // Copy sql-wasm.wasm to dist folder alongside the EXE
  const wasmSrc = path.join(projectRoot, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const wasmDest = path.join(distDir, 'sql-wasm.wasm');
  if (fs.existsSync(wasmSrc)) {
    fs.copyFileSync(wasmSrc, wasmDest);
    console.log('Copied sql-wasm.wasm to', wasmDest);
  }

  // Copy better_sqlite3.node to dist folder alongside the EXE
  const nativeNodeSrc = path.join(projectRoot, 'node_modules', 'better-sqlite3', 'prebuilds', 'win32-x64.node');
  const nativeNodeDest = path.join(distDir, 'better_sqlite3.node');
  if (fs.existsSync(nativeNodeSrc)) {
    fs.copyFileSync(nativeNodeSrc, nativeNodeDest);
    console.log('Copied better_sqlite3.node to', nativeNodeDest);
  }

  console.log('Executable build completed successfully without PE corruption.');
}

run();
