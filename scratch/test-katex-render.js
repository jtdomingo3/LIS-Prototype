const path = require('path');
const katex = require(path.join(__dirname, '../lis-fullstack/node_modules/katex'));

const sample = `Here is the formula:
$$
SDI = \\frac{\\text{Reported Result} - \\text{Peer Mean}}{\\text{Peer SD}}
$$
And inline formula: $TE_{obs} = |\\%Bias| + 2 \\times \\%CV$ with normal text.
Also BMI formula: \\[ BMI = \\frac{\\text{Weight (kg)}}{[\\text{Height (m)}]^2} \\] and cost $50.`;

function renderMath(text) {
  // 1. Block math: $$ ... $$ and \[ ... \]
  let out = text.replace(/(\$\$|\\\[)([\s\S]+?)(\$\$|\\\])/g, (match, open, math) => {
    try {
      return '<div class="katex-display">' + katex.renderToString(math.trim(), { displayMode: true, throwOnError: false }) + '</div>';
    } catch (e) {
      return match;
    }
  });

  // 2. Inline math: \( ... \) and $ ... $
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (match, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

  out = out.replace(/(^|[^\$])\$([^\$\n\r]+?)\$(?!\$)/g, (match, prefix, math) => {
    // Avoid single dollar currency like $50 or $100
    if (/^\s*\d+([.,]\d+)?\s*$/.test(math)) return match;
    try {
      return prefix + katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

  return out;
}

const rendered = renderMath(sample);
console.log('Successfully rendered math!');
console.log('Contains katex-html:', rendered.includes('katex-html'));
console.log('Contains $50 untouched:', rendered.includes('$50'));
