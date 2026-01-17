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

  console.log('Embedding icon into exe...');
  rcedit(exePath, { icon: icoPath }, (err) => {
    if (err) {
      console.error('Failed to embed icon:', err);
      process.exit(1);
    }
    console.log('Successfully embedded icon into', exePath);
  });
}

run();
