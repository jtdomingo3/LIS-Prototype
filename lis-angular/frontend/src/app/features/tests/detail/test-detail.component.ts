import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TestService } from '../../../core/services/test.service';
import { Test, Patient } from '../../../core/models';

@Component({
  selector: 'app-test-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="loading">Loading...</div>
    } @else if (test()) {
      <div class="page-header">
        <h1>Test {{ test()!.test_id }}</h1>
        <div class="header-actions">
          @if (test()!.status === 'pending' || test()!.status === 'in_progress') {
            <a [routerLink]="['/tests', test()!.id, 'results']" class="btn btn-primary">Enter Results</a>
          }
          @if (test()!.status === 'completed') {
            <button class="btn btn-success" (click)="release()">Release</button>
          }
          @if (test()!.status === 'released') {
            <a [routerLink]="['/reports', test()!.id]" class="btn">View Report</a>
          }
          <a routerLink="/tests" class="btn">← Back</a>
        </div>
      </div>

      <div class="detail-grid">
        <div class="card">
          <h3>Test Information</h3>
          <dl>
            <dt>Test ID</dt><dd>{{ test()!.test_id }}</dd>
            <dt>Type</dt><dd>{{ test()!.test_type }}</dd>
            <dt>Status</dt><dd><span class="badge" [class]="'badge-' + test()!.status">{{ test()!.status }}</span></dd>
            <dt>Created</dt><dd>{{ test()!.created_at | date:'medium' }}</dd>
            <dt>Updated</dt><dd>{{ test()!.updated_at | date:'medium' }}</dd>
          </dl>
        </div>

        @if (patient()) {
          <div class="card">
            <h3>Patient</h3>
            <dl>
              <dt>Name</dt><dd><a [routerLink]="['/patients', patient()!.id]">{{ patient()!.first_name }} {{ patient()!.last_name }}</a></dd>
              <dt>Code</dt><dd>{{ patient()!.patient_code }}</dd>
              <dt>Age/Sex</dt><dd>{{ patient()!.age || '—' }} / {{ patient()!.sex || '—' }}</dd>
              <dt>Phone</dt><dd>{{ patient()!.phone || '—' }}</dd>
            </dl>
          </div>
        }

        @if (test()!.results) {
          <div class="card results-card">
            <h3>Results</h3>
            <div class="results-content">
              @for (key of resultKeys(); track key) {
                <div class="result-row">
                  <span class="result-label">{{ formatLabel(key) }}</span>
                  <span class="result-value">{{ getResultValue(key) }}</span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
    .results-card { grid-column: 1 / -1; }
    @media (max-width: 768px) { .detail-grid { grid-template-columns: 1fr; } }
    dl { display: grid; grid-template-columns: 100px 1fr; gap: 0.4rem 1rem; margin-top: 0.75rem; }
    dt { font-size: 0.8rem; color: #6b7280; }
    dd { margin: 0; font-size: 0.875rem; }
    h3 { font-size: 1.05rem; font-weight: 600; margin: 0; }
    .result-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #f3f4f6; }
    .result-label { font-size: 0.85rem; color: #374151; }
    .result-value { font-weight: 500; }
    .header-actions { display: flex; gap: 0.5rem; }
    .btn-success { background: #10b981; color: white; }
    .btn-success:hover { background: #059669; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
  `]
})
export class TestDetailComponent implements OnInit {
  private testService = inject(TestService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  test = signal<Test | null>(null);
  patient = signal<Patient | null>(null);
  loading = signal(true);
  resultKeys = signal<string[]>([]);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.testService.getById(id).subscribe({
      next: (res) => {
        this.test.set(res.test);
        this.patient.set(res.patient || null);
        if (res.test.results) {
          const parsed = typeof res.test.results === 'string' ? JSON.parse(res.test.results) : res.test.results;
          this.test.update(t => ({ ...t!, results: parsed }));
          this.resultKeys.set(Object.keys(parsed));
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  formatLabel(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  getResultValue(key: string): string {
    const results = this.test()?.results as any;
    const val = results?.[key];
    return val !== null && val !== undefined ? String(val) : '—';
  }

  release() {
    const id = this.test()!.id;
    this.testService.updateStatus(id, 'released').subscribe({
      next: () => {
        this.test.update(t => ({ ...t!, status: 'released' }));
      }
    });
  }
}
