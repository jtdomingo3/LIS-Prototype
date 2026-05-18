"use strict";
/**
 * Shared helper to determine which result template to use for a given test.
 * Ported from lis-fullstack/lib/templateResolver.js
 *
 * BUG FIX: Specific test types (hematology, xray, thyroid, serology) are now
 * matched BEFORE the generic 'blood/chem' catch-all that was incorrectly
 * routing them to blood-chemistry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getResultTemplate = getResultTemplate;
function getResultTemplate(test) {
    const type = (test?.test_type ?? '').toLowerCase();
    let template = 'blood-chemistry';
    if (type.includes('fecal occult') || type.includes('fecal-occult') || type.includes('fecaloccult')) {
        template = 'fecal-occult-blood';
    }
    else if (type.includes('fecal') || type.includes('fecalysis')) {
        template = 'fecalysis';
    }
    else if (type.includes('urinal') || type.includes('urinalysis')) {
        template = 'urinalysis';
    }
    else if (type.includes('blood typing') || type.includes('blood-typing') || type.includes('bloodtyping')) {
        template = 'blood-typing';
    }
    else if (type.includes('pregnan') || type.includes('pregnancy')) {
        template = 'pregnancy-test';
    }
    else if (type.includes('drug') || type.includes('drugtest')) {
        template = 'drugtest';
    }
    else if (type.includes('dengue')) {
        template = 'dengue-duo';
    }
    else if (type.includes('esr') || type.includes('erythrocyte')) {
        template = 'esr';
    }
    else if (type.includes('lipid')) {
        template = 'blood-chemistry-lipid-profile';
    }
    else if (type.includes('ecg') || type.includes('electrocardio')) {
        template = 'ecg';
    }
    else if (type.includes('echo') || /2d\s*echo/.test(type)) {
        template = 'echocardiography-2d';
    }
    else if (type.includes('albumin')) {
        template = 'blood-chemistry-albumin';
    }
    else if (type.includes('sgpt') || type.includes('sgot')) {
        template = 'blood-chemistry-sgpt-sgot';
    }
    else if (type.includes('electrolyte')) {
        template = 'blood-chemistry-electrolytes';
    }
    else if (type.includes('bun') || type.includes('creatinine') || type.includes('crea')) {
        template = 'blood-chemistry-bun-crea';
    }
    else if (/blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour/.test(type)) {
        template = 'blood-chemistry-blood-sugar';
    }
    else if (type.includes('hba1c') || type.includes('hb a1c')) {
        template = 'blood-chemistry-hba1c';
    }
    else if (type.includes('bleeding') || type.includes('clotting') || type.includes('ct & bt') || (type.includes('ct') && type.includes('bt'))) {
        template = 'ct-bt';
    }
    else if (/\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/.test(type)) {
        template = 'pt-aptt';
        // ── Specific named types — MUST come BEFORE the generic 'blood/chem' catch-all ──
    }
    else if (type.includes('xray') || type.includes('x-ray') || type.includes('x ray')) {
        template = 'xray';
    }
    else if (type.includes('hemato') || type.includes('hematology') || type.includes('cbc')) {
        template = 'hematology';
    }
    else if (type.includes('thyroid')) {
        template = 'thyroid-panel';
    }
    else if (type.includes('serol') || type.includes('serology')) {
        template = 'serology';
    }
    else if (type.includes('ultrasound-abd-kubp-hbt') || type.includes('ultrasound abd kubp hbt')) {
        template = 'ultrasound-abd-kubp-hbt';
    }
    else if (/(?:1st|first|2nd|second|3rd|third|trimester)/i.test(type)) {
        template = 'ultrasound-1st-trimester-obstetrics';
    }
    else if (type.includes('transvaginal')) {
        template = 'ultrasound-transvaginal';
    }
    else if (/pelvic[_\-\s]?biometry/.test(type)) {
        template = 'ultrasound-pelvic-biometry';
    }
    else if (type.includes('pelvic')) {
        template = 'ultrasound-pelvic';
    }
    else if (type.includes('biophysical')) {
        template = 'ultrasound-biophysical';
        // ── Generic blood/chem fallback — LAST after all specific tests ──
    }
    else if (type.includes('blood') || type.includes('chem')) {
        template = 'blood-chemistry';
    }
    // Allow overriding with explicit template field
    if (test?.template && typeof test.template === 'string') {
        template = test.template;
    }
    return template;
}
//# sourceMappingURL=templateResolver.js.map