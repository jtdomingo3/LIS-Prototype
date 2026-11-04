const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('=== Running Permissions & CSRF Protection Test Suite ===\n');

// 1. Verify permList in views/users/edit.ejs (fullstack & standalone)
['lis-fullstack', 'lis-app-standalone'].forEach(appDir => {
  const editEjsPath = path.join(__dirname, '..', appDir, 'views', 'users', 'edit.ejs');
  const editContent = fs.readFileSync(editEjsPath, 'utf8');
  assert.ok(
    editContent.includes("key: 'philhealth'") && editContent.includes("PhilHealth / Health Card"),
    `[${appDir}] views/users/edit.ejs must include 'philhealth' in permList`
  );
  assert.ok(
    editContent.includes("user.permissions.healthcard"),
    `[${appDir}] views/users/edit.ejs must check healthcard fallback`
  );
  console.log(`[Test] ${appDir} edit.ejs contains PhilHealth / Health Card permission checkbox`);
});

// 2. Verify permList in views/users/new.ejs (fullstack & standalone)
['lis-fullstack', 'lis-app-standalone'].forEach(appDir => {
  const newEjsPath = path.join(__dirname, '..', appDir, 'views', 'users', 'new.ejs');
  const newContent = fs.readFileSync(newEjsPath, 'utf8');
  assert.ok(
    newContent.includes("key: 'philhealth'") && newContent.includes("PhilHealth / Health Card"),
    `[${appDir}] views/users/new.ejs must include 'philhealth' in permList`
  );
  console.log(`[Test] ${appDir} new.ejs contains PhilHealth / Health Card permission checkbox`);
});

// 3. Verify show.ejs permLabels (fullstack & standalone)
['lis-fullstack', 'lis-app-standalone'].forEach(appDir => {
  const showEjsPath = path.join(__dirname, '..', appDir, 'views', 'users', 'show.ejs');
  const showContent = fs.readFileSync(showEjsPath, 'utf8');
  assert.ok(
    showContent.includes("philhealth: 'PhilHealth / Health Card") &&
    showContent.includes("healthcard: 'PhilHealth / Health Card"),
    `[${appDir}] views/users/show.ejs must include 'philhealth' in permLabels`
  );
  console.log(`[Test] ${appDir} show.ejs displays PhilHealth / Health Card privilege badge`);
});

// 4. Verify routes/users.js permissions parsing (fullstack & standalone)
['lis-fullstack', 'lis-app-standalone'].forEach(appDir => {
  const usersRoutePath = path.join(__dirname, '..', appDir, 'routes', 'users.js');
  const usersRouteContent = fs.readFileSync(usersRoutePath, 'utf8');
  assert.ok(
    usersRouteContent.includes("'philhealth'") && usersRouteContent.includes("'healthcard'"),
    `[${appDir}] routes/users.js must parse 'philhealth' and 'healthcard'`
  );
  assert.ok(
    usersRouteContent.includes("permissions.philhealth = true;") && usersRouteContent.includes("permissions.healthcard = true;"),
    `[${appDir}] routes/users.js must sync philhealth and healthcard flags`
  );
  console.log(`[Test] ${appDir} routes/users.js correctly saves philhealth/healthcard permissions`);
});

// 5. Verify server.js routePermissionMap & auth-guard
const serverJsPath = path.join(__dirname, '..', 'lis-fullstack', 'server.js');
const serverContent = fs.readFileSync(serverJsPath, 'utf8');
assert.ok(
  serverContent.includes("{ prefix: '/philhealth', perm: 'philhealth' }") &&
  serverContent.includes("{ prefix: '/healthcard', perm: 'philhealth' }"),
  "server.js routePermissionMap must map /philhealth and /healthcard to 'philhealth'"
);
assert.ok(
  serverContent.includes("mapping.perm === 'philhealth' && (perms.philhealth || perms.healthcard || perms.reception)"),
  "server.js auth guard must check perms.philhealth/perms.healthcard"
);
console.log('[Test] server.js routePermissionMap and auth-guard configured for philhealth');

// 6. Verify default admin accounts seeded with philhealth & healthcard
assert.ok(
  serverContent.includes("philhealth: true, healthcard: true"),
  "server.js default admin accounts must have philhealth: true, healthcard: true"
);
console.log('[Test] server.js default admin permissions include philhealth and healthcard');

// 7. Verify CSRF error handler in server.js does not crash with raw 403 string
assert.ok(
  serverContent.includes("[csrf] EBADCSRFTOKEN caught") &&
  !serverContent.includes("return res.status(403).send('Form tampered with or session expired (CSRF check failed).');"),
  "server.js must handle EBADCSRFTOKEN gracefully with redirect/flash rather than raw 403 text"
);
console.log('[Test] server.js handles CSRF token expiration gracefully');

// 8. Verify CSRF query param propagation in multipart forms
const editEjs = fs.readFileSync(path.join(__dirname, '..', 'lis-fullstack', 'views', 'users', 'edit.ejs'), 'utf8');
assert.ok(editEjs.includes('action="/users/<%= user.id %>?_method=PUT&_csrf='), "edit.ejs form action must include _csrf");

const profileEjs = fs.readFileSync(path.join(__dirname, '..', 'lis-fullstack', 'views', 'users', 'profile.ejs'), 'utf8');
assert.ok(profileEjs.includes('action="/users/profile?_method=PUT&_csrf='), "profile.ejs form action must include _csrf");

const layoutEjs = fs.readFileSync(path.join(__dirname, '..', 'lis-fullstack', 'views', 'layout.ejs'), 'utf8');
assert.ok(layoutEjs.includes("window.__CSRF_TOKEN__"), "layout.ejs must have global CSRF propagation helper");

console.log('[Test] Multipart forms and layout contain CSRF token propagation');

console.log('\n🎉 ALL PERMISSIONS AND CSRF TESTS PASSED!');
