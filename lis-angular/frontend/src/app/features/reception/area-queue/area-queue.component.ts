import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReceptionService } from '../../../core/services/reception.service';

interface QueueItem {
  id: string;
  test_id: string;
  patient_name: string;
  test_type: string;
  status: string;
  assigned_at: string;
}

@Component({
  selector: 'app-area-queue',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>{{ areaLabel() }} Queue</h1>
      <a routerLink="/reception" class="btn">← Back</a>
    </div>

    @if (loading()) {
      <div class="loading">Loading queue...</div>
    } @else {
      <div class="card">
        @if (queue().length) {
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Test ID</th>
                <th>Patient</th>
                <th>Type</th>
                <th>Assigned</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (item of queue(); track item.id; let i = $index) {
                <tr>
                  <td>{{ i + 1 }}</td>
                  <td><strong>{{ item.test_id }}</strong></td>
                  <td>{{ item.patient_name }}</td>
                  <td>{{ item.test_type }}</td>
                  <td>{{ item.assigned_at | date:'shortTime' }}</td>
                  <td>
                    <button class="btn btn-sm btn-primary" (click)="complete(item.id)"
                      [disabled]="completing() === item.id">
                      {{ completing() === item.id ? 'Done...' : 'Complete' }}
                    </button>
                    <a [routerLink]="['/tests', item.id]" class="btn btn-sm">View</a>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <div class="empty">No patients in queue for this area.</div>
        }
      </div>
    }
  `,
  styles: [`
    .empty { text-align: center; padding: 3rem; color: #9ca3af; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
  `]
})
export class AreaQueueComponent implements OnInit, OnDestroy {
  private receptionService = inject(ReceptionService);
  private route = inject(ActivatedRoute);

  areaName = signal('');
  areaLabel = signal('');
  queue = signal<QueueItem[]>([]);
  loading = signal(true);
  completing = signal('');
  private eventSource: EventSource | null = null;

  ngOnInit() {
    const name = this.route.snapshot.paramMap.get('name')!;
    this.areaName.set(name);
    this.areaLabel.set(name.charAt(0).toUpperCase() + name.slice(1));
    this.loadQueue();
    this.subscribeSSE();
  }

  ngOnDestroy() {
    this.eventSource?.close();
  }

  loadQueue() {
    this.receptionService.getAreaQueue(this.areaName()).subscribe({
      next: (res) => {
        this.queue.set(res.queue || []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  complete(testId: string) {
    this.completing.set(testId);
    this.receptionService.completeArea(testId, this.areaName()).subscribe({
      next: () => {
        this.queue.update(q => q.filter(i => i.id !== testId));
        this.completing.set('');
      },
      error: () => this.completing.set('')
    });
  }

  private subscribeSSE() {
    this.eventSource = this.receptionService.subscribeEvents();
    if (this.eventSource) {
      this.eventSource.onmessage = () => this.loadQueue();
    }
  }
}
