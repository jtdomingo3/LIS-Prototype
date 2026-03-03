import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TemplateService } from '../../../core/services/template.service';
import { Template } from '../../../core/models';

@Component({
  selector: 'app-template-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>Templates</h1>
      <a routerLink="/templates/new" class="btn btn-primary">+ New Template</a>
    </div>

    @if (loading()) {
      <div class="loading">Loading...</div>
    } @else {
      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Test Type</th>
              <th>Version</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (t of templates(); track t.id) {
              <tr>
                <td><strong>{{ t.name }}</strong></td>
                <td>{{ t.test_type }}</td>
                <td>v{{ t.version || 1 }}</td>
                <td>{{ t.updated_at | date:'shortDate' }}</td>
                <td>
                  <a [routerLink]="['/templates', t.id, 'edit']" class="btn btn-sm btn-warning">Edit</a>
                  <button class="btn btn-sm btn-danger" (click)="deleteTemplate(t)">Delete</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="text-center">No templates found</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .text-center { text-align: center; color: #6b7280; padding: 2rem !important; }
    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
  `]
})
export class TemplateListComponent implements OnInit {
  private templateService = inject(TemplateService);

  templates = signal<Template[]>([]);
  loading = signal(true);

  ngOnInit() { this.loadTemplates(); }

  loadTemplates() {
    this.templateService.getAll().subscribe({
      next: (res) => {
        this.templates.set(res.templates);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  deleteTemplate(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    this.templateService.delete(t.id).subscribe({
      next: () => this.templates.update(list => list.filter(x => x.id !== t.id))
    });
  }
}
