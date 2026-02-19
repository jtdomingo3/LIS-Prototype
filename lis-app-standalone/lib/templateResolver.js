/**
 * Shared helper to determine which EJS result template to use for a given test.
 * Extracted so both routes/reports.js and lib/reportGenerator.js can use it
 * without circular dependencies.
 */

function getResultTemplate(test) {
  const type = (test && test.testType ? String(test.testType) : '').toLowerCase();
  let template = 'blood-chemistry';

  if (type.includes('fecal occult') || type.includes('fecal-occult') || type.includes('fecaloccult')) {
    template = 'fecal-occult-blood';
  } else if (type.includes('fecal') || type.includes('fecalysis')) {
    template = 'fecalysis';
  } else if (type.includes('urinal') || type.includes('urinalysis')) {
    template = 'urinalysis';
  } else if (type.includes('blood typing') || type.includes('blood-typing') || type.includes('bloodtyping')) {
    template = 'blood-typing';
  } else if (type.includes('pregnan') || type.includes('pregnancy')) {
    template = 'pregnancy-test';
  } else if (type.includes('drug') || type.includes('drugtest')) {
    template = 'drugtest';
  } else if (type.includes('dengue')) {
    template = 'dengue-duo';
  } else if (type.includes('esr') || type.includes('erythrocyte') || type.includes('erythrocyte sedimentation')) {
    template = 'esr';
  } else if (type.includes('lipid') || type.includes('lipid profile') || type.includes('lipid-profile')) {
    template = 'blood-chemistry-lipid-profile';
  } else if (type.includes('ecg') || type.includes('electrocardio') || type.includes('electrocardiogram')) {
    template = 'ecg';
  } else if (type.includes('echo') || type.includes('echocardiograph') || type.includes('echocardiography') || /2d\s*echo/.test(type)) {
    template = 'echocardiography-2d';
  } else if (type.includes('albumin') || type.includes('\balb\b')) {
    template = 'blood-chemistry-albumin';
  } else if (type.includes('sgpt') || type.includes('sgot') || /sgpt\s*\/?\s*sgot/.test(type) || type.includes('sgpt sgot')) {
    template = 'blood-chemistry-sgpt-sgot';
  } else if (type.includes('electrolyte') || type.includes('electrolytes') || type.includes('sodium') || type.includes('potassium') || type.includes('chloride')) {
    template = 'blood-chemistry-electrolytes';
  } else if (type.includes('bun') || type.includes('creatinine') || type.includes('crea')) {
    template = 'blood-chemistry-bun-crea';
  } else if (/blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour/.test(type)) {
    template = 'blood-chemistry-blood-sugar';
  } else if (type.includes('hba1c') || type.includes('hb a1c') || type.includes('hb-a1c') || type.includes('hba 1c')) {
    template = 'blood-chemistry-hba1c';
  } else if (type.includes('bleeding') || type.includes('clotting') || type.includes('ct & bt') || type.includes('ct & bt') || type.includes('ct') && type.includes('bt')) {
    template = 'ct-bt';
  } else if (/\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/.test(type)) {
    template = 'pt-aptt';
  } else if (type.includes('blood') || type.includes('chem')) {
    template = 'blood-chemistry';
  } else if (type.includes('xray') || type.includes('x-ray') || type.includes('x ray')) {
    template = 'xray';
  } else if (type.includes('hemato') || type.includes('hematology') || type.includes('cbc')) {
    template = 'hematology';
  } else if (type.includes('thyroid') || type.includes('thyroid panel') || type.includes('thyroid-panel')) {
    template = 'thyroid-panel';
  } else if (type.includes('serol') || type.includes('serology')) {
    template = 'serology';
  } else if (type.includes('ultrasound-abd-kubp-hbt') || type.includes('ultrasound abd kubp hbt')) {
    template = 'ultrasound-abd-kubp-hbt';
  } else if (/(?:1st|first|2nd|second|3rd|third|trimester)/i.test(type)) {
    template = 'ultrasound-1st-trimester-obstetrics';
  } else if (type.includes('transvaginal') || type.includes('ultrasound-transvaginal')) {
    template = 'ultrasound-transvaginal';
  } else if (type.includes('pelvic-biometry') || type.includes('pelvic biometry') || type.includes('ultrasound-pelvic-biometry') || /pelvic[_\-\s]?biometry/.test(type)) {
    template = 'ultrasound-pelvic-biometry';
  } else if (type.includes('pelvic') || type.includes('ultrasound-pelvic')) {
    template = 'ultrasound-pelvic';
  } else if (type.includes('biophysical') || type.includes('ultrasound-biophysical')) {
    template = 'ultrasound-biophysical';
  }

  // Allow overriding with explicit `template` field on test
  if (test && test.template && typeof test.template === 'string') {
    template = test.template;
  }

  return template;
}

module.exports = { getResultTemplate };
