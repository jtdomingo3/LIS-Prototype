const fs = require('fs');
const path = require('path');
const file = fs.readFileSync('routes/templates.js', 'utf8');

const match = file.match(/async function getStaticResultTemplates\(\) \{([\s\S]*?)\n\}/);
if (match) {
  const funcBody = match[1];
  const evalFunc = new Function('require', 'path', '__dirname', 'fs', `
    return (async function getStaticResultTemplates() {
      ${funcBody}
    })();
  `);
  
  evalFunc(require, path, path.join(__dirname, 'routes'), fs).then(templates => {
    console.log("Returned templates length:", templates.length);
    console.log("ct-bt template:", templates.find(t => t.id === 'static:ct-bt.ejs'));
  }).catch(err => {
    console.error("Error:", err);
  });
} else {
  console.log("Function not found");
}
