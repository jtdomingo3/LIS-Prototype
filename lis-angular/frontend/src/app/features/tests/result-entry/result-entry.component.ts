import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TestService } from '../../../core/services/test.service';
import { TemplateService } from '../../../core/services/template.service';
import { Test } from '../../../core/models';
import { getFieldConfig, ResultSection, ResultField } from './result-field-config';

/**
 * Convert a database template's `fields` array into the ResultSection[] format.
 * This is the bridge between the DB template system and the entry form.
 *
 * DB field shape:  { key, label, type, options?, required? }
 * ResultField:     { name, label, type, options?, required?, placeholder?, reference? }
 */
function dbFieldsToSections(
  dbFields: any[],
  sectionTitle?: string
): ResultSection[] {
  if (!dbFields || dbFields.length === 0) return [];

  // Group by section if fields have a 'section' property, otherwise put all in one section
  const grouped = new Map<string, ResultField[]>();

  for (const f of dbFields) {
    const section = f.section || sectionTitle || '';
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section)!.push({
      name:        f.key || f.name || '',
      label:       f.label || f.key || '',
      type:        f.type || 'text',
      options:     Array.isArray(f.options) ? f.options : [],
      required:    !!f.required,
      placeholder: f.placeholder || '',
      reference:   f.reference || '',
    });
  }

  return Array.from(grouped.entries()).map(([title, fields]) => ({
    title: title || undefined,
    fields,
  }));
}

@Component({
  selector: 'app-result-entry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="loading">
        <div class="skeleton skeleton-block" style="height:60px;margin-bottom:1rem;"></div>
        <div class="skeleton skeleton-block"></div>
        <div class="skeleton skeleton-block"></div>
      </div>
    } @else if (test()) {
      <div class="page-header">
        <h1>Enter Results — {{ test()!.test_type | titlecase }}</h1>
        <a [routerLink]="['/tests', test()!.id]" class="btn btn-outline">← Back to Test</a>
      </div>

      <div class="card">
        @if (error()) { <div class="alert alert-error">{{ error() }}</div> }
        @if (success()) { <div class="alert alert-success">Results saved successfully!</div> }

        <!-- Template source indicator -->
        @if (templateSource()) {
          <div class="template-badge">
            <span class="badge badge-info">🧾 Using template: {{ templateSource() }}</span>
            <a routerLink="/templates" class="edit-template-link">Edit template ↗</a>
          </div>
        } @else {
          <div class="template-badge">
            <span class="badge badge-warning">📋 Using default field config</span>
            <a routerLink="/templates/new" class="edit-template-link">Create a custom template ↗</a>
          </div>
        }

        <div class="meta-row">
          <div class="meta"><strong>Test ID:</strong> {{ test()!.test_id }}</div>
          <div class="meta"><strong>Patient:</strong> {{ test()!.patient_name || '—' }}</div>
          <div class="meta"><strong>Status:</strong> <span class="badge" [class]="'badge-' + test()!.status.toLowerCase()">{{ test()!.status }}</span></div>
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

          <!-- Dynamic sections — from DB template OR hardcoded fallback -->
          @for (section of sections(); track section.title || $index) {
            @if (section.title) {
              <h3 class="section-title">{{ section.title }}</h3>
            }
            <div class="fields-grid">
              @for (field of section.fields; track field.name) {
                <div class="form-group" [class.full-width]="field.type === 'textarea'">
                  <label class="form-label" [title]="field.reference || ''">
                    {{ field.label }}
                    @if (field.required) { <span class="required">*</span> }
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
                    @case ('number') {
                      <input type="number" class="form-control" [(ngModel)]="results[field.name]" [name]="field.name"
                        [placeholder]="field.placeholder || ''" [title]="field.reference || ''" />
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
    .loading { padding: 2rem; }
    .template-badge {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0.75rem;
      background: #f9fafb;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    .edit-template-link {
      font-size: 0.8rem;
      color: var(--secondary-green, #10b981);
      text-decoration: underline;
    }
    .meta-row { display: flex; gap: 1.5rem; flex-wrap: wrap; padding: 0.75rem 0 1rem; border-bottom: 1px solid #e5e7eb; margin-bottom: 1.5rem; }
    .meta { font-size: 0.875rem; }
    .time-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
    .fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1.5rem; margin-bottom: 1rem; }
    .full-width { grid-column: 1 / -1; }
    .section-title { font-size: 1rem; font-weight: 600; margin: 1.25rem 0 0.5rem; padding-bottom: 0.25rem; border-bottom: 1px solid #e5e7eb; }
    .ref-hint { font-size: 0.7rem; color: #9ca3af; font-weight: 400; }
    .required { color: #ef4444; }
    .form-actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; }
    @media (max-width: 768px) { .fields-grid { grid-template-columns: 1fr; } .time-row { grid-template-columns: 1fr; } }
  `]
})
export class ResultEntryComponent implements OnInit {
  private testService     = inject(TestService);
  private templateService = inject(TemplateService);
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);

  test          = signal<Test | null>(null);
  sections      = signal<ResultSection[]>([]);
  templateSource = signal<string>('');   // name of the DB template used, empty = fallback
  loading       = signal(true);
  saving        = signal(false);
  error         = signal('');
  success       = signal(false);

  results: Record<string, string> = {};

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.testService.getById(id).subscribe({
      next: (res) => {
        const t = res.test;
        this.test.set(t);

        // Pre-populate with existing results immediately
        if (t.results) {
          const existing = typeof t.results === 'string' ? JSON.parse(t.results) : t.results;
          Object.entries(existing).forEach(([k, v]) => {
            this.results[k] = (v as string) ?? '';
          });
        }

        // Set date default
        if (!this.results['entryDate']) {
          this.results['entryDate'] = new Date().toISOString().slice(0, 10);
        }

        // Try to load a custom DB template for this test type first
        this.loadSections(t.test_type || '');
      },
      error: () => this.loading.set(false)
    });
  }

  /**
   * Q1: Load fields from DB template if one exists for this test type.
   * Falls back to the hardcoded result-field-config.ts if no custom template found.
   */
  private loadSections(testType: string) {
    this.templateService.getByTestType(testType).subscribe({
      next: (res) => {
        const templates = res.templates || [];
        // Use the first active matching template
        const tmpl = templates[0];

        if (tmpl && tmpl.fields && tmpl.fields.length > 0) {
          // DB template takes priority
          this.sections.set(dbFieldsToSections(tmpl.fields));
          this.templateSource.set(tmpl.name);
        } else {
          // Fall back to hardcoded config
          this.sections.set(getFieldConfig(testType));
          this.templateSource.set('');
        }

        this.loading.set(false);
      },
      error: () => {
        // API error — fall back gracefully
        this.sections.set(getFieldConfig(testType));
        this.templateSource.set('');
        this.loading.set(false);
      }
    });
  }

  onSubmit() {
    this.saving.set(true);
    this.error.set('');
    this.success.set(false);

    // Filter out empty values to keep the stored JSON clean
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
        this.test.update(t => ({ ...t!, status: 'Completed' }));
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to save results');
        this.saving.set(false);
      }
    });
  }
}
