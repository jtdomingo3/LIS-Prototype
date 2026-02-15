const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'views', 'reports', 'results');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const res = path.join(dir, d.name);
    return d.isDirectory() ? walk(res) : res;
  });
}

function fixFile(file) {
  let txt = fs.readFileSync(file, 'utf8');
  const pattern = /(^|\r?\n)\s*(?:const|let)\s+displayName\s*=\s*([^;\n]*)(?:;?)(?=\r?\n)/g;
  if (!pattern.test(txt)) return false;
  txt = txt.replace(pattern, (m, nl, rhs) => {
    // Trim trailing semicolon/newline from rhs
    let rhsClean = rhs.trim().replace(/;$/, '');
    return `${nl}if (typeof displayName === 'undefined') {\n  var displayName = ${rhsClean};\n}`;
  });
  fs.writeFileSync(file, txt, 'utf8');
  return true;
}

try {
  const files = walk(DIR).filter(f => f.endsWith('.ejs'));
  let changed = 0;
  files.forEach(f => {
    try {
      if (fixFile(f)) {
        console.log('Fixed:', f);
        changed++;
      }
    } catch (e) {
      console.error('Error processing', f, e.message);
    }
  });
  console.log('Done. Files changed:', changed);
} catch (e) {
  console.error('Script error:', e.message);
  process.exit(1);
}
