import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReceptionService } from '../../../core/services/reception.service';

@Component({
  selector: 'app-kiosk',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kiosk-wrapper">
      <header class="kiosk-header">
        <div class="kiosk-brand">
          <img src="assets/gezyne-logo.png" alt="Logo" class="kiosk-logo" />
          <div>
            <h1>Gezyne Clinical Laboratory</h1>
            <p>Patient Queue Display</p>
          </div>
        </div>
        <div class="kiosk-time">{{ currentTime() }}</div>
      </header>

      <div class="kiosk-grid">
        @for (area of areas(); track area.name) {
          <div class="kiosk-area-card">
            <div class="kiosk-area-header">{{ area.name }}</div>
            <div class="kiosk-area-body">
              @if (area.patients?.length) {
                @for (p of area.patients; track p) {
                  <div class="queue-item">{{ p }}</div>
                }
              } @else {
                <div class="no-patients">No patients waiting</div>
              }
            </div>
          </div>
        }
      </div>

      @if (adText()) {
        <div class="kiosk-marquee">
          <div class="marquee-content">{{ adText() }}</div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .kiosk-wrapper {
      min-height: 100vh; background: linear-gradient(135deg, #1a1a1a, #0a0a0a);
      color: #fff; display: flex; flex-direction: column;
    }
    .kiosk-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 1rem 2rem; background: #111;
      border-bottom: 3px solid #10b981;
    }
    .kiosk-brand { display: flex; align-items: center; gap: 1rem; }
    .kiosk-logo { width: 56px; height: 56px; border-radius: 8px; background: #fff; padding: 4px; }
    .kiosk-brand h1 { margin: 0; font-size: 1.5rem; color: #f97316; }
    .kiosk-brand p { margin: 0; font-size: 0.9rem; color: #9ca3af; }
    .kiosk-time { font-size: 1.8rem; font-weight: 700; color: #10b981; }

    .kiosk-grid {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem; padding: 2rem; flex: 1;
    }
    .kiosk-area-card {
      background: rgba(255,255,255,0.05); border-radius: 12px;
      border: 1px solid rgba(16,185,129,0.3); overflow: hidden;
    }
    .kiosk-area-header {
      background: #10b981; padding: 0.75rem 1rem; font-weight: 700;
      font-size: 1.1rem; text-align: center;
    }
    .kiosk-area-body { padding: 1rem; min-height: 100px; }
    .queue-item {
      background: rgba(16,185,129,0.15); padding: 0.5rem 0.75rem;
      border-radius: 6px; margin-bottom: 0.5rem; font-weight: 600;
      font-size: 1rem; text-align: center;
    }
    .no-patients { color: #6b7280; text-align: center; padding: 1rem; font-style: italic; }

    .kiosk-marquee {
      background: #f97316; padding: 0.75rem 0; overflow: hidden; white-space: nowrap;
    }
    .marquee-content {
      display: inline-block; padding-left: 100%;
      animation: marquee 20s linear infinite;
      font-weight: 700; font-size: 1.1rem;
    }
    @keyframes marquee {
      0% { transform: translateX(0); }
      100% { transform: translateX(-100%); }
    }
  `]
})
export class KioskComponent implements OnInit, OnDestroy {
  private receptionService = inject(ReceptionService);

  areas = signal<any[]>([]);
  adText = signal('');
  currentTime = signal('');
  private timer: any;
  private refreshTimer: any;

  ngOnInit() {
    this.updateTime();
    this.timer = setInterval(() => this.updateTime(), 1000);
    this.loadKiosk();
    this.refreshTimer = setInterval(() => this.loadKiosk(), 15000); // refresh every 15s
  }

  ngOnDestroy() {
    clearInterval(this.timer);
    clearInterval(this.refreshTimer);
  }

  private updateTime() {
    this.currentTime.set(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }

  private loadKiosk() {
    this.receptionService.getKiosk().subscribe({
      next: (res: any) => {
        this.areas.set(res.areas || []);
        if (res.ad) this.adText.set(res.ad);
      },
    });
  }
}
