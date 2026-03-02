// Test patient matching for ROMEO FELICIA test
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
  if (!setCookie) {
    console.error('No session cookie received');
    return;
  }
  
  const cookieHeader = setCookie.split(/,\s*/).map(c => c.split(';')[0]).join('; ');
  
  // Fetch capture data for ROMEO FELICIA test
  const testId = '43e95cb5-d95f-496b-b3e2-df30d1bb0d24';
  const cap = await fetch(base + `/tests/${testId}/analyzer/capture`, {
    headers: { Cookie: cookieHeader }
  });
  const json = await cap.json();
  
  console.log('\n=== RESPONSE SUMMARY ===');
  console.log('Patients count:', json.patients ? json.patients.length : 0);
  console.log('Rows count:', json.rows ? json.rows.length : 0);
  
  // Find 2026-01-23 data
  const jan23Rows = json.rows.filter(r => r.DATE && r.DATE.startsWith('2026-01-23'));
  console.log('\n=== 2026-01-23 DATA ===');
  console.log('Rows for 2026-01-23:', jan23Rows.length);
  
  if (jan23Rows.length > 0) {
    console.log('\nSample rows:');
    jan23Rows.slice(0, 5).forEach(r => {
      console.log(`  ${r.ITEM}: ${r.RESULT} (PATIENT_ID: ${r.PATIENT_ID})`);
    });
    
    // Get unique patient IDs for this date
    const patientIds = [...new Set(jan23Rows.map(r => r.PATIENT_ID).filter(Boolean))];
    console.log('\nUnique PATIENT_IDs for 2026-01-23:', patientIds);
    
    // Find matching patients
    console.log('\n=== PATIENT MATCHING TEST ===');
    patientIds.forEach(pid => {
      console.log(`\nLooking for patient ID: ${pid}`);
      console.log(`  ID type: ${typeof pid}`);
      console.log(`  ID value: "${pid}"`);
      
      const matchingPatient = json.patients.find(p => {
        if (!p.row || !p.row.ID) return false;
        const rowId = String(p.row.ID);
        const pidStr = String(pid);
        const matches = rowId === pidStr;
        if (matches) {
          console.log(`  ✓ MATCH: "${rowId}" === "${pidStr}"`);
        }
        return matches;
      });
      
      if (matchingPatient) {
        console.log(`  ✓ FOUND patient:`);
        console.log(`    Name: ${matchingPatient.row.FIRST_NAME}`);
        console.log(`    Age: ${matchingPatient.row.AGE}`);
        console.log(`    Sex: ${matchingPatient.row.SEX}`);
        console.log(`    Table: ${matchingPatient.table}`);
      } else {
        console.log(`  ✗ NOT FOUND in patients array`);
        console.log('\n  Checking all patient IDs in response (first 10):');
        json.patients.slice(0, 10).forEach((p, idx) => {
          if (p.row && p.row.ID) {
            console.log(`    ${idx + 1}. ID: "${p.row.ID}" Name: "${p.row.FIRST_NAME || '(no name)'}"`);
          }
        });
      }
    });
  } else {
    console.log('\n✗ No rows found for 2026-01-23');
    console.log('\nAvailable dates (first 20):');
    const dates = [...new Set(json.rows.map(r => r.DATE).filter(Boolean))].sort();
    console.log(dates.slice(0, 20));
  }
  
  // Check if 202601230014 is in the patients array
  console.log('\n=== CHECKING FOR TARGET PATIENT 202601230014 ===');
  const targetPatient = json.patients.find(p => 
    p.row && String(p.row.ID) === '202601230014'
  );
  if (targetPatient) {
    console.log('✓ FOUND in patients array:');
    console.log('  Name:', targetPatient.row.FIRST_NAME);
    console.log('  Age:', targetPatient.row.AGE);
    console.log('  Sex:', targetPatient.row.SEX);
    console.log('  ID:', targetPatient.row.ID);
    console.log('  ID type:', typeof targetPatient.row.ID);
    console.log('  Table:', targetPatient.table);
  } else {
    console.log('✗ NOT FOUND in patients array');
    console.log('\nAll 202601 patient IDs in response:');
    const jan26Patients = json.patients.filter(p => 
      p.row && p.row.ID&& String(p.row.ID).startsWith('202601')
    );
    jan26Patients.forEach(p => {
      console.log(`  ${p.row.ID} - ${p.row.FIRST_NAME} (${p.table})`);
    });
  }
  
  // Check if there are any rows with PATIENT_ID = 202601230014
  console.log('\n=== ROWS WITH PATIENT_ID = 202601230014 ===');
  const targetRows = json.rows.filter(r => String(r.PATIENT_ID) === '202601230014');
  console.log('Count:', targetRows.length);
  if (targetRows.length > 0) {
    console.log('Sample rows:');
    targetRows.slice(0, 5).forEach(r => {
      console.log(`  ${r.DATE} - ${r.ITEM}: ${r.RESULT} (ID: ${r.PATIENT_ID}, type: ${typeof r.PATIENT_ID})`);
    });
  }
})();
