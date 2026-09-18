const fs = require('fs');
const path = require('path');
let pngToIco;

(async function(){
  try {
    try {
      const mod = require('png-to-ico');
      pngToIco = typeof mod === 'function' ? mod : (mod && typeof mod.default === 'function' ? mod.default : null);
    } catch (e) { pngToIco = null; }

    let sharp;
    try { sharp = require('sharp'); } catch (e) { sharp = null; }

    const projectRoot = path.resolve(__dirname, '..');
    const srcCandidates = [
      path.join(projectRoot, '..', 'assets', 'gezyne-logo.png'),
      path.join(projectRoot, '..', 'assets', 'icon_256x256.png'),
      path.join(projectRoot, '..', 'build', 'icon_256x256.png'),
      path.join(projectRoot, '..', '..', 'lis-app-standalone', 'build', 'icon_256x256.png')
    ];
    let src = srcCandidates.find(p => fs.existsSync(p));
    if (!src) {
      console.error('No source PNG found for tray icon. Place a 256x256 PNG at one of:');
      srcCandidates.forEach(p => console.error('  -', p));
      process.exit(2);
    }

    const outDir = path.join(projectRoot, 'build');
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, 'icon.ico');

    if (!pngToIco || !sharp) {
      if (fs.existsSync(out)) {
        console.log('Reusing existing icon.ico at:', out);
        process.exit(0);
      }
      console.error('png-to-ico or sharp module not available and no existing icon.ico found.');
      process.exit(3);
    }

    console.log('Generating', out, 'from', src);

    const sizes = [16,32,48,64,128,256];
    const tmpPaths = [];
    try {
      for (const s of sizes) {
        const tmp = path.join(outDir, `tmp-${s}.png`);
        await sharp(src).resize(s, s, { fit: 'contain' }).png().toFile(tmp);
        tmpPaths.push(tmp);
      }

      const buffer = await pngToIco(tmpPaths);
      fs.writeFileSync(out, buffer);
      console.log('Wrote', out);
    } finally {
      for (const p of tmpPaths) { try { fs.unlinkSync(p); } catch (e) {} }
    }

    } catch (err) {
      console.error('Icon generation failed:', err && err.message || err);
      // fallback: try to copy icon from lis-app-standalone build if available
      try {
        const alt = path.join(projectRoot, '..', '..', 'lis-app-standalone', 'build', 'icon.ico');
        if (fs.existsSync(alt)) {
          fs.copyFileSync(alt, out);
          console.log('Copied fallback icon from', alt, 'to', out);
          process.exit(0);
        }
      } catch (e) {}
      process.exit(1);
    }

})();
