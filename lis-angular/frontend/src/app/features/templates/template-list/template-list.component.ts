import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TemplateService } from '../../../core/services/template.service';
import { Template } from '../../../core/models';

@Component({
  selector: 'app-template-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>🧾 Test Templates</h1>
      <a routerLink="/templates/new" class="btn btn-primary">+ New Template</a>
    </div>

    <div class="card">
      <div class="toolbar">
        <input class="search-box" type="text" placeholder="Search by name or test type..."
          [(ngModel)]="searchText" />
        <label class="toggle-inactive">
          <input type="checkbox" [(ngModel)]="showInactive" (change)="loadTemplates()" />
          Show inactive
        </label>
      </div>

      @if (loading()) {
        <div class="loading-state">Loading templates…</div>
      } @else if (filteredTemplates().length === 0) {
        <div class="empty-state">
          <i class="fa fa-file-alt empty-icon"></i>
          <p>No templates found.</p>
          <a routerLink="/templates/new" class="btn btn-primary">Create your first template</a>
        </div>
      } @else {
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Test Type</th>
                <th>Fields</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (t of filteredTemplates(); track t.id) {
                <tr [class.inactive-row]="!t.is_active">
                  <td>
                    <strong>{{ t.name }}</strong>
                    @if (t.footer_notes) {
                      <div class="sub-text">{{ t.footer_notes | slice:0:60 }}…</div>
                    }
                  </td>
                  <td>
                    @if (t.test_type) {
                      <span class="badge badge-info">{{ t.test_type }}</span>
                    } @else {
                      <span class="text-muted">—</span>
                    }
                  </td>
                  <td>{{ t.fields.length || 0 }} fields</td>
                  <td>
                    <span class="badge" [class]="t.is_active ? 'badge-completed' : 'badge-danger'">
                      {{ t.is_active ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td class="date-col">{{ t.created_at | date:'MMM d, yyyy' }}</td>
                  <td>
                    <div class="action-group">
                      <a [routerLink]="['/templates', t.id, 'edit']" class="btn btn-small btn-outline">✏️ Edit</a>
                      @if (t.is_active) {
                        <button class="btn btn-small btn-outline-danger" (click)="deactivate(t)">Deactivate</button>
                      } @else {
                        <button class="btn btn-small btn-success" (click)="activate(t)">Activate</button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="table-footer">
          {{ filteredTemplates().length }} template{{ filteredTemplates().length !== 1 ? 's' : '' }}
        </div>
      }
    </div>
  `,
  styles: [`
    .toolbar {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }
    .search-box { flex: 1; min-width: 200px; }
    .toggle-inactive {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.9rem;
      color: #6b7280;
      cursor: pointer;
      white-space: nowrap;
    }
    .toggle-inactive input { width: auto; margin: 0; cursor: pointer; }

    .loading-state {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }

    .inactive-row { opacity: 0.55; }
    .sub-text { font-size: 0.78rem; color: #9ca3af; margin-top: 2px; }
    .text-muted { color: #9ca3af; }
    .date-col { font-size: 0.85rem; color: #6b7280; white-space: nowrap; }

    .action-group { display: flex; gap: 0.4rem; flex-wrap: nowrap; }

    .table-footer {
      margin-top: 0.75rem;
      font-size: 0.85rem;
      color: #6b7280;
      text-align: right;
    }
  `]
})
export class TemplateListComponent implements OnInit {
  private templateService = inject(TemplateService);

  templates = signal<Template[]>([]);
  loading = signal(true);
  searchText = '';
  showInactive = false;

  filteredTemplates = computed(() => {
    const search = this.searchText.toLowerCase().trim();
    return this.templates().filter(t => {
      if (!search) return true;
      return (
        t.name.toLowerCase().includes(search) ||
        (t.test_type || '').toLowerCase().includes(search)
      );
    });
  });

  ngOnInit() {
    this.loadTemplates();
  }

  loadTemplates() {
    this.loading.set(true);
    this.templateService.getAll(this.showInactive).subscribe({
      next: (res) => {
        this.templates.set(res.templates);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  deactivate(t: Template) {
    if (!confirm(`Deactivate template "${t.name}"?`)) return;
    this.templateService.delete(t.id).subscribe({
      next: () => this.loadTemplates(),
      error: (err) => console.error('Deactivate failed', err)
    });
  }

  activate(t: Template) {
    this.templateService.update(t.id, { is_active: 1 } as any).subscribe({
      next: () => this.loadTemplates(),
      error: (err) => console.error('Activate failed', err)
    });
  }
}
