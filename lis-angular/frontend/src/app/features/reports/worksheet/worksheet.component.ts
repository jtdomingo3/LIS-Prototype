import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportService } from '../../../core/services/report.service';

@Component({
  selector: 'app-worksheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <h1>Worksheet Export</h1>
    </div>

    <div class="card form-section">
      <h3>Test Worksheet</h3>
      <div *ngIf="worksheetError()" class="alert alert-error">{{ worksheetError() }}</div>
      <div class="form-row">
        <label>Test Type</label>
        <select [(ngModel)]="testType" class="form-control" [disabled]="testTypes().length === 0">
          <option value="">(All test types)</option>
          @for (t of testTypes(); track t) {
            <option [value]="t">{{ t }}</option>
          }
        </select>
      </div>
      <div class="form-row">
        <label>Date From</label>
        <input type="date" [(ngModel)]="dateFrom" class="form-control" />
      </div>
      <div class="form-row">
        <label>Date To</label>
        <input type="date" [(ngModel)]="dateTo" class="form-control" />
      </div>
      <div class="form-row actions">
        <button class="btn btn-primary" (click)="preview()">Preview</button>
        <button class="btn btn-secondary" (click)="download()">Download CSV</button>
      </div>
    </div>

    @if (previewLoading()) {
      <div class="loading">Loading preview...</div>
    }

    @if (previewData().length > 0) {
      <div class="card">
        <h3>Preview ({{ previewData().length }} rows)</h3>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                @for (col of previewColumns(); track col) {
                  <th>{{ col }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of previewData(); track $index) {
                <tr>
                  @for (col of previewColumns(); track col) {
                    <td>{{ row[col] ?? '' }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <div class="card form-section" style="margin-top: 2rem;">
      <h3>Patient Export</h3>
      <div class="form-row">
        <label>Date From</label>
        <input type="date" [(ngModel)]="ptDateFrom" class="form-control" />
      </div>
      <div class="form-row">
        <label>Date To</label>
        <input type="date" [(ngModel)]="ptDateTo" class="form-control" />
      </div>
      <div class="form-row actions">
        <button class="btn btn-primary" (click)="previewPatients()">Preview Patients</button>
        <button class="btn btn-secondary" (click)="downloadPatients()">Download CSV</button>
      </div>
    </div>

    @if (ptPreviewData().length > 0) {
      <div class="card">
        <h3>Patient Preview ({{ ptPreviewData().length }} rows)</h3>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                @for (col of ptPreviewColumns(); track col) {
                  <th>{{ col }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of ptPreviewData(); track $index) {
                <tr>
                  @for (col of ptPreviewColumns(); track col) {
                    <td>{{ row[col] ?? '' }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
  styles: [`
    .form-section { max-width: 600px; margin: 0 auto; }
.card h3 { color: var(--secondary-green-dark); }
:host table th { background: #f9fafb !important; color: #000 !important; }
    .form-row { margin-bottom: 1rem; }
    .form-row label { display: block; font-weight: 600; margin-bottom: 0.25rem; color: #374151; }
    .form-row.actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    .table-wrapper { overflow-x: auto; max-width: 90%; margin: 0 auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
    th { background: var(--secondary-green-dark); color: #fff; font-weight: 600; }
    .loading { text-align: center; padding: 2rem; color: #6b7280; }
  `]
})
export class WorksheetComponent implements OnInit {
  private reportService = inject(ReportService);

  testTypes = signal<string[]>([]);
  testType = '';
  previewData = signal<any[]>([]);
  previewColumns = signal<string[]>([]);
  previewLoading = signal(false);
  worksheetError = signal('');          // display message if types cannot be loaded
  dateFrom = '';
  dateTo = '';
  ptDateFrom = '';
  ptDateTo = '';
  ptPreviewData = signal<any[]>([]);
  ptPreviewColumns = signal<string[]>([]);

  ngOnInit() {
    this.reportService.getWorksheetTypes().subscribe({
      next: (res) => {
        const types = res.types || [];
        this.testTypes.set(types);
        if (types.length && !this.testType) {
          // auto-select first type so user can immediately preview
          this.testType = types[0];
        }
      },
      error: (err) => {
        console.error('Failed to load worksheet types', err);
        this.worksheetError.set('Unable to load test types. Is the backend running?');
      }
    });
  }

  preview() {
    this.previewLoading.set(true);
    const payload: any = {};
    if (this.testType) payload.testType = this.testType;
    if (this.dateFrom) payload.dateFrom = this.dateFrom;
    if (this.dateTo) payload.dateTo = this.dateTo;
    if (!payload.testType && !payload.dateFrom && !payload.dateTo) {
      // no filters at all, request all data (server will still cap at 200)
      payload.allData = true;
    }
    this.reportService.worksheetPreview(payload).subscribe({
      next: (res: any) => {
        const rows = res.rows || [];
        // merge flatResults into top-level and build column list
        const colSet = new Set<string>(['testId','testType','date','time','patientId','firstName','lastName']);
        rows.forEach((r: any) => {
          if (r.flatResults && typeof r.flatResults === 'object') {
            Object.entries(r.flatResults).forEach(([k,v]) => {
              colSet.add(k);
              // convert complex values to human-readable string
              if (v !== null && typeof v === 'object') {
                r[k] = JSON.stringify(v);
              } else {
                r[k] = v === null || v === undefined ? '' : String(v);
              }
            });
            delete r.flatResults; // remove helper property so it's not shown
          }
        });
        this.previewData.set(rows);
        this.previewColumns.set(Array.from(colSet));
        this.previewLoading.set(false);
      },
      error: () => this.previewLoading.set(false),
    });
  }

  download() {
    const payload: any = {};
    if (this.testType) payload.testType = this.testType;
    if (this.dateFrom) payload.dateFrom = this.dateFrom;
    if (this.dateTo) payload.dateTo = this.dateTo;
    if (!payload.testType && !payload.dateFrom && !payload.dateTo) {
      payload.allData = true;
    }
    this.reportService.worksheetDownload(payload).subscribe({
      next: (blob) => this.saveBlob(blob, `worksheet-${this.testType || 'all'}.csv`),
    });
  }

  previewPatients() {
    this.reportService.patientExportPreview({
      dateFrom: this.ptDateFrom || undefined,
      dateTo: this.ptDateTo || undefined,
    }).subscribe({
      next: (res: any) => {
        const rows = res.rows || [];
        this.ptPreviewData.set(rows);
        if (rows.length > 0) {
          this.ptPreviewColumns.set(Object.keys(rows[0]));
        }
      },
    });
  }

  downloadPatients() {
    this.reportService.patientExportDownload({
      dateFrom: this.ptDateFrom || undefined,
      dateTo: this.ptDateTo || undefined,
    }).subscribe({
      next: (blob) => this.saveBlob(blob, 'patient-export.csv'),
    });
  }

  private saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
