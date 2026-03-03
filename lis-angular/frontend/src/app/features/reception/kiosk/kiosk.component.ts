import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppConfigService } from '../../../core/services/app-config.service';

interface AreaDisplay {
  name: string;
  patients: string[];
}

@Component({
  selector: 'app-kiosk',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kiosk-wrapper">
      <header class="kiosk-header">
        <div class="kiosk-brand">
          <div>
            <h1>Gezyne Clinical Laboratory</h1>
            <p>Patient Queue Display</p>
          </div>
        </div>
        <div class="kiosk-controls">
          <button class="ctrl-btn" (click)="toggleSound()" [title]="soundOn() ? 'Mute' : 'Unmute'">
            {{ soundOn() ? '🔊' : '🔇' }}
          </button>
          <button class="ctrl-btn" (click)="toggleFullscreen()" title="Fullscreen">⛶</button>
          <div class="kiosk-time">{{ currentTime() }}</div>
        </div>
      </header>

      <div class="kiosk-grid">
        @for (area of areas(); track area.name) {
          <div class="kiosk-area-card" [class.has-patients]="area.patients.length > 0">
            <div class="kiosk-area-header">{{ area.name }}</div>
            <div class="kiosk-area-body">
              @if (area.patients.length) {
                @for (p of area.patients; track p) {
                  <div class="queue-item" [class.now-serving]="$first">
                    @if ($first) { <span class="now-label">NOW</span> }
                    {{ p }}
                  </div>
                }
              } @else {
                <div class="no-patients">—</div>
              }
            </div>
            <div class="kiosk-area-footer">{{ area.patients.length }} patient(s)</div>
          </div>
        }
      </div>

      @if (adText()) {
        <div class="kiosk-marquee">
          <div class="marquee-content">{{ adText() }}</div>
        </div>
      }

      @if (connectionStatus() !== 'connected') {
        <div class="status-bar">
          {{ connectionStatus() === 'connecting' ? 'Connecting...' : 'Reconnecting...' }}
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .kiosk-wrapper {
      min-height: 100vh; background: linear-gradient(135deg, #1a1a2e, #0a0a1a);
      color: #fff; display: flex; flex-direction: column;
      zoom: 0.8;
    }
    .kiosk-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.75rem 2rem; background: rgba(0,0,0,0.5);
      border-bottom: 3px solid #10b981;
    }
    .kiosk-brand { display: flex; align-items: center; gap: 1rem; }
    .kiosk-brand h1 { margin: 0; font-size: 1.6rem; color: #f97316; }
    .kiosk-brand p { margin: 0; font-size: 0.85rem; color: #9ca3af; }
    .kiosk-controls { display: flex; align-items: center; gap: 0.75rem; }
    .ctrl-btn {
      background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
      color: white; padding: 0.4rem 0.6rem; border-radius: 6px; cursor: pointer;
      font-size: 1.1rem;
    }
    .ctrl-btn:hover { background: rgba(255,255,255,0.2); }
    .kiosk-time { font-size: 1.6rem; font-weight: 700; color: #10b981; font-family: monospace; }

    .kiosk-grid {
      display: grid; grid-template-columns: repeat(5, 1fr);
      gap: 1rem; padding: 1.5rem; flex: 1;
    }
    .kiosk-area-card {
      background: rgba(255,255,255,0.04); border-radius: 12px;
      border: 1px solid rgba(16,185,129,0.2); overflow: hidden;
      display: flex; flex-direction: column;
    }
    .kiosk-area-card.has-patients { border-color: rgba(16,185,129,0.5); }
    .kiosk-area-header {
      background: linear-gradient(135deg, #10b981, #059669);
      padding: 0.6rem 0.75rem; font-weight: 700;
      font-size: 0.95rem; text-align: center;
    }
    .kiosk-area-body { padding: 0.75rem; flex: 1; min-height: 80px; }
    .kiosk-area-footer {
      padding: 0.35rem; text-align: center; font-size: 0.7rem;
      color: #6b7280; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255,255,255,0.05);
    }
    .queue-item {
      background: rgba(16,185,129,0.12); padding: 0.35rem 0.6rem;
      border-radius: 6px; margin-bottom: 0.35rem; font-weight: 600;
      font-size: 0.9rem; text-align: center; position: relative;
    }
    .queue-item.now-serving {
      background: rgba(249,115,22,0.25); border: 1px solid rgba(249,115,22,0.5);
      animation: pulse 2s ease-in-out infinite;
    }
    .now-label {
      position: absolute; left: 4px; top: 50%; transform: translateY(-50%);
      font-size: 0.55rem; background: #f97316; color: white; padding: 1px 4px;
      border-radius: 3px; font-weight: 700;
    }
    .no-patients { color: #4b5563; text-align: center; padding: 1rem; font-style: italic; font-size: 0.85rem; }

    .kiosk-marquee {
      background: linear-gradient(90deg, #f97316, #ea580c);
      padding: 0.6rem 0; overflow: hidden; white-space: nowrap;
    }
    .marquee-content {
      display: inline-block; padding-left: 100%;
      animation: marquee 25s linear infinite;
      font-weight: 700; font-size: 1rem;
    }
    .status-bar {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: #ef4444; color: white; text-align: center;
      padding: 0.35rem; font-size: 0.8rem; font-weight: 600;
    }

    @keyframes marquee {
      0% { transform: translateX(0); }
      100% { transform: translateX(-100%); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    @media (max-width: 1200px) { .kiosk-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 768px) { .kiosk-grid { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class KioskComponent implements OnInit, OnDestroy {
  private cfg = inject(AppConfigService);
  areas = signal<AreaDisplay[]>([]);
  adText = signal('');
  currentTime = signal('');
  soundOn = signal(true);
  connectionStatus = signal<'connected' | 'connecting' | 'disconnected'>('connecting');
  private timer: any;
  private eventSource: EventSource | null = null;
  private lastAreas: Record<string, string[]> = {};

  ngOnInit() {
    this.updateTime();
    this.timer = setInterval(() => this.updateTime(), 1000);
    this.loadKiosk();
    this.connectSSE();
  }

  ngOnDestroy() {
    clearInterval(this.timer);
    this.eventSource?.close();
  }

  private updateTime() {
    this.currentTime.set(new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }));
  }

  private loadKiosk() {
    fetch(`${this.cfg.apiUrl}/reception/kiosk`)
      .then(r => r.json())
      .then((res: any) => {
        const areaData: Record<string, string[]> = res.areas || {};
        const displayAreas: AreaDisplay[] = [];
        for (const [name, patients] of Object.entries(areaData)) {
          displayAreas.push({ name, patients: patients as string[] });
        }
        // Check for new patients and speak
        if (this.soundOn() && Object.keys(this.lastAreas).length > 0) {
          this.announceNewPatients(areaData);
        }
        this.lastAreas = areaData;
        this.areas.set(displayAreas);
        if (res.ad) this.adText.set(res.ad);
      })
      .catch(() => {});
  }

  private connectSSE() {
    this.eventSource = new EventSource(`${this.cfg.apiUrl}/reception/events`);
    this.eventSource.onopen = () => this.connectionStatus.set('connected');
    this.eventSource.onmessage = () => this.loadKiosk();
    this.eventSource.onerror = () => {
      this.connectionStatus.set('disconnected');
      // Auto-reconnect after 5s
      setTimeout(() => {
        if (this.eventSource) this.eventSource.close();
        this.connectSSE();
      }, 5000);
    };
  }

  private announceNewPatients(newAreas: Record<string, string[]>) {
    for (const [area, patients] of Object.entries(newAreas)) {
      const oldPatients = this.lastAreas[area] || [];
      const newOnes = (patients as string[]).filter(p => !oldPatients.includes(p));
      for (const code of newOnes) {
        this.speak(`Now serving ${code} at ${area}`);
      }
    }
  }

  private speak(text: string) {
    if ('speechSynthesis' in window && this.soundOn()) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 0.9;
      utter.volume = 1;
      window.speechSynthesis.speak(utter);
    }
  }

  toggleSound() { this.soundOn.update(v => !v); }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
}
