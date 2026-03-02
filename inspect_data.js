const fs=require('fs');
const d=JSON.parse(fs.readFileSync('lis-fullstack/data.json','utf8'));
console.log('keys',Object.keys(d));
if (d.tests && d.tests.length>0) {
  console.log('first test', d.tests[0]);
  console.log('sample id', d.tests[0].id, d.tests[0].testId);
} else { console.log('no tests'); }
