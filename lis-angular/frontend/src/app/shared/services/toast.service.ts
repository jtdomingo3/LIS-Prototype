import { Injectable, signal, computed } from '@angular/core';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  show(type: Toast['type'], message: string, duration = 4000) {
    const id = Math.random().toString(36).slice(2);
    const toast: Toast = { id, type, message, duration };
    this._toasts.update(t => [...t, toast]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
    return id;
  }

  success(message: string, duration?: number) { return this.show('success', message, duration); }
  error(message: string, duration?: number) { return this.show('error', message, duration); }
  warning(message: string, duration?: number) { return this.show('warning', message, duration); }
  info(message: string, duration?: number) { return this.show('info', message, duration); }

  dismiss(id: string) {
    this._toasts.update(t => t.filter(toast => toast.id !== id));
  }

  dismissAll() {
    this._toasts.set([]);
  }
}
