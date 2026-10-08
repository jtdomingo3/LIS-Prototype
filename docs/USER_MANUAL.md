# Gezyne Clinical Laboratory Information System (LIS)
## Staff & User Operation Manual (Version 2.6.5)

Welcome to the **Gezyne LIS User Guide**. This manual is designed for laboratory staff, medical technologists, receptionists, encoders, clinic nurses, billing officers, quality assurance managers, and attending physicians. It provides comprehensive, step-by-step instructions on which menu items to select, buttons to click, and workflows to follow to operate the system smoothly.

---

## Quick Navigation: The Main Menu Sidebar

All major sections of the system are accessible from the navigation sidebar on the left side of your screen:

| Sidebar Menu Item | Primary Purpose | Who Uses It |
| :--- | :--- | :--- |
| **📊 Dashboard** | Overview of daily patient volume, pending tests, revenue summaries, and alerts | Managers, Admins |
| **👥 Patients** | Patient master registry, historical records, and patient profiles | Receptionists, MedTechs |
| **🏥 Reception** | Registering walk-ins, assigning tests, station queueing, and TV kiosk display | Receptionists, Cashiers |
| **🩺 PhilHealth / Health Card** | PhilHealth Konsulta claims, HMO provider enrollments, LOA approval, Statement of Account (SOA), transmittals | Receptionists, Claims Officers, Cashiers |
| **🧪 Tests & Results** | Entering test results, importing analyzer data, ultrasound entry, and batch worksheets | Medical Technologists |
| **📋 Reports** | Previewing, printing, and issuing official diagnostic PDF reports | MedTechs, Pathologists |
| **📦 Inventory** | Tracking reagent stocks, supplies, stock-in, stock-out, and expiry alerts | MedTechs, Supply Officers |
| **🔬 Equipment & QC** | Instrument logs, daily Quality Control entries, Levey-Jennings charts, and NEQAS | MedTechs, QC Officers |
| **✍️ Signature** | Drawing or uploading official digital signatures for report stamping | Doctors, MedTechs, Pathologists |
| **📊 Worksheet** | Generating and exporting daily laboratory worksheets to Excel/PDF | Medical Technologists |
| **📄 Templates** | Managing diagnostic report formats and normal reference ranges | Admins, Section Heads |
| **👤 Users** | Staff user accounts and role permissions management | Administrators |
| **⚙️ Settings** | Clinic letterhead, thermal printer setup, and AI configuration | Administrators |
| **🤖 GezyneBot AI** | Resident AI assistant for software guidance, Westgard rules, and clinical queries | All Staff Members |
| **💰 Costing & P&L** | Unit test costing, reagent purchase mapping, expense tracking, and income | Lab Owners, Managers |
| **👥 HR & Payroll** | Staff directory, daily biometric/manual DTR, leave approvals, and payroll | HR, Management, Staff |
| **📖 User Manual** | Interactive in-app guide and how-to instructions | All Users |

---

## 1. Reception: Patient Intake, Queue Management & Test Packages

The Reception module is where every patient's laboratory visit begins.

### How to Register a Patient & Issue a Queue Number:
1. Click **Reception** on the left navigation sidebar.
2. **Find or Register:**
   * **For Returning Patients:** Click into the **Search Patient** box, type their name, patient code, or ID, and click their name to auto-fill their information.
   * **For New Patients:** Click the **New Patient** button and complete the registration form:
     - Enter their legal name (**First Name**, **Middle Name**, and **Last Name**).
     - Select their **Date of Birth** in **`MM/DD/YYYY`** format (the system automatically calculates their exact age in years).
     - Select their **Gender** and enter their **Contact Number** and **Address**.
     - **PhilHealth Enrollment:** Check the **PhilHealth Consent** checkbox if the patient is claiming under PhilHealth Konsulta. Enter their 12-digit **PhilHealth Identification Number (PIN)** and their **Agency / Employer** name.
     - **Health Card / HMO Enrollment:** Check the **Health Card / HMO Consent** checkbox if covered by a private HMO. Select the **HMO Provider** (e.g., *Maxicare*, *Intellicare*, *Medicard*, *PhilCare*, *Cocolife*, *Etiqa*, *ValuCare*), type their **Card / Policy Number**, **LOA Number** (Letter of Authorization), and **LOA Expiry Date**.
     - If the patient is a Senior Citizen or PWD, enter their **Senior / PWD ID** to automatically apply statutory discounts.
3. **Selecting Diagnostic Test Packages & Tests:**
   * **Pre-Configured Packages (Packages 1 to 6):**
     - You can select bundled diagnostic packages with one click:
       - **Package 1 (₱550):** FBS, Cholesterol, Uric Acid, Creatinine.
       - **Package 2 (₱750):** FBS, Cholesterol, Uric Acid, Creatinine, SGPT (ALT).
       - **Package 3 (₱1,130):** FBS, Full Lipid Profile (Cholesterol, Triglycerides, HDL, LDL), Uric Acid, Creatinine.
       - **Package 4 (₱1,380):** Package 3 + SGPT.
       - **Package 5 (₱1,500):** Package 3 + SGPT + SGOT (AST).
       - **Package 6 (Executive - ₱2,200):** Package 5 + CBC w/ Platelet Count + Chest X-ray + 12-Lead ECG.
     - **Senior Citizen / PWD Urinalysis Benefit:** All packages automatically include **FREE Routine Urinalysis** for Senior Citizens and PWDs (regular patients pay +₱100 add-on).
   * **Individual Test Selection:**
     - Under the **Requested Tests** checklist, select any individual procedures:
       - *Hematology:* CBC w/ Platelet Count, Blood Typing, ESR, PT/APTT, Clotting/Bleeding Time.
       - *Clinical Chemistry:* FBS, Lipid Profile, BUN, Creatinine, Uric Acid, SGPT, SGOT, Electrolytes, HbA1c.
       - *Clinical Microscopy:* Routine Urinalysis, Routine Fecalysis, Pregnancy Test.
       - *Imaging & Special:* Chest X-Ray, 2D Echo, Ultrasound, 12-Lead ECG.
       - *Consultation:* Doctor's Outpatient Check-up.
4. **Generate the Queue:**
   * Review the sticky **Order Total Summary** at the bottom of the screen.
   * Click the green **Save & Generate Queue Number** button.
   * The system generates an official accession code (e.g. `GCL-20261008-00001`) and prints the thermal queue slip.

### How to Manage the Live Queue & Call Patients:
1. Click on your active station from the top tabs (e.g., **Payment Area**, **Extraction Area**, or **Releasing Area**).
2. Look at the list of waiting patients under **Current Queue**:
   * Click the blue **Call Next** button to call the patient at the top of the line. The system sounds an audible chime and announces the ticket number on the TV speakers.
   * If a patient has temporarily stepped out, click the yellow **Stash** button. When they return, click **Unstash**.
   * When you finish attending to the patient, click the green **Complete & Send to Next Station** button. The system automatically routes them to their next required department (Payment &rarr; Phlebotomy &rarr; X-ray &rarr; Doctor Check-up).
3. **Displaying the Waiting Room TV Kiosk:**
   * On the computer connected to the waiting room television screen, click **Fullscreen Kiosk**.
   * Press **F11** on your keyboard to enter borderless full screen. The TV will now automatically update and announce patient calls in real time.

---

## 2. PhilHealth & Health Card (HMO) Claims Management

The **PhilHealth / Health Card** module (`/philhealth` and `/healthcard`) provides centralized tracking for Philippine health insurance and HMO billing.

### PhilHealth Konsulta Claims:
1. Click **PhilHealth / Health Card** on the left menu and select the **PhilHealth** tab.
2. **Auto-Generated Control Numbers:**
   * Each PhilHealth patient receives a standardized control number formatted as `PH-YYYY-MM-XXXXX` (e.g., `PH-2026-10-00001`).
3. **13 Accredited Konsulta Diagnostic Procedures:**
   * Only the 13 DOH/PhilHealth-accredited procedures are eligible for Konsulta claims:
     1. CBC w/ Platelet Count
     2. Lipid Profile (Cholesterol, HDL, LDL, Triglycerides)
     3. Fasting Blood Sugar (FBS)
     4. Routine Urinalysis
     5. Routine Fecalysis
     6. Sputum Microscopy
     7. Chest X-Ray
     8. Pap Smear
     9. Fecal Occult Blood Test
     10. 12-Lead ECG
     11. Anti-HCV (Hepatitis C Rapid Antibody)
     12. HBsAg (Hepatitis B Surface Antigen Screen)
     13. Blood Typing (ABO / Rh)
4. **Claim Lifecycle Management:**
   * Claims transition through standardized statuses:
     - **Pending Approval:** Newly enrolled patient awaiting verification.
     - **Approved:** Verified with valid PIN and accredited procedures encoded.
     - **Tranche 1 Encoded / Paid:** First encounter and diagnostic profiling encoded/reimbursed.
     - **Tranche 2 Encoded / Paid:** Follow-up consultation and monitoring encoded/reimbursed.
     - **Paid:** Fully settled claim.
5. **Statement of Account (SOA) & Transmittals:**
   * Click **Generate SOA** to produce an official PhilHealth Statement of Account with patient details, PIN, encoded procedures, and reimbursement totals.
   * Click **Summary / Transmittal** to view and print the batch transmittal report for submission to the local PhilHealth Health Care Institution (HCI) portal.

### Health Card / HMO Claims:
1. Click **PhilHealth / Health Card** and select the **Health Card (HMO)** tab (`/healthcard`).
2. **Supported HMO Providers:**
   * The system natively recognizes all major accredited Philippine HMOs: *Maxicare*, *Intellicare*, *Medicard*, *PhilCare*, *Cocolife*, *Etiqa*, *Carehealth Plus*, *ValuCare*, *Insular Health Care*, *Avega*, *Generali*, and corporate health accounts.
3. **HMO Control Number:**
   * Health card records are tracked under `HC-YYYY-MM-XXXXX` (e.g., `HC-2026-10-00001`).
4. **LOA Verification & Approval Workflow:**
   * When a patient arrives with a Letter of Authorization (LOA), the record is initially created as **Pending LOA**.
   * Open the record, verify the **LOA Number**, **LOA Expiry Date**, and authorized diagnosis.
   * Click **Approve LOA** to transition the record to **Approved LOA**.
5. **Procedure Authorization & Excess Computation:**
   * Select from 55+ accredited HMO laboratory, diagnostic, cardiology, and ultrasound procedures.
   * Enter the **HMO Covered Amount** approved on the LOA.
   * If the diagnostic test cost exceeds the approved coverage, the system automatically computes the **Patient Excess Amount**:
     $$\text{Patient Excess} = \text{Gross Amount} - \text{HMO Covered Amount}$$
   * The cashier collects the excess amount from the patient at reception.
6. **SOA Printing & Corporate Billing:**
   * Click **Print SOA** to generate an official branded HMO billing statement displaying the LOA number, member card ID, authorized procedures, covered amount, and approval stamp.

---

## 3. Phlebotomy & Thermal Barcode Printing

1. On the left menu, click **Reception** and select the **Extraction Area** tab.
2. In the patient's row, review the **Specimen Required** indicators:
   * **Lavender Top (EDTA):** Draw for Hematology (CBC, Blood Typing, HbA1c). Invert gently 8–10 times.
   * **Red or Gold Gel SST:** Draw for Chemistry and Serology. Allow to clot before centrifuging.
   * **Light Blue Top (Sodium Citrate):** Draw for Coagulation (PT/INR). Fill exactly to the line!
   * **Gray Top (Fluoride):** Draw for specialized Glucose runs.
3. **Print Barcodes:**
   * Click the **Print Barcode** button next to the patient's name.
   * Your thermal barcode printer immediately prints the tube sticker with the accession number, patient name, and test code.
   * Apply the sticker vertically down the length of the tube without obscuring the fill line.
4. Once extraction is complete, click **Mark Extraction Done**.

---

## 4. Tests & Results: Clinical Laboratory, Analyzers & Ultrasound

### Clinical Laboratory & Chemistry Analyzer Import:
1. Click **Tests & Results** on the left menu.
2. Select your section tab: **Hematology**, **Clinical Chemistry**, **Urinalysis**, **Fecalysis**, **Imaging**, or **Ultrasound**.
3. Locate the pending patient and click **Enter Results**.
4. **Direct Import from Chemistry Analyzers (Mindray BS-240):**
   * Ensure the instrument run is finished on the analyzer.
   * Click the green **Import from Analyzer** button.
   * The system reads the local database and automatically fills in FBS, BUN, Creatinine, Total Cholesterol, Triglycerides, AST, ALT, and Uric Acid.
5. **Abnormal Alert Highlighting:**
   * Values exceeding normal clinical reference ranges are highlighted in bold red to prevent clerical oversight.

### Specialized Ultrasound Results Entry & Templates:
The LIS provides tailored clinical entry forms and printable report templates for all diagnostic ultrasound examinations:
1. **1st Trimester Obstetrics Ultrasound:**
   * Document gestational sac, yolk sac, Crown-Rump Length (CRL), fetal heart motion, and subchorionic hemorrhage findings.
2. **Pelvic Ultrasound (Non-Gravid):**
   * Measure uterine dimensions (length $\times$ width $\times$ AP), endometrial thickness, myometrial echo-pattern, and bilateral ovarian volumes/follicles.
3. **Pelvic Biometry Ultrasound (2nd / 3rd Trimester):**
   * Enter fetal biometry measurements:
     - **BPD** (Biparietal Diameter)
     - **HC** (Head Circumference)
     - **AC** (Abdominal Circumference)
     - **FL** (Femur Length)
   * The system computes **Estimated Fetal Weight (EFW)**, **Average Gestational Age (AOG)**, and **Estimated Date of Confinement (EDC / EDD)**.
4. **Biophysical Profile (BPS):**
   * Score the 5 biophysical variables (2 points each):
     - Fetal Breathing Movements (FBM)
     - Gross Body Movements (FM)
     - Fetal Tone (FT)
     - Amniotic Fluid Volume (AFI / Deepest Vertical Pocket)
     - Non-Stress Test (NST)
   * The system totals the BPS score out of 8/8 or 10/10 with automated clinical risk interpretation.
5. **Transvaginal Ultrasound (TVS):**
   * High-resolution pelvic sonography capturing endocervical canal, retroverted/anteverted uterine status, endometrial stripe, and cul-de-sac fluid.
6. **Abdominal Ultrasound (Whole Abdomen / KUBP / HBT):**
   * Comprehensive organ matrix evaluating liver parenchyma, gallbladder calculi/wall thickness, common bile duct (CBD), pancreas, spleen, kidneys (corticomedullary differentiation), urinary bladder, and prostate volume.

### Releasing Results:
* Select the **Performing MedTech** and **Reviewing Pathologist / Radiologist**.
* Click **Complete & Release Results**.
* **Result Guard:** Once released, the report is securely locked against unauthorized tampering.

---

## 5. Reports: Generating, Previewing & Printing Official Results

1. Click **Reports** on the left menu.
2. Locate the patient under the released reports list.
3. Click the blue **Preview Report** button.
   * The official diagnostic report opens with the facility letterhead, patient demographics, clinical results, normal reference ranges, abnormal flags, and official electronic signatures.
4. Click the green **Print** button (or press **Ctrl + P** on your keyboard).
5. Click **Download PDF** to generate an encrypted PDF file for emailing or archiving.

---

## 6. Digital Signatures: Setting Up Electronic Signatures

1. Click **Signature** on the left navigation menu.
2. **Draw Signature:** Use your mouse or touchscreen stylus to sign inside the digital signature canvas. Click **Clear** to restart if needed.
3. **Upload Signature:** Click **Upload Signature Image** to upload a clean, transparent PNG image of your official signature.
4. Click the green **Save Signature** button.
5. Once saved, your signature automatically stamps onto all verified laboratory results, consultation charts, and medical certificates where you are designated as the signatory.

---

## 7. Equipment & Quality Control: Levey-Jennings Charts & Westgard Rules

1. Click **Equipment & QC** on the left menu.
2. Select your instrument card (e.g., *Mindray BS-240 Analyzer*).
3. Click the **Levey-Jennings Chart** tab.
4. Select the analyte (*Glucose*, *Creatinine*, *Cholesterol*) and control level (**Level 1 Normal** or **Level 2 Pathologic**).
5. Click **+ Add QC Entry**, type the measured value, and click **Save QC Run**.
6. **Correcting Clerical Mistakes:** Click **Drop Previous Run** to safely delete the most recent erroneous reading.
7. **Westgard Multi-Rule Evaluation:**
   * **$1_{2s}$ (Warning):** 1 point exceeds $\pm 2SD$.
   * **$1_{3s}$ (Rejection):** 1 point exceeds $\pm 3SD$. Random error; halt testing and recalibrate.
   * **$2_{2s}$ (Rejection):** 2 consecutive runs exceed the same $+2SD$ or $-2SD$. Systematic error.
   * **$R_{4s}$ (Rejection):** Run difference exceeds $4SD$.
   * **$10_x$ (Rejection):** 10 consecutive readings on one side of the mean.
8. **DOH Monthly QC Inspection Summary:** Click **Monthly Summary** &rarr; **Print DOH Summary Table** to produce the audit compliance table with Mean, SD, and $\%CV$.

---

## 8. NEQAS & Dynamic External Reference Laboratories

1. Click **Equipment & QC** and select the **NEQAS / EQA** tab.
2. Configure designated National Reference Laboratories (*EAMC*, *Lung Center*, *NKTI*, *RITM*, *Philippine Heart Center*).
3. Select your NRL survey, enter your laboratory's reported value, peer group mean, and peer group SD, and click **Calculate SDI & Save**.
4. The system calculates the Standard Deviation Index:
   $$\text{SDI} = \frac{\text{Lab Result} - \text{Peer Group Mean}}{\text{Peer Group SD}}$$
   * **$|SDI| \le 2.0$:** Acceptable (Pass).
   * **$2.0 < |SDI| < 3.0$:** Questionable (Warning).
   * **$|SDI| \ge 3.0$:** Unsatisfactory (Automatic DOH Corrective Action Form generated).
5. Click **Print NEQAS Certificate** to generate an official certificate for accreditation records.

---

## 9. Inventory & Clinical Supplies Management

1. Click **Inventory** on the left menu.
2. **Stock-In:** Click **+ Stock In**, select the reagent or item, enter quantity, lot number, and expiration date, and confirm.
3. **Stock-Out / Waste:** Click **Stock Out / Adjust**, select the reason (*Expired*, *Damaged*, *QC Consumption*, *Spill*), provide remarks, and save.
4. **Automated Depletion:** Reagents are automatically deducted from active lots as tests are marked Completed.
5. **Alerts:** Near-expiry (< 30 days) items show amber warnings; low-stock items trigger pulsing red notifications.

---

## 10. Doctor Consultations & Outpatient Encounters

1. Click **Tests & Results** and locate rows marked **Doctor Check-up** (prefix `DC*`).
2. Click **Start Consultation**.
3. **SOAP Encounter Documentation:**
   * **[S] Subjective:** Chief complaint, HPI, allergies, current medications, smoking pack-years calculator, alcohol screening, and familial NCD kinship pills.
   * **[O] Objective:** Complete vital signs grid with real-time Asia-Pacific BMI badge calculation (*Normal*, *Overweight*, *Obese*), physical exam notes, and prior lab report preview.
   * **[A] Assessment:** Searchable ICD-10 diagnosis selector and clinical impression.
   * **[P] Plan:** Multi-item Rx prescription builder, diagnostic laboratory requisitions, and follow-up date scheduling.
4. **Print Clinical Documents:** Click **Print Medical Chart**, **Print Prescription**, **Print Medical Certificate**, or **Print Lab Request**.
5. Click **Complete Consultation** to finalize and lock the medical chart.

---

## 11. Human Resources (HR) & Philippine Statutory Payroll

1. Click **HR & Payroll** on the left menu.
2. **Employee Directory:** Manage staff profiles, daily rates, fixed monthly salaries, and statutory IDs (TIN, SSS, PhilHealth, Pag-IBIG).
3. **Daily Time Records (DTR):** Log morning and afternoon biometric/manual attendance. The engine computes regular duty hours, tardiness, undertime, overtime, and holiday pay.
4. **Leave Management:** File vacation, sick, maternity, and bereavement leaves. Managers approve leaves and print official leave slips.
5. **Semi-Monthly Payroll:** Click **Compute Payroll**, select the cut-off period, and automatically compute gross earnings, statutory deductions (2025/2026 SSS matrix, PhilHealth 5% split, Pag-IBIG, BIR TRAIN tax), and net pay.
6. **Export & Print:** Download the Excel bank register or print confidential employee payslips.

---

## 12. Costing & Profitability (P&L) Analytics

1. Click **Costing & P&L** on the left menu.
2. **Cost-Per-Test Economics:** View itemized direct costs (reagents, controls, consumable tubes/tips, MedTech labor, equipment depreciation) and gross margin percentages.
3. **Operating Expenses:** Record recurring clinic expenses (Rent, Utilities, Staff Salaries, Reagents, Biohazard Waste Disposal, Regulatory Licensing).
4. **P&L Reporting:** View real-time revenue, gross profit, operating expenses, and net profit margins with division-by-zero protection.

---

## 13. System Settings, Printers & Standalone Synchronization

1. Click **Settings** on the left menu.
2. **Facility Letterhead:** Update Clinic Name, DOH License Number, Address, and Hotlines. Upload the facility logo.
3. **Thermal Printer Configuration:** Select the thermal label printer name and set label dimensions (e.g., 50mm $\times$ 30mm).
4. **GezyneBot AI Configuration:** Enter your encrypted OpenRouter API key and select preferred models.
5. **Standalone Workstation Sync:** On offline desktop clients, click **Sync Settings from Server** to pull the latest facility configurations and doctor room mappings.

---

## 14. GezyneBot AI Clinical Assistant

1. Click **GezyneBot AI** on the left menu (or click the floating robot icon at the bottom-right corner of any page).
2. Type your question in plain English or Tagalog and press **Enter**.
3. **Capabilities:**
   * Step-by-step software navigation across all modules.
   * PhilHealth Konsulta 13-procedure rules and claim status requirements.
   * HMO approval guidelines, LOA validation, and excess calculations.
   * Westgard QC interpretation and corrective action recommendations.
   * Ultrasound biometry dating, gestational age formulas, and BPS scoring.
   * Phlebotomy order of draw and emergency panic values.
   * Philippine statutory contributions (SSS, PhilHealth, Pag-IBIG, BIR TRAIN tax).
   * Live web search toggle for real-time 2024–2026 DOH guidelines via DuckDuckGo.

---

## 15. Clinical Reference & Emergency Panic Values

### Order of Draw for Phlebotomy:
1. **1st - Blood Cultures (SPS Yellow Top) or Sterile Tubes**
2. **2nd - Sodium Citrate (Light Blue Top):** PT, APTT, Coagulation. Must be filled exactly to the line!
3. **3rd - Serum Tubes (Red Top / Gold SST Gel):** Chemistry, Serology, Thyroid.
4. **4th - Heparin (Green Top):** Stat Chemistry, Electrolytes, Troponin.
5. **5th - EDTA (Lavender Top):** CBC, Hematology, Blood Typing, HbA1c. Invert 8–10 times.
6. **6th - Sodium Fluoride (Gray Top):** Glucose testing.

### Critical / Panic Values Requiring Immediate Physician Notification:
* **Fasting Blood Sugar:** $< 45 \text{ mg/dL}$ (Severe Hypoglycemia) or $> 400 \text{ mg/dL}$ (DKA Risk)
* **Potassium ($K^+$):** $< 2.8 \text{ mmol/L}$ or $> 6.0 \text{ mmol/L}$ (Cardiac Arrest Risk)
* **Sodium ($Na^+$):** $< 120 \text{ mmol/L}$ or $> 160 \text{ mmol/L}$
* **Platelet Count:** $< 20,000 \text{ /}\mu\text{L}$ (Spontaneous Hemorrhage Risk) or $> 1,000,000 \text{ /}\mu\text{L}$
* **Hemoglobin:** $< 7.0 \text{ g/dL}$ (Critical Anemia)
* **PT / INR:** $\text{INR} > 4.5$ (High Bleeding Risk)

> **Mandatory Emergency Protocol:** Whenever a panic value is encountered, the Medical Technologist must verify sample integrity (confirm no micro-clot or hemolysis), re-run the sample on the instrument, and immediately contact the attending physician and supervising pathologist.

---

## 16. Philippine Clinical Date Formatting Standard (`MM/DD/YYYY`)

All date fields, timestamps, laboratory worksheets, queue slips, diagnostic reports, and medical certificates generated by the Gezyne LIS strictly adhere to the official Philippine clinical standard:

$$\textbf{MM/DD/YYYY} \quad (\text{Month/Day/Year})$$

* **Example:** October 8, 2026 is formatted strictly as **`10/08/2026`**.
* This eliminates clinical ambiguity and ensures full compliance across all DOH licensing audits and PhilHealth transmittals.

---
*End of Gezyne LIS Staff & User Operation Manual (v2.6.5)*
