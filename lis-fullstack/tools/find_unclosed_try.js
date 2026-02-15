const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'routes', 'reception.js');
const s = fs.readFileSync(file, 'utf8');
let idx = 0; const tries = [];
while (true) {
  const pos = s.indexOf('try', idx);
  if (pos === -1) break;
  const before = s[pos-1] || '';
  const after = s[pos+3] || '';
  if (/\w/.test(before) || /\w/.test(after)) { idx = pos + 3; continue; }
  tries.push(pos);
  idx = pos + 3;
}
function skipSpaces(i) {
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') { i++; continue; }
    if (s.startsWith('//', i)) { i = s.indexOf('\n', i); if (i === -1) return s.length; continue; }
    if (s.startsWith('/*', i)) { const end = s.indexOf('*/', i+2); if (end === -1) return s.length; i = end + 2; continue; }
    break;
  }
  return i;
}
for (const pos of tries) {
  const bracePos = s.indexOf('{', pos);
  if (bracePos === -1) { console.log('try at', pos, 'no {'); continue; }
  let depth = 0; let j = bracePos;
  for (; j < s.length; j++) {
    if (s[j] === '{') depth++; else if (s[j] === '}') depth--;
    if (depth === 0) break;
  }
  if (j >= s.length) { console.log('try at', pos, 'no matching }'); continue; }
  const next = skipSpaces(j+1);
  const nextSlice = s.slice(next, next+20);
  const hasCatch = s.slice(next).startsWith('catch') || s.slice(next).startsWith('finally');
  if (!hasCatch) console.log('try at', pos, 'ends at', j, 'next non-space:', JSON.stringify(nextSlice), 'HAS_CATCH?', hasCatch);
}
console.log('done');
