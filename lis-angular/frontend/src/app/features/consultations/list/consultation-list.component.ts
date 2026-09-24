import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConsultationService } from '../../../core/services/consultation.service';
import { PatientService } from '../../../core/services/patient.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../shared/services/toast.service';
import { Consultation, Patient } from '../../../core/models';

@Component({
  selector: 'app-consultation-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="consultation-hub">
      <!-- Top Action & Overview Banner -->
      <div class="page-header-row">
        <div>
          <h2 class="page-title">
            <span class="icon">🩺</span> Clinical Consultations &amp; Outpatient Encounters
          </h2>
          <p class="page-subtitle">
            Physician consultations, DOH PhilPEN NCD risk assessments, SOAP medical records, and digital prescriptions.
          </p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-primary" (click)="openPatientPicker()">
            <i class="fa fa-user-plus"></i> New Consultation
          </button>
        </div>
      </div>

      <!-- Quick Stats KPI Cards -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon total"><i class="fa fa-notes-medical"></i></div>
          <div class="stat-content">
            <div class="stat-number">{{ totalCount() }}</div>
            <div class="stat-label">Total Encounters</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon progress"><i class="fa fa-clock"></i></div>
          <div class="stat-content">
            <div class="stat-number">{{ inProgressCount() }}</div>
            <div class="stat-label">In Progress</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon completed"><i class="fa fa-check-double"></i></div>
          <div class="stat-content">
            <div class="stat-number">{{ completedCount() }}</div>
            <div class="stat-label">Finalized Charts</div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon doctors"><i class="fa fa-user-md"></i></div>
          <div class="stat-content">
            <div class="stat-number">{{ uniqueDoctorsCount() }}</div>
            <div class="stat-label">Active Physicians</div>
          </div>
        </div>
      </div>

      <!-- Filter & Search Toolbar -->
      <div class="filter-card">
        <div class="search-wrap">
          <i class="fa fa-search search-icon"></i>
          <input
            type="text"
            class="search-input"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onFilterChange()"
            placeholder="Search by patient name, code, doctor, chief complaint, diagnosis..."
          />
          @if (searchQuery) {
            <button class="clear-search" (click)="searchQuery = ''; onFilterChange()">✕</button>
          }
        </div>

        <div class="filter-controls">
          <div class="filter-group">
            <label>Status:</label>
            <select class="filter-select" [(ngModel)]="statusFilter" (change)="onFilterChange()">
              <option value="">All Statuses</option>
              <option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          <div class="filter-group">
            <label>Physician:</label>
            <select class="filter-select" [(ngModel)]="doctorFilter" (change)="onFilterChange()">
              <option value="">All Physicians</option>
              @for (doc of doctorList(); track doc) {
                <option [value]="doc">{{ doc }}</option>
              }
            </select>
          </div>

          <button class="btn btn-secondary btn-sm" (click)="resetFilters()" title="Reset Filters">
            <i class="fa fa-redo"></i> Reset
          </button>
        </div>
      </div>

      <!-- Encounters Data Table -->
      <div class="table-container card">
        @if (loading()) {
          <div class="loading-state">
            <i class="fa fa-spinner fa-spin fa-2x"></i>
            <p>Loading clinical consultation records...</p>
          </div>
        } @else if (filteredConsultations().length === 0) {
          <div class="empty-state">
            <div class="empty-icon">🩺</div>
            <h3>No Consultation Records Found</h3>
            <p>
              @if (searchQuery || statusFilter || doctorFilter) {
                No consultations match your current filter criteria.
              } @else {
                There are no clinical encounters recorded yet. Click "New Consultation" to start an encounter.
              }
            </p>
            <button type="button" class="btn btn-primary" (click)="openPatientPicker()">
              <i class="fa fa-plus-circle"></i> Start Clinical Consultation
            </button>
          </div>
        } @else {
          <table class="data-table">
            <thead>
              <tr>
                <th>Date &amp; Visit</th>
                <th>Patient</th>
                <th>Attending Physician</th>
                <th>Clinical Notes &amp; Diagnosis</th>
                <th>Status</th>
                <th class="actions-header">Actions &amp; Documents</th>
              </tr>
            </thead>
            <tbody>
              @for (c of filteredConsultations(); track c.id) {
                <tr class="encounter-row">
                  <!-- Date & Visit -->
                  <td>
                    <div class="encounter-date">{{ c.consultation_date | date:'mediumDate' }}</div>
                    <div class="encounter-time">{{ c.consultation_date | date:'shortTime' }}</div>
                    <span class="visit-type-badge" [class.follow-up]="c.visit_type === 'Follow-up'">
                      {{ c.visit_type || 'New' }}
                    </span>
                  </td>

                  <!-- Patient Demographics -->
                  <td>
                    <div class="patient-cell">
                      <div class="patient-avatar">
                        {{ getPatientInitials(c) }}
                      </div>
                      <div class="patient-info">
                        <a [routerLink]="['/patients', c.patient_id]" class="patient-name">
                          {{ getPatientName(c) }}
                        </a>
                        <div class="patient-sub">
                          <span class="code">{{ c.patient?.patient_code || 'ID: ' + c.patient_id.substring(0, 8) }}</span>
                          <span class="sep">•</span>
                          <span>{{ c.patient?.gender || 'N/A' }}, {{ c.patient?.age || c.patient?.age_manual || 'Age N/A' }}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  <!-- Attending Physician -->
                  <td>
                    <div class="doc-name">{{ c.doctor_name || 'Unassigned Physician' }}</div>
                    @if (c.doctor_designation) {
                      <div class="doc-designation">{{ c.doctor_designation }}</div>
                    }
                    @if (c.doctor_license_number) {
                      <div class="doc-license">PRC: {{ c.doctor_license_number }}</div>
                    }
                  </td>

                  <!-- Clinical Summary -->
                  <td class="clinical-cell">
                    @if (c.chief_complaint) {
                      <div class="chief-complaint" title="Chief Complaint">
                        <span class="cc-tag">CC:</span> {{ c.chief_complaint }}
                      </div>
                    }
                    @if (c.primary_diagnosis) {
                      <div class="primary-diagnosis" title="Primary Diagnosis">
                        <span class="dx-tag">Dx:</span> <strong>{{ c.primary_diagnosis }}</strong>
                      </div>
                    } @else {
                      <span class="no-dx">Evaluation in progress...</span>
                    }
                    @if (c.vital_signs?.bloodPressureSystolic && c.vital_signs?.bloodPressureDiastolic) {
                      <div class="vitals-mini">
                        BP: {{ c.vital_signs?.bloodPressureSystolic }}/{{ c.vital_signs?.bloodPressureDiastolic }} mmHg
                        @if (c.vital_signs?.bmi) {
                          | BMI: {{ c.vital_signs?.bmi }} ({{ c.vital_signs?.bmiCategory }})
                        }
                      </div>
                    }
                  </td>

                  <!-- Status -->
                  <td>
                    @if (c.status === 'Completed') {
                      <span class="badge badge-success">
                        <i class="fa fa-check-circle"></i> Completed
                      </span>
                    } @else {
                      <span class="badge badge-warning pulse">
                        <i class="fa fa-clock"></i> In Progress
                      </span>
                    }
                  </td>

                  <!-- Actions & Printing -->
                  <td class="actions-cell">
                    <div class="action-buttons">
                      <a [routerLink]="['/consultations', c.id]" class="btn btn-sm btn-teal" title="Open Clinical SOAP Encounter">
                        <i class="fa fa-stethoscope"></i> Open
                      </a>

                      <!-- Documents Dropdown -->
                      <div class="doc-links">
                        <a [routerLink]="['/consultations', c.id, 'print', 'chart']" target="_blank" class="doc-btn chart" title="Medical Chart">
                          <i class="fa fa-file-medical"></i> Chart
                        </a>
                        <a [routerLink]="['/consultations', c.id, 'print', 'prescription']" target="_blank" class="doc-btn rx" title="Official Prescription Pad">
                          <i class="fa fa-prescription"></i> Rx
                        </a>
                        <a [routerLink]="['/consultations', c.id, 'print', 'med-cert']" target="_blank" class="doc-btn cert" title="Medical Certificate">
                          <i class="fa fa-certificate"></i> Cert
                        </a>
                        <a [routerLink]="['/consultations', c.id, 'print', 'lab-request']" target="_blank" class="doc-btn lab" title="Laboratory Request Form">
                          <i class="fa fa-vial"></i> Lab
                        </a>
                      </div>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Patient Picker Modal (When clicking "New Consultation") -->
      @if (showPatientPicker()) {
        <div class="modal-backdrop" (click)="closePatientPicker()">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <div class="modal-title">
                <i class="fa fa-user-injured text-teal"></i> Select Patient for Clinical Consultation
              </div>
              <button class="modal-close" (click)="closePatientPicker()">✕</button>
            </div>

            <div class="modal-body">
              <div class="modal-search">
                <i class="fa fa-search"></i>
                <input
                  type="text"
                  class="form-control"
                  [(ngModel)]="patientSearchQuery"
                  (input)="searchPatients()"
                  placeholder="Type patient name, code, birthdate, or ID..."
                  autofocus
                />
              </div>

              <div class="patient-results-list">
                @if (searchingPatients()) {
                  <div class="loading-state-sm">
                    <i class="fa fa-spinner fa-spin"></i> Searching patients...
                  </div>
                } @else if (patientResults().length === 0) {
                  <div class="empty-state-sm">
                    <p>No matching patients found in database.</p>
                    <a routerLink="/patients/new" (click)="closePatientPicker()" class="btn btn-secondary btn-sm">
                      <i class="fa fa-plus"></i> Register New Patient
                    </a>
                  </div>
                } @else {
                  @for (p of patientResults(); track p.id) {
                    <div class="patient-result-item" (click)="startEncounterWithPatient(p)">
                      <div class="res-avatar">
                        {{ p.first_name ? p.first_name[0] : '' }}{{ p.last_name ? p.last_name[0] : '' }}
                      </div>
                      <div class="res-details">
                        <div class="res-name">{{ p.first_name }} {{ p.middle_name || '' }} {{ p.last_name }}</div>
                        <div class="res-meta">
                          <span class="res-code">{{ p.patient_code || 'ID: ' + p.id.substring(0, 8) }}</span>
                          <span class="sep">•</span>
                          <span>{{ p.gender || 'N/A' }}</span>
                          <span class="sep">•</span>
                          <span>DOB: {{ p.date_of_birth || 'N/A' }} ({{ p.age || p.age_manual || 'Age N/A' }})</span>
                          @if (p.phone) {
                            <span class="sep">•</span>
                            <span>{{ p.phone }}</span>
                          }
                        </div>
                      </div>
                      <button class="btn btn-sm btn-teal select-btn">
                        Select <i class="fa fa-chevron-right"></i>
                      </button>
                    </div>
                  }
                }
              </div>
            </div>

            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="closePatientPicker()">Cancel</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .consultation-hub {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Page Header */
    .page-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
    }

    .page-title {
      font-size: 1.6em;
      font-weight: 700;
      color: var(--primary-black);
      letter-spacing: -0.5px;
      margin: 0 0 6px 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .page-subtitle {
      color: var(--text-gray);
      font-size: 0.95em;
      margin: 0;
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
    }

    .stat-card {
      background: #ffffff;
      border-radius: 14px;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 18px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
      border: 1px solid var(--border-gray);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
    }

    .stat-icon {
      width: 50px;
      height: 50px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35em;
    }

    .stat-icon.total { background: #e0f2fe; color: #0284c7; }
    .stat-icon.progress { background: #fef3c7; color: #d97706; }
    .stat-icon.completed { background: #ecfdf5; color: #059669; }
    .stat-icon.doctors { background: #f3e8ff; color: #7e22ce; }

    .stat-number {
      font-size: 1.8em;
      font-weight: 700;
      color: var(--primary-black);
      line-height: 1.1;
    }

    .stat-label {
      font-size: 0.85em;
      color: var(--text-gray);
      font-weight: 500;
      margin-top: 4px;
    }

    /* Filter Toolbar */
    .filter-card {
      background: #ffffff;
      border-radius: 14px;
      padding: 16px 20px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
      border: 1px solid var(--border-gray);
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
    }

    .search-wrap {
      flex: 1;
      min-width: 280px;
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 14px;
      color: #94a3b8;
      font-size: 0.95em;
    }

    .search-input {
      width: 100%;
      height: 42px;
      padding: 0 36px 0 40px;
      border: 1px solid var(--border-gray);
      border-radius: 10px;
      font-size: 0.92em;
      outline: none;
      transition: all 0.2s ease;
      background: #fafafa;
    }

    .search-input:focus {
      background: #fff;
      border-color: var(--secondary-green);
      box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
    }

    .clear-search {
      position: absolute;
      right: 12px;
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 1em;
    }

    .filter-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }

    .filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .filter-group label {
      font-size: 0.85em;
      font-weight: 600;
      color: #64748b;
      margin: 0;
    }

    .filter-select {
      height: 40px;
      padding: 0 12px;
      border: 1px solid var(--border-gray);
      border-radius: 8px;
      font-size: 0.88em;
      background: #ffffff;
      color: var(--text-dark);
      outline: none;
      cursor: pointer;
    }

    .filter-select:focus {
      border-color: var(--secondary-green);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    }

    /* Table Container */
    .table-container {
      background: #ffffff;
      border-radius: 14px;
      padding: 0;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
      border: 1px solid var(--border-gray);
    }

    .data-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
    }

    .data-table th {
      background: #f8fafc;
      color: #64748b;
      padding: 14px 20px;
      font-size: 0.82em;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border-gray);
      text-align: left;
    }

    .data-table td {
      padding: 16px 20px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 0.9em;
      vertical-align: middle;
    }

    .encounter-row:hover td {
      background-color: #f8fafc;
    }

    .encounter-row:last-child td {
      border-bottom: none;
    }

    .encounter-date {
      font-weight: 700;
      color: #1e293b;
    }

    .encounter-time {
      font-size: 0.82em;
      color: #64748b;
      margin-top: 2px;
    }

    .visit-type-badge {
      display: inline-block;
      margin-top: 6px;
      padding: 2px 8px;
      border-radius: 6px;
      font-size: 0.75em;
      font-weight: 700;
      background: #e2e8f0;
      color: #475569;
    }

    .visit-type-badge.follow-up {
      background: #dbeafe;
      color: #1d4ed8;
    }

    /* Patient Cell */
    .patient-cell {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .patient-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.9em;
      flex-shrink: 0;
    }

    .patient-name {
      font-weight: 700;
      color: #0f172a;
      text-decoration: none;
      font-size: 1em;
    }

    .patient-name:hover {
      color: #0d9488;
      text-decoration: underline;
    }

    .patient-sub {
      font-size: 0.82em;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
    }

    .patient-sub .code {
      font-weight: 600;
      color: #0d9488;
    }

    .sep {
      color: #cbd5e1;
    }

    /* Physician Cell */
    .doc-name {
      font-weight: 700;
      color: #1e293b;
    }

    .doc-designation {
      font-size: 0.8em;
      color: #059669;
      font-weight: 600;
      margin-top: 1px;
    }

    .doc-license {
      font-size: 0.78em;
      color: #64748b;
      margin-top: 2px;
    }

    /* Clinical Cell */
    .clinical-cell {
      max-width: 320px;
    }

    .chief-complaint {
      font-size: 0.88em;
      color: #334155;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .cc-tag {
      font-weight: 700;
      color: #e11d48;
    }

    .primary-diagnosis {
      font-size: 0.88em;
      color: #0f172a;
      margin-top: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dx-tag {
      font-weight: 700;
      color: #0d9488;
    }

    .no-dx {
      color: #94a3b8;
      font-style: italic;
      font-size: 0.85em;
    }

    .vitals-mini {
      font-size: 0.78em;
      color: #64748b;
      margin-top: 4px;
      font-family: monospace;
    }

    /* Action Buttons */
    .actions-header {
      text-align: right;
    }

    .actions-cell {
      text-align: right;
    }

    .action-buttons {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }

    .btn-teal {
      background: #0d9488;
      color: #ffffff;
      border: 1px solid #0f766e;
      font-weight: 700;
      box-shadow: 0 1px 3px rgba(13, 148, 136, 0.25);
    }

    .btn-teal:hover {
      background: #0f766e;
      color: #ffffff;
    }

    .doc-links {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .doc-btn {
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 0.76em;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      border: 1px solid;
      transition: all 0.15s ease;
    }

    .doc-btn.chart { background: #fff7ed; color: #c2410c; border-color: #fdba74; }
    .doc-btn.chart:hover { background: #ea580c; color: #fff; }

    .doc-btn.rx { background: #f0fdf4; color: #15803d; border-color: #86efac; }
    .doc-btn.rx:hover { background: #16a34a; color: #fff; }

    .doc-btn.cert { background: #fefce8; color: #a16207; border-color: #fde047; }
    .doc-btn.cert:hover { background: #ca8a04; color: #fff; }

    .doc-btn.lab { background: #f0f9ff; color: #0369a1; border-color: #7dd3fc; }
    .doc-btn.lab:hover { background: #0284c7; color: #fff; }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.78em;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .badge-success { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    .badge-warning { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }

    /* Patient Picker Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fadeIn 0.2s ease;
    }

    .modal-card {
      background: #ffffff;
      border-radius: 16px;
      width: 100%;
      max-width: 640px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      max-height: 85vh;
    }

    .modal-header {
      padding: 18px 24px;
      border-bottom: 1px solid var(--border-gray);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f8fafc;
    }

    .modal-title {
      font-size: 1.15em;
      font-weight: 700;
      color: var(--primary-black);
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .text-teal { color: #0d9488; }

    .modal-close {
      background: none;
      border: none;
      font-size: 1.2em;
      color: #94a3b8;
      cursor: pointer;
    }

    .modal-body {
      padding: 20px 24px;
      overflow-y: auto;
      flex: 1;
    }

    .modal-search {
      position: relative;
      margin-bottom: 16px;
    }

    .modal-search i {
      position: absolute;
      left: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: #94a3b8;
    }

    .modal-search input {
      padding-left: 38px;
    }

    .patient-results-list {
      max-height: 380px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .patient-result-item {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 16px;
      border-radius: 10px;
      border: 1px solid var(--border-gray);
      cursor: pointer;
      transition: all 0.15s ease;
      background: #ffffff;
    }

    .patient-result-item:hover {
      background: #f0fdfa;
      border-color: #0d9488;
      transform: translateX(3px);
    }

    .res-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #e2e8f0;
      color: #334155;
      font-weight: 700;
      font-size: 0.85em;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .res-details {
      flex: 1;
      min-width: 0;
    }

    .res-name {
      font-weight: 700;
      color: #0f172a;
      font-size: 0.95em;
    }

    .res-meta {
      font-size: 0.8em;
      color: #64748b;
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    .res-code {
      font-weight: 600;
      color: #0d9488;
    }

    .modal-footer {
      padding: 14px 24px;
      border-top: 1px solid var(--border-gray);
      background: #f8fafc;
      display: flex;
      justify-content: flex-end;
    }

    .loading-state, .empty-state {
      padding: 48px 24px;
      text-align: center;
      color: #64748b;
    }

    .empty-icon {
      font-size: 3em;
      margin-bottom: 12px;
    }

    .empty-state h3 {
      font-size: 1.25em;
      color: #1e293b;
      margin-bottom: 8px;
    }

    .empty-state p {
      max-width: 450px;
      margin: 0 auto 20px auto;
      font-size: 0.92em;
    }
  `]
})
export class ConsultationListComponent implements OnInit {
  private consultService = inject(ConsultationService);
  private patientService = inject(PatientService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private router = inject(Router);

  consultations = signal<any[]>([]);
  loading = signal(true);

  searchQuery = '';
  statusFilter = '';
  doctorFilter = '';

  // Patient Picker Modal
  showPatientPicker = signal(false);
  searchingPatients = signal(false);
  patientSearchQuery = '';
  patientResults = signal<Patient[]>([]);

  // Computed Stats
  totalCount = computed(() => this.consultations().length);
  inProgressCount = computed(() => this.consultations().filter(c => c.status !== 'Completed').length);
  completedCount = computed(() => this.consultations().filter(c => c.status === 'Completed').length);

  doctorList = computed(() => {
    const set = new Set<string>();
    for (const c of this.consultations()) {
      if (c.doctor_name) set.add(c.doctor_name.trim());
    }
    return Array.from(set).sort();
  });

  uniqueDoctorsCount = computed(() => this.doctorList().length);

  filteredConsultations = computed(() => {
    let list = this.consultations();

    if (this.statusFilter) {
      list = list.filter(c => c.status === this.statusFilter);
    }

    if (this.doctorFilter) {
      list = list.filter(c => (c.doctor_name || '').trim() === this.doctorFilter);
    }

    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(c => {
        const pName = this.getPatientName(c).toLowerCase();
        const pCode = (c.patient?.patient_code || '').toLowerCase();
        const cc = (c.chief_complaint || '').toLowerCase();
        const dx = (c.primary_diagnosis || '').toLowerCase();
        const doc = (c.doctor_name || '').toLowerCase();
        return pName.includes(q) || pCode.includes(q) || cc.includes(q) || dx.includes(q) || doc.includes(q);
      });
    }

    return list;
  });

  ngOnInit(): void {
    this.loadConsultations();
  }

  loadConsultations(): void {
    this.loading.set(true);
    this.consultService.getAll({ limit: 500 }).subscribe({
      next: (res) => {
        this.consultations.set(res.consultations || []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load consultation records');
      }
    });
  }

  onFilterChange(): void {
    // reactive computed signal auto-updates filteredConsultations()
  }

  resetFilters(): void {
    this.searchQuery = '';
    this.statusFilter = '';
    this.doctorFilter = '';
  }

  getPatientName(c: any): string {
    if (c.patient) {
      return `${c.patient.first_name || ''} ${c.patient.last_name || ''}`.trim() || 'Unknown Patient';
    }
    return 'Patient #' + (c.patient_id ? c.patient_id.substring(0, 8) : 'Unknown');
  }

  getPatientInitials(c: any): string {
    if (c.patient) {
      const f = c.patient.first_name ? c.patient.first_name[0] : '';
      const l = c.patient.last_name ? c.patient.last_name[0] : '';
      return (f + l).toUpperCase() || 'P';
    }
    return 'P';
  }

  openPatientPicker(): void {
    this.showPatientPicker.set(true);
    this.patientSearchQuery = '';
    this.searchPatients();
  }

  closePatientPicker(): void {
    this.showPatientPicker.set(false);
  }

  searchPatients(): void {
    this.searchingPatients.set(true);
    this.patientService.getAll({ search: this.patientSearchQuery, limit: 20 }).subscribe({
      next: (res) => {
        this.patientResults.set(res.patients || []);
        this.searchingPatients.set(false);
      },
      error: () => {
        this.searchingPatients.set(false);
      }
    });
  }

  startEncounterWithPatient(patient: Patient): void {
    this.closePatientPicker();
    // Route to new encounter panel with patient param
    this.router.navigate(['/consultations/new'], { queryParams: { patient: patient.id } });
  }
}
