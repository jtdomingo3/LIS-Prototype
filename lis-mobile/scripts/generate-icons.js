/**
 * generate-icons.js — Resize gezyne-logo.png into Android icon densities
 * Run: node generate-icons.js
 */
const fs   = require('fs');
const path = require('path');

(async function () {
  let sharp;
  try { sharp = require('sharp'); } catch (e) {
    console.error('sharp is not installed. Run: npm install sharp');
    process.exit(1);
  }

  const src = path.resolve(__dirname, '..', 'www', 'img', 'logo.png');
  if (!fs.existsSync(src)) { console.error('Source logo not found at', src); process.exit(2); }

  const outDir = path.resolve(__dirname, '..', 'res', 'icons', 'android');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const sizes = {
    'ldpi.png':    36,
    'mdpi.png':    48,
    'hdpi.png':    72,
    'xhdpi.png':   96,
    'xxhdpi.png': 144,
    'xxxhdpi.png':192
  };

  for (const [name, size] of Object.entries(sizes)) {
    const out = path.join(outDir, name);
    await sharp(src).resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toFile(out);
    console.log(`  ✔ ${name} (${size}x${size})`);
  }
  console.log('Done – icons written to', outDir);
})();
