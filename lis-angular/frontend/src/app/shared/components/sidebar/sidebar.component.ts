import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar" [class.collapsed]="isCollapsed()">
      <!-- Brand Logo & Header -->
      <div class="brand">
        <img src="assets/gezyne-logo.png" alt="Gezyne Clinical Laboratory" class="brand-logo" />
        @if (!isCollapsed()) {
          <div class="brand-text">Gezyne Clinical<br/>Laboratory</div>
        }
      </div>

      <!-- Navigation Menu -->
      <nav class="sidebar-nav">
        @if (auth.hasPermission('dashboard')) {
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item" title="Dashboard">
            <span class="nav-emoji">📊</span><span class="nav-text">Dashboard</span>
          </a>
        }
        @if (auth.hasPermission('patients')) {
          <a routerLink="/patients" routerLinkActive="active" class="nav-item" title="Patients">
            <span class="nav-emoji">👥</span><span class="nav-text">Patients</span>
          </a>
        }
        @if (auth.hasPermission('reception')) {
          <a routerLink="/reception" routerLinkActive="active" class="nav-item" title="Reception & Queues">
            <span class="nav-emoji">🏥</span><span class="nav-text">Reception</span>
          </a>
        }
        @if (auth.hasPermission('tests')) {
          <a routerLink="/tests" routerLinkActive="active" class="nav-item" title="Tests & Results">
            <span class="nav-emoji">🧪</span><span class="nav-text">Tests &amp; Results</span>
          </a>
        }
        @if (auth.hasPermission('consultations') || isDoctor()) {
          <a routerLink="/consultations/panel" routerLinkActive="active" class="nav-item" title="Doctor Consultations">
            <span class="nav-emoji">🩺</span><span class="nav-text">Consultations</span>
          </a>
        }
        @if (auth.hasPermission('reports')) {
          <a routerLink="/reports" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="nav-item" title="Reports">
            <span class="nav-emoji">📋</span><span class="nav-text">Reports</span>
          </a>
        }
        @if (auth.hasPermission('inventory') || auth.hasPermission('admin')) {
          <a routerLink="/inventory" routerLinkActive="active" class="nav-item" title="Reagent Inventory">
            <span class="nav-emoji">📦</span><span class="nav-text">Inventory</span>
          </a>
        }
        @if (auth.hasPermission('equipment') || auth.hasPermission('admin')) {
          <a routerLink="/equipment" routerLinkActive="active" class="nav-item" title="Equipment & QC">
            <span class="nav-emoji">🔬</span><span class="nav-text">Equipment &amp; QC</span>
          </a>
        }
        @if (auth.hasPermission('reports')) {
          <a routerLink="/signatures" routerLinkActive="active" class="nav-item" title="Signatures">
            <span class="nav-emoji">✍️</span><span class="nav-text">Signatures</span>
          </a>
        }
        @if (auth.hasPermission('worksheet')) {
          <a routerLink="/reports/worksheet" routerLinkActive="active" class="nav-item" title="Worksheet">
            <span class="nav-emoji">📊</span><span class="nav-text">Worksheet</span>
          </a>
        }
        @if (auth.hasPermission('templates')) {
          <a routerLink="/templates" routerLinkActive="active" class="nav-item" title="Templates">
            <span class="nav-emoji">📄</span><span class="nav-text">Templates</span>
          </a>
        }
        @if (auth.hasPermission('users')) {
          <a routerLink="/users" routerLinkActive="active" class="nav-item" title="Users">
            <span class="nav-emoji">👤</span><span class="nav-text">Users</span>
          </a>
        }
        <a routerLink="/chatbot" routerLinkActive="active" class="nav-item" title="GezyneBot AI">
          <span class="nav-emoji">🤖</span><span class="nav-text">GezyneBot AI</span>
        </a>
      </nav>

      <!-- Sidebar Footer -->
      <div class="sidebar-footer">
        <a routerLink="/settings" routerLinkActive="active" class="nav-item" title="Settings">
          <span class="nav-emoji">⚙️</span><span class="nav-text">Settings</span>
        </a>

        <!-- Fullscreen Button -->
        <button type="button" class="nav-item btn-action" (click)="toggleFullscreen()" title="Toggle Fullscreen">
          <span class="nav-emoji">⛶</span><span class="nav-text">Fullscreen</span>
        </button>

        <!-- Collapse Toggle -->
        <button type="button" class="nav-item btn-action" (click)="toggleCollapse()" title="Collapse / Expand Sidebar">
          <span class="nav-emoji">{{ isCollapsed() ? '⏩' : '⏪' }}</span>
          <span class="nav-text">{{ isCollapsed() ? 'Expand' : 'Collapse' }}</span>
        </button>

        <button class="logout-btn" (click)="auth.logout()" title="Logout">
          <i class="fa fa-power-off"></i>
          @if (!isCollapsed()) {
            <span>Logout</span>
          }
        </button>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar {
      width: 260px;
      min-width: 260px;
      background: linear-gradient(180deg, #09090b 0%, #18181b 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow-y: auto;
      padding: 20px 16px;
      box-shadow: 4px 0 24px rgba(0,0,0,0.25);
      z-index: 100;
      transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      box-sizing: border-box;
    }

    .sidebar.collapsed {
      width: 76px;
      min-width: 76px;
      padding: 20px 10px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      justify-content: center;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .brand-logo {
      width: 42px;
      height: 42px;
      object-fit: contain;
      border-radius: 8px;
      background: white;
      padding: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }

    .brand-text {
      color: #ffffff;
      font-weight: 700;
      font-size: 1.05rem;
      text-align: left;
      line-height: 1.2;
      letter-spacing: -0.3px;
    }

    .sidebar-nav {
      flex: 1;
      padding: 0.25rem 0;
      overflow-y: auto;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      margin: 3px 0;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.9rem;
      color: #94a3b8;
      text-decoration: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      background: transparent;
      border: none;
      width: 100%;
      text-align: left;
      box-sizing: border-box;
    }

    .sidebar.collapsed .nav-item {
      justify-content: center;
      padding: 10px 0;
    }

    .nav-item:hover {
      background-color: rgba(255, 255, 255, 0.08);
      color: #ffffff;
      transform: translateX(3px);
    }

    .nav-item.active {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
      font-weight: 600;
    }

    .nav-emoji {
      font-size: 1.15rem;
      width: 24px;
      text-align: center;
      display: inline-block;
      flex-shrink: 0;
    }

    .nav-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sidebar.collapsed .nav-text {
      display: none;
    }

    .sidebar-footer {
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      padding-top: 12px;
      margin-top: auto;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .btn-action {
      background: transparent;
      border: none;
      color: #94a3b8;
    }

    .logout-btn {
      margin-top: 8px;
      padding: 10px 14px;
      background: rgba(239, 68, 68, 0.1);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      font-weight: 600;
      font-size: 0.85rem;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-sizing: border-box;
    }

    .logout-btn:hover {
      background: #ef4444;
      color: white;
    }

    .sidebar.collapsed .logout-btn {
      padding: 10px 0;
    }
  `]
})
export class SidebarComponent {
  auth = inject(AuthService);
  isCollapsed = signal<boolean>(false);

  toggleCollapse(): void {
    this.isCollapsed.update(v => !v);
  }

  isDoctor(): boolean {
    const u = this.auth.currentUser();
    if (!u) return false;
    return Boolean(
      ['Doctor', 'Physician', 'Internist', 'Cardiologist', 'Pathologist'].includes(u.role) ||
      (u.name && (u.name.includes('Dr.') || u.name.includes('MD')))
    );
  }

  toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }
}
