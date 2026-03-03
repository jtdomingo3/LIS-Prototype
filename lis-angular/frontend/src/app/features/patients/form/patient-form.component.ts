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
            <label class="form-label">Age</label>
            <input type="number" class="form-control" [(ngModel)]="form.age" name="age" min="0" max="150" />
          </div>
          <div class="form-group">
            <label class="form-label">Sex</label>
            <select class="form-control" [(ngModel)]="form.sex" name="sex">
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Birthday</label>
            <input type="date" class="form-control" [(ngModel)]="form.birthday" name="birthday" />
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="tel" class="form-control" [(ngModel)]="form.phone" name="phone" />
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input type="email" class="form-control" [(ngModel)]="form.email" name="email" />
          </div>
          <div class="form-group">
            <label class="form-label">Company / Source</label>
            <input type="text" class="form-control" [(ngModel)]="form.company" name="company" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Address</label>
          <input type="text" class="form-control" [(ngModel)]="form.address" name="address" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Physician</label>
            <input type="text" class="form-control" [(ngModel)]="form.physician" name="physician" />
          </div>
          <div class="form-group">
            <label class="form-label">Room / Bed</label>
            <input type="text" class="form-control" [(ngModel)]="form.room" name="room" />
          </div>
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
    .form-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
    .form-actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; }
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
    age: null, sex: '', birthday: '',
    phone: '', email: '', company: '',
    address: '', physician: '', room: ''
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
            if (p[key] !== undefined) this.form[key] = p[key] ?? '';
          });
        },
        error: () => this.error.set('Failed to load patient')
      });
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
