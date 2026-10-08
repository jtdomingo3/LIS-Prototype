/**
 * HMO / Health Card Procedures Catalog
 * Unlike PhilHealth (which strictly limits to 13 Konsulta tests),
 * Philippine HMOs support almost all clinical laboratory, diagnostic,
 * cardiology, imaging, ultrasound, and send-out procedures authorized by LOA.
 */

const HMO_CATALOG = [
  // Hematology
  {
    key: 'cbc',
    label: 'CBC w/ Platelet Count',
    category: 'Hematology',
    targetArea: 'Extraction Area',
    defaultPrice: 350,
    forSendOut: false
  },
  {
    key: 'esr',
    label: 'Erythrocyte Sedimentation Rate (ESR)',
    category: 'Hematology',
    targetArea: 'Extraction Area',
    defaultPrice: 300,
    forSendOut: false
  },
  {
    key: 'blood_typing',
    label: 'Blood Typing (ABO / Rh)',
    category: 'Hematology',
    targetArea: 'Extraction Area',
    defaultPrice: 300,
    forSendOut: false
  },
  {
    key: 'ct_bt',
    label: 'Clotting Time & Bleeding Time (CT/BT)',
    category: 'Hematology',
    targetArea: 'Extraction Area',
    defaultPrice: 300,
    forSendOut: false
  },
  {
    key: 'pt_aptt',
    label: 'Prothrombin Time / APTT (PT/APTT)',
    category: 'Hematology',
    targetArea: 'Extraction Area',
    defaultPrice: 850,
    forSendOut: false
  },
  {
    key: 'pbs',
    label: 'Peripheral Blood Smear',
    category: 'Hematology',
    targetArea: 'Extraction Area',
    defaultPrice: 500,
    forSendOut: false
  },

  // Blood Chemistry
  {
    key: 'fbs',
    label: 'Fasting Blood Sugar (FBS)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 250,
    forSendOut: false
  },
  {
    key: 'rbs',
    label: 'Random Blood Sugar (RBS)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 250,
    forSendOut: false
  },
  {
    key: 'hba1c',
    label: 'HbA1c (Glycated Hemoglobin)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 850,
    forSendOut: false
  },
  {
    key: 'lipid_profile',
    label: 'Lipid Profile (Cholesterol, Triglycerides, HDL, LDL)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 850,
    forSendOut: false
  },
  {
    key: 'total_cholesterol',
    label: 'Total Cholesterol',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 300,
    forSendOut: false
  },
  {
    key: 'triglycerides',
    label: 'Triglycerides',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 300,
    forSendOut: false
  },
  {
    key: 'hdl_ldl',
    label: 'HDL / LDL Cholesterol',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 400,
    forSendOut: false
  },
  {
    key: 'bun',
    label: 'Blood Urea Nitrogen (BUN)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 300,
    forSendOut: false
  },
  {
    key: 'creatinine',
    label: 'Serum Creatinine',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 300,
    forSendOut: false
  },
  {
    key: 'bun_crea',
    label: 'BUN / Creatinine',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 550,
    forSendOut: false
  },
  {
    key: 'uric_acid',
    label: 'Blood Uric Acid (BUA)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 300,
    forSendOut: false
  },
  {
    key: 'sgpt',
    label: 'SGPT / ALT',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 350,
    forSendOut: false
  },
  {
    key: 'sgot',
    label: 'SGOT / AST',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 350,
    forSendOut: false
  },
  {
    key: 'sgpt_sgot',
    label: 'SGPT & SGOT',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 650,
    forSendOut: false
  },
  {
    key: 'electrolytes',
    label: 'Serum Electrolytes (Na, K, Cl)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 850,
    forSendOut: false
  },
  {
    key: 'albumin',
    label: 'Serum Albumin',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 350,
    forSendOut: false
  },
  {
    key: 'total_protein',
    label: 'Total Protein / Albumin-Globulin Ratio',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 450,
    forSendOut: false
  },
  {
    key: 'alp',
    label: 'Alkaline Phosphatase (ALP)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 450,
    forSendOut: false
  },
  {
    key: 'bilirubin',
    label: 'Total Bilirubin / Direct / Indirect (TB/DB/IB)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 550,
    forSendOut: false
  },
  {
    key: 'ogtt',
    label: 'Oral Glucose Tolerance Test (OGTT)',
    category: 'Blood Chemistry',
    targetArea: 'Extraction Area',
    defaultPrice: 650,
    forSendOut: false
  },

  // Clinical Microscopy / Parasitology
  {
    key: 'urinalysis',
    label: 'Routine Urinalysis',
    category: 'Clinical Microscopy',
    targetArea: 'Extraction Area',
    defaultPrice: 200,
    forSendOut: false
  },
  {
    key: 'fecalysis',
    label: 'Routine Fecalysis (Stool Exam)',
    category: 'Clinical Microscopy',
    targetArea: 'Extraction Area',
    defaultPrice: 200,
    forSendOut: false
  },
  {
    key: 'fobt',
    label: 'Fecal Occult Blood Test (FOBT)',
    category: 'Clinical Microscopy',
    targetArea: 'Extraction Area',
    defaultPrice: 350,
    forSendOut: false
  },
  {
    key: 'pregnancy_test',
    label: 'Pregnancy Test (Urine hCG)',
    category: 'Clinical Microscopy',
    targetArea: 'Extraction Area',
    defaultPrice: 250,
    forSendOut: false
  },

  // Serology & Immunology
  {
    key: 'dengue_duo',
    label: 'Dengue Duo (NS1 Ag / IgG / IgM)',
    category: 'Serology',
    targetArea: 'Extraction Area',
    defaultPrice: 950,
    forSendOut: false
  },
  {
    key: 'hbsag',
    label: 'Hepatitis B Surface Antigen (HBsAg)',
    category: 'Serology',
    targetArea: 'Extraction Area',
    defaultPrice: 350,
    forSendOut: false
  },
  {
    key: 'anti_hbs',
    label: 'Anti-HBs Titer',
    category: 'Serology',
    targetArea: 'Extraction Area',
    defaultPrice: 500,
    forSendOut: false
  },
  {
    key: 'anti_hcv',
    label: 'Anti-HCV (Hepatitis C Screening)',
    category: 'Serology',
    targetArea: 'Extraction Area',
    defaultPrice: 650,
    forSendOut: false
  },
  {
    key: 'syphilis_rpr',
    label: 'Syphilis Screening (RPR / VDRL)',
    category: 'Serology',
    targetArea: 'Extraction Area',
    defaultPrice: 350,
    forSendOut: false
  },
  {
    key: 'thyroid_panel',
    label: 'Thyroid Panel (TSH, FT3, FT4)',
    category: 'Serology',
    targetArea: 'Extraction Area',
    defaultPrice: 1650,
    forSendOut: false
  },
  {
    key: 'tsh',
    label: 'Thyroid Stimulating Hormone (TSH)',
    category: 'Serology',
    targetArea: 'Extraction Area',
    defaultPrice: 650,
    forSendOut: false
  },
  {
    key: 'hiv_screen',
    label: 'HIV 1/2 Screening (Confidential)',
    category: 'Serology',
    targetArea: 'Extraction Area',
    defaultPrice: 550,
    forSendOut: false
  },

  // Diagnostic Imaging & Cardiology
  {
    key: 'xray_chest_pa',
    label: 'Chest X-Ray (PA View)',
    category: 'X-Ray',
    targetArea: 'X-Ray Area',
    defaultPrice: 450,
    forSendOut: false
  },
  {
    key: 'xray_chest_palat',
    label: 'Chest X-Ray (PA & Lateral Views)',
    category: 'X-Ray',
    targetArea: 'X-Ray Area',
    defaultPrice: 650,
    forSendOut: false
  },
  {
    key: 'ecg_12lead',
    label: '12-Lead Electrocardiogram (ECG)',
    category: 'ECG',
    targetArea: 'ECG Area',
    defaultPrice: 450,
    forSendOut: false
  },
  {
    key: 'echo_2d',
    label: '2D Echocardiography w/ Doppler',
    category: 'Cardiology',
    targetArea: 'Cardiology Area',
    defaultPrice: 2800,
    forSendOut: false
  },

  // Ultrasound Procedures
  {
    key: 'us_whole_abd',
    label: 'Ultrasound: Whole Abdomen',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 1600,
    forSendOut: false
  },
  {
    key: 'us_upper_abd',
    label: 'Ultrasound: Upper Abdomen (HBT)',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 1200,
    forSendOut: false
  },
  {
    key: 'us_kub',
    label: 'Ultrasound: KUB (Kidneys, Ureters, Bladder)',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 1100,
    forSendOut: false
  },
  {
    key: 'us_kub_prostate',
    label: 'Ultrasound: KUB with Prostate',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 1350,
    forSendOut: false
  },
  {
    key: 'us_pelvic',
    label: 'Ultrasound: Pelvic',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 950,
    forSendOut: false
  },
  {
    key: 'us_transvaginal',
    label: 'Ultrasound: Transvaginal (TVS)',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 1200,
    forSendOut: false
  },
  {
    key: 'us_ob_1st_tri',
    label: 'Ultrasound: 1st Trimester Obstetrics',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 1100,
    forSendOut: false
  },
  {
    key: 'us_bpp',
    label: 'Ultrasound: Biophysical Profile (BPP)',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 1300,
    forSendOut: false
  },
  {
    key: 'us_thyroid',
    label: 'Ultrasound: Thyroid / Neck',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 1200,
    forSendOut: false
  },
  {
    key: 'us_breast',
    label: 'Ultrasound: Breast (Bilateral)',
    category: 'Ultrasound',
    targetArea: 'Ultrasound Area',
    defaultPrice: 1400,
    forSendOut: false
  },

  // Toxicology
  {
    key: 'drug_test',
    label: 'Drug Test (Methamphetamine & THC Screen)',
    category: 'Toxicology',
    targetArea: 'Extraction Area',
    defaultPrice: 350,
    forSendOut: false
  },

  // Send-out / Histopathology
  {
    key: 'sendout_special',
    label: 'Specialized Send-out Procedure',
    category: 'Send-out',
    targetArea: 'Send-out Area',
    defaultPrice: 1500,
    forSendOut: true
  },
  {
    key: 'histopath_biopsy',
    label: 'Histopathology / Biopsy Examination',
    category: 'Send-out',
    targetArea: 'Send-out Area',
    defaultPrice: 2000,
    forSendOut: true
  }
];

function getHmoCatalog() {
  return HMO_CATALOG.slice();
}

module.exports = {
  HMO_CATALOG,
  getHmoCatalog
};
