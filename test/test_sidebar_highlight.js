const ejs = require('../lis-fullstack/node_modules/ejs');
const fs = require('fs');
const assert = require('assert');

['./lis-fullstack/views/layout.ejs', './lis-app-standalone/views/layout.ejs'].forEach(layoutPath => {
  const content = fs.readFileSync(layoutPath, 'utf8');
  
  // Test with title = 'System User Manual'
  const htmlManual = ejs.render(content, {
    title: 'System User Manual',
    sessionUser: { role: 'Admin', name: 'Admin User', email: 'admin@lab.com' },
    perms: { users: true },
    featureFlags: { users: true },
    body: '<div>Content</div>',
    script: '',
    style: '',
    csrfToken: 'test-token'
  }, { views: ['./lis-fullstack/views'] });
  
  const userAccMatch = htmlManual.match(/<a href="\/users" class="nav-item ([^"]*)"/);
  const manualMatch = htmlManual.match(/<a href="\/manual" class="nav-item ([^"]*)"/);
  
  console.log(layoutPath, 'ON /manual:');
  console.log('  User Accounts class:', JSON.stringify(userAccMatch ? userAccMatch[1].trim() : ''));
  console.log('  User Manual class  :', JSON.stringify(manualMatch ? manualMatch[1].trim() : ''));
  
  assert.ok(manualMatch && manualMatch[1].includes('active'), 'User Manual should be active on /manual');
  assert.ok(!userAccMatch || !userAccMatch[1].includes('active'), 'User Accounts must NOT be active on /manual');

  // Test with title = 'User Management'
  const htmlUsers = ejs.render(content, {
    title: 'User Management',
    sessionUser: { role: 'Admin', name: 'Admin User', email: 'admin@lab.com' },
    perms: { users: true },
    featureFlags: { users: true },
    body: '<div>Content</div>',
    script: '',
    style: '',
    csrfToken: 'test-token'
  }, { views: ['./lis-fullstack/views'] });
  
  const userAccMatch2 = htmlUsers.match(/<a href="\/users" class="nav-item ([^"]*)"/);
  const manualMatch2 = htmlUsers.match(/<a href="\/manual" class="nav-item ([^"]*)"/);
  
  console.log(layoutPath, 'ON /users:');
  console.log('  User Accounts class:', JSON.stringify(userAccMatch2 ? userAccMatch2[1].trim() : ''));
  console.log('  User Manual class  :', JSON.stringify(manualMatch2 ? manualMatch2[1].trim() : ''));
  
  assert.ok(userAccMatch2 && userAccMatch2[1].includes('active'), 'User Accounts should be active on /users');
  assert.ok(!manualMatch2 || !manualMatch2[1].includes('active'), 'User Manual must NOT be active on /users');
});

console.log('\n🎉 ALL SIDEBAR ACTIVE HIGHLIGHT TESTS PASSED (100%)!\n');
