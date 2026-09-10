const assert = require('assert');
const path = require('path');

console.log('=== TESTING GEZYNEBOT KNOWLEDGE BASE COVERAGE (v2.6.0) ===\n');

const fullstackService = require('../lis-fullstack/lib/gezyneBotService');
const standaloneService = require('../lis-app-standalone/lib/gezyneBotService');
const trayService = require('../lis-fullstack/tray/lib/gezyneBotService');

const requiredKeywords = [
  'LIS Version 2.6.0',
  'Equipment & Levey-Jennings QC',
  'EQUIPMENT MANAGEMENT & LEVEY-JENNINGS QUALITY CONTROL',
  'Mindray BS-240',
  'Levey-Jennings',
  'Westgard Multi-Rule Evaluation',
  '1_2s Rule',
  '1_3s Rule',
  '2_2s Rule',
  'R_4s Rule',
  '4_1s Rule',
  '10_x Rule',
  'Drop / Delete Previous Run',
  'DOH Monthly QC Inspection Summary',
  'NATIONAL EXTERNAL QUALITY ASSESSMENT SCHEME (NEQAS)',
  'East Avenue Medical Center (EAMC)',
  'NRL-EOHTMA',
  'Drug Testing PT Surveys',
  'Cannabinoids / THC',
  'Methamphetamine / MET',
  'Standard Deviation Index (SDI)',
  'REAGENT & CLINICAL SUPPLY INVENTORY MANAGEMENT',
  'Open-Vial Stability',
  'USER MANAGEMENT & GRANULAR MODULE PERMISSIONS',
  'Equipment & QC (equipment)',
  'CLINICAL CONSULTATION & OUTPATIENT DOCTOR ENCOUNTERS',
  'DOH Philippine Package of Essential NCD Interventions (PhilPEN)',
  'Patient Medical Chart (/consultations/:testId/print/chart)',
  'Gezyne Clinical Laboratory & Medical Clinic'
];

const services = [
  { name: 'lis-fullstack', service: fullstackService },
  { name: 'lis-app-standalone', service: standaloneService },
  { name: 'lis-fullstack/tray', service: trayService }
];

services.forEach(({ name, service }) => {
  console.log(`[Testing Target] ${name}...`);
  // Check if buildKnowledgeContext is exportable or check queryOpenRouter system prompt
  // In our service file, buildKnowledgeContext is internal, but we can verify the source file directly
  const fs = require('fs');
  let filePath = '';
  if (name === 'lis-fullstack') filePath = path.join(__dirname, '../lis-fullstack/lib/gezyneBotService.js');
  if (name === 'lis-app-standalone') filePath = path.join(__dirname, '../lis-app-standalone/lib/gezyneBotService.js');
  if (name === 'lis-fullstack/tray') filePath = path.join(__dirname, '../lis-fullstack/tray/lib/gezyneBotService.js');

  const content = fs.readFileSync(filePath, 'utf8');

  requiredKeywords.forEach(kw => {
    assert(content.includes(kw), `[${name}] Missing required keyword in knowledge base: "${kw}"`);
  });
  console.log(`  ✓ All ${requiredKeywords.length} required knowledge keywords verified in ${name}`);
});

console.log('\n🎉 ALL GEZYNEBOT KNOWLEDGE BASE TESTS PASSED (100%)!\n');
