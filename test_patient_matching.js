// Test script to verify patient matching logic
const https = require('https');
const http = require('http');

// Login first
const loginData = JSON.stringify({
  email: 'admin@lab.com',
  password: 'admin123'
});

const loginOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

console.log('Logging in...');
const loginReq = http.request(loginOptions, (loginRes) => {
  const cookies = loginRes.headers['set-cookie'];
  console.log('Login status:', loginRes.statusCode);
  
  // Consume the response body even if we don't need it
  loginRes.on('data', () => {});
  loginRes.on('end', () => {
    if (!cookies) {
      console.error('No cookies received');
      return;
    }
    
    const cookie = cookies[0].split(';')[0];
    console.log('Got session cookie');
    
    // Now fetch the capture endpoint for the ROMEO FELICIA test
    const testId = '43e95cb5-d95f-496b-b3e2-df30d1bb0d24'; // ROMEO FELICIA
    
    const captureOptions = {
      hostname: 'localhost',
      port: 3000,
      path: `/tests/${testId}/analyzer/capture`,
      method: 'GET',
      headers: {
        'Cookie': cookie
      }
    };
    
    console.log('\nFetching analyzer data...');
    const captureReq = http.request(captureOptions, (captureRes) => {
      console.log('Capture status:', captureRes.statusCode);
      let data = '';
      captureRes.on('data', chunk => data += chunk);
      captureRes.on('end', () => {
        if (captureRes.statusCode !== 200) {
          console.error('Unexpected status code:', captureRes.statusCode);
          console.error('Response:', data.substring(0, 200));
          return;
        }
        const json = JSON.parse(data);
      
      console.log('\n=== RESPONSE SUMMARY ===');
      console.log('Patients count:', json.patients ? json.patients.length : 0);
      console.log('Rows count:', json.rows ? json.rows.length : 0);
      
      // Find 2026-01-23 data
      const jan23Rows = json.rows.filter(r => r.DATE && r.DATE.startsWith('2026-01-23'));
      console.log('\n=== 2026-01-23 DATA ===');
      console.log('Rows for 2026-01-23:', jan23Rows.length);
      
      if (jan23Rows.length > 0) {
        console.log('\nSample rows:');
        jan23Rows.slice(0, 3).forEach(r => {
          console.log(`  ${r.ITEM}: ${r.RESULT} (PATIENT_ID: ${r.PATIENT_ID})`);
        });
        
        // Get unique patient IDs for this date
        const patientIds = [...new Set(jan23Rows.map(r => r.PATIENT_ID).filter(Boolean))];
        console.log('\nUnique PATIENT_IDs for 2026-01-23:', patientIds);
        
        // Find matching patients
        console.log('\n=== PATIENT MATCHING ===');
        patientIds.forEach(pid => {
          const matchingPatient = json.patients.find(p => 
            p.row && String(p.row.ID) === String(pid)
          );
          
          if (matchingPatient) {
            console.log(`✓ FOUND patient for ID ${pid}:`);
            console.log(`  Name: ${matchingPatient.row.FIRST_NAME}`);
            console.log(`  Age: ${matchingPatient.row.AGE}`);
            console.log(`  Sex: ${matchingPatient.row.SEX}`);
            console.log(`  Table: ${matchingPatient.table}`);
          } else {
            console.log(`✗ NOT FOUND patient for ID ${pid}`);
            console.log('  Checking patient IDs in response...');
            const sample = json.patients.slice(0, 5).map(p => 
              p.row ? `${p.row.ID} (${p.row.FIRST_NAME || 'no name'})` : 'no row'
            );
            console.log('  First 5 patient IDs:', sample);
          }
        });
      } else {
        console.log('No rows found for 2026-01-23');
        console.log('\nAvailable dates (first 10):');
        const dates = [...new Set(json.rows.map(r => r.DATE).filter(Boolean))];
        console.log(dates.slice(0, 10));
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
        console.log('  Table:', targetPatient.table);
      } else {
        console.log('✗ NOT FOUND in patients array');
      }
      
      // Check if there are any rows with PATIENT_ID = 202601230014
      const targetRows = json.rows.filter(r => String(r.PATIENT_ID) === '202601230014');
      console.log('\nRows with PATIENT_ID = 202601230014:', targetRows.length);
      if (targetRows.length > 0) {
        console.log('Sample:');
        targetRows.slice(0, 3).forEach(r => {
          console.log(`  ${r.DATE} - ${r.ITEM}: ${r.RESULT}`);
        });
      }
    });
  });
  
  captureReq.on('error', err => {
    console.error('Capture request error:', err);
  });
  
  captureReq.end();
  });
});

loginReq.on('error', err => {
  console.error('Login error:', err);
});

loginReq.write(loginData);
loginReq.end();
