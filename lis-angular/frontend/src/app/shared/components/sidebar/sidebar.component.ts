import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <div class="sidebar" [class.collapsed]="isCollapsed()">
      <!-- Brand in sidebar -->
      <div class="brand">
        <img src="assets/gezyne-logo.png" alt="Gezyne Clinical Laboratory" class="brand-logo" />
        @if (!isCollapsed()) {
          <div class="brand-text">Gezyne Clinical Laboratory</div>
        }
      </div>

      <!-- Navigation Items -->
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

        <!-- Clinical Consultations Panel -->
        @if (auth.hasPermission('consultations') || isDoctor()) {
          <a routerLink="/consultations" routerLinkActive="active" class="nav-item" title="Clinical Consultations">
            <span class="nav-emoji">🩺</span><span class="nav-text">Consultations</span>
          </a>
        }

        @if (auth.hasPermission('reports')) {
          <a routerLink="/reports" routerLinkActive="active" [routerLinkActiveOptions]="{exact: true}" class="nav-item" title="Reports">
            <span class="nav-emoji">📋</span><span class="nav-text">Reports</span>
          </a>
        }

        @if (auth.hasPermission('inventory') || auth.hasPermission('admin')) {
          <a routerLink="/inventory" routerLinkActive="active" class="nav-item" title="Inventory">
            <span class="nav-emoji">📦</span><span class="nav-text">Inventory</span>
          </a>
        }

        @if (auth.hasPermission('equipment') || auth.hasPermission('admin')) {
          <a routerLink="/equipment" routerLinkActive="active" class="nav-item" title="Equipment & QC">
            <span class="nav-emoji">🔬</span><span class="nav-text">Equipment &amp; QC</span>
          </a>
        }

        @if (auth.hasPermission('reports') || auth.hasPermission('admin')) {
          <a routerLink="/signatures" routerLinkActive="active" class="nav-item" title="Signatures">
            <span class="nav-emoji">✍️</span><span class="nav-text">Signature</span>
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

        <!-- Bottom Action Items -->
        <a routerLink="/settings" routerLinkActive="active" class="nav-item" style="margin-top: 14px;" title="Settings">
          <span class="nav-emoji">⚙️</span><span class="nav-text">Settings</span>
        </a>

        <a routerLink="/chatbot" routerLinkActive="active" class="nav-item" style="margin-top: 2px;" title="GezyneBot AI">
          <span class="nav-emoji">🤖</span><span class="nav-text">GezyneBot AI</span>
        </a>

        <button type="button" class="nav-item" (click)="toggleFullscreen()" style="margin-top: 2px; border: none; width: 100%; text-align: left; background: transparent; cursor: pointer;" title="Toggle Fullscreen">
          <span class="nav-emoji">⛶</span><span class="nav-text">Fullscreen</span>
        </button>

        <!-- Sidebar Collapse Toggle Button -->
        <button type="button" class="nav-item" (click)="toggleCollapse()" style="margin-top: 2px; border: none; width: 100%; text-align: left; background: transparent; cursor: pointer;" title="Collapse/Expand Menu">
          <span class="nav-emoji">{{ isCollapsed() ? '⏩' : '⏪' }}</span>
          <span class="nav-text">{{ isCollapsed() ? 'Expand' : 'Collapse' }}</span>
        </button>
      </nav>

      <!-- Logout Button (Fullstack Style) -->
      <button type="button" class="logout-btn" (click)="auth.logout()" title="Logout">
        <i class="fa fa-power-off logout-emoji" aria-hidden="true"></i>
        @if (!isCollapsed()) {
          <span class="logout-text">Logout</span>
        }
      </button>
    </div>
  `,
  styles: [`
    .sidebar {
      width: 280px;
      min-width: 280px;
      height: 100%;
      max-height: 100vh;
      background: linear-gradient(180deg, var(--primary-black-dark) 0%, var(--primary-black) 100%);
      color: var(--text-white);
      padding: 24px 20px;
      overflow-y: auto;
      box-shadow: 4px 0 24px rgba(0, 0, 0, 0.08);
      z-index: 100;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      box-sizing: border-box;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 16px;
      justify-content: center;
      margin-bottom: 24px;
      padding-bottom: 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .brand-logo {
      width: 44px;
      height: 44px;
      object-fit: contain;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.95);
      padding: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      transition: transform 0.3s ease;
      flex-shrink: 0;
    }

    .brand:hover .brand-logo {
      transform: scale(1.05) rotate(-2deg);
    }

    .brand-text {
      color: var(--text-white);
      font-weight: 700;
      font-size: 1.12em;
      text-align: left;
      line-height: 1.25;
      letter-spacing: -0.3px;
    }

    .sidebar-nav {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding-right: 2px;
    }

    .nav-item {
      padding: 11px 16px;
      margin: 3px 0;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-weight: 500;
      color: var(--text-gray);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 12px;
      background: transparent;
      font-size: 0.93em;
    }

    .nav-item:hover {
      background-color: rgba(255, 255, 255, 0.08);
      color: var(--text-white);
      transform: translateX(4px);
    }

    .nav-item.active {
      background: linear-gradient(135deg, var(--secondary-green) 0%, var(--secondary-green-dark) 100%);
      color: var(--text-white);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      font-weight: 600;
    }

    .nav-emoji {
      font-size: 1.2em;
      width: 26px;
      text-align: center;
      opacity: 0.9;
      flex-shrink: 0;
    }

    .nav-text {
      display: inline-block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Logout Button */
    .logout-btn {
      margin-top: 20px;
      padding: 12px 16px;
      background: rgba(249, 115, 22, 0.1);
      color: var(--accent-orange);
      border: 1px solid rgba(249, 115, 22, 0.2);
      border-radius: 10px;
      cursor: pointer;
      width: 100%;
      font-weight: 600;
      transition: all 0.3s ease;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 0.95em;
      font-family: inherit;
    }

    .logout-emoji {
      font-size: 1.1em;
      line-height: 1;
    }

    .logout-text {
      white-space: nowrap;
    }

    .logout-btn:hover {
      background: var(--accent-orange);
      color: var(--text-white);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
    }

    /* Collapsed State */
    .sidebar.collapsed {
      width: 80px;
      min-width: 80px;
      padding: 24px 12px;
    }

    .sidebar.collapsed .brand {
      padding-bottom: 16px;
      margin-bottom: 16px;
    }

    .sidebar.collapsed .brand-text {
      display: none;
    }

    .sidebar.collapsed .nav-text {
      display: none;
    }

    .sidebar.collapsed .nav-item {
      justify-content: center;
      padding: 12px 0;
    }

    .sidebar.collapsed .logout-btn {
      padding: 12px 0;
      justify-content: center;
    }

    .sidebar.collapsed .logout-text {
      display: none;
    }
  `]
})
export class SidebarComponent {
  auth = inject(AuthService);
  isCollapsed = signal(false);

  toggleCollapse() {
    this.isCollapsed.update(v => !v);
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  isDoctor(): boolean {
    const u = this.auth.currentUser();
    if (!u) return false;
    const r = (u.role || '').toLowerCase();
    const n = (u.name || '').toLowerCase();
    return ['doctor', 'physician', 'internist', 'cardiologist', 'pathologist'].includes(r) ||
      n.includes('dr.') || n.includes('md') || n.includes('m.d.');
  }
}
