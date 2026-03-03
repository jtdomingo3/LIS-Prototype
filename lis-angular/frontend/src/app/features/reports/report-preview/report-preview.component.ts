import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TestService } from '../../../core/services/test.service';
import { Test, Patient } from '../../../core/models';

@Component({
  selector: 'app-report-preview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="loading">Loading report...</div>
    } @else if (test()) {
      <div class="page-header no-print">
        <h1>Report Preview — {{ test()!.test_id }}</h1>
        <div class="header-actions">
          <button class="btn btn-primary" (click)="print()">🖨 Print</button>
          <a [routerLink]="['/tests', test()!.id]" class="btn">← Back</a>
        </div>
      </div>

      <div class="report-container" id="reportContent">
        <div class="report-header">
          <h2 class="report-title">LABORATORY REPORT</h2>
          <div class="report-subtitle">{{ test()!.test_type | uppercase }}</div>
        </div>

        <div class="patient-info">
          <div class="info-row"><span class="label">Patient Name:</span> {{ patient()?.first_name }} {{ patient()?.middle_name || '' }} {{ patient()?.last_name }}</div>
          <div class="info-row"><span class="label">Patient Code:</span> {{ patient()?.patient_code }}</div>
          <div class="info-row"><span class="label">Age / Sex:</span> {{ patient()?.age || '—' }} / {{ patient()?.sex || '—' }}</div>
          <div class="info-row"><span class="label">Physician:</span> {{ patient()?.physician || test()!.physician || '—' }}</div>
          <div class="info-row"><span class="label">Test ID:</span> {{ test()!.test_id }}</div>
          <div class="info-row"><span class="label">Date:</span> {{ test()!.created_at | date:'mediumDate' }}</div>
        </div>

        @if (resultKeys().length) {
          <table class="result-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              @for (key of resultKeys(); track key) {
                @if (!isSignatoryField(key) && !isMetaField(key)) {
                  <tr>
                    <td>{{ formatLabel(key) }}</td>
                    <td>{{ getResultValue(key) }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
        }

        <div class="signatories">
          @if (results['performedByName']) {
            <div class="sig">
              <div class="sig-line"></div>
              <div class="sig-name">{{ results['performedByName'] }}</div>
              <div class="sig-title">Medical Technologist</div>
              @if (results['performedByLicense']) {
                <div class="sig-license">Lic. No.: {{ results['performedByLicense'] }}</div>
              }
            </div>
          }
          @if (results['validatedByName']) {
            <div class="sig">
              <div class="sig-line"></div>
              <div class="sig-name">{{ results['validatedByName'] }}</div>
              <div class="sig-title">Medical Technologist (Validator)</div>
              @if (results['validatedByLicense']) {
                <div class="sig-license">Lic. No.: {{ results['validatedByLicense'] }}</div>
              }
            </div>
          }
          @if (results['requestedByName']) {
            <div class="sig">
              <div class="sig-line"></div>
              <div class="sig-name">{{ results['requestedByName'] }}</div>
              <div class="sig-title">Pathologist</div>
              @if (results['requestedByLicense']) {
                <div class="sig-license">Lic. No.: {{ results['requestedByLicense'] }}</div>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .report-container {
      background: white; max-width: 800px; margin: 0 auto; padding: 2rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 4px;
    }
    .report-header { text-align: center; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid #111827; }
    .report-title { font-size: 1.3rem; font-weight: 700; margin: 0; }
    .report-subtitle { font-size: 0.9rem; color: #6b7280; margin-top: 0.25rem; }
    .patient-info { display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem 2rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e7eb; }
    .info-row { font-size: 0.85rem; }
    .info-row .label { font-weight: 600; }
    .result-table { width: 100%; border-collapse: collapse; margin-bottom: 2rem; }
    .result-table th, .result-table td { padding: 0.5rem 0.75rem; border: 1px solid #e5e7eb; font-size: 0.85rem; }
    .result-table th { background: #f9fafb; font-weight: 600; text-align: left; }
    .signatories { display: flex; justify-content: space-around; margin-top: 3rem; }
    .sig { text-align: center; min-width: 180px; }
    .sig-line { border-bottom: 1px solid #111827; margin-bottom: 0.25rem; height: 40px; }
    .sig-name { font-weight: 600; font-size: 0.85rem; }
    .sig-title { font-size: 0.75rem; color: #6b7280; }
    .sig-license { font-size: 0.7rem; color: #9ca3af; }
    .header-actions { display: flex; gap: 0.5rem; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }

    @media print {
      .no-print { display: none !important; }
      .report-container { box-shadow: none; margin: 0; padding: 0; }
    }
  `]
})
export class ReportPreviewComponent implements OnInit {
  private testService = inject(TestService);
  private route = inject(ActivatedRoute);

  test = signal<Test | null>(null);
  patient = signal<Patient | null>(null);
  resultKeys = signal<string[]>([]);
  loading = signal(true);
  results: Record<string, any> = {};

  private sigFields = new Set(['performedByName', 'performedByLicense', 'validatedByName', 'validatedByLicense', 'requestedByName', 'requestedByLicense']);
  private metaFields = new Set(['entryDate', 'timeRequested', 'timeReleased', 'mtName', 'mtLicense', 'pathName', 'pathLicense']);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.testService.getById(id).subscribe({
      next: (res) => {
        this.test.set(res.test);
        this.patient.set(res.patient || null);
        if (res.test.results) {
          const parsed = typeof res.test.results === 'string' ? JSON.parse(res.test.results) : res.test.results;
          this.results = parsed;
          this.resultKeys.set(Object.keys(parsed));
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  isSignatoryField(key: string): boolean { return this.sigFields.has(key); }
  isMetaField(key: string): boolean { return this.metaFields.has(key); }

  formatLabel(key: string): string {
    return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  }

  getResultValue(key: string): string {
    const val = this.results[key];
    return val !== null && val !== undefined ? String(val) : '—';
  }

  print() { window.print(); }
}
