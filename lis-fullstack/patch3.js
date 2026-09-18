const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'templates.js');
let content = fs.readFileSync(filePath, 'utf8');

const fieldsMapping = {
  'hematology.ejs': [
    { name: 'RBC ct.', type: 'text', required: false, normalValues: '3.8-5.8', unit: 'x 10^6/µL' },
    { name: 'Hemoglobin (Male)', type: 'text', required: false, normalValues: '130-160', unit: 'g/dL' },
    { name: 'Hemoglobin (Female)', type: 'text', required: false, normalValues: '120-140', unit: 'g/dL' },
    { name: 'Hematocrit (Male)', type: 'text', required: false, normalValues: '0.38-0.49', unit: '%' },
    { name: 'Hematocrit (Female)', type: 'text', required: false, normalValues: '0.36-0.44', unit: '%' },
    { name: 'MCV', type: 'text', required: false, normalValues: '83.0-98.0', unit: 'µm^3' },
    { name: 'MCH', type: 'text', required: false, normalValues: '27.0-32.2', unit: 'pg' },
    { name: 'MCHC', type: 'text', required: false, normalValues: '31.8-33.7', unit: 'g/dL' },
    { name: 'WBC ct.', type: 'text', required: false, normalValues: '5.0-10.0', unit: 'x10^9/L' },
    { name: 'Neutrophils', type: 'text', required: false, normalValues: '43.0-76.0', unit: '%' },
    { name: 'Lymphocyte', type: 'text', required: false, normalValues: '17.0-48.0', unit: '%' },
    { name: 'Monocyte', type: 'text', required: false, normalValues: '0-10.0', unit: '%' },
    { name: 'Eosinophils', type: 'text', required: false, normalValues: '0.5-5.0', unit: '%' },
    { name: 'Basophils', type: 'text', required: false, normalValues: '0-1', unit: '%' },
    { name: 'Platelet ct.', type: 'text', required: false, normalValues: '150-350', unit: 'x10^9/L' }
  ],
  'thyroid-panel.ejs': [
    { name: 'TSH', type: 'text', required: false, normalValues: '0.30 - 4.20', unit: 'mIU/L' },
    { name: 'FT4', type: 'text', required: false, normalValues: '12.0 - 22.0', unit: 'pmol/L' },
    { name: 'FT3', type: 'text', required: false, normalValues: '2.80 - 7.10', unit: 'pmol/L' }
  ],
  'pt-aptt.ejs': [
    { name: 'PT Patient', type: 'text', required: false, normalValues: '10.0-14.0 sec.' },
    { name: 'PT Activity', type: 'text', required: false, normalValues: '70-150 %' },
    { name: 'PT INR', type: 'text', required: false, normalValues: '1.0-1.3' },
    { name: 'APTT Patient', type: 'text', required: false, normalValues: '22.0-38.0 sec.' }
  ],
  'blood-chemistry-bun-crea.ejs': [
    { name: 'BUN', type: 'text', required: false, normalValues: '4.67 - 23.36', unit: 'mg/dL' },
    { name: 'Creatinine', type: 'text', required: false, normalValues: '0.50 - 1.00', unit: 'mg/dL' }
  ],
  'blood-chemistry-sgpt-sgot.ejs': [
    { name: 'SGPT (ALT)', type: 'text', required: false, normalValues: '0.00 - 32.00', unit: 'U/L' },
    { name: 'SGOT (AST)', type: 'text', required: false, normalValues: '0.00 - 31.00', unit: 'U/L' }
  ],
  'ultrasound-abd-kubp-hbt.ejs': [ { name: 'Examination', type: 'text' }, { name: 'Impression', type: 'text' } ],
  'echocardiography-2d.ejs': [ { name: 'Examination', type: 'text' }, { name: 'Impression', type: 'text' } ],
  'ultrasound-transvaginal.ejs': [ { name: 'Examination', type: 'text' }, { name: 'Impression', type: 'text' } ],
  'ultrasound-biophysical.ejs': [ { name: 'Examination', type: 'text' }, { name: 'Impression', type: 'text' } ],
  'ultrasound-1st-trimester-obstetrics.ejs': [ { name: 'Examination', type: 'text' }, { name: 'Impression', type: 'text' } ],
  'ultrasound-pelvic.ejs': [ { name: 'Examination', type: 'text' }, { name: 'Impression', type: 'text' } ],
  'ultrasound-pelvic-biometry.ejs': [ { name: 'Examination', type: 'text' }, { name: 'Impression', type: 'text' } ],
  'xray.ejs': [ { name: 'Examination', type: 'text' }, { name: 'Impression', type: 'text' } ],
  'urinalysis.ejs': [
    { name: 'Color', type: 'text' }, { name: 'Appearance', type: 'text' }, 
    { name: 'pH', type: 'text', normalValues: '5.0-7.0' }, { name: 'Specific Gravity', type: 'text', normalValues: '1.005-1.025' },
    { name: 'Glucose', type: 'text', normalValues: 'Negative' }, { name: 'Protein', type: 'text', normalValues: 'Negative' },
    { name: 'Leukocyte', type: 'text', normalValues: 'Negative' }, { name: 'Nitrite', type: 'text', normalValues: 'Negative' },
    { name: 'Urobilinogen', type: 'text', normalValues: 'Negative' }, { name: 'Blood', type: 'text', normalValues: 'Negative' },
    { name: 'Ketones', type: 'text', normalValues: 'Negative' }, { name: 'Bilirubin', type: 'text', normalValues: 'Negative' },
    { name: 'WBC', type: 'text', normalValues: '0-3 /hpf' }, { name: 'RBC', type: 'text', normalValues: '0-5 /hpf' },
    { name: 'Epithelial', type: 'text' }, { name: 'Mucus', type: 'text' },
    { name: 'Amorphous', type: 'text' }, { name: 'Bacteria', type: 'text' },
    { name: 'Others', type: 'text' }, { name: 'Note', type: 'text' }
  ],
  'fecalysis.ejs': [
    { name: 'Color', type: 'text' }, { name: 'Consistency', type: 'text' },
    { name: 'Pus Cell', type: 'text' }, { name: 'RBC', type: 'text' },
    { name: 'Parasites', type: 'text' }, { name: 'Others', type: 'text' }, { name: 'Note', type: 'text' }
  ],
  'esr.ejs': [
    { name: 'ESR Value', type: 'text', normalValues: 'Child:0-20, Male:0-10, Female:0-20 mm/hr' }
  ],
  'blood-typing.ejs': [
    { name: 'Specimen', type: 'text' }, { name: 'Result', type: 'text' }
  ],
  'serology.ejs': [
    { name: 'HBsAg', type: 'text' }, { name: 'Syphilis', type: 'text' }
  ],
  'pregnancy-test.ejs': [
    { name: 'Specimen', type: 'text' }, { name: 'Result', type: 'text' }
  ],
  'ct-bt.ejs': [
    { name: 'Bleeding Time', type: 'text' }, { name: 'Clotting Time', type: 'text' }
  ],
  'dengue-duo.ejs': [
    { name: 'NS1 Ag', type: 'text' }, { name: 'IgG', type: 'text' }, { name: 'IgM', type: 'text' }
  ],
  'drugtest.ejs': [
    { name: 'Methamphetamine', type: 'text' }, { name: 'Tetrahydrocannabinol', type: 'text' }
  ],
  'ecg.ejs': [
    { name: 'Rhythm', type: 'text' }, { name: 'Rate', type: 'text' }, { name: 'Impression', type: 'text' }
  ],
  'fecal-occult-blood.ejs': [
    { name: 'Result', type: 'text' }
  ]
};

// Insert the mapping object inside the files.map(f => {
const mapIndex = content.indexOf('return files.map(f => {');
if (mapIndex !== -1) {
  const insertStr = 'return files.map(f => {\\n      const defaultFieldsMapping = ' + JSON.stringify(fieldsMapping) + ';\\n';
  content = content.replace('return files.map(f => {', insertStr);
}

// Replace fields: [], with fields: defaultFieldsMapping[f] || [], but only between files.map(f => { and its closing brace.
// Since the entire static template list is in the map function, we can just replace 'fields: [],' globally
// with 'fields: (defaultFieldsMapping[f] || []),'.
// Wait, router.get('/new') also has fields, but it's not 'fields: [],'. It is 'fields: parsedFields,'
// Let's just do a regex replace for 'fields: [],' that is followed by 'createdAt: null'
content = content.replace(/fields:\s*\[\],\s*createdAt:\s*null/g, 'fields: (defaultFieldsMapping[f] || []),\n          createdAt: null');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched templates.js');
