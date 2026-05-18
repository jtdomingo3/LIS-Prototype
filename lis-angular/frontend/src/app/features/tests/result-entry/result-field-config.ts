/**
 * Field definitions for each test type result entry form.
 * Each test type maps to an array of sections, each with fields.
 * Field types: text, number, select, textarea
 */

export interface ResultField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  placeholder?: string;
  reference?: string;
  options?: string[];
  required?: boolean;
}

export interface ResultSection {
  title?: string;
  fields: ResultField[];
}

export type ResultFieldConfig = Record<string, ResultSection[]>;

const SEMI_QUANT = ['Negative', 'Trace', '+', '++', '+++', '++++'];

export const RESULT_FIELD_CONFIG: ResultFieldConfig = {
  hematology: [
    {
      title: 'CBC',
      fields: [
        { name: 'rbc', label: 'RBC (x10^6/µL)', type: 'text', placeholder: '3.8-5.8', reference: '3.8-5.8 x10^6/µL' },
        { name: 'hemoglobin', label: 'Hemoglobin (g/dL)', type: 'text', placeholder: 'M 130-160 / F 120-140', reference: 'Male 130-160, Female 120-140 g/dL' },
        { name: 'hematocrit', label: 'Hematocrit (%)', type: 'text', placeholder: 'M 0.38-0.49 / F 0.36-0.44', reference: 'Male 0.38-0.49, Female 0.36-0.44' },
        { name: 'mcv', label: 'MCV (fL)', type: 'text', placeholder: '83.0-98.0', reference: '83.0-98.0 fL' },
        { name: 'mch', label: 'MCH (pg)', type: 'text', placeholder: '27.0-32.2', reference: '27.0-32.2 pg' },
        { name: 'mchc', label: 'MCHC (g/dL)', type: 'text', placeholder: '31.8-33.7', reference: '31.8-33.7 g/dL' },
      ]
    },
    {
      title: 'Differential / Other',
      fields: [
        { name: 'wbc', label: 'WBC (x10^9/L)', type: 'text', placeholder: '5.0-10.0', reference: '5.0-10.0 x10^9/L' },
        { name: 'neutrophils', label: 'Neutrophils (%)', type: 'text', placeholder: '43.0-76.0', reference: '43.0-76.0%' },
        { name: 'lymphocyte', label: 'Lymphocyte (%)', type: 'text', placeholder: '17.0-48.0', reference: '17.0-48.0%' },
        { name: 'monocyte', label: 'Monocyte (%)', type: 'text', placeholder: '0-10.0', reference: '0-10.0%' },
        { name: 'eosinophils', label: 'Eosinophils (%)', type: 'text', placeholder: '0.5-5.0', reference: '0.5-5.0%' },
        { name: 'basophils', label: 'Basophils (%)', type: 'text', placeholder: '0-1', reference: '0-1%' },
        { name: 'platelets', label: 'Platelets (x10^9/µL)', type: 'text', placeholder: '150-350', reference: '150-350 x10^9/µL' },
      ]
    }
  ],

  urinalysis: [
    {
      title: 'Physical / Chemical',
      fields: [
        { name: 'color', label: 'Color', type: 'select', options: ['Yellow', 'Light Yellow', 'Dark Yellow', 'Amber', 'Red', 'Reddish Brown', 'Yellow Orange', 'Straw', 'Clear'] },
        { name: 'appearance', label: 'Transparency', type: 'select', options: ['Clear', 'Slightly Hazy', 'Hazy', 'Slightly Turbid', 'Turbid'] },
        { name: 'ph', label: 'pH', type: 'text', placeholder: '5.0-7.0', reference: '5.0-7.0' },
        { name: 'specificGravity', label: 'Specific Gravity', type: 'text', placeholder: '1.005-1.025', reference: '1.005-1.025' },
        { name: 'glucose', label: 'Glucose', type: 'select', options: SEMI_QUANT },
        { name: 'protein', label: 'Protein', type: 'select', options: SEMI_QUANT },
        { name: 'bilirubin', label: 'Bilirubin', type: 'select', options: SEMI_QUANT },
        { name: 'urobilinogen', label: 'Urobilinogen', type: 'select', options: ['Normal', ...SEMI_QUANT] },
        // key = 'leukocyte' (no 's') — matches renderer r.leukocyte
        { name: 'leukocyte', label: 'Leukocyte', type: 'select', options: SEMI_QUANT },
        { name: 'nitrite', label: 'Nitrite', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'ketones', label: 'Ketones', type: 'select', options: SEMI_QUANT },
        { name: 'blood', label: 'Blood', type: 'select', options: SEMI_QUANT },
      ]
    },
    {
      title: 'Microscopic',
      fields: [
        // keys match renderer: r.rbc, r.wbc, r.epithelial, r.mucus
        { name: 'rbc', label: 'RBC (/HPF)', type: 'text', placeholder: '0-3', reference: '0-3/HPF' },
        { name: 'wbc', label: 'WBC (/HPF)', type: 'text', placeholder: '0-5', reference: '0-5/HPF' },
        { name: 'epithelial', label: 'Epithelial Cells', type: 'text' },
        { name: 'mucus', label: 'Mucus Threads', type: 'text' },
        { name: 'bacteria', label: 'Bacteria', type: 'text' },
        { name: 'crystals', label: 'Crystals', type: 'text' },
        { name: 'casts', label: 'Casts', type: 'text' },
        { name: 'amorphous', label: 'Amorphous Crystals', type: 'text' },
        { name: 'yeastCells', label: 'Yeast Cells', type: 'text' },
        { name: 'others', label: 'Others', type: 'text' },
      ]
    }
  ],

  'blood chemistry': [
    {
      title: 'Blood Chemistry',
      fields: [
        { name: 'fbs', label: 'FBS (mg/dL)', type: 'text', placeholder: '70-100', reference: '70-100 mg/dL' },
        { name: 'rbs', label: 'RBS (mg/dL)', type: 'text', placeholder: '<140', reference: '<140 mg/dL' },
        { name: 'bun', label: 'BUN (mg/dL)', type: 'text', placeholder: '7-20', reference: '7-20 mg/dL' },
        { name: 'creatinine', label: 'Creatinine (mg/dL)', type: 'text', placeholder: 'M 0.7-1.3 / F 0.6-1.1', reference: 'Male 0.7-1.3, Female 0.6-1.1 mg/dL' },
        { name: 'uricAcid', label: 'Uric Acid (mg/dL)', type: 'text', placeholder: 'M 3.4-7.0 / F 2.4-5.7', reference: 'Male 3.4-7.0, Female 2.4-5.7 mg/dL' },
        { name: 'sgpt', label: 'SGPT / ALT (U/L)', type: 'text', placeholder: 'M 10-40 / F 7-35', reference: 'Male 10-40, Female 7-35 U/L' },
        { name: 'sgot', label: 'SGOT / AST (U/L)', type: 'text', placeholder: 'M 10-40 / F 9-32', reference: 'Male 10-40, Female 9-32 U/L' },
        { name: 'totalCholesterol', label: 'Total Cholesterol (mg/dL)', type: 'text', placeholder: '<200', reference: '<200 Desirable' },
        { name: 'triglycerides', label: 'Triglycerides (mg/dL)', type: 'text', placeholder: '<150', reference: '<150 Normal' },
        { name: 'hdl', label: 'HDL (mg/dL)', type: 'text', placeholder: '40-60', reference: '40-60 mg/dL' },
        { name: 'ldl', label: 'LDL (mg/dL)', type: 'text', placeholder: '<100', reference: '<100 Optimal' },
        { name: 'vldl', label: 'VLDL (mg/dL)', type: 'text', placeholder: '<30', reference: '<30 mg/dL' },
        { name: 'albumin', label: 'Albumin (g/dL)', type: 'text', placeholder: '3.5-5.5', reference: '3.5-5.5 g/dL' },
        { name: 'hba1c', label: 'HbA1c (%)', type: 'text', placeholder: '<5.7', reference: '<5.7% Normal' },
        { name: 'sodium', label: 'Sodium (mmol/L)', type: 'text', placeholder: '136-145', reference: '136-145 mmol/L' },
        { name: 'potassium', label: 'Potassium (mmol/L)', type: 'text', placeholder: '3.5-5.1', reference: '3.5-5.1 mmol/L' },
        { name: 'chloride', label: 'Chloride (mmol/L)', type: 'text', placeholder: '98-106', reference: '98-106 mmol/L' },
        { name: 'calcium', label: 'Calcium (mg/dL)', type: 'text', placeholder: '8.5-10.2', reference: '8.5-10.2 mg/dL' },
      ]
    }
  ],

  xray: [
    {
      fields: [
        { name: 'findings', label: 'Findings', type: 'textarea' },
        { name: 'impression', label: 'Impression', type: 'textarea' },
        { name: 'recommendation', label: 'Recommendation', type: 'textarea' },
      ]
    }
  ],

  ecg: [
    {
      fields: [
        { name: 'rate', label: 'Rate', type: 'text' },
        { name: 'rhythm', label: 'Rhythm', type: 'text' },
        { name: 'axis', label: 'Axis', type: 'text' },
        { name: 'pWave', label: 'P Wave', type: 'text' },
        { name: 'prInterval', label: 'PR Interval', type: 'text' },
        { name: 'qrsComplex', label: 'QRS Complex', type: 'text' },
        { name: 'stSegment', label: 'ST Segment', type: 'text' },
        { name: 'tWave', label: 'T Wave', type: 'text' },
        { name: 'interpretation', label: 'Interpretation', type: 'textarea' },
      ]
    }
  ],

  'drug test': [
    {
      fields: [
        { name: 'methamphetamine', label: 'Methamphetamine (Shabu)', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'thc', label: 'THC (Marijuana)', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'cocaine', label: 'Cocaine', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'benzodiazepine', label: 'Benzodiazepine', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'morphine', label: 'Morphine / Opiates', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'ecstasy', label: 'Ecstasy / MDMA', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'specimenValidity', label: 'Specimen Validity', type: 'select', options: ['Valid', 'Invalid', 'Substituted'] },
        { name: 'remarks', label: 'Remarks', type: 'textarea' },
      ]
    }
  ],

  fecalysis: [
    {
      title: 'Physical',
      fields: [
        { name: 'color', label: 'Color', type: 'select', options: ['Brown', 'Dark Brown', 'Light Brown', 'Yellow', 'Green', 'Black', 'Red'] },
        { name: 'consistency', label: 'Consistency', type: 'select', options: ['Formed', 'Semi-formed', 'Soft', 'Loose', 'Watery', 'Mucoid'] },
      ]
    },
    {
      title: 'Microscopic',
      fields: [
        { name: 'rbc', label: 'RBC (/hpf)', type: 'text' },
        { name: 'wbc', label: 'WBC (/hpf)', type: 'text' },
        { name: 'bacteria', label: 'Bacteria', type: 'text' },
        { name: 'fatGlobules', label: 'Fat Globules', type: 'text' },
        { name: 'yeastCells', label: 'Yeast Cells', type: 'text' },
        // key = 'ovaParasite' — matches renderer r.ovaParasite
        { name: 'ovaParasite', label: 'Ova / Parasite', type: 'text' },
        { name: 'ovaSpecies', label: 'Species (if any)', type: 'text' },
        { name: 'muscleFibers', label: 'Muscle Fibers', type: 'text' },
        { name: 'pusCells', label: 'Pus Cells', type: 'text' },
        { name: 'others', label: 'Others', type: 'text' },
      ]
    }
  ],

  serology: [
    {
      fields: [
        // keys match renderer keys: hbsag, antiHbs, antiHcv, antiHavIgm, vdrl, hiv, typhidotIgm, typhidotIgg, aso, rfLatex, crp
        { name: 'hbsag', label: 'HBsAg', type: 'select', options: ['Non-Reactive', 'Reactive'] },
        { name: 'antiHbs', label: 'Anti-HBs', type: 'select', options: ['Non-Reactive', 'Reactive'] },
        { name: 'antiHcv', label: 'Anti-HCV', type: 'select', options: ['Non-Reactive', 'Reactive'] },
        { name: 'antiHavIgm', label: 'Anti-HAV (IgM)', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'vdrl', label: 'VDRL / RPR', type: 'select', options: ['Non-Reactive', 'Reactive'] },
        { name: 'hiv', label: 'HIV Screening', type: 'select', options: ['Non-Reactive', 'Reactive'] },
        { name: 'typhidotIgm', label: 'Typhidot IgM', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'typhidotIgg', label: 'Typhidot IgG', type: 'select', options: ['Negative', 'Positive'] },
        { name: 'aso', label: 'ASO (Titer)', type: 'text' },
        { name: 'rfLatex', label: 'RF Latex', type: 'text' },
        { name: 'crp', label: 'CRP', type: 'text' },
        { name: 'remarks', label: 'Remarks', type: 'textarea' },
      ]
    }
  ],

  miscellaneous: [
    {
      fields: [
        { name: 'testName', label: 'Test Name', type: 'text' },
        { name: 'result', label: 'Result', type: 'textarea' },
        { name: 'referenceRange', label: 'Reference Range', type: 'text' },
        { name: 'remarks', label: 'Remarks', type: 'textarea' },
      ]
    }
  ],

  // Sub-types of blood chemistry
  'blood chemistry - blood sugar': [
    {
      fields: [
        { name: 'fbs', label: 'FBS (mg/dL)', type: 'text', placeholder: '70-100', reference: '70-100 mg/dL' },
        { name: 'rbs', label: 'RBS (mg/dL)', type: 'text', placeholder: '<140', reference: '<140 mg/dL' },
        { name: 'ogtt75g', label: 'OGTT 75g', type: 'text' },
        { name: 'ppbs', label: 'PPBS (2hr)', type: 'text' },
      ]
    }
  ],

  'blood chemistry - lipid profile': [
    {
      title: 'Lipid Profile',
      fields: [
        { name: 'totalCholesterol', label: 'Total Cholesterol (mg/dL)', type: 'text', placeholder: '<200', reference: '<200 Desirable' },
        { name: 'triglycerides', label: 'Triglycerides (mg/dL)', type: 'text', placeholder: '<150', reference: '<150 Normal' },
        { name: 'hdl', label: 'HDL (mg/dL)', type: 'text', placeholder: '40-60', reference: '40-60 mg/dL' },
        { name: 'ldl', label: 'LDL (mg/dL)', type: 'text', placeholder: '<100', reference: '<100 Optimal' },
        { name: 'vldl', label: 'VLDL (mg/dL)', type: 'text', placeholder: '<30', reference: '<30 mg/dL' },
      ]
    }
  ],

  'blood chemistry - bun/creatinine': [
    {
      fields: [
        { name: 'bun', label: 'BUN (mg/dL)', type: 'text', placeholder: '7-20', reference: '7-20 mg/dL' },
        { name: 'creatinine', label: 'Creatinine (mg/dL)', type: 'text', placeholder: 'M 0.7-1.3 / F 0.6-1.1', reference: 'Male 0.7-1.3, Female 0.6-1.1 mg/dL' },
      ]
    }
  ],

  'blood chemistry - sgpt/sgot': [
    {
      fields: [
        { name: 'sgpt', label: 'SGPT / ALT (U/L)', type: 'text', placeholder: 'M 10-40 / F 7-35', reference: 'Male 10-40, Female 7-35 U/L' },
        { name: 'sgot', label: 'SGOT / AST (U/L)', type: 'text', placeholder: 'M 10-40 / F 9-32', reference: 'Male 10-40, Female 9-32 U/L' },
      ]
    }
  ],

  'blood chemistry - hba1c': [
    {
      fields: [
        { name: 'hba1c', label: 'HbA1c (%)', type: 'text', placeholder: '<5.7', reference: '<5.7% Normal, 5.7-6.4% Pre-diabetic, ≥6.5% Diabetic' },
      ]
    }
  ],

  'blood chemistry - electrolytes': [
    {
      title: 'Electrolytes',
      fields: [
        { name: 'sodium', label: 'Sodium (mmol/L)', type: 'text', placeholder: '136-145', reference: '136-145 mmol/L' },
        { name: 'potassium', label: 'Potassium (mmol/L)', type: 'text', placeholder: '3.5-5.1', reference: '3.5-5.1 mmol/L' },
        { name: 'chloride', label: 'Chloride (mmol/L)', type: 'text', placeholder: '98-106', reference: '98-106 mmol/L' },
        { name: 'calcium', label: 'Calcium (mg/dL)', type: 'text', placeholder: '8.5-10.2', reference: '8.5-10.2 mg/dL' },
        { name: 'ionizedCalcium', label: 'Ionized Calcium (mmol/L)', type: 'text', placeholder: '1.12-1.32', reference: '1.12-1.32 mmol/L' },
      ]
    }
  ],

  'blood chemistry - albumin': [
    {
      fields: [
        { name: 'albumin', label: 'Albumin (g/dL)', type: 'text', placeholder: '3.5-5.5', reference: '3.5-5.5 g/dL' },
        { name: 'totalProtein', label: 'Total Protein (g/dL)', type: 'text', placeholder: '6.0-8.0', reference: '6.0-8.0 g/dL' },
        { name: 'globulin', label: 'Globulin (g/dL)', type: 'text', placeholder: '2.3-3.5', reference: '2.3-3.5 g/dL' },
        { name: 'agRatio', label: 'A/G Ratio', type: 'text', placeholder: '1.2-2.2', reference: '1.2-2.2' },
      ]
    }
  ],

  'blood typing': [
    {
      fields: [
        { name: 'bloodType', label: 'Blood Type (ABO)', type: 'select', options: ['A', 'B', 'AB', 'O'] },
        { name: 'rhFactor', label: 'Rh Factor', type: 'select', options: ['Positive', 'Negative'] },
      ]
    }
  ],

  'ct/bt': [
    {
      fields: [
        { name: 'clottingTime', label: 'Clotting Time', type: 'text', reference: '5-15 min' },
        { name: 'bleedingTime', label: 'Bleeding Time', type: 'text', reference: '1-5 min' },
      ]
    }
  ],

  'pt/aptt': [
    {
      fields: [
        { name: 'ptPatient', label: 'PT Patient (sec)', type: 'text' },
        { name: 'ptControl', label: 'PT Control (sec)', type: 'text' },
        { name: 'ptActivity', label: 'PT Activity (%)', type: 'text' },
        { name: 'inr', label: 'INR', type: 'text' },
        { name: 'apttPatient', label: 'APTT Patient (sec)', type: 'text' },
        { name: 'apttControl', label: 'APTT Control (sec)', type: 'text' },
      ]
    }
  ],

  esr: [
    {
      fields: [
        // key = 'esr' — matches renderer: r.esr
        { name: 'esr', label: 'ESR (mm/hr)', type: 'text', reference: 'Male 0-15, Female 0-20 mm/hr' },
        { name: 'method', label: 'Method', type: 'text', placeholder: 'Westergren' },
      ]
    }
  ],

  'thyroid panel': [
    {
      fields: [
        { name: 't3', label: 'T3 (ng/dL)', type: 'text', reference: '80-200 ng/dL' },
        { name: 't4', label: 'T4 (µg/dL)', type: 'text', reference: '4.5-12.0 µg/dL' },
        { name: 'tsh', label: 'TSH (mIU/L)', type: 'text', reference: '0.27-4.2 mIU/L' },
        { name: 'ft3', label: 'Free T3 (pg/mL)', type: 'text', reference: '2.0-4.4 pg/mL' },
        { name: 'ft4', label: 'Free T4 (ng/dL)', type: 'text', reference: '0.93-1.7 ng/dL' },
      ]
    }
  ],
};

/**
 * Get field config for a test type, falling back to miscellaneous
 */
export function getFieldConfig(testType: string): ResultSection[] {
  const lower = testType.toLowerCase().trim();
  return RESULT_FIELD_CONFIG[lower] || RESULT_FIELD_CONFIG['miscellaneous'];
}
