const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'routes', 'templates.js');
let content = fs.readFileSync(filePath, 'utf8');

const fieldsMapping = {
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
  ]
};

// First, fix the catch-all mapping at the end
const catchAllRegex = /const name = f\.replace\('\.ejs', ''\)\.replace\(\/-\/g, ' '\);\s*return {\s*id: `static:\$\{f\}`,\s*name: name\.charAt\(0\)\.toUpperCase\(\) \+ name\.slice\(1\),\s*testType: name,\s*fields: \[\],\s*createdAt: null,\s*isStatic: true,\s*filename: f\s*};/g;
const catchAllReplacement = `
      const name = f.replace('.ejs', '').replace(/-/g, ' ');
      // Apply known default fields if present, else empty
      const defaultFieldsMapping = ${JSON.stringify(fieldsMapping, null, 2)};
      const mappedFields = defaultFieldsMapping[f] || [];
      return {
        id: \`static:\$\{f\}\`,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        testType: name,
        fields: mappedFields,
        createdAt: null,
        isStatic: true,
        filename: f
      };
`;

content = content.replace(catchAllRegex, catchAllReplacement);

// Also update the hardcoded explicit ones that have fields: []
const explicitIfRegex = /if \(f === '([^']+)'\) \{\s*return \{\s*id: `static:\$\{f\}`,\s*name: '([^']+)',\s*testType: '([^']+)',\s*fields: \[\]/g;
content = content.replace(explicitIfRegex, (match, fName, tName, tType) => {
  if (fieldsMapping[fName]) {
    const fieldsStr = JSON.stringify(fieldsMapping[fName], null, 12).replace(/\n\s*/g, ' ');
    return `if (f === '${fName}') {\n        return {\n          id: \`static:\$\{f\}\`,\n          name: '${tName}',\n          testType: '${tType}',\n          fields: ${fieldsStr}`;
  }
  return match;
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully patched templates.js');
