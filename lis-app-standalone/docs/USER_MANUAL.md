# Gezyne Clinical Laboratory Information System (LIS)
## Staff & User Operation Manual (Version 2.6.3)

Welcome to the **Gezyne LIS User Guide**. This manual is designed for laboratory staff, medical technologists, receptionists, encoders, clinic nurses, quality assurance managers, and attending physicians. It provides step-by-step instructions on which menu items to select, buttons to click, and forms to complete to operate the system smoothly.

---

## Quick Navigation: The Main Menu Sidebar

All major sections of the system are accessible from the navigation sidebar on the left side of your screen:

| Sidebar Menu Item | Primary Purpose | Who Uses It |
| :--- | :--- | :--- |
| **📊 Dashboard** | Overview of daily patient volume, pending tests, revenue summaries, and alerts | Managers, Admins |
| **👥 Patients** | Patient master registry, historical records, and patient profiles | Receptionists, MedTechs |
| **🏥 Reception** | Registering walk-ins, assigning tests, station queueing, and TV kiosk display | Receptionists, Cashiers |
| **🧪 Tests & Results** | Entering test results, importing analyzer data, and batch worksheets | Medical Technologists |
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

## 1. Reception: Patient Intake & Queue Management

The Reception module is where every patient's laboratory visit begins.

### How to Register a Patient & Issue a Queue Number:
1. Click **Reception** on the left navigation sidebar.
2. **Find or Register:**
   * **For Returning Patients:** Click into the **Search Patient** box, type their name or patient code, and click their name to auto-fill their information.
   * **For New Patients:** Click the **New Patient** button and fill in the form:
     - Type their complete legal name (Last Name, First Name, Middle Name).
     - Select their **Date of Birth** (the system automatically calculates their age).
     - Select their **Gender** and enter their **Contact Number** and **Address**.
     - If the patient is a Senior Citizen or PWD, enter their **Senior / PWD ID** to automatically apply the statutory discount.
     - Check the **PhilHealth Consent** checkbox.
3. **Select Tests to Perform:**
   - Under the **Requested Tests** checklist, check the boxes for all requested procedures:
     - *Hematology:* CBC, Blood Typing, Platelet Count, ESR.
     - *Clinical Chemistry:* Fasting Blood Sugar (FBS), Lipid Profile, BUN, Creatinine, Uric Acid, SGPT, SGOT, Electrolytes.
     - *Clinical Microscopy:* Routine Urinalysis, Routine Fecalysis.
     - *Imaging & Special Procedures:* X-Ray, 2D Echo, Ultrasound, ECG.
     - *Consultation:* Doctor's Check-up.
4. **Generate the Queue:**
   - Click the green **Save & Generate Queue Number** button at the bottom of the form.
   - The system generates an official accession code (e.g. `GCL-2026-03-00124`) and prints the patient's queue ticket.

### How to Manage the Live Queue & Call Patients:
1. Click on your active station from the top tabs (e.g., **Payment Area**, **Extraction Area**, or **Releasing Area**).
2. Look at the list of waiting patients under **Current Queue**:
   * Click the blue **Call Next** button to call the patient at the top of the line. The system sounds an audible chime and announces the number on the clinic TV speakers.
   * If a patient has temporarily stepped out to the restroom or outside, click the yellow **Stash** button. This holds their spot without canceling their ticket. When they return, click **Unstash**.
   * When you finish attending to the patient, click the green **Complete & Send to Next Station** button. The system automatically routes them to their next department (for example, from Payment &rarr; Phlebotomy &rarr; Doctor Check-up).
3. **Displaying the Waiting Room TV Kiosk:**
   - On the computer connected to the waiting room television screen, click **Fullscreen Kiosk** (or navigate to the TV display link).
   - Press **F11** on your keyboard to enter borderless full screen. The TV will now automatically update and announce patient calls in real time.

---

## 2. Phlebotomy & Thermal Barcode Printing

1. On the left menu, click **Reception** and select the **Extraction Area** tab.
2. In the patient's row, look at the **Specimen Required** indicators:
   * **Lavender Top (EDTA):** Draw for Hematology (CBC, Blood Typing, HbA1c). Invert gently 8–10 times.
   * **Red or Gold Gel SST:** Draw for Chemistry and Serology. Allow to clot before centrifuging.
   * **Light Blue Top (Sodium Citrate):** Draw for Coagulation (PT/INR). Fill exactly to the line!
   * **Gray Top (Fluoride):** Draw for special Glucose/Lactate runs.
3. **Print Barcodes:**
   * Click the **Print Barcode** button next to the patient's name.
   * Your thermal barcode printer will immediately print the tube sticker with the patient's accession code, name, and test code.
   * Peel and place the barcode sticker vertically down the length of the collection tube.
4. Once blood extraction is finished, click the green **Mark Extraction Done** button.

---

## 3. Tests & Results: Entering Lab Data & Importing Analyzers

### How to Record and Verify Laboratory Results:
1. Click **Tests & Results** on the left menu.
2. Use the top department filters to choose your section: **Hematology**, **Clinical Chemistry**, **Urinalysis**, **Fecalysis**, or **Imaging**.
3. Find the patient in the pending list and click the blue **Enter Results** button (or click directly on the Test ID).
4. **Encoding Values:**
   - Type the measured clinical numbers into each parameter box (e.g., WBC, Hemoglobin, Fasting Blood Sugar).
   - The system checks your inputs against standard normal limits. If a value is critically high or low, the input box highlights in bold red to alert you.
5. **Importing Directly from Chemistry Analyzers (Mindray BS-240 / Analyzer):**
   - If you are running Clinical Chemistry, you do not need to type each number by hand!
   - Ensure the analyzer test run is completed on your machine.
   - Click the green **Import from Analyzer** button at the top-right of the test form.
   - The system reads the chemistry database, matches the sample code, and automatically fills in FBS, BUN, Creatinine, Cholesterol, Triglycerides, AST, ALT, and Uric Acid.
   - Review the auto-filled numbers on screen to confirm accuracy.
6. **Releasing the Test:**
   - Select the **Performing MedTech** from the dropdown menu.
   - Select the **Reviewing Pathologist** from the dropdown menu.
   - Click the green **Complete & Release Results** button.
   - **Result Guard Protection:** Once released, the test is permanently locked against accidental edits. If a correction is required, only an Administrator can unlock it.

### How to Print Batch Worksheets:
1. Click **Worksheet** on the left sidebar (or click **Print Worksheet** from the Tests page).
2. Choose your department and select today's date.
3. Click the **Export to Excel** button or the **Print Worksheet** button. Medical technologists can use this physical sheet at the bench to record manual readings before encoding.

---

## 4. Reports: Generating, Previewing & Printing Official Results

1. Click **Reports** on the left menu.
2. Locate the patient under the released reports list.
3. Click the blue **Preview Report** button.
   * A preview of the official clinical report will open, formatted with the laboratory header, patient demographics, test results, normal reference ranges, abnormal flags, and official digital signatures.
4. Click the green **Print** button (or press **Ctrl + P** on your keyboard).
5. To save an electronic copy for emailing to the patient or doctor, click the **Download PDF** button.

---

## 5. Digital Signatures: Setting Up Electronic Signatures

1. Click **Signature** on the left navigation menu.
2. You will see your user profile card with your digital signature canvas.
3. **To Draw Your Signature:**
   * Use your mouse or a touchscreen stylus to sign inside the signature box.
   * If you make a mistake, click the gray **Clear** button and sign again.
4. **To Upload a Scanned Signature:**
   * Click the **Upload Signature Image** button and select a high-resolution PNG image of your signature (transparent background recommended).
5. Click the green **Save Signature** button.
6. Once saved, your signature will automatically appear on all lab reports, consultation charts, and medical certificates where you are selected as the signatory.

---

## 6. Equipment & Quality Control: Levey-Jennings Charts & Westgard Rules

This module tracks analyzer maintenance, daily calibration, and statistical Quality Control.

### How to Record Daily Quality Control Runs:
1. Click **Equipment & QC** on the left menu.
2. Click on the instrument card you are operating (e.g., *Mindray BS-240 Clinical Chemistry Analyzer*).
3. Click the **Levey-Jennings Chart** tab.
4. Select the analyte from the dropdown menu (e.g., *Glucose*, *Creatinine*, *Cholesterol*).
5. Select the Control Level: **Level 1 (Normal Control)** or **Level 2 (High/Pathologic Control)**.
6. Click the blue **+ Add QC Entry** button.
7. Enter today's measured concentration value and click **Save QC Run**.
8. **Correcting Clerical Mistakes:** If you made a typographical error while typing a value, click the orange **Drop Previous Run** button. This safely deletes the latest entry without damaging historical records.

### How to Interpret the Levey-Jennings (LJ) Chart & Westgard Flags:
The system automatically plots your entry on the interactive SVG chart with the Mean line, $\pm 1SD$, $\pm 2SD$, and $\pm 3SD$ boundary lines:
* **Green Point (Pass):** Value is within acceptable analytical variation ($< \pm 2SD$).
* **Yellow Alert ($1_{2s}$ Warning Rule):** 1 control value exceeded $\pm 2SD$. Check for early reagent aging or calibration drift.
* **Red Alert ($1_{3s}$ Rejection Rule):** 1 control value exceeded $\pm 3SD$. Random error detected. **Do not release patient results**; recalibrate and re-run control.
* **Red Alert ($2_{2s}$ Rejection Rule):** 2 consecutive control runs exceeded the same $+2SD$ or $-2SD$ limit. Systematic error detected. Inspect reagent lot and recalibrate.
* **Red Alert ($R_{4s}$ Rejection Rule):** The difference between two runs in the same batch exceeded $4SD$.
* **Red Alert ($10_x$ Rejection Rule):** 10 consecutive readings fall on the same side of the mean line. Indicates instrument drift or standard degradation.

### How to Print the DOH Monthly QC Inspection Summary:
1. Click the **Monthly Summary** tab on your analyzer screen.
2. Select the target month and year.
3. Click the **Print DOH Summary Table** button.
   * This generates a single-page compliance table displaying the Mean, Standard Deviation, and $\%CV$ for every analyte, ready for Department of Health (DOH) licensing inspectors.

---

## 7. NEQAS & Dynamic External Reference Laboratories

1. On the left menu, click **Equipment & QC** and select the **NEQAS / EQA** tab.
2. **Dynamic NRL Setup:**
   * Click **+ Register Reference Lab** to view or configure designated National Reference Laboratories (e.g., *East Avenue Medical Center - EAMC*, *Lung Center of the Philippines - LCP*, *NKTI*, *RITM*, *Philippine Heart Center*).
3. **Recording an EQA Survey Result:**
   * Select your participating NRL (e.g. *EAMC Drug Testing Survey*).
   * Enter the Survey Round Code, Sample ID, and the Analyte (e.g., *THC / Cannabinoids* or *Methamphetamine*).
   * Enter your laboratory's Reported Value, the Peer Group Mean, and Peer Group Standard Deviation.
   * Click **Calculate SDI & Save**.

The system automatically computes the Standard Deviation Index using the peer evaluation formula:

$$
\text{SDI} = \frac{\text{Lab Result} - \text{Peer Group Mean}}{\text{Peer Group SD}}
$$

4. **Evaluating Your Standard Deviation Index (SDI / Z-Score):**
   * **$|SDI| \le 2.0$ (Green Badge):** Acceptable / Pass.
   * **$2.0 < |SDI| < 3.0$ (Yellow Badge):** Questionable / Warning. Review analytical process.
   * **$|SDI| \ge 3.0$ (Red Badge):** Unsatisfactory / Action Required.
   * *Automatic DOH Corrective Action Form:* When an unsatisfactory score is recorded, the system automatically creates and appends an official **Corrective Action Form** requiring root cause analysis and pathologist sign-off.
5. Click **Print NEQAS Certificate** to produce an official framed certificate for laboratory accreditation.

---

## 8. Inventory & Clinical Supplies Management

1. Click **Inventory** on the left menu.
2. Select your department tab: *Clinical Chemistry*, *Hematology*, *Urinalysis*, *Serology*, *Radiology*, or *General Supplies*.
3. **Receiving New Supplies (Stock-In):**
   * Click the green **+ Stock In** button at the top-right.
   * Select the reagent or item from the dropdown list.
   * Enter the Quantity received, Lot / Batch Number, and Manufacturer Expiration Date.
   * Click **Confirm Stock-In**.
4. **Recording Reagent Waste or Disposal (Stock-Out):**
   * Click the orange **Stock Out / Adjust** button on the item row.
   * Enter the quantity removed, select the reason (*Expired*, *Damaged*, *Quality Control consumption*, or *Spill*), and enter an explanation in the **Audit Remarks** field.
   * Click **Save Adjustment**.
5. **Automatic Deduction:**
   * You do not need to manually deduct reagents used for daily testing! The system automatically deducts the exact required tests from active inventory lots every time a test is marked Completed.
6. **Near-Expiry & Low-Stock Alerts:**
   * Reagents with fewer than 30 days before expiration display an amber **Near Expiry** badge.
   * Items with stock levels below their reorder threshold display a pulsing red **Low Stock** warning.

---

## 9. Doctor Consultations & Outpatient Encounters

This module is designed for attending clinic physicians and outpatient medical officers.

### How to Conduct an Outpatient Consultation:
1. Click **Tests & Results** on the left menu.
2. Look for rows marked with **Doctor Check-up - Dr. [Name]** (or code prefix `DC*`).
3. Click the teal **Start Consultation** button (or click **Consultation** if already started).
4. **Doctor Auto-Detection:**
   * When you log in with your physician account, the system automatically fills in your name, professional title, and PRC medical license number.
5. **Documenting the SOAP Encounter:**
   * **[S] Subjective:**
     - Type the patient's **Chief Complaint (CC)** and **History of Present Illness (HPI)**.
     - Document current medications and known allergies (allergies will be highlighted in red).
     - Under **DOH PhilPEN Lifestyle Risk Assessment**:
       * Select smoking status and enter sticks smoked per day and years smoked (the system automatically calculates lifetime **Pack-Years**).
       * Check alcohol consumption frequency and assess binge drinking risk.
       * Click pills on the **Familial NCD Checklist** (Hypertension, Diabetes, Stroke, Asthma, Cancer) to auto-populate family medical history.
   * **[O] Objective:**
     - Enter patient vital signs: Blood Pressure (Systolic/Diastolic), Heart Rate, Respiratory Rate, Temperature, and Blood Sugar.
     - Enter **Weight (kg)** and **Height (cm)**. The system calculates the patient's **BMI** in real time and displays their Asia-Pacific FNRI weight classification badge (*Normal*, *Overweight*, or *Obese*).
     - Check physical examination findings.
     - Click **View Result** on previous lab tests to instantly review prior diagnostic PDF reports.
   * **[A] Assessment:**
     - Type to search in the **ICD-10 Diagnosis** box to select the official clinical diagnosis.
     - Enter your clinical impression and notes.
   * **[P] Plan:**
     - In the **Prescription (Rx)** section, type medication name, dosage, frequency, and duration.
     - In the **Diagnostic Requisitions** section, check any follow-up tests requested.
     - Provide lifestyle and dietary advice.
6. **Printing Official Medical Documents:**
   * Click **Print Medical Chart** for the complete full-page clinical encounter record.
   * Click **Print Prescription** for the official Philippine Rx prescription slip with your license, PTR, and S2 numbers.
   * Click **Print Medical Certificate** for an official fit-to-work or illness certificate.
   * Click **Print Lab Request** for the diagnostic requisition slip.
7. Click the green **Complete Consultation** button. This updates the patient's status to **Checked** and locks the chart.

---

## 10. Human Resources (HR) & Philippine Statutory Payroll

1. Click **HR & Payroll** on the left menu.
2. **Employee Master Directory:**
   * Click **Employees** to view all registered staff.
   * Click **+ New Employee** to add a new staff member. Complete their personal info, employment type (*Daily Duty*, *Fixed Monthly*, or *Commission*), daily rate, and statutory ID numbers (TIN, SSS, PhilHealth, Pag-IBIG).
3. **Daily Time Records (DTR):**
   * Staff can click **My HR Portal** &rarr; **Daily Time Record** to view their daily morning and afternoon time logs.
   * The attendance engine automatically computes regular duty hours, tardiness, undertime, overtime, and holiday pay.
4. **Filing & Approving Leaves:**
   * To file a leave, an employee clicks **Apply for Leave**, selects the leave type (*Vacation*, *Sick*, *Maternity*, *Bereavement*), and clicks **Submit**.
   * Managers click **Leaves** &rarr; **Approve** or **Reject** with remarks. Click **Print Leave Slip** for physical documentation.
5. **Computing Semi-Monthly Payroll:**
   * Click the **Payroll** tab and click the blue **Compute Payroll** button.
   * Select the cut-off period (e.g., 1st to 15th or 16th to end of month).
   * The system computes:
     * Gross Earnings (Daily rate $\times$ days worked + Overtime + Holiday + Allowances).
     * Statutory Deductions (Progressive 2025/2026 SSS matrix, PhilHealth 5% split, Pag-IBIG, and BIR TRAIN withholding tax).
     * Net Take-Home Pay.
   * Click **Export Payroll Register** to download the bank disbursement spreadsheet in Excel format.
   * Click **Print Payslip** next to any employee name to generate their official confidential payslip.

---

## 11. Costing & Profitability (P&L) Analytics

1. Click **Costing & P&L** on the left navigation menu.
2. **Cost-Per-Test Economics:**
   * Click **Cost Per Test** to view the itemized direct cost for each procedure.
   * The system calculates reagent cost (linked to live inventory prices), control cost, consumable tubes/tips, MedTech labor, and machine depreciation.
   * Review the **Gross Margin %** to ensure your selling prices remain profitable.
3. **Recording Clinic Expenses:**
   * Click **Expenses** &rarr; **+ Add Expense**.
   * Choose the category (*Rent*, *Utilities*, *Reagents*, *Salaries*, *Waste Disposal*, *Licensing*), enter the amount, and click **Save**.
4. **Reviewing Financial Performance:**
   * Click **P&L Overview** or **Monthly Statement** to inspect total revenue, gross margin, operating expenses, and net clinic profit.

---

## 12. System Settings & Customization

1. Click **Settings** on the left navigation menu.
2. **Clinic Header Information:**
   * Update the official Clinic Name, DOH License Number, Address, and Telephone Hotlines.
   * Upload or change the clinic logo.
3. **Thermal Barcode Printer Setup:**
   * Select your installed thermal label printer name from the dropdown menu and set your label dimensions (e.g. 50mm $\times$ 30mm).
4. **GezyneBot AI Configuration:**
   * Enter your encrypted OpenRouter API key and select your preferred AI model from the dropdown list.
5. **Sync Settings (Standalone Desktop Workstations):**
   * On standalone client computers, click the blue **Sync Settings from Server** button to instantly pull clinic settings and doctor room names from the central server.

---

## 13. GezyneBot AI Assistant

1. Click **GezyneBot AI** on the left navigation menu (or click the floating robot icon at the bottom-right corner of any page).
2. Type your question in plain English or Tagalog into the chat box and press **Enter** (or click the send icon).
3. **Example questions you can ask GezyneBot:**
   * *"How do I import blood chemistry results from the analyzer?"*
   * *"What should I do if my Levey-Jennings chart flags a 2_2s Westgard violation?"*
   * *"What is the phlebotomy order of draw for a CBC, PT, and Fasting Blood Sugar?"*
   * *"How is overtime and holiday pay calculated for daily duty staff?"*
   * *"What are the critical panic values for serum potassium and glucose?"*
4. GezyneBot will immediately respond with step-by-step instructions referencing this user manual.

---

## 14. Clinical Reference & Emergency Panic Values

### Order of Draw for Phlebotomy:
1. **1st - Blood Cultures (SPS Yellow Top) or Sterile Tubes**
2. **2nd - Sodium Citrate (Light Blue Top):** PT, APTT, Coagulation. Must be filled to the mark!
3. **3rd - Serum Tubes (Red Top / Gold SST Gel):** Chemistry, Serology, Thyroid.
4. **4th - Heparin (Green Top):** Stat Chemistry, Electrolytes, Troponin.
5. **5th - EDTA (Lavender Top):** CBC, Hematology, Blood Typing, HbA1c. Invert 8–10 times.
6. **6th - Sodium Fluoride (Gray Top):** Glucose testing.

### Critical / Panic Values Requiring Immediate Physician Notification:
* **Fasting Blood Sugar:** $< 45 \text{ mg/dL}$ (Severe Hypoglycemia) or $> 400 \text{ mg/dL}$ (DKA Risk)
* **Potassium ($K^+$):** $< 2.8 \text{ mmol/L}$ or $> 6.0 \text{ mmol/L}$ (Severe Cardiac Arrest Risk)
* **Sodium ($Na^+$):** $< 120 \text{ mmol/L}$ or $> 160 \text{ mmol/L}$
* **Platelet Count:** $< 20,000 \text{ /}\mu\text{L}$ (Spontaneous Hemorrhage Risk) or $> 1,000,000 \text{ /}\mu\text{L}$
* **Hemoglobin:** $< 7.0 \text{ g/dL}$ (Critical Anemia)
* **PT / INR:** $\text{INR} > 4.5$ (High Bleeding Risk)

> **Mandatory Emergency Protocol:** Whenever a panic value is encountered, the Medical Technologist must immediately check sample integrity (verify no micro-clot or hemolysis), re-run the test on the instrument, and contact the attending physician and supervising pathologist immediately.

---
*End of Gezyne LIS Staff & User Operation Manual (v2.6.3)*
