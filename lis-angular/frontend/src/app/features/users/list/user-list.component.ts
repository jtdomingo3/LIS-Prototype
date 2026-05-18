import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { User } from '../../../core/models';

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <h1>Users</h1>
      <a routerLink="/users/new" class="btn btn-primary">+ New User</a>
    </div>

    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (u of users(); track u.id) {
            <tr>
              <td><strong>{{ u.name }}</strong></td>
              <td>{{ u.email }}</td>
              <td><span class="badge">{{ u.role }}</span></td>
              <td><span class="badge" [class]="u.active ? 'badge-completed' : 'badge-pending'">{{ u.active ? 'Active' : 'Inactive' }}</span></td>
              <td>{{ u.last_login ? (u.last_login | date:'short') : 'Never' }}</td>
              <td>
                <div class="table-actions">
                  <a [routerLink]="['/users', u.id, 'edit']" class="btn btn-sm btn-outline-orange">Edit</a>
                  <button class="btn btn-sm btn-outline-danger" (click)="deleteUser(u)" [disabled]="u.role === 'admin'">Delete</button>
                </div>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="text-center">
                <div class="empty-state">
                  <i class="fa fa-user-shield empty-icon"></i>
                  <p>No users found</p>
                  <span>Add a new user to get started.</span>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .text-center { text-align: center; color: #6b7280; padding: 2rem !important; }
  `]
})
export class UserListComponent implements OnInit {
  private userService = inject(UserService);
  users = signal<User[]>([]);

  ngOnInit() { this.loadUsers(); }

  loadUsers() {
    this.userService.getAll().subscribe(res => this.users.set(res.users));
  }

  deleteUser(u: User) {
    if (!confirm(`Delete user "${u.name}"?`)) return;
    this.userService.delete(u.id).subscribe({
      next: () => this.users.update(list => list.filter(x => x.id !== u.id))
    });
  }
}
