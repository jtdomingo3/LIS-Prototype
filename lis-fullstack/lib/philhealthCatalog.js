/**
 * PhilHealth Test Catalog
 * Single source of truth for all PhilHealth-accredited laboratory procedures.
 * Only these 13 procedures are allowed for PhilHealth patients.
 */

const PHILHEALTH_CATALOG = [
  {
    itemNo: 1,
    key: 'cbc',
    label: 'CBC w/ platelet count',
    category: 'Hematology',
    isBloodChem: false,
    forSendOut: false,
    targetArea: 'Extraction Area',
    defaultRemarks: '',
    requiresRemarks: false,
    badgeText: 'Hematology',
    badgeColor: '#0284c7',
    aliases: ['cbc', 'cbc (hematology)', 'complete blood count (cbc)', 'cbc w/ platelet count']
  },
  {
    itemNo: 2,
    key: 'lipid_profile',
    label: 'Lipid profile (Total Cholesterol, HDL and LDL Cholesterol, Triglycerides)',
    category: 'Blood Chemistry',
    isBloodChem: true,
    forSendOut: false,
    targetArea: 'Extraction Area',
    defaultRemarks: 'Blood Chemistry',
    requiresRemarks: false,
    badgeText: 'Blood Chemistry',
    badgeColor: '#d97706',
    aliases: ['lipid_profile', 'lipid profile', 'lipid profile (total cholesterol, hdl, ldl, triglycerides)']
  },
  {
    itemNo: 3,
    key: 'fbs',
    label: 'Fasting Blood Sugar',
    category: 'Blood Chemistry',
    isBloodChem: true,
    forSendOut: false,
    targetArea: 'Extraction Area',
    defaultRemarks: 'Blood Chemistry',
    requiresRemarks: false,
    badgeText: 'Blood Chemistry',
    badgeColor: '#d97706',
    aliases: ['fbs', 'fasting blood sugar', 'fasting blood sugar (fbs)']
  },
  {
    itemNo: 4,
    key: 'ogtt',
    label: 'Oral Glucose Tolerance Test',
    category: 'Blood Chemistry',
    isBloodChem: true,
    forSendOut: false,
    targetArea: 'Extraction Area',
    defaultRemarks: 'Blood Chemistry',
    requiresRemarks: false,
    badgeText: 'Blood Chemistry',
    badgeColor: '#d97706',
    aliases: ['ogtt', 'oral glucose tolerance', 'oral glucose tolerance (ogtt)', 'oral glucose tolerance test']
  },
  {
    itemNo: 5,
    key: 'hba1c',
    label: 'HbA1C',
    category: 'Blood Chemistry',
    isBloodChem: true,
    forSendOut: false,
    targetArea: 'Extraction Area',
    defaultRemarks: 'Blood Chemistry',
    requiresRemarks: false,
    badgeText: 'Blood Chemistry',
    badgeColor: '#d97706',
    aliases: ['hba1c', 'hba1c']
  },
  {
    itemNo: 6,
    key: 'creatinine',
    label: 'Creatinine',
    category: 'Blood Chemistry',
    isBloodChem: true,
    forSendOut: false,
    targetArea: 'Extraction Area',
    defaultRemarks: 'Blood Chemistry',
    requiresRemarks: false,
    badgeText: 'Blood Chemistry',
    badgeColor: '#d97706',
    aliases: ['creatinine']
  },
  {
    itemNo: 7,
    key: 'chest_xray',
    label: 'Chest X-Ray',
    category: 'Imaging',
    isBloodChem: false,
    forSendOut: false,
    targetArea: 'X-ray',
    defaultRemarks: '',
    requiresRemarks: false,
    badgeText: 'Imaging',
    badgeColor: '#4f46e5',
    aliases: ['chest_xray', 'chest x-ray', 'chest x-ray (pa)', 'chest xray']
  },
  {
    itemNo: 8,
    key: 'sputum_microscopy',
    label: 'Sputum Microscopy',
    category: 'Send-out',
    isBloodChem: false,
    forSendOut: true,
    targetArea: 'Sendout',
    defaultRemarks: '',
    requiresRemarks: true,
    badgeText: 'Send-out',
    badgeColor: '#dc2626',
    aliases: ['sputum_microscopy', 'sputum microscopy', 'sputum microscopy (send-out)']
  },
  {
    itemNo: 9,
    key: 'ecg',
    label: 'ECG',
    category: 'Cardiac',
    isBloodChem: false,
    forSendOut: false,
    targetArea: 'ECG',
    defaultRemarks: '',
    requiresRemarks: false,
    badgeText: 'Cardiac',
    badgeColor: '#059669',
    aliases: ['ecg', 'electrocardiogram']
  },
  {
    itemNo: 10,
    key: 'urinalysis',
    label: 'Urinalysis',
    category: 'Clinical Microscopy',
    isBloodChem: false,
    forSendOut: false,
    targetArea: 'Awaiting',
    defaultRemarks: '',
    requiresRemarks: false,
    badgeText: 'Clinical Microscopy',
    badgeColor: '#0891b2',
    aliases: ['urinalysis']
  },
  {
    itemNo: 11,
    key: 'pap_smear',
    label: 'Pap smear',
    category: 'Send-out',
    isBloodChem: false,
    forSendOut: true,
    targetArea: 'Sendout',
    defaultRemarks: '',
    requiresRemarks: true,
    badgeText: 'Send-out',
    badgeColor: '#dc2626',
    aliases: ['pap_smear', 'pap smear', 'pap smear (send-out)']
  },
  {
    itemNo: 12,
    key: 'fecalysis',
    label: 'Fecalysis',
    category: 'Clinical Microscopy',
    isBloodChem: false,
    forSendOut: false,
    targetArea: 'Awaiting',
    defaultRemarks: '',
    requiresRemarks: false,
    badgeText: 'Clinical Microscopy',
    badgeColor: '#0891b2',
    aliases: ['fecalysis', 'stool examination']
  },
  {
    itemNo: 13,
    key: 'fobt',
    label: 'Fecal Occult Blood Test',
    category: 'Clinical Microscopy',
    isBloodChem: false,
    forSendOut: false,
    targetArea: 'Awaiting',
    defaultRemarks: '',
    requiresRemarks: false,
    badgeText: 'Clinical Microscopy',
    badgeColor: '#0891b2',
    aliases: ['fobt', 'fecal occult blood test']
  }
];

function getCatalog() {
  return PHILHEALTH_CATALOG.map(item => ({ ...item }));
}

function getProcedureByKey(key) {
  if (!key) return null;
  const kLower = String(key).toLowerCase().trim();
  return PHILHEALTH_CATALOG.find(p => 
    p.key.toLowerCase() === kLower ||
    p.label.toLowerCase() === kLower ||
    (p.aliases && p.aliases.some(a => a.toLowerCase() === kLower))
  ) || null;
}

function isValidProcedureKey(key) {
  return !!getProcedureByKey(key);
}

function normalizeProcedure(proc) {
  if (!proc) return null;
  const key = typeof proc === 'string' ? proc : (proc.key || proc.procedureKey);
  const labelStr = typeof proc === 'object' && proc.label ? String(proc.label).trim() : '';
  const cat = getProcedureByKey(key) || getProcedureByKey(labelStr);
  if (!cat) {
    return typeof proc === 'object' ? proc : { key: String(proc), label: String(proc) };
  }
  let remarks = (proc && proc.remarks) ? String(proc.remarks).trim() : '';
  if (remarks === 'Blood Chemistry' || remarks.startsWith('Blood Chemistry') || remarks.startsWith('For Send Out')) {
    remarks = '';
  }
  return {
    itemNo: cat.itemNo,
    key: cat.key,
    label: cat.label,
    category: cat.category,
    forSendOut: cat.forSendOut,
    targetArea: cat.targetArea,
    remarks: remarks
  };
}

function normalizeProcedures(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map(normalizeProcedure)
    .filter(Boolean)
    .sort((a, b) => (a.itemNo || 99) - (b.itemNo || 99));
}

module.exports = {
  PHILHEALTH_CATALOG,
  getCatalog,
  getProcedureByKey,
  isValidProcedureKey,
  normalizeProcedure,
  normalizeProcedures
};
