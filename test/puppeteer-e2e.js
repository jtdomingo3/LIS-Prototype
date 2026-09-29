const puppeteer = require('puppeteer');
const { getTestCredentials } = require('./test-auth-config');

async function runTests(port, name, credentials) {
  console.log(`\n=== Testing ${name} (Port ${port}) ===`);
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  try {
    // 1. Login
    console.log(`[${name}] Navigating to login...`);
    await page.goto(`http://127.0.0.1:${port}/login`, { waitUntil: 'networkidle2' });
    await page.type('#emailInput', credentials.email);
    await page.type('#passwordInput', credentials.password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('button[type="submit"]')
    ]);

    if (page.url().includes('login') || page.url() === `http://127.0.0.1:${port}/`) {
      console.log(`❌ [${name}] Login failed, redirected to: ${page.url()}`);
      await browser.close();
      return false;
    }
    
    console.log(`✅ [${name}] Login successful!`);
    
    // 2. Go to Patients
    await page.goto(`http://127.0.0.1:${port}/patients`, { waitUntil: 'networkidle2' });
    const bodyText1 = await page.evaluate(() => document.body.innerText);
    if (bodyText1.includes('Patient Management') || bodyText1.includes('Total Patients') || bodyText1.includes('Patients')) {
      console.log(`✅ [${name}] Patients page loaded successfully.`);
    } else {
      console.log(`❌ [${name}] Patients page missing expected text.`);
    }
    
    // 3. Go to Reception
    await page.goto(`http://127.0.0.1:${port}/reception`, { waitUntil: 'networkidle2' });
    const bodyText2 = await page.evaluate(() => document.body.innerText);
    if (bodyText2.includes('Reception') || bodyText2.includes('Queue')) {
      console.log(`✅ [${name}] Reception page loaded successfully.`);
    } else {
      console.log(`❌ [${name}] Reception page failed to load properly.`);
    }
    
    // 4. Go to Tests & Results
    await page.goto(`http://127.0.0.1:${port}/tests`, { waitUntil: 'networkidle2' });
    const bodyText3 = await page.evaluate(() => document.body.innerText);
    if (bodyText3.includes('Diagnostic Tests') || bodyText3.includes('Completed') || bodyText3.includes('Results') || bodyText3.includes('Test')) {
      console.log(`✅ [${name}] Tests & Results page loaded successfully.`);
    } else {
      console.log(`❌ [${name}] Tests & Results page missing expected text.`);
    }

    // 5. Go to Reports
    await page.goto(`http://127.0.0.1:${port}/reports`, { waitUntil: 'networkidle2' });
    const bodyText4 = await page.evaluate(() => document.body.innerText);
    if (bodyText4.includes('Report') || bodyText4.includes('Preview')) {
      console.log(`✅ [${name}] Reports page loaded successfully.`);
    } else {
      console.log(`❌ [${name}] Reports page failed to load properly.`);
    }

  } catch (e) {
    console.log(`❌ [${name}] Exception during test:`, e.message);
  } finally {
    await browser.close();
  }
}

(async () => {
  const credentials = getTestCredentials();
  await runTests(3000, 'Fullstack App', credentials);
  await runTests(30099, 'Standalone App', credentials);
  console.log('\n--- Automated E2E Regression Testing Complete ---');
})();
