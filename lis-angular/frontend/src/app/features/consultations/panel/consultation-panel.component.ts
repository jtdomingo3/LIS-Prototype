import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConsultationService } from '../../../core/services/consultation.service';
import { PatientService } from '../../../core/services/patient.service';
import { TestService } from '../../../core/services/test.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { Consultation, Patient, Test, PrescriptionItem } from '../../../core/models';

@Component({
  selector: 'app-consultation-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="consultation-container">
      <!-- Top Sticky Action Header -->
      <header class="encounter-header">
        <div class="header-left">
          <button type="button" class="btn btn-outline" (click)="goBack()">
            <i class="fa fa-arrow-left"></i> Back
          </button>
          <div class="title-group">
            <h1>
              <span class="encounter-icon">🩺</span>
              Outpatient Clinical Consultation
            </h1>
            <div class="encounter-meta">
              <span class="badge" [ngClass]="consultation().status === 'Completed' ? 'badge-completed' : 'badge-progress'">
                {{ consultation().status === 'Completed' ? '✓ ENCOUNTER COMPLETED' : '● IN PROGRESS' }}
              </span>
              <span class="meta-item"><strong>Date:</strong> {{ consultation().consultation_date | date:'mediumDate' }}</span>
              <span class="meta-item"><strong>Visit:</strong> {{ consultation().visit_type }}</span>
            </div>
          </div>
        </div>

        <div class="header-actions">
          <div class="print-dropdown">
            <button type="button" class="btn btn-secondary" (click)="togglePrintMenu()">
              <i class="fa fa-print"></i> Print Documents <i class="fa fa-caret-down"></i>
            </button>
            @if (showPrintMenu()) {
              <div class="dropdown-menu">
                <a [routerLink]="['/consultations', consultation().id, 'print', 'chart']" target="_blank" class="dropdown-item">
                  <i class="fa fa-notes-medical"></i> Patient Medical Chart
                </a>
                <a [routerLink]="['/consultations', consultation().id, 'print', 'prescription']" target="_blank" class="dropdown-item">
                  <i class="fa fa-prescription"></i> Official Prescription Pad (Rx)
                </a>
                <a [routerLink]="['/consultations', consultation().id, 'print', 'med-cert']" target="_blank" class="dropdown-item">
                  <i class="fa fa-certificate"></i> Medical Certificate
                </a>
                <a [routerLink]="['/consultations', consultation().id, 'print', 'lab-request']" target="_blank" class="dropdown-item">
                  <i class="fa fa-vial"></i> Laboratory Request
                </a>
              </div>
            }
          </div>

          <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="saveConsultation(false)">
            <i class="fa fa-save"></i> {{ saving() ? 'Saving...' : 'Save Encounter' }}
          </button>

          @if (consultation().status !== 'Completed') {
            <button type="button" class="btn btn-success" [disabled]="saving()" (click)="saveConsultation(true)">
              <i class="fa fa-check-circle"></i> Complete Encounter
            </button>
          }
        </div>
      </header>

      <!-- Patient Banner -->
      <section class="patient-banner">
        <div class="patient-summary">
          <div class="avatar">{{ patientInitials() }}</div>
          <div class="patient-info">
            <div class="patient-name">
              {{ patient()?.first_name }} {{ patient()?.middle_name || '' }} {{ patient()?.last_name }}
              <span class="patient-code">({{ patient()?.patient_code || 'No Code' }})</span>
            </div>
            <div class="patient-details">
              <span><strong>Age/Sex:</strong> {{ patient()?.age || patient()?.age_manual || 'N/A' }} / {{ patient()?.gender || 'N/A' }}</span>
              <span><strong>Birthdate:</strong> {{ patient()?.date_of_birth || 'N/A' }}</span>
              <span><strong>Contact:</strong> {{ patient()?.phone || 'N/A' }}</span>
              <span><strong>Address:</strong> {{ patient()?.address || 'N/A' }}</span>
            </div>
          </div>
        </div>

        <!-- Attending Physician & Credentials -->
        <div class="physician-box">
          <div class="physician-label">Attending Physician</div>
          <input type="text" class="form-control" [(ngModel)]="consultation().doctor_name" placeholder="Dr. Full Name, MD" />
          <div class="physician-row">
            <input type="text" class="form-control form-control-sm" [(ngModel)]="consultation().doctor_designation" placeholder="Designation (e.g. Internist)" />
            <input type="text" class="form-control form-control-sm" [(ngModel)]="consultation().doctor_license_number" placeholder="PRC License #" />
          </div>
        </div>
      </section>

      <!-- SOAP Navigation Tabs -->
      <nav class="encounter-tabs">
        <button type="button" class="tab-btn" [class.active]="activeTab() === 'subjective'" (click)="activeTab.set('subjective')">
          <span class="tab-badge">S</span> Subjective Assessment
        </button>
        <button type="button" class="tab-btn" [class.active]="activeTab() === 'objective'" (click)="activeTab.set('objective')">
          <span class="tab-badge">O</span> Objective &amp; Vitals
        </button>
        <button type="button" class="tab-btn" [class.active]="activeTab() === 'assessment'" (click)="activeTab.set('assessment')">
          <span class="tab-badge">A</span> Clinical Assessment
        </button>
        <button type="button" class="tab-btn" [class.active]="activeTab() === 'plan'" (click)="activeTab.set('plan')">
          <span class="tab-badge">P</span> Plan &amp; Rx
        </button>
        <button type="button" class="tab-btn" [class.active]="activeTab() === 'history'" (click)="activeTab.set('history')">
          <i class="fa fa-history"></i> Lab History
        </button>
      </nav>

      <!-- Tab Content Panes -->
      <main class="encounter-body">
        <!-- 1. SUBJECTIVE TAB -->
        @if (activeTab() === 'subjective') {
          <div class="tab-pane">
            <div class="card">
              <div class="card-header">
                <h3>Chief Complaint &amp; History of Present Illness</h3>
              </div>
              <div class="card-body">
                <div class="form-group">
                  <label>Chief Complaint (CC) <span class="required">*</span></label>
                  <input type="text" class="form-control" [(ngModel)]="consultation().chief_complaint" placeholder="e.g. Recurrent fever for 3 days with productive cough" />
                </div>
                <div class="form-group">
                  <label>History of Present Illness (HPI)</label>
                  <textarea rows="4" class="form-control" [(ngModel)]="consultation().history_of_present_illness" placeholder="Onset, duration, location, character, aggravating and relieving factors..."></textarea>
                </div>
              </div>
            </div>

            <!-- Medical History & Allergies -->
            <div class="grid-2">
              <div class="card">
                <div class="card-header">
                  <h3>Past Medical History &amp; Medications</h3>
                </div>
                <div class="card-body">
                  <div class="form-group">
                    <label>Past Medical History (PMH)</label>
                    <textarea rows="3" class="form-control" [(ngModel)]="consultation().past_medical_history" placeholder="Previous illnesses, hospitalizations, surgeries..."></textarea>
                  </div>
                  <div class="form-group">
                    <label>Current Medications</label>
                    <textarea rows="2" class="form-control" [(ngModel)]="consultation().current_medications" placeholder="Maintenance drugs, vitamins, supplements..."></textarea>
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="card-header alert-header">
                  <h3>⚠️ Allergies &amp; Drug Sensitivities</h3>
                </div>
                <div class="card-body">
                  <div class="nkda-row">
                    <label class="checkbox-label">
                      <input type="checkbox" [checked]="isNkda()" (change)="toggleNkda($event)" />
                      <strong>No Known Drug Allergies (NKDA)</strong>
                    </label>
                  </div>
                  <div class="form-group">
                    <label>Allergy Details / Warning Notes</label>
                    <textarea rows="3" class="form-control alert-textarea" [(ngModel)]="consultation().allergies" placeholder="Specific allergic reactions (e.g. Penicillin - Urticaria, Aspirin - Bronchospasm)"></textarea>
                  </div>
                </div>
              </div>
            </div>

            <!-- DOH PhilPEN Lifestyle Risk Assessment -->
            <div class="card philpen-card">
              <div class="card-header">
                <h3>🇵🇭 DOH PhilPEN Lifestyle &amp; NCD Risk Screening</h3>
                <span class="subtext">Philippine Package of Essential NCD Interventions</span>
              </div>
              <div class="card-body">
                <div class="grid-3">
                  <!-- Smoking Risk & Auto Pack-Years -->
                  <div class="sub-card">
                    <h4>🚬 Tobacco / Smoking</h4>
                    <div class="form-group">
                      <label>Smoking Status</label>
                      <select class="form-control" [(ngModel)]="consultation().smoking.status" (change)="updateSmoking()">
                        <option value="Never Smoked">Never Smoked</option>
                        <option value="Current Smoker">Current Smoker</option>
                        <option value="Former Smoker">Former Smoker (Quit)</option>
                      </select>
                    </div>
                    @if (consultation().smoking.status !== 'Never Smoked') {
                      <div class="grid-2-sm">
                        <div class="form-group">
                          <label>Sticks / Day</label>
                          <input type="number" class="form-control" [(ngModel)]="consultation().smoking.sticksPerDay" (input)="updateSmoking()" />
                        </div>
                        <div class="form-group">
                          <label>Years Smoked</label>
                          <input type="number" class="form-control" [(ngModel)]="consultation().smoking.years" (input)="updateSmoking()" />
                        </div>
                      </div>
                      <div class="pack-years-banner">
                        <span>Calculated Pack-Years:</span>
                        <strong class="pack-years-val">{{ consultation().smoking.packYears || 0 }} pack-years</strong>
                      </div>
                    }
                  </div>

                  <!-- Alcohol Screening -->
                  <div class="sub-card">
                    <h4>🍷 Alcohol Intake</h4>
                    <div class="form-group">
                      <label>Alcohol Consumption</label>
                      <select class="form-control" [(ngModel)]="consultation().alcohol.status">
                        <option value="Non-drinker">Non-drinker</option>
                        <option value="Occasional">Occasional (< 1 drink/mo)</option>
                        <option value="Moderate">Moderate (1-2 drinks/week)</option>
                        <option value="Heavy">Heavy (> 3 drinks/week)</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label>Binge Drinking Risk (≥ 4-5 drinks/session)?</label>
                      <select class="form-control" [(ngModel)]="consultation().alcohol.bingeDrinking">
                        <option value="No">No</option>
                        <option value="Yes">Yes (High Risk)</option>
                      </select>
                    </div>
                  </div>

                  <!-- Hereditary Familial NCDs -->
                  <div class="sub-card">
                    <h4>🧬 Familial Hereditary NCDs</h4>
                    <p class="help-text">Check all conditions present in 1st-degree relatives:</p>
                    <div class="ncd-chips">
                      @for (ncd of commonNcds; track ncd) {
                        <button type="button" class="ncd-pill" [class.selected]="hasNcd(ncd)" (click)="toggleNcd(ncd)">
                          {{ hasNcd(ncd) ? '✓ ' : '+ ' }}{{ ncd }}
                        </button>
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- 2. OBJECTIVE & VITALS TAB -->
        @if (activeTab() === 'objective') {
          <div class="tab-pane">
            <div class="card">
              <div class="card-header">
                <h3>Vital Signs &amp; Asia-Pacific BMI Auto-Calculation</h3>
                <span class="subtext">Official DOH &amp; FNRI Classification</span>
              </div>
              <div class="card-body">
                <div class="vitals-grid">
                  <div class="vital-item">
                    <label>Blood Pressure (mmHg)</label>
                    <div class="bp-inputs">
                      <input type="number" class="form-control" [(ngModel)]="consultation().vital_signs.bloodPressureSystolic" placeholder="Systolic" />
                      <span class="slash">/</span>
                      <input type="number" class="form-control" [(ngModel)]="consultation().vital_signs.bloodPressureDiastolic" placeholder="Diastolic" />
                    </div>
                  </div>

                  <div class="vital-item">
                    <label>Pulse Rate (bpm)</label>
                    <input type="number" class="form-control" [(ngModel)]="consultation().vital_signs.pulseRate" placeholder="e.g. 78" />
                  </div>

                  <div class="vital-item">
                    <label>Respiratory Rate (cpm)</label>
                    <input type="number" class="form-control" [(ngModel)]="consultation().vital_signs.respiratoryRate" placeholder="e.g. 18" />
                  </div>

                  <div class="vital-item">
                    <label>Temperature (°C)</label>
                    <input type="number" step="0.1" class="form-control" [(ngModel)]="consultation().vital_signs.temperature" placeholder="e.g. 36.6" />
                  </div>

                  <div class="vital-item">
                    <label>Oxygen Saturation (%)</label>
                    <input type="number" class="form-control" [(ngModel)]="consultation().vital_signs.oxygenSaturation" placeholder="e.g. 98" />
                  </div>

                  <div class="vital-item">
                    <label>Weight (kg) <span class="calc-tag">BMI</span></label>
                    <input type="number" step="0.1" class="form-control" [(ngModel)]="consultation().vital_signs.weight" (input)="onVitalsChange()" placeholder="e.g. 65" />
                  </div>

                  <div class="vital-item">
                    <label>Height (cm) <span class="calc-tag">BMI</span></label>
                    <input type="number" step="0.5" class="form-control" [(ngModel)]="consultation().vital_signs.height" (input)="onVitalsChange()" placeholder="e.g. 165" />
                  </div>

                  <!-- Real-time BMI Display Box -->
                  <div class="vital-item bmi-display-box" [ngClass]="bmiCategoryClass()">
                    <label>BMI (Asia-Pacific / DOH)</label>
                    <div class="bmi-val">{{ consultation().vital_signs.bmi || '--' }}</div>
                    <div class="bmi-cat">{{ consultation().vital_signs.bmiCategory || 'Awaiting Weight & Height' }}</div>
                  </div>

                  <div class="vital-item">
                    <label>Waist Circumference (cm)</label>
                    <input type="number" class="form-control" [(ngModel)]="consultation().vital_signs.waistCircumference" placeholder="e.g. 82" />
                  </div>

                  <div class="vital-item">
                    <label>Random Blood Sugar (mg/dL)</label>
                    <input type="number" class="form-control" [(ngModel)]="consultation().vital_signs.bloodGlucose" placeholder="e.g. 110" />
                  </div>

                  <div class="vital-item">
                    <label>Pain Scale (0 - 10)</label>
                    <input type="number" min="0" max="10" class="form-control" [(ngModel)]="consultation().vital_signs.painScale" placeholder="0 = None, 10 = Worst" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Physical Examination -->
            <div class="card">
              <div class="card-header">
                <h3>Physical Examination Findings</h3>
              </div>
              <div class="card-body">
                <textarea rows="6" class="form-control" [(ngModel)]="consultation().physical_exam_findings" placeholder="General survey, HEENT, Chest/Lungs, Heart/CVS, Abdomen, Extremities, Neurological..."></textarea>
              </div>
            </div>
          </div>
        }

        <!-- 3. ASSESSMENT TAB -->
        @if (activeTab() === 'assessment') {
          <div class="tab-pane">
            <div class="card">
              <div class="card-header">
                <h3>Primary Clinical Diagnosis &amp; ICD-10</h3>
              </div>
              <div class="card-body">
                <div class="form-group">
                  <label>Primary Diagnosis <span class="required">*</span></label>
                  <input type="text" class="form-control form-control-lg diagnosis-input" [(ngModel)]="consultation().primary_diagnosis" placeholder="Primary diagnostic impression (e.g. Acute Bronchitis, Essential Hypertension - I10)" />
                </div>

                <div class="quick-icd-suggestions">
                  <span class="label">Common Primary Care Diagnoses:</span>
                  @for (diag of commonDiagnoses; track diag) {
                    <button type="button" class="diag-chip" (click)="consultation().primary_diagnosis = diag">
                      {{ diag }}
                    </button>
                  }
                </div>
              </div>
            </div>

            <div class="grid-2">
              <div class="card">
                <div class="card-header">
                  <h3>Differential Diagnoses</h3>
                </div>
                <div class="card-body">
                  <div class="add-tag-row">
                    <input type="text" class="form-control" [(ngModel)]="newDifferential" (keyup.enter)="addDifferential()" placeholder="Add differential diagnosis and press Enter..." />
                    <button type="button" class="btn btn-secondary" (click)="addDifferential()">Add</button>
                  </div>
                  <div class="tag-list">
                    @for (diff of consultation().differential_diagnosis; track diff; let i = $index) {
                      <span class="tag">
                        {{ diff }}
                        <button type="button" (click)="removeDifferential(i)">×</button>
                      </span>
                    }
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="card-header">
                  <h3>Clinical Impression &amp; Etiology</h3>
                </div>
                <div class="card-body">
                  <div class="form-group">
                    <label>Suspected Etiology / Pathology</label>
                    <input type="text" class="form-control" [(ngModel)]="consultation().suspected_pathology" placeholder="e.g. Viral upper respiratory tract infection" />
                  </div>
                  <div class="form-group">
                    <label>Detailed Clinical Impression</label>
                    <textarea rows="3" class="form-control" [(ngModel)]="consultation().clinical_impression" placeholder="Summary reasoning, complications, disease staging..."></textarea>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- 4. PLAN & PRESCRIPTIONS TAB -->
        @if (activeTab() === 'plan') {
          <div class="tab-pane">
            <!-- Prescription Pad Builder -->
            <div class="card">
              <div class="card-header">
                <h3>💊 Official Prescription Pad (Rx)</h3>
                <button type="button" class="btn btn-outline-primary btn-sm" (click)="addPrescriptionItem()">
                  <i class="fa fa-plus"></i> Add Medication
                </button>
              </div>
              <div class="card-body">
                <div class="table-responsive">
                  <table class="table rx-table">
                    <thead>
                      <tr>
                        <th>Medication / Generic Name</th>
                        <th>Dosage &amp; Form</th>
                        <th>Route</th>
                        <th>Frequency</th>
                        <th>Duration</th>
                        <th>Sig / Instructions</th>
                        <th style="width: 50px;"></th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (rx of consultation().prescriptions; track $index; let i = $index) {
                        <tr>
                          <td>
                            <input type="text" class="form-control" [(ngModel)]="rx.medication" placeholder="e.g. Amoxicillin + Clavulanic Acid" />
                          </td>
                          <td>
                            <input type="text" class="form-control" [(ngModel)]="rx.dosage" placeholder="e.g. 625mg Tab" />
                          </td>
                          <td>
                            <input type="text" class="form-control" [(ngModel)]="rx.route" placeholder="e.g. Oral" />
                          </td>
                          <td>
                            <input type="text" class="form-control" [(ngModel)]="rx.frequency" placeholder="e.g. TID with meals" />
                          </td>
                          <td>
                            <input type="text" class="form-control" [(ngModel)]="rx.duration" placeholder="e.g. 7 days" />
                          </td>
                          <td>
                            <input type="text" class="form-control" [(ngModel)]="rx.instructions" placeholder="e.g. Take 1 tab every 8 hours" />
                          </td>
                          <td>
                            <button type="button" class="btn btn-icon btn-danger-sm" (click)="removePrescriptionItem(i)">
                              <i class="fa fa-trash"></i>
                            </button>
                          </td>
                        </tr>
                      }
                      @if (consultation().prescriptions.length === 0) {
                        <tr>
                          <td colspan="7" class="empty-table">No medications added yet. Click "+ Add Medication" above to prescribe.</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <!-- Ordered Diagnostic Requisitions & Advice -->
            <div class="grid-2">
              <div class="card">
                <div class="card-header">
                  <h3>🧪 Diagnostic Requisitions Order</h3>
                </div>
                <div class="card-body">
                  <div class="form-group">
                    <label>Order Diagnostic Tests (Requisitions)</label>
                    <div class="add-tag-row">
                      <input type="text" class="form-control" [(ngModel)]="newLabTest" (keyup.enter)="addLabTest()" placeholder="e.g. CBC with PC, Urinalysis, FBS, Lipid Profile..." />
                      <button type="button" class="btn btn-secondary" (click)="addLabTest()">Order</button>
                    </div>
                  </div>
                  <div class="tag-list">
                    @for (test of consultation().lab_request_tests; track test; let i = $index) {
                      <span class="tag tag-blue">
                        {{ test }}
                        <button type="button" (click)="removeLabTest(i)">×</button>
                      </span>
                    }
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="card-header">
                  <h3>Non-Pharmacologic Advice &amp; Follow-up</h3>
                </div>
                <div class="card-body">
                  <div class="form-group">
                    <label>Dietary &amp; Lifestyle Target Advice</label>
                    <textarea rows="2" class="form-control" [(ngModel)]="consultation().treatment_plan" placeholder="Low salt, low fat diet, hydration, 150 mins aerobic activity..."></textarea>
                  </div>
                  <div class="grid-2-sm">
                    <div class="form-group">
                      <label>Follow-up Return Date</label>
                      <input type="date" class="form-control" [(ngModel)]="consultation().follow_up_date" />
                    </div>
                    <div class="form-group">
                      <label>Referrals to Specialist</label>
                      <input type="text" class="form-control" [(ngModel)]="consultation().referrals" placeholder="e.g. Cardiology, Pulmonology" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- 5. LAB HISTORY TAB -->
        @if (activeTab() === 'history') {
          <div class="tab-pane">
            <div class="card">
              <div class="card-header">
                <h3>Complete Patient Diagnostic Test History</h3>
                <span class="subtext">Review prior Urinalysis, CBC, Chemistry, X-Ray, etc.</span>
              </div>
              <div class="card-body">
                <div class="table-responsive">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Test ID</th>
                        <th>Test Type</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (t of patientTests(); track t.id) {
                        <tr>
                          <td><strong>{{ t.test_id || t.id.slice(0, 8) }}</strong></td>
                          <td>{{ t.test_type }}</td>
                          <td>{{ t.test_date | date:'mediumDate' }}</td>
                          <td>
                            <span class="badge" [ngClass]="t.status === 'Released' || t.status === 'Completed' || t.status === 'Checked' ? 'badge-completed' : 'badge-progress'">
                              {{ t.status }}
                            </span>
                          </td>
                          <td>
                            <a [routerLink]="['/reports']" [queryParams]="{ testId: t.id }" target="_blank" class="btn btn-sm btn-outline-primary">
                              <i class="fa fa-external-link-alt"></i> View Result
                            </a>
                          </td>
                        </tr>
                      }
                      @if (patientTests().length === 0) {
                        <tr>
                          <td colspan="5" class="empty-table">No prior laboratory tests found for this patient.</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        }
      </main>
    </div>
  `,
  styles: [`
    .consultation-container {
      padding: 1.5rem;
      max-width: 1400px;
      margin: 0 auto;
      font-family: 'Inter', sans-serif;
    }

    .encounter-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: white;
      padding: 1.25rem 1.5rem;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
      margin-bottom: 1.5rem;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    .title-group h1 {
      font-size: 1.35rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .encounter-meta {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-top: 0.25rem;
      font-size: 0.85rem;
      color: #64748b;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      position: relative;
    }

    .print-dropdown {
      position: relative;
    }

    .dropdown-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 0.5rem;
      background: white;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
      min-width: 240px;
      padding: 0.5rem 0;
      z-index: 1000;
      border: 1px solid #e2e8f0;
    }

    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.65rem 1.25rem;
      color: #1e293b;
      text-decoration: none;
      font-size: 0.9rem;
      transition: background 0.15s ease;
    }

    .dropdown-item:hover {
      background: #f1f5f9;
      color: #10b981;
    }

    /* Patient Banner */
    .patient-banner {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 1.5rem;
      background: #ffffff;
      padding: 1.25rem 1.5rem;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
      margin-bottom: 1.5rem;
      border-left: 5px solid #10b981;
    }

    .patient-summary {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    .avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10b981 0%, #047857 100%);
      color: white;
      font-weight: 700;
      font-size: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3);
    }

    .patient-name {
      font-size: 1.2rem;
      font-weight: 700;
      color: #0f172a;
    }

    .patient-code {
      color: #64748b;
      font-weight: 500;
      font-size: 0.95rem;
    }

    .patient-details {
      display: flex;
      flex-wrap: wrap;
      gap: 1.25rem;
      font-size: 0.85rem;
      color: #475569;
      margin-top: 0.35rem;
    }

    .physician-box {
      background: #f8fafc;
      padding: 0.85rem 1rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .physician-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 0.35rem;
    }

    .physician-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      margin-top: 0.4rem;
    }

    /* Tabs */
    .encounter-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
      overflow-x: auto;
      padding-bottom: 0.25rem;
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.25rem;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-weight: 600;
      color: #64748b;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .tab-btn:hover {
      background: #f8fafc;
      color: #10b981;
    }

    .tab-btn.active {
      background: #10b981;
      color: white;
      border-color: #10b981;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.25);
    }

    .tab-badge {
      display: inline-block;
      width: 22px;
      height: 22px;
      line-height: 22px;
      text-align: center;
      background: rgba(0,0,0,0.1);
      border-radius: 50%;
      font-size: 0.75rem;
      font-weight: 700;
    }

    /* Cards & Layout */
    .card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
      margin-bottom: 1.25rem;
      border: 1px solid #e2e8f0;
      overflow: hidden;
    }

    .card-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fafafa;
    }

    .card-header h3 {
      font-size: 1.05rem;
      font-weight: 700;
      color: #1e293b;
      margin: 0;
    }

    .card-header .subtext {
      font-size: 0.8rem;
      color: #64748b;
    }

    .card-body {
      padding: 1.25rem 1.5rem;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.25rem;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1.25rem;
    }

    .grid-2-sm {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    /* Forms */
    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      font-size: 0.85rem;
      font-weight: 600;
      color: #334155;
      margin-bottom: 0.35rem;
    }

    .form-control {
      width: 100%;
      padding: 0.65rem 0.85rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.9rem;
      font-family: inherit;
      box-sizing: border-box;
      transition: border-color 0.15s ease;
    }

    .form-control:focus {
      outline: none;
      border-color: #10b981;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    }

    .form-control-sm {
      padding: 0.4rem 0.65rem;
      font-size: 0.8rem;
    }

    .form-control-lg {
      padding: 0.85rem 1rem;
      font-size: 1.1rem;
      font-weight: 600;
    }

    /* Vitals Grid & BMI Box */
    .vitals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }

    .vital-item {
      background: #f8fafc;
      padding: 0.85rem 1rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .vital-item label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 0.4rem;
      display: flex;
      justify-content: space-between;
    }

    .calc-tag {
      background: #e2e8f0;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 0.7rem;
      color: #0f172a;
    }

    .bp-inputs {
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .slash {
      font-weight: 700;
      color: #94a3b8;
    }

    .bmi-display-box {
      text-align: center;
      transition: all 0.3s ease;
    }

    .bmi-val {
      font-size: 1.8rem;
      font-weight: 800;
      line-height: 1.2;
    }

    .bmi-cat {
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 0.2rem;
    }

    .bmi-normal { background: #dcfce7; border-color: #86efac; color: #15803d; }
    .bmi-underweight { background: #fef3c7; border-color: #fde047; color: #b45309; }
    .bmi-overweight { background: #ffedd5; border-color: #fdba74; color: #c2410c; }
    .bmi-obese1 { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
    .bmi-obese2 { background: #fecdd3; border-color: #fda4af; color: #991b1b; }

    /* PhilPEN styles */
    .sub-card {
      background: #f8fafc;
      padding: 1rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .sub-card h4 {
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
      color: #1e293b;
    }

    .pack-years-banner {
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      color: #0369a1;
      margin-top: 0.5rem;
    }

    .pack-years-val {
      font-size: 1rem;
      color: #0284c7;
    }

    .ncd-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.5rem;
    }

    .ncd-pill {
      padding: 0.35rem 0.65rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      border: 1px solid #cbd5e1;
      background: white;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .ncd-pill.selected {
      background: #10b981;
      border-color: #10b981;
      color: white;
    }

    /* Diagnosis pills */
    .quick-icd-suggestions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      margin-top: 0.75rem;
    }

    .quick-icd-suggestions .label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #64748b;
    }

    .diag-chip {
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      padding: 0.3rem 0.6rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 500;
      color: #334155;
      cursor: pointer;
    }

    .diag-chip:hover {
      background: #e2e8f0;
    }

    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .tag {
      background: #e2e8f0;
      padding: 0.35rem 0.75rem;
      border-radius: 6px;
      font-size: 0.85rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }

    .tag button {
      background: none;
      border: none;
      font-weight: bold;
      cursor: pointer;
      color: #64748b;
    }

    .tag-blue {
      background: #dbeafe;
      color: #1d4ed8;
    }

    .add-tag-row {
      display: flex;
      gap: 0.5rem;
    }

    /* Prescriptions Table */
    .rx-table th {
      background: #f8fafc;
      font-size: 0.8rem;
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
      padding: 0.75rem;
      border-bottom: 2px solid #e2e8f0;
    }

    .rx-table td {
      padding: 0.5rem;
      border-bottom: 1px solid #f1f5f9;
    }

    /* Buttons */
    .btn {
      padding: 0.65rem 1.25rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: none;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-primary { background: #10b981; color: white; }
    .btn-primary:hover { background: #059669; }

    .btn-secondary { background: #0f172a; color: white; }
    .btn-secondary:hover { background: #1e293b; }

    .btn-success { background: #16a34a; color: white; }
    .btn-success:hover { background: #15803d; }

    .btn-outline { background: white; border: 1px solid #cbd5e1; color: #334155; }
    .btn-outline:hover { background: #f8fafc; }

    .btn-outline-primary { background: white; border: 1px solid #10b981; color: #10b981; }
    .btn-outline-primary:hover { background: #10b981; color: white; }

    .badge {
      display: inline-block;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    .badge-completed { background: #dcfce7; color: #15803d; }
    .badge-progress { background: #fef3c7; color: #b45309; }

    .empty-table {
      text-align: center;
      padding: 2rem;
      color: #94a3b8;
      font-style: italic;
    }
  `]
})
export class ConsultationPanelComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private consultService = inject(ConsultationService);
  private patientService = inject(PatientService);
  private testService = inject(TestService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  consultation = signal<Consultation>({
    id: '',
    patient_id: '',
    test_id: null,
    doctor_id: null,
    doctor_name: '',
    doctor_license_number: '',
    doctor_designation: '',
    visit_type: 'New',
    consultation_date: new Date().toISOString(),
    status: 'In Progress',
    chief_complaint: '',
    history_of_present_illness: '',
    past_medical_history: '',
    current_medications: '',
    allergies: '',
    review_of_systems: '',
    smoking: { status: 'Never Smoked' },
    alcohol: { status: 'Non-drinker' },
    family_history: { diseases: [] },
    social_history: {},
    vital_signs: {},
    physical_exam_findings: '',
    primary_diagnosis: '',
    differential_diagnosis: [],
    suspected_pathology: '',
    clinical_impression: '',
    treatment_plan: '',
    prescriptions: [],
    lab_request_tests: [],
    referrals: '',
    follow_up_date: '',
    follow_up_notes: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  });

  patient = signal<Patient | null>(null);
  test = signal<Test | null>(null);
  patientTests = signal<Test[]>([]);

  activeTab = signal<'subjective' | 'objective' | 'assessment' | 'plan' | 'history'>('subjective');
  showPrintMenu = signal<boolean>(false);
  saving = signal<boolean>(false);

  newDifferential = '';
  newLabTest = '';

  commonNcds = [
    'Hypertension',
    'Type 2 Diabetes',
    'Stroke / CVA',
    'Coronary Heart Disease',
    'Bronchial Asthma / COPD',
    'Chronic Kidney Disease',
    'Dyslipidemia',
    'Malignancy / Cancer'
  ];

  commonDiagnoses = [
    'Essential Hypertension (I10)',
    'Type 2 Diabetes Mellitus (E11)',
    'Acute Upper Respiratory Infection (J06.9)',
    'Acute Bronchitis (J20.9)',
    'Acute Gastroenteritis (A09)',
    'Urinary Tract Infection (N39.0)',
    'Dyslipidemia (E78.5)',
    'Community-Acquired Pneumonia (J18.9)'
  ];

  patientInitials = computed(() => {
    const p = this.patient();
    if (!p) return 'PT';
    return `${p.first_name?.[0] || ''}${p.last_name?.[0] || ''}`.toUpperCase();
  });

  bmiCategoryClass = computed(() => {
    const cat = this.consultation().vital_signs?.bmiCategory;
    if (cat === 'Normal') return 'bmi-normal';
    if (cat === 'Underweight') return 'bmi-underweight';
    if (cat === 'Overweight') return 'bmi-overweight';
    if (cat === 'Obese I') return 'bmi-obese1';
    if (cat === 'Obese II') return 'bmi-obese2';
    return '';
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const patientId = this.route.snapshot.queryParamMap.get('patient');
    const testId = this.route.snapshot.queryParamMap.get('test');

    if (id && id !== 'new') {
      this.loadExistingConsultation(id);
    } else if (testId) {
      // Find consultation by testId or prepare new encounter
      this.consultService.getByTestId(testId).subscribe({
        next: (res) => {
          this.consultation.set(res);
          if (res.patient) this.patient.set(res.patient);
          if (res.test) this.test.set(res.test);
          this.loadPatientHistory(res.patient_id);
        },
        error: () => {
          this.prepareNewEncounter(patientId, testId);
        }
      });
    } else {
      this.prepareNewEncounter(patientId, null);
    }
  }

  private loadExistingConsultation(id: string): void {
    this.consultService.getById(id).subscribe({
      next: (res) => {
        this.consultation.set(res);
        if (res.patient) this.patient.set(res.patient);
        if (res.test) this.test.set(res.test);
        this.loadPatientHistory(res.patient_id);
      },
      error: () => {
        this.toast.error('Failed to load consultation record');
        this.goBack();
      }
    });
  }

  private prepareNewEncounter(patientId: string | null, testId: string | null): void {
    const currentUser = this.auth.currentUser();
    const isDoc = ['Doctor', 'Physician', 'Internist', 'Cardiologist', 'Pathologist'].includes(currentUser?.role || '') ||
      (currentUser?.name && (currentUser.name.includes('Dr.') || currentUser.name.includes('MD')));

    this.consultation.update(c => ({
      ...c,
      patient_id: patientId || '',
      test_id: testId || null,
      doctor_name: isDoc ? (currentUser?.name || '') : '',
      doctor_license_number: isDoc ? (currentUser?.license_number || '') : '',
      doctor_designation: isDoc ? (currentUser?.designation || currentUser?.role || 'Physician') : '',
    }));

    if (patientId) {
      this.patientService.getById(patientId).subscribe({
        next: (res) => {
          this.patient.set(res.patient);
          this.patientTests.set(res.tests || []);
        }
      });
    }

    if (testId) {
      this.testService.getById(testId).subscribe({
        next: (res) => {
          this.test.set(res.test);
          if (res.patient && !this.patient()) {
            this.patient.set(res.patient);
            this.loadPatientHistory(res.patient.id);
          }
        }
      });
    }
  }

  private loadPatientHistory(patientId: string): void {
    if (!patientId) return;
    this.patientService.getById(patientId).subscribe({
      next: (res) => {
        this.patientTests.set(res.tests || []);
      }
    });
  }

  onVitalsChange(): void {
    const w = this.consultation().vital_signs?.weight;
    const h = this.consultation().vital_signs?.height;
    const { bmi, category } = this.consultService.calculateBmi(w, h);
    this.consultation.update(c => ({
      ...c,
      vital_signs: {
        ...c.vital_signs,
        bmi: bmi !== null ? bmi : '',
        bmiCategory: category,
      }
    }));
  }

  updateSmoking(): void {
    const sm = this.consultation().smoking;
    if (sm.sticksPerDay && sm.years) {
      const spd = parseFloat(String(sm.sticksPerDay));
      const yrs = parseFloat(String(sm.years));
      if (!isNaN(spd) && !isNaN(yrs)) {
        sm.packYears = +((spd / 20) * yrs).toFixed(1);
      }
    }
  }

  isNkda(): boolean {
    return this.consultation().allergies?.toUpperCase().includes('NKDA') || false;
  }

  toggleNkda(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.consultation.update(c => ({
      ...c,
      allergies: checked ? 'NKDA (No Known Drug Allergies)' : ''
    }));
  }

  hasNcd(ncd: string): boolean {
    return this.consultation().family_history?.diseases?.includes(ncd) || false;
  }

  toggleNcd(ncd: string): void {
    const current = this.consultation().family_history?.diseases || [];
    const updated = current.includes(ncd)
      ? current.filter(x => x !== ncd)
      : [...current, ncd];

    this.consultation.update(c => ({
      ...c,
      family_history: {
        ...c.family_history,
        diseases: updated,
      }
    }));
  }

  addDifferential(): void {
    if (!this.newDifferential.trim()) return;
    this.consultation.update(c => ({
      ...c,
      differential_diagnosis: [...(c.differential_diagnosis || []), this.newDifferential.trim()]
    }));
    this.newDifferential = '';
  }

  removeDifferential(index: number): void {
    this.consultation.update(c => ({
      ...c,
      differential_diagnosis: c.differential_diagnosis.filter((_, i) => i !== index)
    }));
  }

  addLabTest(): void {
    if (!this.newLabTest.trim()) return;
    this.consultation.update(c => ({
      ...c,
      lab_request_tests: [...(c.lab_request_tests || []), this.newLabTest.trim()]
    }));
    this.newLabTest = '';
  }

  removeLabTest(index: number): void {
    this.consultation.update(c => ({
      ...c,
      lab_request_tests: c.lab_request_tests.filter((_, i) => i !== index)
    }));
  }

  addPrescriptionItem(): void {
    const newItem: PrescriptionItem = {
      medication: '',
      dosage: '',
      route: 'Oral',
      frequency: '',
      duration: '',
      instructions: '',
    };
    this.consultation.update(c => ({
      ...c,
      prescriptions: [...(c.prescriptions || []), newItem]
    }));
  }

  removePrescriptionItem(index: number): void {
    this.consultation.update(c => ({
      ...c,
      prescriptions: c.prescriptions.filter((_, i) => i !== index)
    }));
  }

  togglePrintMenu(): void {
    this.showPrintMenu.update(v => !v);
  }

  saveConsultation(markCompleted: boolean): void {
    const c = this.consultation();
    if (!c.patient_id) {
      this.toast.error('Patient is required');
      return;
    }
    if (!c.chief_complaint?.trim()) {
      this.toast.error('Chief Complaint is required');
      this.activeTab.set('subjective');
      return;
    }

    this.saving.set(true);
    if (markCompleted) {
      c.status = 'Completed';
    }

    const obs$ = c.id
      ? this.consultService.update(c.id, c)
      : this.consultService.create(c);

    obs$.subscribe({
      next: (res) => {
        this.saving.set(false);
        this.consultation.set(res);
        this.toast.success(markCompleted ? 'Encounter completed successfully!' : 'Encounter saved');
        if (markCompleted) {
          this.activeTab.set('plan');
        }
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error(err?.error?.error || 'Failed to save consultation');
      }
    });
  }

  goBack(): void {
    const c = this.consultation();
    if (c.test_id) {
      this.router.navigate(['/tests', c.test_id]);
    } else if (c.patient_id) {
      this.router.navigate(['/patients', c.patient_id]);
    } else {
      this.router.navigate(['/patients']);
    }
  }
}
