import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TemplateService } from '../../../core/services/template.service';
import { Template } from '../../../core/models';

interface TemplateField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea';
  options?: string;   // comma-separated list for select type
  required?: boolean;
}

const TEST_TYPE_OPTIONS = [
  'Hematology',
  'Urinalysis',
  'Fecalysis',
  'Blood Chemistry',
  'Blood Chemistry - Lipid Profile',
  'Blood Chemistry - BUN/Creatinine',
  'Blood Chemistry - SGPT/SGOT',
  'Blood Chemistry - HbA1c',
  'Blood Chemistry - Blood Sugar',
  'Blood Chemistry - Electrolytes',
  'Blood Chemistry - Albumin',
  'Blood Typing',
  'Serology',
  'Drug Test',
  'Pregnancy Test',
  'Dengue Duo',
  'ESR',
  'CT/BT',
  'PT/aPTT',
  'Fecal Occult Blood',
  'X-Ray',
  'ECG',
  'Thyroid Panel',
  'Ultrasound - Abdominal/KUB',
  'Ultrasound - Transvaginal',
  'Ultrasound - Pelvic',
  '2D Echocardiography',
  'Miscellaneous',
];

@Component({
  selector: 'app-template-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>{{ isEdit ? '✏️ Edit Template' : '+ New Template' }}</h1>
      <a routerLink="/templates" class="btn btn-outline">← Back to Templates</a>
    </div>

    @if (loading()) {
      <div class="loading-state">Loading…</div>
    } @else {
      <div class="card">
        @if (error()) {
          <div class="alert alert-error">{{ error() }}</div>
        }
        @if (success()) {
          <div class="alert alert-success">Template saved successfully!</div>
        }

        <form (ngSubmit)="onSubmit()">

          <!-- ── Basic Info ── -->
          <div class="section-header">Basic Information</div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Template Name <span class="required">*</span></label>
              <input type="text" class="form-control" [(ngModel)]="name" name="name"
                placeholder="e.g. Complete Blood Count" required />
            </div>
            <div class="form-group">
              <label class="form-label">Associated Test Type</label>
              <select class="form-control" [(ngModel)]="testType" name="testType">
                <option value="">-- None --</option>
                @for (opt of testTypeOptions; track opt) {
                  <option [value]="opt">{{ opt }}</option>
                }
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Footer Notes</label>
            <textarea class="form-control" [(ngModel)]="footerNotes" name="footerNotes" rows="3"
              placeholder="Optional notes printed at the bottom of this report (e.g. reference ranges, disclaimers)">
            </textarea>
          </div>

          <!-- ── Fields Builder ── -->
          <div class="section-header">
            Fields
            <button type="button" class="btn btn-small btn-primary add-field-btn" (click)="addField()">
              + Add Field
            </button>
          </div>

          @if (fields.length === 0) {
            <div class="empty-fields">
              No fields yet. Click "Add Field" to start building your template.
            </div>
          }

          @for (field of fields; track $index) {
            <div class="field-card" [class.field-dragging]="false">
              <div class="field-header">
                <span class="field-num">Field {{ $index + 1 }}</span>
                <div class="field-actions">
                  <button type="button" class="icon-btn" title="Move up"
                    [disabled]="$index === 0" (click)="moveField($index, -1)">↑</button>
                  <button type="button" class="icon-btn" title="Move down"
                    [disabled]="$index === fields.length - 1" (click)="moveField($index, 1)">↓</button>
                  <button type="button" class="icon-btn remove-btn" title="Remove field"
                    (click)="removeField($index)">✕</button>
                </div>
              </div>

              <div class="field-grid">
                <div class="form-group">
                  <label class="form-label">Key (data name)</label>
                  <input type="text" class="form-control" [(ngModel)]="field.key"
                    [name]="'key_' + $index"
                    placeholder="e.g. hemoglobin" />
                </div>
                <div class="form-group">
                  <label class="form-label">Label (displayed on form)</label>
                  <input type="text" class="form-control" [(ngModel)]="field.label"
                    [name]="'label_' + $index"
                    placeholder="e.g. Hemoglobin (g/dL)" />
                </div>
                <div class="form-group">
                  <label class="form-label">Field Type</label>
                  <select class="form-control" [(ngModel)]="field.type" [name]="'type_' + $index">
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="textarea">Textarea</option>
                    <option value="select">Dropdown (Select)</option>
                  </select>
                </div>
                <div class="form-group" [class.hidden]="field.type !== 'select'">
                  <label class="form-label">Options <span class="hint">(comma-separated)</span></label>
                  <input type="text" class="form-control" [(ngModel)]="field.options"
                    [name]="'options_' + $index"
                    placeholder="e.g. Negative, Positive, Reactive" />
                </div>
              </div>
            </div>
          }

          <div class="form-actions">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">
              {{ saving() ? 'Saving…' : (isEdit ? 'Update Template' : 'Create Template') }}
            </button>
            <a routerLink="/templates" class="btn btn-outline">Cancel</a>
          </div>

        </form>
      </div>
    }
  `,
  styles: [`
    .loading-state { text-align: center; padding: 3rem; color: #6b7280; }

    .section-header {
      font-size: 1rem;
      font-weight: 700;
      color: #374151;
      margin: 1.5rem 0 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .add-field-btn { margin-left: auto; }

    .empty-fields {
      text-align: center;
      padding: 2rem;
      background: #f9fafb;
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      color: #6b7280;
      font-size: 0.9rem;
      margin-bottom: 1rem;
    }

    .field-card {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-left: 4px solid var(--secondary-green, #10b981);
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 0.75rem;
      transition: box-shadow 0.2s;
    }
    .field-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

    .field-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }
    .field-num { font-weight: 600; color: #6b7280; font-size: 0.85rem; }

    .field-actions { display: flex; gap: 0.25rem; }
    .icon-btn {
      background: none;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      padding: 2px 8px;
      cursor: pointer;
      font-size: 0.8rem;
      color: #374151;
      transition: all 0.15s;
    }
    .icon-btn:hover:not(:disabled) { background: #e5e7eb; }
    .icon-btn:disabled { opacity: 0.35; cursor: not-allowed; }
    .remove-btn:hover:not(:disabled) { background: #fee2e2; color: #dc2626; border-color: #dc2626; }

    .field-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem 1.5rem;
    }
    .form-group { margin-bottom: 0; }

    .hidden { visibility: hidden; pointer-events: none; }

    .required { color: #ef4444; }
    .hint { font-size: 0.75rem; color: #9ca3af; font-weight: 400; }

    .form-actions { margin-top: 2rem; display: flex; gap: 0.75rem; }

    @media (max-width: 640px) {
      .field-grid { grid-template-columns: 1fr; }
      .form-row { grid-template-columns: 1fr; }
    }
  `]
})
export class TemplateFormComponent implements OnInit {
  private templateService = inject(TemplateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEdit = false;
  templateId: string | null = null;

  name = '';
  testType = '';
  footerNotes = '';
  fields: TemplateField[] = [];

  testTypeOptions = TEST_TYPE_OPTIONS;

  loading = signal(false);
  saving = signal(false);
  error = signal('');
  success = signal(false);

  ngOnInit() {
    this.templateId = this.route.snapshot.paramMap.get('id');
    this.isEdit = !!this.templateId;

    if (this.isEdit && this.templateId) {
      this.loading.set(true);
      this.templateService.getById(this.templateId).subscribe({
        next: (res) => {
          const t: Template = res.template;
          this.name = t.name || '';
          this.testType = t.test_type || '';
          this.footerNotes = t.footer_notes || '';
          // Map saved fields to local TemplateField structure
          this.fields = (t.fields || []).map((f: any) => ({
            key: f.key || '',
            label: f.label || '',
            type: f.type || 'text',
            options: Array.isArray(f.options) ? f.options.join(', ') : (f.options || ''),
            required: !!f.required,
          }));
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load template.');
          this.loading.set(false);
        }
      });
    }
  }

  addField() {
    this.fields.push({ key: '', label: '', type: 'text', options: '' });
  }

  removeField(index: number) {
    this.fields.splice(index, 1);
  }

  moveField(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this.fields.length) return;
    const tmp = this.fields[index];
    this.fields[index] = this.fields[newIndex];
    this.fields[newIndex] = tmp;
  }

  onSubmit() {
    this.error.set('');
    this.success.set(false);

    if (!this.name.trim()) {
      this.error.set('Template name is required.');
      return;
    }

    // Serialize fields — convert comma options string to array
    const serializedFields = this.fields
      .filter(f => f.key.trim() && f.label.trim())
      .map(f => ({
        key: f.key.trim(),
        label: f.label.trim(),
        type: f.type,
        ...(f.type === 'select' && f.options
          ? { options: f.options.split(',').map(o => o.trim()).filter(Boolean) }
          : {}),
        required: !!f.required,
      }));

    const payload = {
      name: this.name.trim(),
      test_type: this.testType || null,
      fields: serializedFields,
      footer_notes: this.footerNotes.trim() || null,
    };

    this.saving.set(true);

    const request$ = this.isEdit && this.templateId
      ? this.templateService.update(this.templateId, payload as any)
      : this.templateService.create(payload as any);

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set(true);
        setTimeout(() => this.router.navigate(['/templates']), 1200);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(err.error?.error || 'Failed to save template.');
      }
    });
  }
}
