import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TemplateService } from '../../../core/services/template.service';

@Component({
  selector: 'app-template-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit Template' : 'New Template' }}</h1>
      <a routerLink="/templates" class="btn btn-outline">← Back</a>
    </div>

    <div class="card">
      @if (error()) { <div class="alert alert-error">{{ error() }}</div> }

      <form (ngSubmit)="onSubmit()">
        <div class="form-group">
          <label class="form-label">Template Name *</label>
          <input type="text" class="form-control" [(ngModel)]="form.name" name="name" required />
        </div>
        <div class="form-group">
          <label class="form-label">Test Type *</label>
          <select class="form-control" [(ngModel)]="form.test_type" name="test_type" required>
            <option value="">Select type</option>
            <option value="blood chemistry">Blood Chemistry</option>
            <option value="hematology">Hematology</option>
            <option value="urinalysis">Urinalysis</option>
            <option value="xray">X-Ray</option>
            <option value="ecg">ECG</option>
            <option value="drug test">Drug Test</option>
            <option value="fecalysis">Fecalysis</option>
            <option value="serology">Serology</option>
            <option value="miscellaneous">Miscellaneous</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Header HTML</label>
          <textarea class="form-control" [(ngModel)]="form.header_html" name="header_html" rows="4"
            placeholder="Header content shown at top of report"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Footer HTML</label>
          <textarea class="form-control" [(ngModel)]="form.footer_html" name="footer_html" rows="4"
            placeholder="Footer content shown at bottom of report"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Styles (CSS)</label>
          <textarea class="form-control" [(ngModel)]="form.styles" name="styles" rows="4"
            placeholder="Custom CSS for report printing"></textarea>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving...' : (isEdit() ? 'Update Template' : 'Create Template') }}
          </button>
          <a routerLink="/templates" class="btn btn-outline">Cancel</a>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .form-actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; }
  `]
})
export class TemplateFormComponent implements OnInit {
  private templateService = inject(TemplateService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEdit = signal(false);
  saving = signal(false);
  error = signal('');
  templateId = '';

  form: any = {
    name: '', test_type: '', header_html: '', footer_html: '', styles: ''
  };

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEdit.set(true);
      this.templateId = id;
      this.templateService.getById(id).subscribe({
        next: (res) => {
          const t = res.template;
          Object.keys(this.form).forEach(k => {
            if (t[k] !== undefined) this.form[k] = t[k] ?? '';
          });
        },
        error: () => this.error.set('Failed to load template')
      });
    }
  }

  onSubmit() {
    if (!this.form.name || !this.form.test_type) {
      this.error.set('Name and test type are required');
      return;
    }
    this.saving.set(true);
    this.error.set('');

    const obs = this.isEdit()
      ? this.templateService.update(this.templateId, this.form)
      : this.templateService.create(this.form);

    obs.subscribe({
      next: () => this.router.navigate(['/templates']),
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to save');
        this.saving.set(false);
      }
    });
  }
}
