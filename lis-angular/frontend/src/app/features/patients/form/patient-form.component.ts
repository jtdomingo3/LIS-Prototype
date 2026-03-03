import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PatientService } from '../../../core/services/patient.service';

@Component({
  selector: 'app-patient-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit Patient' : 'New Patient' }}</h1>
      <a routerLink="/patients" class="btn">← Back</a>
    </div>

    <div class="card">
      @if (error()) { <div class="alert alert-error">{{ error() }}</div> }

      <form (ngSubmit)="onSubmit()">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">First Name *</label>
            <input type="text" class="form-control" [(ngModel)]="form.first_name" name="first_name" required />
          </div>
          <div class="form-group">
            <label class="form-label">Middle Name</label>
            <input type="text" class="form-control" [(ngModel)]="form.middle_name" name="middle_name" />
          </div>
          <div class="form-group">
            <label class="form-label">Last Name *</label>
            <input type="text" class="form-control" [(ngModel)]="form.last_name" name="last_name" required />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Date of Birth</label>
            <input type="date" class="form-control" [(ngModel)]="form.date_of_birth" name="date_of_birth" (change)="onDobChange()" />
          </div>
          <div class="form-group">
            <label class="form-label">Age</label>
            <input type="text" class="form-control" [(ngModel)]="form.age_manual" name="age_manual" placeholder="Auto from DOB" />
          </div>
          <div class="form-group">
            <label class="form-label">Gender *</label>
            <select class="form-control" [(ngModel)]="form.gender" name="gender">
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="tel" class="form-control" [(ngModel)]="form.phone" name="phone" />
          </div>
          <div class="form-group">
            <label class="form-label">Company / Source</label>
            <input type="text" class="form-control" [(ngModel)]="form.company" name="company" />
          </div>
          <div class="form-group">
            <label class="form-label">Physician</label>
            <input type="text" class="form-control" [(ngModel)]="form.physician" name="physician" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Address</label>
          <textarea class="form-control" [(ngModel)]="form.address" name="address" rows="2"></textarea>
        </div>

        <!-- PhilHealth Section -->
        <div class="form-group philhealth-section">
          <label class="form-label">PhilHealth</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="philhealth" [value]="1" [(ngModel)]="form.philhealth_consent" /> Yes
            </label>
            <label class="radio-label">
              <input type="radio" name="philhealth" [value]="0" [(ngModel)]="form.philhealth_consent" /> No
            </label>
          </div>
          @if (form.philhealth_consent === 1) {
            <div class="form-group" style="margin-top: 0.5rem;">
              <label class="form-label">PhilHealth ID</label>
              <input type="text" class="form-control" [(ngModel)]="form.philhealth_id" name="philhealth_id" placeholder="Enter PhilHealth ID" />
            </div>
          }
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving...' : (isEdit() ? 'Update Patient' : 'Create Patient') }}
          </button>
          <a routerLink="/patients" class="btn">Cancel</a>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .form-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem; }
    .form-group { margin-bottom: 0.75rem; }
    .form-label { display: block; font-weight: 600; margin-bottom: 0.25rem; font-size: 0.85rem; color: #374151; }
    .form-actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; }
    .radio-group { display: flex; gap: 1.5rem; margin-top: 0.25rem; }
    .radio-label { display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.9rem; }
    .philhealth-section { margin-top: 0.5rem; padding: 1rem; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
    @media (max-width: 768px) { .form-row { grid-template-columns: 1fr; } }
  `]
})
export class PatientFormComponent implements OnInit {
  private patientService = inject(PatientService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEdit = signal(false);
  saving = signal(false);
  error = signal('');
  patientId = '';

  form: any = {
    first_name: '', middle_name: '', last_name: '',
    date_of_birth: '', age_manual: '', gender: '',
    phone: '', company: '', physician: '',
    address: '',
    philhealth_consent: 0, philhealth_id: ''
  };

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEdit.set(true);
      this.patientId = id;
      this.patientService.getById(id).subscribe({
        next: (res) => {
          const p = res.patient;
          Object.keys(this.form).forEach(key => {
            if (p[key] !== undefined && p[key] !== null) this.form[key] = p[key];
          });
          // Map legacy fields
          if (!this.form.date_of_birth && p['birthday']) this.form.date_of_birth = p['birthday'];
          if (!this.form.gender && p['sex']) this.form.gender = p['sex'];
          if (!this.form.age_manual && p['age']) this.form.age_manual = p['age'];
          this.form.philhealth_consent = p.philhealth_consent ? 1 : 0;
        },
        error: () => this.error.set('Failed to load patient')
      });
    }
  }

  onDobChange() {
    if (this.form.date_of_birth) {
      const today = new Date();
      const birth = new Date(this.form.date_of_birth);
      if (!isNaN(birth.getTime())) {
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        this.form.age_manual = String(age);
      }
    }
  }

  onSubmit() {
    if (!this.form.first_name || !this.form.last_name) {
      this.error.set('First name and last name are required');
      return;
    }
    this.saving.set(true);
    this.error.set('');

    const obs = this.isEdit()
      ? this.patientService.update(this.patientId, this.form)
      : this.patientService.create(this.form);

    obs.subscribe({
      next: (res) => this.router.navigate(['/patients', res.patient.id]),
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to save patient');
        this.saving.set(false);
      }
    });
  }
}
