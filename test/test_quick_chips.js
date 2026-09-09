const fs = require('fs');

const files = [
  './lis-fullstack/views/chatbot/index.ejs',
  './lis-app-standalone/views/chatbot/index.ejs',
  './lis-fullstack/views/partials/gezynebot-widget.ejs',
  './lis-app-standalone/views/partials/gezynebot-widget.ejs'
];

let allPassed = true;

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const chipMatches = content.match(/class="(?:main-chip|gezynebot-chip)"[^>]*>/g) || [];
  console.log(`${f} -> Chips count: ${chipMatches.length}`);
  if (chipMatches.length !== 6) {
    console.error(`  FAIL: Expected 6 chips in ${f}, found ${chipMatches.length}`);
    allPassed = false;
  } else {
    console.log(`  PASS: Exactly 6 chips found.`);
  }

  const hasOnclick = chipMatches.every(c => c.includes('onclick='));
  if (!hasOnclick) {
    console.error(`  FAIL: Not all chips have onclick in ${f}`);
    allPassed = false;
  } else {
    console.log(`  PASS: All chips contain inline onclick handlers.`);
  }

  if (f.includes('chatbot/index.ejs')) {
    const hasGlobal = content.includes('window.handleQuickChipClick');
    const hasInit = content.includes('initChatbot');
    if (!hasGlobal || !hasInit) {
      console.error(`  FAIL: Missing global handler or initChatbot in ${f}`);
      allPassed = false;
    } else {
      console.log(`  PASS: Global handleQuickChipClick and safe initChatbot present.`);
    }
  }

  if (f.includes('gezynebot-widget.ejs')) {
    const hasGlobalWidget = content.includes('window.handleWidgetChipClick');
    if (!hasGlobalWidget) {
      console.error(`  FAIL: Missing global handleWidgetChipClick in ${f}`);
      allPassed = false;
    } else {
      console.log(`  PASS: Global handleWidgetChipClick present.`);
    }
  }
});

if (allPassed) {
  console.log('\n🎉 ALL 4 VIEWS PASSED QUICK QUERY 6-OPTION VERIFICATION (100%)!');
  process.exit(0);
} else {
  console.error('\n❌ VERIFICATION FAILED.');
  process.exit(1);
}
