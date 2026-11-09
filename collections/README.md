# Gezyne LIS - Server REST API Collections

This directory contains standardized API request collections and environment schemas for testing, verifying, and integrating with the **Gezyne Laboratory Information System (LIS)** server application.

The collections are formatted using the open **v2.1.0 collection specification**, making them compatible with any standard REST client or automated runner (VS Code REST Client, Insomnia, Thunder Client, Postman, Bruno, curl, or CLI test runners).

---

## 📁 Included Files

1. **`api_collection.json`**: Complete API collection featuring **72 endpoints** across all 18 clinical, analytical, financial, and administrative modules:
   - **1. Authentication & Security**: JWT token issuance, verification, session keepalive ping, CSRF forms, and logout.
   - **2. Dashboard & Analytics**: Real-time KPI statistics and mobile/kiosk summary metrics.
   - **3. Patients Registry & Auto-MRN**: Demographic records, auto-MRN generation, and live autocomplete searches.
   - **4. Reception & 10-Station Queue**: Patient check-in, station stage completion, and rollback/undo across all 10 clinical stations.
   - **5. Laboratory Tests & Diagnostic Results**: Test orders, analyte entry, auto-calculated Wintrobe indices, MedTech verification, and Pathologist release.
   - **6. Clinical Reports & Printing**: Report HTML preview, PDF generation, daily worksheet compilation, and batch print queue.
   - **7. Diagnostic Templates & Catalog**: Catalog panel definitions, analyte codes, units, and reference ranges.
   - **8. Diagnostic Inventory & ISO 15189**: Reagent items, lot batch numbers, consumption logs, and critical stock / expiry alerts.
   - **9. Equipment QC & Levey-Jennings**: Analyzer registry, IQC Levey-Jennings data points, Westgard multi-rules (1:2s, 1:3s, 2:2s, R:4s, 4:1s, 10:x), and NEQAS NRL reference centers.
   - **10. User Management & RBAC Permissions**: Staff provisioning, role-based permission matrices, and administrative password resets.
   - **11. Settings, Accreditations & Database Backup**: Facility licenses (DOH LTO, PhilHealth accreditation), thermal printer configuration, and emergency database recovery.
   - **12. Digital Signatures & PIN Authorization**: Electronic signatory certification and 4-6 digit cryptographic PIN verification.
   - **13. Laboratory Costing & Financial P&L**: Operating expenses, daily cash intake, and monthly accounting Profit & Loss statements.
   - **14. Human Resources & Statutory Payroll**: Staff directory, DTR attendance logs, and Philippine statutory deductions (TRAIN tax, SSS, PhilHealth, Pag-IBIG).
   - **15. PhilHealth Konsulta & HMO Health Card**: Primary care e-Claims, statement of account (SOA), and corporate HMO billing.
   - **16. Doctor Consultations & Physical Exam**: SOAP clinical encounters, diagnoses, and medical prescriptions.
   - **17. GezyneBot Clinical AI Assistant**: Embedded RAG vector search, diagnostic manual queries, and clinical Q&A.
   - **18. Offline Standalone Synchronization**: Standalone client state hydration and bulk mutation replay queue (`/api/sync`).

2. **`environment.json`**: Pre-configured environment variables:
   - `baseUrl`: Default `http://127.0.0.1:3000`
   - `authToken`: Automatically populated via test script when running `POST /api/auth/token`
   - `adminEmail`: Configurable test email
   - `adminPassword`: Configurable admin password
   - Dynamic IDs: `{{patientId}}`, `{{testId}}`, `{{equipmentId}}`, `{{itemId}}`, `{{employeeId}}`

---

## 🚀 How to Import and Use

### In any GUI REST Client (Insomnia, Postman, Bruno, Thunder Client)
1. Open your REST client.
2. Click **Import** or **Open Collection**.
3. Select both:
   - `collections/api_collection.json`
   - `collections/environment.json`
4. Select the imported environment (`Gezyne LIS Local Environment`).
5. Run **"1. Authentication & Security > Get JWT Auth Token"**:
   - The embedded script captures the returned Bearer token into `{{authToken}}`.
   - All subsequent endpoint calls in the collection inherit this token automatically.

### Automated Terminal / CI/CD Execution
You can run the entire collection headlessly from your terminal:

```bash
# Using Newman CLI
npx newman run collections/api_collection.json -e collections/environment.json
```
