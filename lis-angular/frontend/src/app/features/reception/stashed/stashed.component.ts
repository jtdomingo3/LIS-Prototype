import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ReceptionService } from '../../../core/services/reception.service';

interface StashedItem {
  patient: {
    id: string;
    patient_id?: string;
    patient_code?: string;
    first_name?: string;
    last_name?: string;
  };
  testIds: string[];
  testNames: string[];
  stashedAt: string;
}

@Component({
  selector: 'app-stashed',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1>Stashed Results</h1>
        <p class="subtitle">Results temporarily held in reception when patients are unavailable.</p>
      </div>
      <a routerLink="/reception" class="btn btn-outline">&larr; Back to Reception</a>
    </div>

    @if (alertMsg()) {
      <div class="alert alert-success">{{ alertMsg() }}</div>
    }
    @if (errorMsg()) {
      <div class="alert alert-danger">{{ errorMsg() }}</div>
    }

    <div class="toolbar">
      <input
        type="text"
        [(ngModel)]="searchQuery"
        placeholder="Search patient name or ID..."
        class="form-control search-box"
      />
      <span class="count-badge">{{ filteredList().length }} Patient(s) Stashed</span>
    </div>

    @if (loading()) {
      <div class="loading">Loading stashed results...</div>
    } @else if (filteredList().length === 0) {
      <div class="card empty">
        <p>No stashed results found.</p>
      </div>
    } @else {
      <div class="card table-card">
        <table class="table">
          <thead>
            <tr>
              <th>Patient Code</th>
              <th>Patient Name</th>
              <th>Tests</th>
              <th>Stashed At</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (item of filteredList(); track item.patient.id) {
              <tr>
                <td>
                  <strong>{{ item.patient.patient_code || item.patient.patient_id || item.patient.id }}</strong>
                </td>
                <td>{{ item.patient.first_name }} {{ item.patient.last_name }}</td>
                <td>
                  <div class="badge-list">
                    @for (name of item.testNames; track name) {
                      <span class="badge">{{ name }}</span>
                    }
                  </div>
                </td>
                <td>{{ item.stashedAt | date:'medium' }}</td>
                <td style="text-align: right;">
                  <button
                    class="btn btn-primary btn-sm"
                    (click)="release(item)"
                    [disabled]="releasing() === item.patient.id"
                  >
                    {{ releasing() === item.patient.id ? 'Releasing...' : 'Release Result' }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .subtitle {
      color: #64748b;
      margin-top: 0.25rem;
      font-size: 0.95rem;
    }
    .toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
      gap: 1rem;
    }
    .search-box {
      max-width: 350px;
    }
    .count-badge {
      font-weight: 600;
      color: #475569;
      font-size: 0.9rem;
    }
    .badge-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .badge {
      background: #e2e8f0;
      color: #334155;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .table-card {
      padding: 0;
      overflow: hidden;
    }
    .btn-sm {
      padding: 0.35rem 0.75rem;
      font-size: 0.85rem;
    }
    .empty {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }
    .loading {
      text-align: center;
      padding: 3rem;
      color: #64748b;
    }
    .alert {
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 0.9rem;
    }
    .alert-success {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
    }
    .alert-danger {
      background: #fee2e2;
      color: #991b1b;
      border: 1px solid #fecaca;
    }
  `]
})
export class StashedComponent implements OnInit {
  private receptionService = inject(ReceptionService);

  stashedList = signal<StashedItem[]>([]);
  loading = signal(true);
  releasing = signal<string | null>(null);
  searchQuery = '';
  alertMsg = signal<string | null>(null);
  errorMsg = signal<string | null>(null);

  filteredList = computed(() => {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) return this.stashedList();
    return this.stashedList().filter(item => {
      const name = `${item.patient.first_name || ''} ${item.patient.last_name || ''}`.toLowerCase();
      const code = (item.patient.patient_code || item.patient.patient_id || '').toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  });

  ngOnInit() {
    this.loadStashed();
  }

  loadStashed() {
    this.loading.set(true);
    this.receptionService.getStashed().subscribe({
      next: (res) => {
        this.stashedList.set(res.stashedList || []);
        this.loading.set(false);
      },
      error: (err) => {
        this.errorMsg.set('Failed to load stashed results');
        this.loading.set(false);
      }
    });
  }

  release(item: StashedItem) {
    if (!confirm(`Release results for ${item.patient.first_name} ${item.patient.last_name}?`)) {
      return;
    }

    this.releasing.set(item.patient.id);
    this.receptionService.releaseStashed({
      patientId: item.patient.id,
      testIds: item.testIds,
    }).subscribe({
      next: (res) => {
        this.releasing.set(null);
        this.alertMsg.set(res.message || 'Result released successfully');
        setTimeout(() => this.alertMsg.set(null), 3000);
        this.loadStashed();
      },
      error: (err) => {
        this.releasing.set(null);
        this.errorMsg.set('Failed to release stashed results');
        setTimeout(() => this.errorMsg.set(null), 3000);
      }
    });
  }
}
