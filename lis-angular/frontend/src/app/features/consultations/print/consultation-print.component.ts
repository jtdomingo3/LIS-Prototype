import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ConsultationService } from '../../../core/services/consultation.service';

@Component({
  selector: 'app-consultation-print',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="print-page-wrapper">
      <!-- Print Actions Bar (Hidden on print) -->
      <div class="no-print action-bar">
        <button type="button" class="btn btn-print" (click)="printDocument()">
          <i class="fa fa-print"></i> Print Document
        </button>
        <span class="hint">Print orientation: Portrait. Letter or A4 size.</span>
      </div>

      @if (loading()) {
        <div class="loading-state">Loading document data...</div>
      } @else if (error()) {
        <div class="error-state">{{ error() }}</div>
      } @else {
        <!-- Printable Paper Container -->
        <div class="print-paper" id="printable-area">
          <!-- Official Letterhead -->
          <header class="clinic-header">
            <div class="clinic-logo-box">
              <img src="assets/gezyne-logo.png" alt="Gezyne Logo" class="clinic-logo" />
            </div>
            <div class="clinic-info">
              <h2>GEZYNE CLINICAL LABORATORY &amp; MEDICAL CLINIC</h2>
              <div class="clinic-sub">Complete Diagnostic &amp; Outpatient Clinical Services</div>
              <div class="clinic-contact">DOH Accredited Primary Clinical Laboratory &bull; Bacolod City, Philippines &bull; (034) 434-0000</div>
            </div>
          </header>

          <div class="divider-double"></div>

          <!-- Document Specific Title -->
          <div class="doc-title-banner">
            <h1>{{ documentTitle() }}</h1>
          </div>

          <!-- Patient & Encounter Metadata Banner -->
          <section class="meta-grid">
            <div class="meta-row">
              <span class="label">Patient Name:</span>
              <strong class="val">{{ data().patient?.first_name }} {{ data().patient?.middle_name || '' }} {{ data().patient?.last_name }}</strong>
              <span class="label">Patient Code:</span>
              <span class="val">{{ data().patient?.patient_code || 'N/A' }}</span>
            </div>
            <div class="meta-row">
              <span class="label">Age / Gender:</span>
              <span class="val">{{ data().patient?.age || data().patient?.age_manual || 'N/A' }} / {{ data().patient?.gender || 'N/A' }}</span>
              <span class="label">Encounter Date:</span>
              <span class="val">{{ data().consultation?.consultation_date | date:'mediumDate' }}</span>
            </div>
            <div class="meta-row">
              <span class="label">Address / Contact:</span>
              <span class="val">{{ data().patient?.address || 'N/A' }} &bull; {{ data().patient?.phone || 'N/A' }}</span>
              <span class="label">Attending Doctor:</span>
              <strong class="val">{{ data().consultation?.doctor_name || 'Dr. Attending Physician' }}</strong>
            </div>
          </section>

          <!-- 1. PATIENT MEDICAL CHART VIEW -->
          @if (docType() === 'chart') {
            <div class="doc-body chart-body">
              <!-- Subjective -->
              <div class="section-block">
                <div class="section-title">[S] Subjective Findings</div>
                <p><strong>Chief Complaint:</strong> {{ data().consultation?.chief_complaint || 'None recorded' }}</p>
                @if (data().consultation?.history_of_present_illness) {
                  <p><strong>History of Present Illness:</strong> {{ data().consultation?.history_of_present_illness }}</p>
                }
                @if (data().consultation?.past_medical_history) {
                  <p><strong>Past Medical History:</strong> {{ data().consultation?.past_medical_history }}</p>
                }
                <p><strong>Allergies:</strong> <span [class.red-text]="data().consultation?.allergies">{{ data().consultation?.allergies || 'NKDA (No Known Drug Allergies)' }}</span></p>
                <div class="lifestyle-strip">
                  <span><strong>Smoking:</strong> {{ data().consultation?.smoking?.status }} ({{ data().consultation?.smoking?.packYears || 0 }} pack-years)</span>
                  <span><strong>Alcohol:</strong> {{ data().consultation?.alcohol?.status }} (Binge risk: {{ data().consultation?.alcohol?.bingeDrinking || 'No' }})</span>
                </div>
              </div>

              <!-- Objective -->
              <div class="section-block">
                <div class="section-title">[O] Objective &amp; Vital Signs</div>
                <table class="compact-table vitals-table">
                  <tbody>
                    <tr>
                      <td><strong>BP:</strong> {{ data().consultation?.vital_signs?.bloodPressureSystolic || '--' }}/{{ data().consultation?.vital_signs?.bloodPressureDiastolic || '--' }} mmHg</td>
                      <td><strong>Pulse:</strong> {{ data().consultation?.vital_signs?.pulseRate || '--' }} bpm</td>
                      <td><strong>Resp:</strong> {{ data().consultation?.vital_signs?.respiratoryRate || '--' }} cpm</td>
                      <td><strong>Temp:</strong> {{ data().consultation?.vital_signs?.temperature || '--' }} °C</td>
                    </tr>
                    <tr>
                      <td><strong>Weight:</strong> {{ data().consultation?.vital_signs?.weight || '--' }} kg</td>
                      <td><strong>Height:</strong> {{ data().consultation?.vital_signs?.height || '--' }} cm</td>
                      <td colspan="2"><strong>BMI (Asia-Pacific):</strong> {{ data().consultation?.vital_signs?.bmi || '--' }} ({{ data().consultation?.vital_signs?.bmiCategory || 'N/A' }})</td>
                    </tr>
                  </tbody>
                </table>
                @if (data().consultation?.physical_exam_findings) {
                  <p style="margin-top: 8px;"><strong>Physical Examination:</strong> {{ data().consultation?.physical_exam_findings }}</p>
                }
              </div>

              <!-- Assessment -->
              <div class="section-block">
                <div class="section-title">[A] Assessment &amp; Diagnosis</div>
                <div class="diagnosis-box">
                  <strong>PRIMARY DIAGNOSIS:</strong> {{ data().consultation?.primary_diagnosis || 'Under Evaluation' }}
                </div>
                @if (data().consultation?.clinical_impression) {
                  <p style="margin-top: 6px;"><strong>Clinical Impression:</strong> {{ data().consultation?.clinical_impression }}</p>
                }
              </div>

              <!-- Plan -->
              <div class="section-block">
                <div class="section-title">[P] Treatment Plan &amp; Recommendations</div>
                @if (data().consultation?.prescriptions?.length > 0) {
                  <table class="compact-table rx-print-table">
                    <thead>
                      <tr>
                        <th>Medication</th>
                        <th>Dosage</th>
                        <th>Sig / Frequency</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (rx of data().consultation?.prescriptions; track rx.medication) {
                        <tr>
                          <td><strong>{{ rx.medication }}</strong></td>
                          <td>{{ rx.dosage }}</td>
                          <td>{{ rx.instructions || rx.frequency }}</td>
                          <td>{{ rx.duration }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
                @if (data().consultation?.treatment_plan) {
                  <p style="margin-top: 6px;"><strong>Advice / Lifestyle:</strong> {{ data().consultation?.treatment_plan }}</p>
                }
                @if (data().consultation?.follow_up_date) {
                  <p><strong>Follow-up Schedule:</strong> {{ data().consultation?.follow_up_date | date:'mediumDate' }}</p>
                }
              </div>
            </div>
          }

          <!-- 2. OFFICIAL PRESCRIPTION PAD (Rx) -->
          @if (docType() === 'prescription') {
            <div class="doc-body rx-body">
              <div class="rx-symbol">℞</div>
              <div class="rx-items-list">
                @for (rx of data().consultation?.prescriptions; track rx.medication; let i = $index) {
                  <div class="rx-item">
                    <div class="rx-num">{{ i + 1 }}.</div>
                    <div class="rx-content">
                      <div class="rx-drug"><strong>{{ rx.medication }}</strong> {{ rx.dosage }}</div>
                      <div class="rx-sig">Sig: {{ rx.instructions || rx.frequency }} (for {{ rx.duration || 'as directed' }})</div>
                    </div>
                  </div>
                }
                @if (!data().consultation?.prescriptions?.length) {
                  <p class="empty-note">No medications entered on this prescription.</p>
                }
              </div>
            </div>
          }

          <!-- 3. MEDICAL CERTIFICATE -->
          @if (docType() === 'med-cert') {
            <div class="doc-body medcert-body">
              <p class="salutation">TO WHOM IT MAY CONCERN:</p>
              <p class="cert-text">
                This is to certify that <strong>{{ data().patient?.first_name }} {{ data().patient?.middle_name || '' }} {{ data().patient?.last_name }}</strong>,
                {{ data().patient?.age || data().patient?.age_manual || 'N/A' }} years of age, residing at {{ data().patient?.address || 'N/A' }},
                was clinically examined and treated at this clinic on <strong>{{ data().consultation?.consultation_date | date:'longDate' }}</strong>
                with the following clinical findings and diagnosis:
              </p>

              <div class="cert-diagnosis-box">
                <div class="cert-diag-label">DIAGNOSIS:</div>
                <div class="cert-diag-val">{{ data().consultation?.primary_diagnosis || 'Medical Evaluation' }}</div>
              </div>

              <p class="cert-text">
                <strong>Recommendations / Remarks:</strong><br/>
                {{ data().consultation?.treatment_plan || 'Patient is advised medical rest and hydration.' }}
              </p>
              <p class="disclaimer-note">
                <em>* This certification is issued upon patient request for valid medical purposes except for medico-legal verification.</em>
              </p>
            </div>
          }

          <!-- 4. LABORATORY REQUISITIONS -->
          @if (docType() === 'lab-request') {
            <div class="doc-body labreq-body">
              <div class="labreq-title">DIAGNOSTIC TEST REQUISITIONS:</div>
              <ul class="labreq-list">
                @for (t of data().consultation?.lab_request_tests; track t) {
                  <li><span class="box-check">&#9633;</span> <strong>{{ t }}</strong></li>
                }
                @if (!data().consultation?.lab_request_tests?.length) {
                  <li class="empty-note">No laboratory tests requested.</li>
                }
              </ul>
              @if (data().consultation?.primary_diagnosis) {
                <p style="margin-top: 15px;"><strong>Clinical Indication / Impression:</strong> {{ data().consultation?.primary_diagnosis }}</p>
              }
            </div>
          }

          <!-- Doctor Attestation Signature Block -->
          <footer class="signature-block">
            <div class="sig-line"></div>
            <div class="doc-name"><strong>{{ data().consultation?.doctor_name || 'Attending Physician' }}</strong></div>
            <div class="doc-title">{{ data().consultation?.doctor_designation || 'Attending Physician' }}</div>
            <div class="doc-creds">
              PRC License No.: {{ data().consultation?.doctor_license_number || '_______________' }} &bull; PTR No.: _______________
            </div>
          </footer>
        </div>
      }
    </div>
  `,
  styles: [`
    .print-page-wrapper {
      background: #f1f5f9;
      min-height: 100vh;
      padding: 20px;
      font-family: 'Inter', sans-serif;
    }

    .action-bar {
      max-width: 800px;
      margin: 0 auto 15px auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }

    .btn-print {
      background: #10b981;
      color: white;
      border: none;
      padding: 8px 18px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.95rem;
    }

    .btn-print:hover {
      background: #059669;
    }

    .hint {
      color: #64748b;
      font-size: 0.85rem;
    }

    /* Standard Printable Sheet (US Letter / A4) */
    .print-paper {
      width: 794px;
      min-height: 1123px;
      margin: 0 auto;
      background: white;
      padding: 40px 50px;
      box-sizing: border-box;
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      position: relative;
      color: #1e293b;
      display: flex;
      flex-direction: column;
    }

    .clinic-header {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .clinic-logo {
      width: 65px;
      height: 65px;
      object-fit: contain;
    }

    .clinic-info h2 {
      font-size: 1.15rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
      letter-spacing: -0.3px;
    }

    .clinic-sub {
      font-size: 0.85rem;
      font-weight: 600;
      color: #10b981;
      margin-top: 2px;
    }

    .clinic-contact {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 3px;
    }

    .divider-double {
      border-top: 2px solid #0f172a;
      border-bottom: 1px solid #0f172a;
      height: 3px;
      margin: 15px 0 12px 0;
    }

    .doc-title-banner h1 {
      font-size: 1.15rem;
      font-weight: 800;
      text-align: center;
      text-transform: uppercase;
      margin: 0 0 12px 0;
      letter-spacing: 0.5px;
      color: #0f172a;
    }

    .meta-grid {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.8rem;
      margin-bottom: 15px;
    }

    .meta-row {
      display: grid;
      grid-template-columns: 120px 1fr 120px 1fr;
      padding: 3px 0;
    }

    .meta-row .label {
      color: #64748b;
      font-weight: 600;
    }

    .doc-body {
      flex: 1;
      font-size: 0.85rem;
      line-height: 1.5;
    }

    .section-block {
      margin-bottom: 12px;
    }

    .section-title {
      font-weight: 800;
      text-transform: uppercase;
      font-size: 0.85rem;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 3px;
      margin-bottom: 6px;
      color: #0f172a;
    }

    .lifestyle-strip {
      display: flex;
      gap: 20px;
      font-size: 0.8rem;
      margin-top: 6px;
      background: #f1f5f9;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .compact-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
    }

    .compact-table td, .compact-table th {
      border: 1px solid #cbd5e1;
      padding: 5px 8px;
    }

    .compact-table th {
      background: #f8fafc;
    }

    .diagnosis-box {
      background: #f0fdf4;
      border-left: 4px solid #16a34a;
      padding: 8px 12px;
      font-size: 0.95rem;
    }

    .red-text {
      color: #dc2626;
      font-weight: 700;
    }

    /* Rx Pad */
    .rx-symbol {
      font-size: 2.2rem;
      font-weight: 800;
      font-family: serif;
      margin: 10px 0;
      color: #0f172a;
    }

    .rx-items-list {
      margin-left: 20px;
    }

    .rx-item {
      display: flex;
      gap: 10px;
      margin-bottom: 14px;
    }

    .rx-num {
      font-weight: 700;
      color: #64748b;
    }

    .rx-drug {
      font-size: 0.95rem;
    }

    .rx-sig {
      font-size: 0.85rem;
      font-style: italic;
      color: #334155;
    }

    /* Med Cert */
    .salutation {
      font-weight: 700;
      margin: 20px 0 15px 0;
    }

    .cert-text {
      text-indent: 30px;
      text-align: justify;
      line-height: 1.8;
      margin-bottom: 15px;
    }

    .cert-diagnosis-box {
      border: 1px dashed #94a3b8;
      padding: 12px 16px;
      margin: 15px 0;
      text-align: center;
    }

    .cert-diag-label {
      font-size: 0.75rem;
      font-weight: 700;
      color: #64748b;
    }

    .cert-diag-val {
      font-size: 1.15rem;
      font-weight: 800;
      color: #0f172a;
      margin-top: 4px;
    }

    .disclaimer-note {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 30px;
    }

    /* Lab Request */
    .labreq-title {
      font-weight: 700;
      margin-bottom: 10px;
    }

    .labreq-list {
      list-style: none;
      padding-left: 5px;
    }

    .labreq-list li {
      padding: 6px 0;
      font-size: 0.9rem;
    }

    .box-check {
      font-size: 1.2rem;
      margin-right: 8px;
    }

    /* Signature */
    .signature-block {
      margin-top: auto;
      padding-top: 35px;
      width: 280px;
      margin-left: auto;
      text-align: center;
    }

    .sig-line {
      border-top: 1px solid #0f172a;
      margin-bottom: 6px;
    }

    .doc-name {
      font-size: 0.95rem;
    }

    .doc-title {
      font-size: 0.8rem;
      color: #475569;
    }

    .doc-creds {
      font-size: 0.7rem;
      color: #64748b;
      margin-top: 2px;
    }

    /* Print Styles */
    @media print {
      body, html {
        background: white !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .no-print {
        display: none !important;
      }
      .print-page-wrapper {
        padding: 0 !important;
        background: white !important;
      }
      .print-paper {
        box-shadow: none !important;
        width: 100% !important;
        min-height: auto !important;
        padding: 20px 30px !important;
      }
    }
  `]
})
export class ConsultationPrintComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private consultService = inject(ConsultationService);

  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  data = signal<any>({});
  docType = signal<'chart' | 'prescription' | 'med-cert' | 'lab-request'>('chart');

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const type = this.route.snapshot.paramMap.get('type') as any;
    if (type) this.docType.set(type);

    if (id) {
      this.consultService.getPrintData(id).subscribe({
        next: (res) => {
          this.data.set(res);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.error || 'Failed to load document');
          this.loading.set(false);
        }
      });
    }
  }

  documentTitle(): string {
    const t = this.docType();
    if (t === 'chart') return 'PATIENT OUTPATIENT MEDICAL CHART';
    if (t === 'prescription') return 'PHYSICIAN PRESCRIPTION ORDER';
    if (t === 'med-cert') return 'OFFICIAL MEDICAL CERTIFICATE';
    if (t === 'lab-request') return 'LABORATORY & DIAGNOSTIC REQUISITION';
    return 'CLINICAL DOCUMENT';
  }

  printDocument(): void {
    window.print();
  }
}
