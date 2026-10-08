/**
 * Unit Test: Markdown Helper Line Breaks, GezyneBot Knowledge, and v2.6.5 Parity
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const fullstackMd = require('../lis-fullstack/lib/markdownHelper');
const standaloneMd = require('../lis-app-standalone/lib/markdownHelper');

console.log('=== Running Markdown Line Break & Version 2.6.5 Test Suite ===\n');

// 1. Test Markdown Helper line break rendering
function testMarkdownLineBreaks(helper, label) {
  console.log(`[Test] ${label}: multi-line paragraph joins lines with <br />`);
  const inputMultiLine = "First line of observation.\nSecond line of observation.\nThird line of observation.";
  const rendered = helper.renderMarkdown(inputMultiLine);
  assert.ok(rendered.includes('<p class="manual-p">First line of observation.<br />Second line of observation.<br />Third line of observation.</p>'),
    `Expected lines to be joined with <br />, got: ${rendered}`);
  console.log(`  ✓ Multi-line paragraph correctly rendered with <br /> tags`);

  console.log(`[Test] ${label}: explicit <br> tags in markdown are preserved`);
  const inputExplicitBr = "Point 1<br>Point 2<br />Point 3";
  const renderedBr = helper.renderMarkdown(inputExplicitBr);
  assert.ok(renderedBr.includes('<br />') || renderedBr.includes('<br>'), `Expected <br> to be preserved, got: ${renderedBr}`);
  assert.ok(!renderedBr.includes('&lt;br&gt;'), `Expected raw <br> not to be escaped to &lt;br&gt;, got: ${renderedBr}`);
  console.log(`  ✓ Explicit <br> tags properly preserved`);

  console.log(`[Test] ${label}: double newline separates distinct paragraphs`);
  const inputTwoParagraphs = "Paragraph 1 text.\n\nParagraph 2 text.";
  const renderedTwoP = helper.renderMarkdown(inputTwoParagraphs);
  assert.ok(renderedTwoP.includes('<p class="manual-p">Paragraph 1 text.</p>'), `Missing first paragraph`);
  assert.ok(renderedTwoP.includes('<p class="manual-p">Paragraph 2 text.</p>'), `Missing second paragraph`);
  console.log(`  ✓ Paragraph breaks on double newline working cleanly`);

  console.log(`[Test] ${label}: --- renders as <hr class="manual-hr" /> and NOT as literal text '---'`);
  const hrResult = helper.renderMarkdown("Some text\n\n---\n\nOther text");
  assert.ok(hrResult.includes('<hr class="manual-hr" />'), `Expected <hr class="manual-hr" />, got: ${hrResult}`);
  assert.ok(!hrResult.includes('<p class="manual-p">---</p>'), `Literal --- was rendered in <p>: ${hrResult}`);
  console.log(`  ✓ Horizontal rule (---) correctly rendered as <hr>`);

  console.log(`[Test] ${label}: headings do NOT have literal '#' rendered as text`);
  const headingResult = helper.renderMarkdown("# Main Heading Title");
  assert.ok(!headingResult.includes('class="manual-anchor">#</a>'), `Heading should not have visible # character`);
  assert.ok(headingResult.includes('<h1 id="main-heading-title" class="manual-h1">Main Heading Title</h1>'), `Heading format mismatch: ${headingResult}`);
  console.log(`  ✓ Headings do not show literal '#' character`);

  console.log(`[Test] ${label}: Table of Contents does not contain double-escaped &amp;`);
  const parsedManual = helper.parseMarkdown("## Staff & User Operation Manual");
  assert.strictEqual(parsedManual.toc[0].text, "Staff & User Operation Manual", `TOC text should be clean string, got: ${parsedManual.toc[0].text}`);
  console.log(`  ✓ Table of Contents displays clean '&' without double-escaping`);
}

testMarkdownLineBreaks(fullstackMd, 'Full-Stack MarkdownHelper');
testMarkdownLineBreaks(standaloneMd, 'Standalone MarkdownHelper');

// 2. Test Version 2.6.5 parity across all package.json files
console.log('\n[Test] Verifying Version 2.6.5 synchronization across package.json files:');
const packages = [
  { name: 'lis-fullstack', file: '../lis-fullstack/package.json' },
  { name: 'lis-app-standalone', file: '../lis-app-standalone/package.json' },
  { name: 'lis-tray', file: '../lis-fullstack/tray/package.json' },
  { name: 'lis-mobile', file: '../lis-mobile/package.json' },
];

for (const pkg of packages) {
  const fullPath = path.resolve(__dirname, pkg.file);
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  assert.strictEqual(data.version, '2.6.5', `Expected ${pkg.name} version to be 2.6.5, got: ${data.version}`);
  console.log(`  ✓ ${pkg.name}: v${data.version}`);
}

// 3. Test User Manual version header
console.log('\n[Test] Verifying USER_MANUAL.md version header:');
const manualPath = path.resolve(__dirname, '../docs/USER_MANUAL.md');
const manualContent = fs.readFileSync(manualPath, 'utf8');
assert.ok(manualContent.includes('Version 2.6.5'), 'USER_MANUAL.md missing Version 2.6.5');
console.log('  ✓ docs/USER_MANUAL.md is Version 2.6.5');

// 4. Test GezyneBot service prompt
console.log('\n[Test] Verifying GezyneBot service prompt:');
const gezyneBotFile = path.resolve(__dirname, '../lis-fullstack/lib/gezyneBotService.js');
const botContent = fs.readFileSync(gezyneBotFile, 'utf8');
assert.ok(botContent.includes('Version 2.6.5'), 'gezyneBotService.js missing Version 2.6.5');
assert.ok(botContent.includes('PhilHealth & Health Card / HMO Claims'), 'gezyneBotService.js missing PhilHealth/HMO context');
assert.ok(botContent.includes('Comprehensive Ultrasound Reporting Suite'), 'gezyneBotService.js missing Ultrasound context');
assert.ok(botContent.includes('MM/DD/YYYY'), 'gezyneBotService.js missing MM/DD/YYYY context');
console.log('  ✓ GezyneBot service prompt updated with v2.6.5, PhilHealth/HMO, Ultrasound, and MM/DD/YYYY');

console.log('\n🎉 ALL MARKDOWN LINE BREAK & VERSION 2.6.5 TESTS PASSED!\n');
