import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ReceptionService } from '../../../core/services/reception.service';

interface PatientEntry {
  patient: any;
  tests: any[];
  clinicalAmount?: number;
  xrayAmount?: number;
}

@Component({
  selector: 'app-area-queue',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <h1>{{ areaName() }} Queue</h1>
      <a routerLink="/reception" class="btn btn-outline">← Back</a>
    </div>

    @if (loading()) {
      <div class="loading">Loading queue...</div>
    } @else {
      @if (entries().length) {
        @for (entry of entries(); track entry.patient.id) {
          <div class="card patient-card">
            <div class="patient-header">
              <div>
                <strong>{{ entry.patient.patient_id || entry.patient.patient_code }}</strong>
                — {{ entry.patient.first_name }} {{ entry.patient.last_name }}
              </div>
              <span class="test-count">{{ entry.tests.length }} test(s)</span>
            </div>

            <table class="table compact">
              <thead>
                <tr><th>Test ID</th><th>Type</th><th>Date</th></tr>
              </thead>
              <tbody>
                @for (t of entry.tests; track t.id) {
                  <tr>
                    <td>{{ t.test_id }}</td>
                    <td>{{ t.test_type }}</td>
                    <td>{{ t.created_at | date:'shortDate' }}</td>
                  </tr>
                }
              </tbody>
            </table>

            <!-- Payment Area: amount inputs -->
            @if (isPaymentArea()) {
              <div class="payment-inputs">
                <div class="form-group">
                  <label class="form-label">Clinical Lab Amount</label>
                  <input type="number" class="form-control" [(ngModel)]="entry.clinicalAmount"
                    [ngModelOptions]="{standalone: true}" placeholder="0.00" min="0" step="0.01" />
                </div>
                <div class="form-group">
                  <label class="form-label">X-ray Lab Amount</label>
                  <input type="number" class="form-control" [(ngModel)]="entry.xrayAmount"
                    [ngModelOptions]="{standalone: true}" placeholder="0.00" min="0" step="0.01" />
                </div>
              </div>
            }

            <div class="patient-actions">
              @if (isDoctorArea()) {
                <a [routerLink]="['/consultations', getDoctorTestId(entry)]" [queryParams]="{ area: areaName(), patient: entry.patient.id, test: getDoctorTestId(entry) }" class="btn btn-teal">
                  <i class="fa fa-stethoscope"></i> Open Clinical Consultation
                </a>
              }
              <button class="btn btn-primary" (click)="completePatient(entry)"
                [disabled]="completing() === entry.patient.id || stashing() === entry.patient.id">
                {{ completing() === entry.patient.id ? 'Processing...' : 'Mark Complete' }}
              </button>
              @if (isReleasingArea()) {
                <button class="btn btn-warning" (click)="stashPatient(entry)"
                  [disabled]="stashing() === entry.patient.id || completing() === entry.patient.id">
                  {{ stashing() === entry.patient.id ? 'Stashing...' : '&#128229; Stash Result' }}
                </button>
              }
              <button class="btn btn-danger" (click)="deletePatient(entry)"
                [disabled]="completing() === entry.patient.id || stashing() === entry.patient.id">
                Delete
              </button>
            </div>
          </div>
        }
      } @else {
        <div class="card empty">No patients in queue for this area.</div>
      }
    }
  `,
  styles: [`
    .patient-card { margin-bottom: 1rem; }
    .patient-header {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 0.75rem; border-bottom: 1px solid #e5e7eb; margin-bottom: 0.75rem;
    }
    .test-count { font-size: 0.85rem; color: #6b7280; background: #f3f4f6; padding: 2px 10px; border-radius: 12px; }
    .compact th, .compact td { padding: 0.4rem 0.75rem; font-size: 0.85rem; }
    .payment-inputs { display: flex; gap: 1rem; margin-top: 0.75rem; }
    .payment-inputs .form-group { flex: 1; }
    .patient-actions { display: flex; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #e5e7eb; }
    .empty { text-align: center; padding: 3rem; color: #9ca3af; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
    .btn-danger { background: #ef4444; color: white; border-color: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
    .btn-warning { background: #f59e0b; color: white; border: none; font-weight: 600; border-radius: 6px; padding: 0.5rem 1rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.4rem; }
    .btn-warning:hover { background: #d97706; }
  `]
})
export class AreaQueueComponent implements OnInit, OnDestroy {
  private receptionService = inject(ReceptionService);
  private route = inject(ActivatedRoute);

  areaName = signal('');
  entries = signal<PatientEntry[]>([]);
  loading = signal(true);
  completing = signal('');
  stashing = signal('');
  private eventSource: EventSource | null = null;

  isPaymentArea() { return this.areaName() === 'Payment Area'; }
  isReleasingArea() { return (this.areaName() || '').toLowerCase().includes('releasing'); }

  ngOnInit() {
    const name = decodeURIComponent(this.route.snapshot.paramMap.get('name')!);
    this.areaName.set(name);
    this.loadQueue();
    this.subscribeSSE();
  }

  ngOnDestroy() {
    this.eventSource?.close();
  }

  loadQueue() {
    this.receptionService.getAreaQueue(this.areaName()).subscribe({
      next: (res: any) => {
        const raw = res.entries || [];
        this.entries.set(raw.map((e: any) => ({
          patient: e.patient,
          tests: e.tests || [],
          clinicalAmount: 0,
          xrayAmount: 0
        })));
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  completePatient(entry: PatientEntry) {
    if (this.isPaymentArea()) {
      const total = (entry.clinicalAmount || 0) + (entry.xrayAmount || 0);
      if (total <= 0) {
        alert('Please enter at least one payment amount');
        return;
      }
    }

    this.completing.set(entry.patient.id);
    const testIds = entry.tests.map((t: any) => t.id);

    const data: any = {
      testIds,
      patientId: entry.patient.id,
      area: this.areaName(),
    };
    if (this.isPaymentArea()) {
      data.clinicalAmount = entry.clinicalAmount || 0;
      data.xrayAmount = entry.xrayAmount || 0;
    }

    this.receptionService.completeTests(data).subscribe({
      next: () => {
        this.entries.update(list => list.filter(e => e.patient.id !== entry.patient.id));
        this.completing.set('');
      },
      error: () => this.completing.set('')
    });
  }

  deletePatient(entry: PatientEntry) {
    const name = `${entry.patient.first_name} ${entry.patient.last_name}`;
    if (!confirm(`Remove all ${entry.tests.length} test(s) for ${name} from ${this.areaName()}?`)) return;

    this.completing.set(entry.patient.id);
    const testIds = entry.tests.map((t: any) => t.id);

    this.receptionService.deleteFromQueue({ testIds, area: this.areaName() }).subscribe({
      next: () => {
        this.entries.update(list => list.filter(e => e.patient.id !== entry.patient.id));
        this.completing.set('');
      },
      error: () => this.completing.set('')
    });
  }

  stashPatient(entry: PatientEntry) {
    const name = `${entry.patient.first_name} ${entry.patient.last_name}`;
    const confirmed = confirm(
      `Stash results for ${name}?\n\n• The patient will be moved to the Stashed Results section on Reception.\n• This queue count will decrease immediately.`
    );
    if (!confirmed) return;

    this.stashing.set(entry.patient.id);
    const testIds = entry.tests.map((t: any) => t.id);

    this.receptionService.stashResults({ patientId: entry.patient.id, testIds }).subscribe({
      next: () => {
        this.entries.update(list => list.filter(e => e.patient.id !== entry.patient.id));
        this.stashing.set('');
      },
      error: () => {
        this.stashing.set('');
        alert('Failed to stash patient results.');
      }
    });
  }

  private subscribeSSE() {
    this.eventSource = this.receptionService.subscribeEvents();
    if (this.eventSource) {
      this.eventSource.onmessage = () => this.loadQueue();
    }
  }

  isDoctorArea(): boolean {
    const a = (this.areaName() || '').toLowerCase();
    return a.includes('doctor') || a.includes('consult');
  }

  getDoctorTestId(entry: PatientEntry): string {
    const docTest = entry.tests?.find((t: any) => {
      const type = (t.test_type || '').toLowerCase();
      return type.includes('doctor') || type.includes('consult');
    });
    return docTest?.id || entry.tests?.[0]?.id || 'new';
  }
}
