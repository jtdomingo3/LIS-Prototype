import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EquipmentService } from '../../core/services/equipment.service';
import { ToastService } from '../../shared/services/toast.service';
import { Equipment, EquipmentLog, QcControl, QcEntry } from '../../core/models';

@Component({
  selector: 'app-equipment-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="equipment-page">
      <header class="page-header">
        <div class="header-title">
          <h1>🔬 Laboratory Instruments &amp; Equipment QC</h1>
          <p class="subtitle">ISO 15189:2022 (Clause 6.4) &bull; Calibration Schedules &bull; Radiation Safety &bull; Westgard Rules</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-primary" (click)="openNewModal()">
            <i class="fa fa-plus"></i> Register Instrument
          </button>
        </div>
      </header>

      <!-- Equipment Cards Grid -->
      <div class="equipment-grid">
        @for (eq of equipment(); track eq.id) {
          <div class="eq-card" [class.overdue]="eq.is_calibration_overdue" [class.due-soon]="eq.is_calibration_due">
            <div class="eq-card-header">
              <div>
                <span class="eq-code">{{ eq.equipment_code }}</span>
                <h3 class="eq-name">{{ eq.name }}</h3>
                <div class="eq-sub">{{ eq.manufacturer }} &bull; Model {{ eq.model_number || 'N/A' }}</div>
              </div>
              <span class="status-badge" [ngClass]="eqStatusClass(eq.status)">
                {{ eq.status }}
              </span>
            </div>

            <div class="eq-card-body">
              <div class="info-row">
                <span class="label">Section / Dept:</span>
                <span class="val">{{ eq.department }}</span>
              </div>
              <div class="info-row">
                <span class="label">Serial No.:</span>
                <span class="val">{{ eq.serial_number || 'N/A' }}</span>
              </div>
              <div class="info-row">
                <span class="label">Location:</span>
                <span class="val">{{ eq.location || 'Main Laboratory' }}</span>
              </div>

              <!-- Calibration schedule tracker -->
              <div class="cal-banner" [class.cal-danger]="eq.is_calibration_overdue" [class.cal-warn]="eq.is_calibration_due">
                <div class="cal-icon">⏱️</div>
                <div class="cal-details">
                  <div class="cal-label">Next Calibration:</div>
                  <div class="cal-date">
                    <strong>{{ eq.next_calibration_date ? (eq.next_calibration_date | date:'mediumDate') : 'Not Scheduled' }}</strong>
                    @if (eq.days_until_calibration !== null && eq.days_until_calibration !== undefined) {
                      <span class="days-pill" [class.days-neg]="eq.days_until_calibration < 0">
                        ({{ eq.days_until_calibration < 0 ? (abs(eq.days_until_calibration) + ' days OVERDUE') : (eq.days_until_calibration + ' days left') }})
                      </span>
                    }
                  </div>
                </div>
              </div>

              @if (eq.radiation_safety_details.isRadiationEmitter) {
                <div class="rad-tag">
                  ☢️ Diagnostic X-Ray / Radiation Emitter (FDA CDRRHR Reg: {{ eq.radiation_safety_details.fdaCdrrhrRegNumber || 'Active' }})
                </div>
              }
            </div>

            <div class="eq-card-footer">
              <button type="button" class="btn btn-sm btn-outline" (click)="viewLogs(eq)">
                <i class="fa fa-clipboard-list"></i> Service Logs
              </button>
              <button type="button" class="btn btn-sm btn-outline-primary" (click)="viewQc(eq)">
                <i class="fa fa-chart-line"></i> QC &amp; Levey-Jennings
              </button>
            </div>
          </div>
        }
      </div>

      <!-- SERVICE LOGS MODAL -->
      @if (activeModal() === 'logs') {
        <div class="modal-backdrop">
          <div class="modal-dialog modal-lg">
            <div class="modal-header">
              <h3>📋 Maintenance &amp; Calibration Logs: {{ selectedEquipment()?.name }}</h3>
              <button type="button" class="close-btn" (click)="closeModal()">×</button>
            </div>
            <div class="modal-body">
              <!-- Add new log form -->
              <div class="add-log-box">
                <h4>+ Record Service or Calibration</h4>
                <div class="grid-3">
                  <div class="form-group">
                    <label>Log Type</label>
                    <select class="form-control" [(ngModel)]="newLog.log_type">
                      <option value="CALIBRATION">Calibration</option>
                      <option value="PREVENTIVE_MAINTENANCE">Preventive Maintenance</option>
                      <option value="REPAIR">Corrective Repair</option>
                      <option value="INSPECTION">Routine Inspection</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>Service Date</label>
                    <input type="date" class="form-control" [(ngModel)]="newLog.service_date" />
                  </div>
                  <div class="form-group">
                    <label>Certificate / Report #</label>
                    <input type="text" class="form-control" [(ngModel)]="newLog.certificate_number" placeholder="CERT-2026-01" />
                  </div>
                </div>
                <div class="grid-2">
                  <div class="form-group">
                    <label>Engineer / Provider</label>
                    <input type="text" class="form-control" [(ngModel)]="newLog.service_provider" placeholder="Company / Biomedical Engineer" />
                  </div>
                  <div class="form-group">
                    <label>Result Status</label>
                    <select class="form-control" [(ngModel)]="newLog.result_status">
                      <option value="PASSED">PASSED / OPERATIONAL</option>
                      <option value="FAILED">FAILED / ADJUSTMENT NEEDED</option>
                      <option value="PENDING">PENDING REPORT</option>
                    </select>
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-primary" (click)="saveLog()">Save Service Log</button>
              </div>

              <!-- Existing logs table -->
              <div class="table-responsive" style="margin-top: 15px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Service Date</th>
                      <th>Provider / Engineer</th>
                      <th>Certificate #</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (log of currentLogs(); track log.id) {
                      <tr>
                        <td><strong>{{ log.log_type }}</strong></td>
                        <td>{{ log.service_date | date:'mediumDate' }}</td>
                        <td>{{ log.service_provider || 'Internal Staff' }}</td>
                        <td><code>{{ log.certificate_number || 'N/A' }}</code></td>
                        <td>
                          <span class="badge" [class.badge-pass]="log.result_status === 'PASSED'" [class.badge-fail]="log.result_status === 'FAILED'">
                            {{ log.result_status }}
                          </span>
                        </td>
                      </tr>
                    }
                    @if (currentLogs().length === 0) {
                      <tr>
                        <td colspan="5" class="empty-state">No service logs recorded for this instrument.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" (click)="closeModal()">Close</button>
            </div>
          </div>
        </div>
      }

      <!-- QC & LEVEY-JENNINGS MODAL -->
      @if (activeModal() === 'qc') {
        <div class="modal-backdrop">
          <div class="modal-dialog modal-lg">
            <div class="modal-header">
              <h3>📈 Quality Control &amp; Levey-Jennings: {{ selectedEquipment()?.name }}</h3>
              <button type="button" class="close-btn" (click)="closeModal()">×</button>
            </div>
            <div class="modal-body">
              <div class="qc-intro">
                Westgard multirule monitoring for diagnostic accuracy.
              </div>

              <!-- Record QC run form -->
              <div class="qc-run-form">
                <div class="grid-3">
                  <div class="form-group">
                    <label>Analyte Code</label>
                    <input type="text" class="form-control" [(ngModel)]="qcForm.analyte_code" placeholder="e.g. GLU, CHOL, CREA" />
                  </div>
                  <div class="form-group">
                    <label>Measured Value</label>
                    <input type="number" step="0.1" class="form-control" [(ngModel)]="qcForm.measured_value" />
                  </div>
                  <div class="form-group">
                    <label>Target Mean / SD</label>
                    <div style="display:flex; gap: 4px;">
                      <input type="number" step="0.1" class="form-control" [(ngModel)]="qcForm.mean_target" placeholder="Mean" />
                      <input type="number" step="0.1" class="form-control" [(ngModel)]="qcForm.sd_target" placeholder="SD" />
                    </div>
                  </div>
                </div>
                <button type="button" class="btn btn-sm btn-primary" (click)="submitQcRun()">Record Control Run</button>
              </div>

              <!-- QC Run History Table -->
              <div class="table-responsive" style="margin-top: 15px;">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Run Date</th>
                      <th>Analyte</th>
                      <th>Measured</th>
                      <th>Mean ± SD</th>
                      <th>Z-Score</th>
                      <th>Status / Westgard Violations</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (run of qcEntries(); track run.id) {
                      <tr>
                        <td>{{ run.run_date | date:'short' }}</td>
                        <td><strong>{{ run.analyte_code }}</strong></td>
                        <td><strong>{{ run.measured_value }}</strong></td>
                        <td>{{ run.mean_target }} ± {{ run.sd_target }}</td>
                        <td>
                          <span class="z-badge" [class.z-bad]="run.status !== 'IN_CONTROL'">
                            {{ run.z_score !== null ? run.z_score : '--' }}
                          </span>
                        </td>
                        <td>
                          <span class="badge" [class.badge-pass]="run.status === 'IN_CONTROL'" [class.badge-warn]="run.status === 'WARNING'" [class.badge-fail]="run.status === 'OUT_OF_CONTROL'">
                            {{ run.status }}
                          </span>
                          @for (rule of run.violated_rules; track rule) {
                            <div class="rule-tag">{{ rule }}</div>
                          }
                        </td>
                      </tr>
                    }
                    @if (qcEntries().length === 0) {
                      <tr>
                        <td colspan="6" class="empty-state">No quality control entries recorded yet. Record a run above.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" (click)="closeModal()">Close</button>
            </div>
          </div>
        </div>
      }

      <!-- NEW INSTRUMENT MODAL -->
      @if (activeModal() === 'new') {
        <div class="modal-backdrop">
          <div class="modal-dialog modal-lg">
            <div class="modal-header">
              <h3>✨ Register New Laboratory Equipment / Analyzer</h3>
              <button type="button" class="close-btn" (click)="closeModal()">×</button>
            </div>
            <div class="modal-body">
              <div class="grid-2">
                <div class="form-group">
                  <label>Equipment / Machine Name <span class="required">*</span></label>
                  <input type="text" class="form-control" [(ngModel)]="newEq.name" placeholder="e.g. Mindray BS-240 Chemistry Analyzer" />
                </div>
                <div class="form-group">
                  <label>Equipment Code</label>
                  <input type="text" class="form-control" [(ngModel)]="newEq.equipment_code" placeholder="Auto-generated if blank" />
                </div>
              </div>
              <div class="grid-3">
                <div class="form-group">
                  <label>Department / Section</label>
                  <select class="form-control" [(ngModel)]="newEq.department">
                    <option value="General Laboratory">General Laboratory</option>
                    <option value="Clinical Chemistry">Clinical Chemistry</option>
                    <option value="Hematology">Hematology</option>
                    <option value="Clinical Microscopy">Clinical Microscopy</option>
                    <option value="Radiology / X-Ray">Radiology / X-Ray</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Manufacturer / Brand</label>
                  <input type="text" class="form-control" [(ngModel)]="newEq.manufacturer" placeholder="e.g. Mindray, Roche, Abbott" />
                </div>
                <div class="form-group">
                  <label>Model Number</label>
                  <input type="text" class="form-control" [(ngModel)]="newEq.model_number" placeholder="e.g. BS-240" />
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Serial Number</label>
                  <input type="text" class="form-control" [(ngModel)]="newEq.serial_number" />
                </div>
                <div class="form-group">
                  <label>Physical Location</label>
                  <input type="text" class="form-control" [(ngModel)]="newEq.location" placeholder="e.g. Room 102 - Chemistry Bench" />
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Calibration Cycle (Days)</label>
                  <input type="number" class="form-control" [(ngModel)]="newEq.calibration_cycle_days" />
                </div>
                <div class="form-group">
                  <label>Next Scheduled Calibration Date</label>
                  <input type="date" class="form-control" [(ngModel)]="newEq.next_calibration_date" />
                </div>
              </div>
              <div class="form-group">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="newEq.radiation_safety_details.isRadiationEmitter" />
                  <strong>Diagnostic Radiation Emitter (X-Ray / C-Arm / CT)</strong>
                </label>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" (click)="closeModal()">Cancel</button>
              <button type="button" class="btn btn-primary" (click)="saveNewEquipment()">Register Instrument</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .equipment-page {
      padding: 1.5rem;
      max-width: 1400px;
      margin: 0 auto;
      font-family: 'Inter', sans-serif;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .header-title h1 {
      font-size: 1.45rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
    }

    .subtitle {
      font-size: 0.85rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    /* Grid */
    .equipment-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
      gap: 1.25rem;
    }

    .eq-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .eq-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.08);
    }

    .eq-card.overdue {
      border-left: 5px solid #ef4444;
    }

    .eq-card.due-soon {
      border-left: 5px solid #f59e0b;
    }

    .eq-card-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .eq-code {
      font-family: monospace;
      font-size: 0.75rem;
      color: #64748b;
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .eq-name {
      font-size: 1.05rem;
      font-weight: 700;
      color: #0f172a;
      margin: 0.25rem 0;
    }

    .eq-sub {
      font-size: 0.8rem;
      color: #64748b;
    }

    .eq-card-body {
      padding: 1rem 1.25rem;
      flex: 1;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      padding: 0.25rem 0;
    }

    .info-row .label {
      color: #64748b;
    }

    .cal-banner {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.65rem 0.85rem;
      margin-top: 0.75rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .cal-icon {
      font-size: 1.25rem;
    }

    .cal-label {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 600;
    }

    .cal-date {
      font-size: 0.85rem;
    }

    .days-pill {
      font-size: 0.75rem;
      color: #059669;
      margin-left: 4px;
    }

    .days-neg {
      color: #dc2626;
      font-weight: 700;
    }

    .cal-danger {
      background: #fef2f2;
      border-color: #fecaca;
    }

    .cal-warn {
      background: #fffbeb;
      border-color: #fde68a;
    }

    .rad-tag {
      background: #fef3c7;
      color: #92400e;
      border: 1px solid #fde68a;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-top: 0.65rem;
    }

    .eq-card-footer {
      padding: 0.75rem 1.25rem;
      background: #f8fafc;
      border-top: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
    }

    /* Badges */
    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .st-op { background: #dcfce7; color: #15803d; }
    .st-warn { background: #fef3c7; color: #b45309; }
    .st-danger { background: #fee2e2; color: #b91c1c; }

    .badge-pass { background: #dcfce7; color: #15803d; }
    .badge-warn { background: #fef3c7; color: #b45309; }
    .badge-fail { background: #fee2e2; color: #b91c1c; }

    .z-badge {
      padding: 2px 6px;
      border-radius: 4px;
      background: #f1f5f9;
      font-weight: 700;
    }

    .z-bad {
      background: #fee2e2;
      color: #dc2626;
    }

    .rule-tag {
      font-size: 0.75rem;
      color: #dc2626;
      font-weight: 600;
    }

    /* Modals */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1050;
      backdrop-filter: blur(2px);
    }

    .modal-dialog {
      background: white;
      width: 100%;
      max-width: 600px;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.25);
      overflow: hidden;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }

    .modal-lg { max-width: 800px; }

    .modal-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h3 {
      font-size: 1.15rem;
      font-weight: 700;
      margin: 0;
      color: #0f172a;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: #64748b;
      cursor: pointer;
    }

    .modal-body {
      padding: 1.5rem;
      overflow-y: auto;
    }

    .modal-footer {
      padding: 1rem 1.5rem;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }

    .add-log-box, .qc-run-form {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 1rem;
      border-radius: 8px;
    }

    .add-log-box h4 {
      margin: 0 0 0.75rem 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #1e293b;
    }

    .qc-intro {
      font-size: 0.85rem;
      color: #64748b;
      margin-bottom: 1rem;
    }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem; }
    .form-group { margin-bottom: 0.85rem; }
    .form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 0.3rem; }

    .form-control {
      padding: 0.55rem 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.85rem;
      font-family: inherit;
      width: 100%;
      box-sizing: border-box;
    }

    .table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .table th { background: #f8fafc; padding: 0.65rem 0.85rem; text-align: left; border-bottom: 2px solid #e2e8f0; }
    .table td { padding: 0.65rem 0.85rem; border-bottom: 1px solid #f1f5f9; }

    .btn {
      padding: 0.6rem 1rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: none;
      transition: all 0.2s ease;
    }

    .btn-primary { background: #10b981; color: white; }
    .btn-primary:hover { background: #059669; }

    .btn-outline { background: white; border: 1px solid #cbd5e1; color: #334155; }
    .btn-outline:hover { background: #f8fafc; }

    .btn-outline-primary { background: white; border: 1px solid #10b981; color: #10b981; }
    .btn-outline-primary:hover { background: #10b981; color: white; }

    .btn-sm { padding: 0.35rem 0.65rem; font-size: 0.75rem; }
    .empty-state { text-align: center; padding: 2rem; color: #94a3b8; }
  `]
})
export class EquipmentListComponent implements OnInit {
  private eqService = inject(EquipmentService);
  private toast = inject(ToastService);

  equipment = signal<Equipment[]>([]);
  selectedEquipment = signal<Equipment | null>(null);
  currentLogs = signal<EquipmentLog[]>([]);
  qcEntries = signal<QcEntry[]>([]);

  activeModal = signal<'logs' | 'qc' | 'new' | null>(null);

  newLog: Partial<EquipmentLog> = {
    log_type: 'CALIBRATION',
    service_date: new Date().toISOString().slice(0, 10),
    service_provider: '',
    certificate_number: '',
    result_status: 'PASSED',
  };

  qcForm = {
    analyte_code: 'GLU',
    measured_value: 100,
    mean_target: 100,
    sd_target: 5,
  };

  newEq: any = {
    name: '',
    equipment_code: '',
    department: 'Clinical Chemistry',
    manufacturer: '',
    model_number: '',
    serial_number: '',
    location: '',
    calibration_cycle_days: 365,
    next_calibration_date: '',
    radiation_safety_details: { isRadiationEmitter: false },
  };

  ngOnInit(): void {
    this.loadEquipment();
  }

  loadEquipment(): void {
    this.eqService.getAll().subscribe({
      next: (res) => this.equipment.set(res),
      error: () => this.toast.error('Failed to load equipment')
    });
  }

  eqStatusClass(status: string): string {
    if (status === 'OPERATIONAL') return 'st-op';
    if (status.includes('DUE')) return 'st-warn';
    if (status.includes('OVERDUE') || status === 'OUT_OF_SERVICE') return 'st-danger';
    return '';
  }

  abs(val: number): number {
    return Math.abs(val);
  }

  viewLogs(eq: Equipment): void {
    this.selectedEquipment.set(eq);
    this.newLog = {
      log_type: 'CALIBRATION',
      service_date: new Date().toISOString().slice(0, 10),
      service_provider: '',
      certificate_number: '',
      result_status: 'PASSED',
    };
    this.eqService.getLogs(eq.id).subscribe({
      next: (logs) => {
        this.currentLogs.set(logs);
        this.activeModal.set('logs');
      }
    });
  }

  saveLog(): void {
    const eq = this.selectedEquipment();
    if (!eq) return;

    this.eqService.addLog(eq.id, this.newLog).subscribe({
      next: () => {
        this.toast.success('Service log recorded');
        this.viewLogs(eq);
        this.loadEquipment();
      },
      error: (err) => this.toast.error(err?.error?.error || 'Failed to record log')
    });
  }

  viewQc(eq: Equipment): void {
    this.selectedEquipment.set(eq);
    // Find or create default control run
    this.eqService.getQcControls(eq.id).subscribe({
      next: (ctrls) => {
        const ctrlId = ctrls[0]?.id || eq.id;
        this.eqService.getQcEntries(ctrlId).subscribe({
          next: (entries) => {
            this.qcEntries.set(entries);
            this.activeModal.set('qc');
          }
        });
      }
    });
  }

  submitQcRun(): void {
    const eq = this.selectedEquipment();
    if (!eq) return;

    this.eqService.addQcEntry({
      equipment_id: eq.id,
      control_id: eq.id, // linked to instrument
      analyte_code: this.qcForm.analyte_code,
      measured_value: Number(this.qcForm.measured_value),
      mean_target: Number(this.qcForm.mean_target),
      sd_target: Number(this.qcForm.sd_target),
    }).subscribe({
      next: (entry) => {
        if (entry.status === 'OUT_OF_CONTROL') {
          this.toast.error(`⚠️ Westgard Alert: Run is Out of Control! (${entry.violated_rules.join(', ')})`);
        } else if (entry.status === 'WARNING') {
          this.toast.warning(`⚠️ Westgard Warning: Run exceeds 2 SD limit!`);
        } else {
          this.toast.success('QC run in control (Passed)');
        }
        this.viewQc(eq);
      },
      error: (err) => this.toast.error(err?.error?.error || 'Failed to submit QC run')
    });
  }

  openNewModal(): void {
    this.newEq = {
      name: '',
      equipment_code: `EQ-${Date.now().toString().slice(-6)}`,
      department: 'Clinical Chemistry',
      manufacturer: '',
      model_number: '',
      serial_number: '',
      location: '',
      calibration_cycle_days: 365,
      next_calibration_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      radiation_safety_details: { isRadiationEmitter: false },
    };
    this.activeModal.set('new');
  }

  saveNewEquipment(): void {
    if (!this.newEq.name?.trim()) {
      this.toast.error('Instrument name is required');
      return;
    }

    this.eqService.create(this.newEq).subscribe({
      next: () => {
        this.toast.success('Equipment registered successfully');
        this.closeModal();
        this.loadEquipment();
      },
      error: (err) => this.toast.error(err?.error?.error || 'Failed to register equipment')
    });
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.selectedEquipment.set(null);
  }
}
