const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const specPath = path.join(__dirname, 'captured_print_spec.json');
const outDir = path.join(__dirname, 'out_images');

if (!fs.existsSync(specPath)) {
  console.error('captured_print_spec.json not found at', specPath);
  process.exit(2);
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

function findRasterBlocks(buf) {
  const blocks = [];
  for (let i = 0; i + 7 < buf.length; i++) {
    if (buf[i] === 0x1d && buf[i+1] === 0x76 && buf[i+2] === 0x30) {
      const m = buf[i+3];
      const xL = buf[i+4];
      const xH = buf[i+5];
      const yL = buf[i+6];
      const yH = buf[i+7];
      const widthBytes = xL + xH * 256;
      const height = yL + yH * 256;
      const dataStart = i + 8;
      const dataLen = widthBytes * height;
      const dataEnd = dataStart + dataLen;
      const payload = buf.slice(dataStart, Math.min(dataEnd, buf.length));
      blocks.push({ offset: i, m, widthBytes, height, payload, truncated: dataEnd > buf.length });
      i = dataEnd - 1;
    }
  }
  return blocks;
}

async function renderBlocks() {
  let idx = 0;
  for (let entryIndex = 0; entryIndex < spec.length; entryIndex++) {
    const e = spec[entryIndex];
    if (e && e.type === 'raw' && e.hex) {
      const hex = e.hex.replace(/\s+/g, '');
      let buf;
      try {
        buf = Buffer.from(hex, 'hex');
      } catch (err) {
        console.warn('Skipping invalid hex in entry', entryIndex);
        continue;
      }
      const blocks = findRasterBlocks(buf);
      for (const b of blocks) {
        const width = b.widthBytes * 8;
        const height = b.height;
        if (width <= 0 || height <= 0) continue;
        const image = new Jimp(width, height, 0xffffffff);
        for (let y = 0; y < height; y++) {
          for (let xb = 0; xb < b.widthBytes; xb++) {
            const byteIndex = y * b.widthBytes + xb;
            const byte = b.payload[byteIndex] || 0;
            for (let bit = 0; bit < 8; bit++) {
              // Use MSB as leftmost pixel
              const bitSet = (byte >> (7 - bit)) & 1;
              if (bitSet) {
                const x = xb * 8 + bit;
                image.setPixelColor(0x000000ff, x, y);
              }
            }
          }
        }
        const outPath = path.join(outDir, `raster_${idx}.png`);
        await image.writeAsync(outPath);
        console.log('Wrote', outPath, `(${width}x${height})`, b.truncated ? 'TRUNCATED' : '');
        idx++;
      }
    }
  }
  if (idx === 0) console.log('No GS v 0 raster blocks found in spec.');
}

renderBlocks().catch(err => {
  console.error('Error rendering blocks:', err);
  process.exit(1);
});
