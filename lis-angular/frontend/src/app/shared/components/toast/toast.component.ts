import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast" [class]="'toast-' + toast.type" (click)="toastService.dismiss(toast.id)">
          <span class="toast-icon">{{ iconFor(toast.type) }}</span>
          <span class="toast-msg">{{ toast.message }}</span>
          <button class="toast-close" (click)="toastService.dismiss(toast.id)" aria-label="Close">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      max-width: 380px;
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.85rem 1.1rem;
      border-radius: 10px;
      font-size: 0.9rem;
      font-weight: 500;
      box-shadow: 0 4px 20px rgba(0,0,0,0.18);
      pointer-events: all;
      cursor: pointer;
      animation: slideUp 0.28s ease;
      border-left: 4px solid transparent;
      backdrop-filter: blur(6px);
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .toast-success { background: #d1fae5; color: #065f46; border-left-color: #10b981; }
    .toast-error   { background: #fee2e2; color: #991b1b; border-left-color: #ef4444; }
    .toast-warning { background: #fef3c7; color: #92400e; border-left-color: #f97316; }
    .toast-info    { background: #dbeafe; color: #1e40af; border-left-color: #3b82f6; }

    .toast-icon { font-size: 1.1rem; flex-shrink: 0; }
    .toast-msg  { flex: 1; line-height: 1.4; }

    .toast-close {
      background: none; border: none; cursor: pointer;
      opacity: 0.6; font-size: 0.8rem; padding: 2px 4px;
      color: inherit; line-height: 1; flex-shrink: 0;
    }
    .toast-close:hover { opacity: 1; }
  `]
})
export class ToastComponent {
  toastService = inject(ToastService);

  iconFor(type: Toast['type']): string {
    return { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' }[type] ?? 'ℹ️';
  }
}
