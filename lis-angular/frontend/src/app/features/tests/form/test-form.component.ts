import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TestService } from '../../../core/services/test.service';
import { PatientService } from '../../../core/services/patient.service';
import { Patient } from '../../../core/models';

@Component({
  selector: 'app-test-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>New Test Order</h1>
      <a routerLink="/tests" class="btn">← Back</a>
    </div>

    <div class="card">
      @if (error()) { <div class="alert alert-error">{{ error() }}</div> }

      <form (ngSubmit)="onSubmit()">
        <div class="form-group">
          <label class="form-label">Patient *</label>
          <div class="patient-search">
            <input type="text" class="form-control" [(ngModel)]="patientSearch" name="patientSearch"
              placeholder="Type patient name to search..." (input)="searchPatients()" />
            @if (patientResults().length) {
              <div class="search-results">
                @for (p of patientResults(); track p.id) {
                  <div class="search-item" (click)="selectPatient(p)">
                    <strong>{{ p.patient_code }}</strong> — {{ p.first_name }} {{ p.last_name }}
                    <span class="age-sex">({{ p.age || '?' }}/{{ p.sex?.[0]?.toUpperCase() || '?' }})</span>
                  </div>
                }
              </div>
            }
            @if (selectedPatient()) {
              <div class="selected-patient">
                Selected: <strong>{{ selectedPatient()!.first_name }} {{ selectedPatient()!.last_name }}</strong>
                ({{ selectedPatient()!.patient_code }})
                <button type="button" class="btn-clear" (click)="clearPatient()">×</button>
              </div>
            }
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Test Types *</label>
          <div class="test-type-grid">
            @for (tt of testTypes; track tt.value) {
              <label class="checkbox-label">
                <input type="checkbox" [checked]="selectedTypes.includes(tt.value)"
                  (change)="toggleType(tt.value)" />
                {{ tt.label }}
              </label>
            }
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Physician</label>
          <input type="text" class="form-control" [(ngModel)]="physician" name="physician" />
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Creating...' : 'Create Test' + (selectedTypes.length > 1 ? 's' : '') }}
          </button>
          <a routerLink="/tests" class="btn">Cancel</a>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .patient-search { position: relative; }
    .search-results {
      position: absolute; z-index: 10; background: white; width: 100%;
      border: 1px solid #d1d5db; border-radius: 6px; max-height: 200px; overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 2px;
    }
    .search-item { padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.875rem; }
    .search-item:hover { background: #f3f4f6; }
    .age-sex { color: #9ca3af; margin-left: 0.25rem; }
    .selected-patient {
      margin-top: 0.5rem; padding: 0.5rem 0.75rem; background: #eff6ff;
      border-radius: 6px; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;
    }
    .btn-clear { background: none; border: none; font-size: 1.2rem; cursor: pointer; color: #6b7280; padding: 0 0.25rem; }
    .test-type-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.5rem; }
    .checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; cursor: pointer; padding: 0.4rem 0.5rem; border-radius: 4px; }
    .checkbox-label:hover { background: #f9fafb; }
    .form-actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; }
  `]
})
export class TestFormComponent implements OnInit {
  private testService = inject(TestService);
  private patientService = inject(PatientService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  saving = signal(false);
  error = signal('');
  patientResults = signal<Patient[]>([]);
  selectedPatient = signal<Patient | null>(null);

  patientSearch = '';
  physician = '';
  selectedTypes: string[] = [];
  private debounce: any;

  testTypes = [
    { value: 'blood chemistry', label: 'Blood Chemistry' },
    { value: 'hematology', label: 'Hematology' },
    { value: 'urinalysis', label: 'Urinalysis' },
    { value: 'xray', label: 'X-Ray' },
    { value: 'ecg', label: 'ECG' },
    { value: 'drug test', label: 'Drug Test' },
    { value: 'fecalysis', label: 'Fecalysis' },
    { value: 'serology', label: 'Serology' },
    { value: 'miscellaneous', label: 'Miscellaneous' },
  ];

  ngOnInit() {
    const patientId = this.route.snapshot.queryParamMap.get('patientId');
    if (patientId) {
      this.patientService.getById(patientId).subscribe({
        next: (res) => this.selectedPatient.set(res.patient)
      });
    }
  }

  searchPatients() {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      if (this.patientSearch.length < 2) { this.patientResults.set([]); return; }
      this.patientService.getAll({ search: this.patientSearch, limit: 8 }).subscribe(res => {
        this.patientResults.set(res.patients);
      });
    }, 250);
  }

  selectPatient(p: Patient) {
    this.selectedPatient.set(p);
    this.patientSearch = '';
    this.patientResults.set([]);
  }

  clearPatient() {
    this.selectedPatient.set(null);
    this.patientSearch = '';
  }

  toggleType(type: string) {
    const idx = this.selectedTypes.indexOf(type);
    if (idx >= 0) this.selectedTypes.splice(idx, 1);
    else this.selectedTypes.push(type);
  }

  onSubmit() {
    if (!this.selectedPatient()) { this.error.set('Please select a patient'); return; }
    if (!this.selectedTypes.length) { this.error.set('Please select at least one test type'); return; }

    this.saving.set(true);
    this.error.set('');

    this.testService.create({
      patient_id: this.selectedPatient()!.id,
      test_types: this.selectedTypes,
      physician: this.physician
    }).subscribe({
      next: (res) => {
        const tests = res.tests;
        if (tests.length === 1) {
          this.router.navigate(['/tests', tests[0].id]);
        } else {
          this.router.navigate(['/tests']);
        }
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to create test');
        this.saving.set(false);
      }
    });
  }
}
