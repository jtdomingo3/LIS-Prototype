const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const pngToIco = require('png-to-ico');
const rcedit = require('rcedit');
const Jimp = require('jimp');

async function run() {
  const projectRoot = path.resolve(__dirname, '..');
  const distDir = path.join(projectRoot, 'dist');
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  const pngPath = path.join(projectRoot, 'assets', 'gezyne-logo.png');
  const icoPath = path.join(distDir, 'gezyne-logo.ico');

  if (!fs.existsSync(pngPath)) {
    console.error('Logo not found:', pngPath);
    process.exit(1);
  }

  console.log('Preparing ICO...');
  const image = await Jimp.read(pngPath);
  const resized = image.cover(256, 256);
  const buffer = await resized.getBufferAsync(Jimp.MIME_PNG);
  const buf = await pngToIco(buffer);
  fs.writeFileSync(icoPath, buf);

  console.log('Building launcher exe with pkg...');
  try {
    execSync('pkg scripts/launcher.js --out-path dist --targets node18-win-x64', { stdio: 'inherit' });
  } catch (e) {
    console.error('pkg failed:', e);
    process.exit(1);
  }

  const launcherExe = path.join(distDir, 'launcher.exe');
  // pkg uses the source filename as the exe name (launcher.exe)
  // Embed icon
  const produced = path.join(distDir, 'launcher.exe');
  if (!fs.existsSync(produced)) {
    console.error('Expected launcher exe not found at', produced);
    process.exit(1);
  }

  console.log('Embedding icon into launcher...');
  rcedit(produced, { icon: icoPath }, (err) => {
    if (err) {
      console.error('Failed to embed icon:', err);
      process.exit(1);
    }
    console.log('Launcher built at', produced);
  });
}

run();
