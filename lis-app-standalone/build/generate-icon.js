const fs = require('fs');
const path = require('path');
let pngToIco;

(async function(){
  try {
    // dynamic require and normalize export shape
    try {
      const mod = require('png-to-ico');
      pngToIco = typeof mod === 'function' ? mod : (mod && typeof mod.default === 'function' ? mod.default : null);
    } catch (e) {
      pngToIco = null;
    }

    let sharp;
    try { sharp = require('sharp'); } catch (e) { sharp = null; }

    const projectRoot = path.resolve(__dirname, '..');
    const srcCandidates = [
      path.join(projectRoot, 'assets', 'gezyne-logo.png'),
      path.join(projectRoot, 'assets', 'icon_256x256.png'),
      path.join(projectRoot, 'build', 'icon_256x256.png')
    ];
    let src = srcCandidates.find(p => fs.existsSync(p));
    if (!src) {
      console.error('No source PNG found. Place a PNG (preferably 256x256) at one of:');
      srcCandidates.forEach(p => console.error('  -', p));
      process.exit(2);
    }

    if (!pngToIco) {
      console.error('png-to-ico module not available or has unexpected export shape.');
      console.error('Run: npm install --save-dev png-to-ico');
      process.exit(3);
    }

    if (!sharp) {
      console.error('sharp module not available. Run: npm install --save-dev sharp');
      process.exit(4);
    }

    const out = path.join(__dirname, 'icon.ico');
    console.log('Generating', out, 'from', src);

    // sizes required for good Windows icon: 16,32,48,64,128,256
    const sizes = [16,32,48,64,128,256];
    const tmpPaths = [];
    try {
      for (const s of sizes) {
        const tmp = path.join(__dirname, `tmp-${s}.png`);
        await sharp(src).resize(s, s, { fit: 'contain' }).png().toFile(tmp);
        tmpPaths.push(tmp);
      }

      const buffer = await pngToIco(tmpPaths);
      fs.writeFileSync(out, buffer);
      console.log('Wrote', out);
    } finally {
      // cleanup temp files
      for (const p of tmpPaths) {
        try { fs.unlinkSync(p); } catch (e) {}
      }
    }

  } catch (err) {
    console.error('Icon generation failed:', err && err.message || err);
    process.exit(1);
  }
})();
