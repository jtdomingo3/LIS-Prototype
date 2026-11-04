const assert = require('assert');
const path = require('path');

console.log('=== TESTING GEZYNEBOT KNOWLEDGE BASE COVERAGE (v3.0.0) ===\n');

const fullstackService = require('../lis-fullstack/lib/gezyneBotService');
const standaloneService = require('../lis-app-standalone/lib/gezyneBotService');
const trayService = require('../lis-fullstack/tray/lib/gezyneBotService');

const requiredKeywords = [
  'LIS Version 3.0.0',
  '1. Reception: Patient Intake, Queue Management & Test Packages',
  'Packages 1 to 6',
  '2. PhilHealth & Health Card (HMO) Claims Management',
  'PhilHealth Konsulta',
  '3. Phlebotomy & Thermal Barcode Printing',
  '4. Tests & Results: Clinical Laboratory, Analyzers & Ultrasound',
  'Estimated Fetal Weight (EFW)',
  '5. Reports: Generating, Previewing & Printing Official Results',
  '6. Digital Signatures: Setting Up Electronic Signatures',
  '7. Equipment & Quality Control: Levey-Jennings Charts & Westgard Rules',
  '8. NEQAS & Dynamic External Reference Laboratories',
  '9. Inventory & Clinical Supplies Management',
  '10. Doctor Consultations & Outpatient Encounters',
  '11. Human Resources (HR) & Philippine Statutory Payroll',
  '12. Costing & Profitability (P&L) Analytics',
  '13. System Settings, Printers & Standalone Synchronization',
  '14. GezyneBot AI Clinical Assistant',
  '15. Clinical Reference & Emergency Panic Values',
  '16. Philippine Clinical Date Formatting Standard',
  'MM/DD/YYYY'
];

const services = [
  { name: 'lis-fullstack', service: fullstackService },
  { name: 'lis-app-standalone', service: standaloneService },
  { name: 'lis-fullstack/tray', service: trayService }
];

services.forEach(({ name, service }) => {
  console.log(`[Testing Target] ${name}...`);
  const content = service.buildKnowledgeContext();
  assert.ok(content, `[${name}] Failed to build knowledge context`);

  requiredKeywords.forEach(kw => {
    assert.ok(content.includes(kw), `[${name}] Missing required keyword in knowledge base: "${kw}"`);
  });
  console.log(`  ✓ All ${requiredKeywords.length} required knowledge chapters and keywords verified in ${name}`);
});

console.log('\n🎉 ALL GEZYNEBOT KNOWLEDGE BASE TESTS PASSED (100%)!\n');
