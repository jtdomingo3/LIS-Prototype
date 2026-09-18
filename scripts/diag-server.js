const http = require('http');

const body = JSON.stringify({
  firstName: 'DIAG_TEST',
  lastName: 'DIAG_PATIENT',
  gender: 'Male',
  dateOfBirth: '1990-01-01'
});

const req = http.request('http://192.168.56.1:3000/patients', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-LIS-Sync-Replay': '1',
    'Accept': 'application/json'
  },
  timeout: 5000
}, (res) => {
  console.log('Status code:', res.statusCode);
  console.log('Headers:', res.headers);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log('Body:', data.slice(0, 300)));
});

req.on('error', (e) => console.error('Connection error:', e.message));
req.write(body);
req.end();
