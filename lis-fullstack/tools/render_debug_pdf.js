const fs = require('fs');
const path = require('path');
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  console.error('Puppeteer is not installed in this project. Install with: npm i puppeteer');
  process.exit(1);
}

async function render(htmlPath) {
  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'Letter', printBackground: true });
    await browser.close();

    const outPath = path.join(path.dirname(htmlPath), `${path.basename(htmlPath, path.extname(htmlPath))}.diagnostic.pdf`);
    fs.writeFileSync(outPath, pdfBuffer);
    const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
    const hdr = buf && buf.length ? buf.toString('utf8', 0, 5) : null;
    console.log('Wrote diagnostic PDF to', outPath);
    console.log('PDF header:', hdr);
    if (hdr !== '%PDF-') {
      console.warn('Diagnostic PDF does not start with %PDF-; renderer produced unexpected output.');
    }
  } catch (err) {
    console.error('Diagnostic render failed:', err && (err.stack || err));
    process.exit(2);
  }
}

if (process.argv.length < 3) {
  console.error('Usage: node tools/render_debug_pdf.js <path-to-debug-html>');
  process.exit(1);
}

render(process.argv[2]);
