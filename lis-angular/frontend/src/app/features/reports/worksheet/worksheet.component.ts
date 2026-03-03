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
      <h1>📊 Worksheet Export</h1>
    </div>

    <div class="card form-section">
      <h3>Test Worksheet</h3>
      <div class="form-row">
        <label>Test Type</label>
        <select [(ngModel)]="testType" class="form-control">
          <option value="">Select Test Type</option>
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
        <button class="btn btn-primary" (click)="preview()" [disabled]="!testType">Preview</button>
        <button class="btn btn-secondary" (click)="download()" [disabled]="!testType">Download CSV</button>
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
    .form-section { max-width: 600px; }
    .form-row { margin-bottom: 1rem; }
    .form-row label { display: block; font-weight: 600; margin-bottom: 0.25rem; color: #374151; }
    .form-row.actions { display: flex; gap: 0.75rem; margin-top: 1.5rem; }
    .table-wrapper { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; white-space: nowrap; }
    th { background: #f9fafb; font-weight: 600; }
    .loading { text-align: center; padding: 2rem; color: #6b7280; }
  `]
})
export class WorksheetComponent implements OnInit {
  private reportService = inject(ReportService);

  testTypes = signal<string[]>([]);
  previewData = signal<any[]>([]);
  previewColumns = signal<string[]>([]);
  previewLoading = signal(false);
  ptPreviewData = signal<any[]>([]);
  ptPreviewColumns = signal<string[]>([]);

  testType = '';
  dateFrom = '';
  dateTo = '';
  ptDateFrom = '';
  ptDateTo = '';

  ngOnInit() {
    this.reportService.getWorksheetTypes().subscribe({
      next: (res) => this.testTypes.set(res.types || []),
    });
  }

  preview() {
    this.previewLoading.set(true);
    this.reportService.worksheetPreview({
      testType: this.testType,
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    }).subscribe({
      next: (res: any) => {
        const rows = res.rows || [];
        this.previewData.set(rows);
        if (rows.length > 0) {
          this.previewColumns.set(Object.keys(rows[0]));
        }
        this.previewLoading.set(false);
      },
      error: () => this.previewLoading.set(false),
    });
  }

  download() {
    this.reportService.worksheetDownload({
      testType: this.testType,
      dateFrom: this.dateFrom || undefined,
      dateTo: this.dateTo || undefined,
    }).subscribe({
      next: (blob) => this.saveBlob(blob, `worksheet-${this.testType}.csv`),
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
