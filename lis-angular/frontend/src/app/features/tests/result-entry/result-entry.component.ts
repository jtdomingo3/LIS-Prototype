import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TestService } from '../../../core/services/test.service';
import { Test } from '../../../core/models';
import { getFieldConfig, ResultSection } from './result-field-config';

@Component({
  selector: 'app-result-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="loading">Loading...</div>
    } @else if (test()) {
      <div class="page-header">
        <h1>Enter Results — {{ test()!.test_type | titlecase }}</h1>
        <a [routerLink]="['/tests', test()!.id]" class="btn btn-outline">← Back to Test</a>
      </div>

      <div class="card">
        @if (error()) { <div class="alert alert-error">{{ error() }}</div> }
        @if (success()) { <div class="alert alert-success">Results saved successfully!</div> }

        <div class="meta-row">
          <div class="meta"><strong>Test ID:</strong> {{ test()!.test_id }}</div>
          <div class="meta"><strong>Patient:</strong> {{ test()!.patient_name || '—' }}</div>
          <div class="meta"><strong>Status:</strong> <span class="badge" [class]="'badge-' + test()!.status">{{ test()!.status }}</span></div>
        </div>

        <form (ngSubmit)="onSubmit()">
          <!-- Common date/time fields -->
          <div class="time-row">
            <div class="form-group">
              <label class="form-label">Entry Date</label>
              <input type="date" class="form-control" [(ngModel)]="results['entryDate']" name="entryDate" />
            </div>
            <div class="form-group">
              <label class="form-label">Time Requested</label>
              <input type="time" class="form-control" [(ngModel)]="results['timeRequested']" name="timeRequested" />
            </div>
            <div class="form-group">
              <label class="form-label">Time Released</label>
              <input type="time" class="form-control" [(ngModel)]="results['timeReleased']" name="timeReleased" />
            </div>
          </div>

          <!-- Dynamic sections based on test type -->
          @for (section of sections(); track section.title || $index) {
            @if (section.title) {
              <h3 class="section-title">{{ section.title }}</h3>
            }
            <div class="fields-grid">
              @for (field of section.fields; track field.name) {
                <div class="form-group" [class.full-width]="field.type === 'textarea'">
                  <label class="form-label" [title]="field.reference || ''">
                    {{ field.label }}
                    @if (field.reference) {
                      <span class="ref-hint">({{ field.reference }})</span>
                    }
                  </label>

                  @switch (field.type) {
                    @case ('select') {
                      <select class="form-control" [(ngModel)]="results[field.name]" [name]="field.name">
                        <option value=""></option>
                        @for (opt of field.options; track opt) {
                          <option [value]="opt">{{ opt }}</option>
                        }
                      </select>
                    }
                    @case ('textarea') {
                      <textarea class="form-control" [(ngModel)]="results[field.name]" [name]="field.name"
                        rows="4" [placeholder]="field.placeholder || ''"></textarea>
                    }
                    @default {
                      <input type="text" class="form-control" [(ngModel)]="results[field.name]" [name]="field.name"
                        [placeholder]="field.placeholder || ''" [title]="field.reference || ''" />
                    }
                  }
                </div>
              }
            </div>
          }

          <!-- Signatory section -->
          <h3 class="section-title">Signatories</h3>
          <div class="fields-grid">
            <div class="form-group">
              <label class="form-label">Performed By (Name)</label>
              <input type="text" class="form-control" [(ngModel)]="results['performedByName']" name="performedByName" />
            </div>
            <div class="form-group">
              <label class="form-label">License No.</label>
              <input type="text" class="form-control" [(ngModel)]="results['performedByLicense']" name="performedByLicense" />
            </div>
            <div class="form-group">
              <label class="form-label">Validated By (Name)</label>
              <input type="text" class="form-control" [(ngModel)]="results['validatedByName']" name="validatedByName" />
            </div>
            <div class="form-group">
              <label class="form-label">License No.</label>
              <input type="text" class="form-control" [(ngModel)]="results['validatedByLicense']" name="validatedByLicense" />
            </div>
            <div class="form-group">
              <label class="form-label">Pathologist (Name)</label>
              <input type="text" class="form-control" [(ngModel)]="results['requestedByName']" name="requestedByName" />
            </div>
            <div class="form-group">
              <label class="form-label">License No.</label>
              <input type="text" class="form-control" [(ngModel)]="results['requestedByLicense']" name="requestedByLicense" />
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save Results' }}
            </button>
            <a [routerLink]="['/tests', test()!.id]" class="btn btn-outline">Cancel</a>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    .meta-row { display: flex; gap: 1.5rem; flex-wrap: wrap; padding: 0.75rem 0 1rem; border-bottom: 1px solid #e5e7eb; margin-bottom: 1.5rem; }
    .meta { font-size: 0.875rem; }
    .time-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
    .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1.5rem; margin-bottom: 1rem; }
    .full-width { grid-column: 1 / -1; }
    .section-title { font-size: 1rem; font-weight: 600; margin: 1.25rem 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid #e5e7eb; }
    .ref-hint { font-size: 0.7rem; color: #9ca3af; font-weight: 400; }
    .form-actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
    .alert-success { background: #d1fae5; color: #065f46; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
    @media (max-width: 768px) { .fields-grid { grid-template-columns: 1fr; } .time-row { grid-template-columns: 1fr; } }
  `]
})
export class ResultEntryComponent implements OnInit {
  private testService = inject(TestService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  test = signal<Test | null>(null);
  sections = signal<ResultSection[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  success = signal(false);

  results: Record<string, string> = {};

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.testService.getById(id).subscribe({
      next: (res) => {
        const t = res.test;
        this.test.set(t);

        // Load field config for this test type
        const config = getFieldConfig(t.test_type || 'miscellaneous');
        this.sections.set(config);

        // Pre-populate with existing results
        if (t.results) {
          const existing = typeof t.results === 'string' ? JSON.parse(t.results) : t.results;
          Object.entries(existing).forEach(([k, v]) => {
            this.results[k] = v as string ?? '';
          });
        }

        // Set defaults
        if (!this.results['entryDate']) {
          this.results['entryDate'] = new Date().toISOString().slice(0, 10);
        }

        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onSubmit() {
    this.saving.set(true);
    this.error.set('');
    this.success.set(false);

    // Filter out empty values
    const data: Record<string, string> = {};
    Object.entries(this.results).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) {
        data[k] = v;
      }
    });

    this.testService.updateResults(this.test()!.id, data).subscribe({
      next: () => {
        this.success.set(true);
        this.saving.set(false);
        this.test.update(t => ({ ...t!, status: 'completed' }));
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to save results');
        this.saving.set(false);
      }
    });
  }
}
