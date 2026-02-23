// use global fetch available in Node 18+
const base = 'http://localhost:3000';
(async () => {
  // login
  const loginResp = await fetch(base + '/login', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'email=admin%40lab.com&password=password123'
  });
  console.log('login status', loginResp.status);
  const setCookie = loginResp.headers.get('set-cookie');
  console.log('received set-cookie header', setCookie);
  if (!setCookie) return;
  // sometimes multiple cookies are comma-separated; split and keep name=value
  const cookieHeader = setCookie.split(/,\s*/).map(c => c.split(';')[0]).join('; ');
  // need a test id - let's fetch the list of tests to choose one
  const listResp = await fetch(base + '/tests', { headers: { Cookie: cookieHeader } });
  const html = await listResp.text();
  console.log('list length', html.length);
  // this just verifies login working - should not redirect back to login page
  const testId = '6fc99a17-6cf9-4ff9-be52-3592099bad46';
  if (testId && testId !== 'replace_with_test_id') {
    const cap = await fetch(base + `/tests/${testId}/analyzer/capture`, {
      headers: { Cookie: cookieHeader }
    });
    const json = await cap.json();
    console.log('capture resp', json);
  if (json.rows && json.rows.length) {
    const counts = {};
    json.rows.forEach(r => { const code = (r.ITEM||r.Item||r.item||'').toString().toUpperCase(); counts[code] = (counts[code]||0)+1; });
    console.log('item counts', counts);
    console.log('unique items', Object.keys(counts).sort());
  }
  }
})();