import https from 'https';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o-mini';

export const AVAILABLE_MODELS = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Fast & Accurate - Recommended)' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (Very Fast)' },
  { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B Instruct' },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B Instruct' }
];

export const SYSTEM_PROMPT = `
You are GezyneBot, the intelligent clinical laboratory, outpatient consultation, and LIS assistant for Gezyne Clinical Laboratory & Medical Clinic.
You are professional, medically accurate, and deeply knowledgeable about:

1. CLINICAL CONSULTATION MODULE (SOAP & PhilPEN Guidelines):
- Subjective: Chief complaint, HPI, PMH, Medications, Allergies (flag NKDA if no known allergies).
- DOH PhilPEN Lifestyle Risk Screening:
  * Smoking pack-years formula: (sticks per day / 20) * years smoked.
  * Alcohol risk: non-drinker, occasional, moderate, heavy, binge drinking.
  * Familial NCDs: Hypertension, Diabetes, Stroke, CVD, Cancer, Asthma, Kidney Disease, Dyslipidemia.
  * Physical activity: Target >= 150 minutes of moderate activity per week.
- Objective (Vitals & Physical Exam):
  * BP, Pulse, Resp Rate, Temp, SpO2, Weight (kg), Height (cm), Waist (cm), Glucose, Pain scale.
  * Asia-Pacific / DOH Philippines BMI Standard (FNRI):
    < 18.5: Underweight
    18.5 - 22.9: Normal
    23.0 - 24.9: Overweight / At Risk
    25.0 - 29.9: Obese Class I
    >= 30.0: Obese Class II
- Assessment: ICD-10 directory lookup, differential diagnoses, clinical impressions.
- Plan: Multi-item prescription pad (drug, dose, route, freq, duration, sig instructions), diagnostic requisitions, lifestyle advice, follow-up scheduling.
- Attending physician auto-capture: Doctors logging in automatically populate their PRC license, PTR, S2, and clinical designation (e.g. Internist, Cardiologist, Pathologist).
- 'Checked' status represents a completed clinical consultation encounter.

2. LABORATORY PANIC / CRITICAL VALUES:
- Glucose: < 45 mg/dL or > 400 mg/dL (Critical call required immediately)
- Potassium: < 2.8 mmol/L or > 6.2 mmol/L (Severe arrhythmia risk)
- Hemoglobin: < 7.0 g/dL (Severe anemia requiring urgent transfusion consideration)
- Platelet count: < 20,000 /uL (Spontaneous hemorrhage risk)
- Sodium: < 120 mmol/L or > 160 mmol/L
- Troponin / CK-MB: Elevated above 99th percentile URL (Acute coronary syndrome alert)

3. PHLEBOTOMY ORDER OF DRAW (CLSI H3-A6 standard):
1. Blood Culture bottles (SPS / aerobic & anaerobic)
2. Coagulation tube (Light Blue - 3.2% Sodium Citrate)
3. Serum tubes with/without clot activator or gel separator (Red, Gold, Tiger top)
4. Heparin tube (Green - Sodium or Lithium Heparin)
5. EDTA tube (Lavender / Purple - K2 or K3 EDTA for CBC and HbA1c)
6. Glycolytic inhibitor (Gray - Sodium Fluoride / Potassium Oxalate for Glucose)

4. EQUIPMENT & QUALITY CONTROL (QC):
- Levey-Jennings charts with analyte mean and standard deviations (±1SD, ±2SD, ±3SD).
- Westgard Rules:
  * 1-2s: Warning rule (1 control run exceeds 2 SD)
  * 1-3s: Rejection (1 control run exceeds 3 SD)
  * 2-2s: Rejection (2 consecutive runs exceed 2 SD on the same side of the mean)
  * R-4s: Rejection (Difference between 2 consecutive controls exceeds 4 SD)
  * 4-1s: Rejection (4 consecutive runs exceed 1 SD on the same side)
  * 10-x: Rejection (10 consecutive runs on the same side of the mean)

Always format responses using clean GitHub Markdown with clear headers, bullet points, and clinical highlights.
`;

function resolveApiKey(): string | null {
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.startsWith('sk-or-')) {
    return process.env.OPENROUTER_API_KEY;
  }
  return null;
}

export async function askGezyneBot(messages: { role: string; content: string }[], model: string = DEFAULT_MODEL): Promise<{ answer: string; model: string; offlineFallback?: boolean }> {
  const apiKey = resolveApiKey();

  // If no API key is set, use the built-in clinical fallback engine
  if (!apiKey) {
    const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
    return {
      answer: generateClinicalFallback(lastUserMsg),
      model: 'gezynebot-embedded-clinical-engine',
      offlineFallback: true
    };
  }

  const payload = {
    model: model || DEFAULT_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages
    ],
    temperature: 0.3,
    max_tokens: 1500
  };

  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const url = new URL(OPENROUTER_API_URL);

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://gezynelab.com',
        'X-Title': 'Gezyne LIS Clinical Assistant',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            resolve({
              answer: parsed.choices[0].message.content,
              model: parsed.model || model
            });
          } else if (parsed.error) {
            resolve({
              answer: `⚠️ *GezyneBot API Notice*: ${parsed.error.message || 'Service returned an error'}\n\n${generateClinicalFallback(messages[messages.length - 1].content)}`,
              model: model,
              offlineFallback: true
            });
          } else {
            resolve({
              answer: generateClinicalFallback(messages[messages.length - 1].content),
              model: model,
              offlineFallback: true
            });
          }
        } catch (e: any) {
          resolve({
            answer: generateClinicalFallback(messages[messages.length - 1].content),
            model: model,
            offlineFallback: true
          });
        }
      });
    });

    req.on('error', () => {
      resolve({
        answer: generateClinicalFallback(messages[messages.length - 1]?.content || ''),
        model: model,
        offlineFallback: true
      });
    });

    req.setTimeout(25000, () => {
      req.destroy();
      resolve({
        answer: generateClinicalFallback(messages[messages.length - 1]?.content || ''),
        model: model,
        offlineFallback: true
      });
    });

    req.write(data);
    req.end();
  });
}

function generateClinicalFallback(query: string): string {
  const q = query.toLowerCase();

  if (q.includes('bmi') || q.includes('philpen') || q.includes('obese') || q.includes('weight')) {
    return `### ⚖️ Philippine DOH PhilPEN & Asia-Pacific BMI Classification

According to the **Philippine Department of Health (DOH)** and the **Food and Nutrition Research Institute (FNRI)**:

| BMI (kg/m²) | Classification | Clinical Action |
| :--- | :--- | :--- |
| **< 18.5** | **Underweight** | Nutritional assessment & dietary counseling |
| **18.5 – 22.9** | **Normal** | Lifestyle maintenance |
| **23.0 – 24.9** | **Overweight (At Risk)** | Dietary modification, physical activity (≥150 min/wk) |
| **25.0 – 29.9** | **Obese Class I** | Caloric restriction, CVD risk assessment |
| **≥ 30.0** | **Obese Class II** | Intensive medical nutrition therapy, comorbidities screen |

*Note: In the LIS consultation module, entering the patient's weight (kg) and height (cm) automatically calculates the exact BMI and category badge.*`;
  }

  if (q.includes('soap') || q.includes('consultation') || q.includes('doctor') || q.includes('chart')) {
    return `### 🩺 Clinical Consultation & SOAP Documentation

The **Clinical Consultation Module** provides a complete outpatient encounter workflow:
1. **[S] Subjective**: Chief complaint, HPI, PMH, Allergies (red warning badge if present, NKDA checkbox), Review of Systems. Includes **DOH PhilPEN** lifestyle profiling:
   - Smoking pack-years: auto-calculated via $\\frac{\\text{sticks}}{20} \\times \\text{years}$.
   - Alcohol risk & binge drinking evaluation.
   - Familial hereditary NCD pills (Hypertension, Diabetes, Cancer, etc.).
2. **[O] Objective**: Full vitals grid with real-time Asia-Pacific BMI classification, waist circumference, blood glucose, and physical examination notes.
3. **[A] Assessment**: Primary diagnosis with ICD-10 suggestions, differential diagnoses, and pathology impressions.
4. **[P] Plan**: Multi-item prescription pad (Rx), diagnostic lab requisitions, follow-up dates, and advice.
5. **Printable Documents**:
   - Patient Medical Chart (encounter hard copy)
   - Official Prescription Pad with PRC/PTR/S2 credentials
   - Medical Certificate for fit-to-work or illness declarations
   - Laboratory Requisition Form`;
  }

  if (q.includes('tube') || q.includes('order of draw') || q.includes('draw')) {
    return `### 🧪 Phlebotomy Order of Draw (CLSI H3-A6 Standards)

To prevent cross-contamination of additives between collection tubes:

1. **🟡 Blood Cultures** (SPS / Blood Culture Bottles)
2. **🔵 Coagulation Tube** (Light Blue — 3.2% Buffered Sodium Citrate; 1:9 ratio)
3. **🔴 Serum Tubes** (Red Plain, Gold / SST with gel separator)
4. **🟢 Heparin Tube** (Green — Sodium or Lithium Heparin for STAT chemistry)
5. **🟣 EDTA Tube** (Lavender / Purple — K2/K3 EDTA for CBC, Hematology, HbA1c)
6. **⚪ Glycolytic Inhibitor** (Gray — Sodium Fluoride / Potassium Oxalate for FBS/Glucose)`;
  }

  if (q.includes('panic') || q.includes('critical value') || q.includes('alert')) {
    return `### 🚨 Critical / Panic Laboratory Values

Values that indicate an immediate life-threatening situation requiring immediate verbal read-back to the attending physician:

- **Blood Glucose**: < 45 mg/dL (severe hypoglycemia) or > 400 mg/dL (DKA / HHS risk)
- **Serum Potassium (K⁺)**: < 2.8 mmol/L or > 6.2 mmol/L (cardiac arrest / arrhythmia risk)
- **Hemoglobin**: < 7.0 g/dL (transfusion threshold)
- **Platelet Count**: < 20,000 /µL (spontaneous intracranial / mucosal bleeding)
- **Serum Sodium (Na⁺)**: < 120 mmol/L or > 160 mmol/L (seizure / cerebral edema risk)
- **Troponin I / T**: Positive or > 99th percentile cutoff (Acute Coronary Syndrome)`;
  }

  if (q.includes('equipment') || q.includes('qc') || q.includes('westgard')) {
    return `### 🔬 Equipment & Quality Control (Westgard Rules)

The LIS monitors analyzer performance using daily controls and Levey-Jennings charts:

- **1-2s (Warning)**: 1 control observation exceeds the Mean ± 2 SD. Look for potential trends.
- **1-3s (Rejection)**: 1 observation exceeds the Mean ± 3 SD. Random error or large systematic error. Reject run.
- **2-2s (Rejection)**: 2 consecutive observations exceed the same Mean + 2 SD or Mean - 2 SD. Systematic error.
- **R-4s (Rejection)**: 1 observation exceeds Mean + 2 SD and the next exceeds Mean - 2 SD (range = 4 SD). Random error.
- **4-1s (Rejection)**: 4 consecutive observations exceed Mean + 1 SD or Mean - 1 SD. Systematic shift.
- **10-x (Rejection)**: 10 consecutive observations fall on one side of the Mean. Systematic bias.`;
  }

  return `### 👋 GezyneBot Clinical Assistant

I am here to assist with:
- **Outpatient Clinical Consultations**: SOAP documentation, PhilPEN CVD risk assessment, and official printing (Medical Chart, Prescription, Med Cert).
- **Asia-Pacific BMI Standards**: FNRI / DOH cutoffs and vital signs evaluation.
- **Laboratory Operations**: Tube order of draw, critical panic values, reference ranges.
- **Equipment & QC**: Maintenance schedules, radiation safety, and Westgard multirule violations.
- **Reagent Inventory**: Lot tracking, expiration dates, and critical stock alerts.

Feel free to ask a specific clinical or laboratory query!`;
}
