import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppConfigService } from '../../../core/services/app-config.service';

interface AreaDisplay {
  name: string;
  count: number;
  nowServing: string;
  nextList: string[];
}

@Component({
  selector: 'app-kiosk',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kiosk-container">
      <!-- Header -->
      <div class="kiosk-header">
        <div class="kiosk-title-row">
          <img src="assets/gezyne-logo.png" alt="Gezyne logo" class="kiosk-logo">
          <div class="kiosk-title-stack">
            <h1 class="kiosk-title">Gezyne Clinical Laboratory</h1>
            <h2 class="kiosk-subtitle">Patient Queue Display</h2>
            <div class="kiosk-time">{{ currentTime() }}</div>
            <div class="kiosk-date">{{ currentDate() }}</div>
          </div>
        </div>
      </div>

      <!-- Status Bar -->
      <div class="status-bar">
        <div class="status-indicator">
          <span class="status-dot" [class]="connectionStatus()"></span>
          <span>{{ connectionLabel() }}</span>
        </div>
        <div class="status-indicator">
          <span>🔄</span>
          <span>{{ lastUpdateTime() }}</span>
        </div>
      </div>

      <!-- Areas Grid -->
      <div class="areas-grid">
        @for (area of areas(); track area.name) {
          <div class="area-card" [class.has-patients]="area.count > 0"
               [class.highlight]="highlightedArea() === area.name">
            <div class="area-header">
              <h3 class="area-name">{{ area.name }}</h3>
              <span class="area-count" [class.active]="area.count > 0">{{ area.count }}</span>
            </div>
            <div class="area-content">
              <div class="now-serving-label">NOW SERVING</div>
              @if (area.nowServing) {
                <div class="patient-number">{{ area.nowServing }}</div>
              } @else {
                <div class="patient-number empty">—</div>
              }
              @if (area.nextList.length) {
                <div class="next-section">
                  <div class="next-label">NEXT</div>
                  <div class="next-list">
                    @for (p of area.nextList; track $index) {
                      <div class="next-item">{{ p }}</div>
                    }
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Marquee -->
    @if (adText()) {
      <div class="kiosk-marquee" [class.footer-up]="!footerHidden()">
        <div class="marquee-inner">{{ adText() }}</div>
      </div>
    }

    <!-- Footer -->
    <div class="kiosk-footer" [class.hidden]="footerHidden()">
      <div class="footer-controls">
        <button class="sound-btn" [class.enabled]="soundEnabled()"
          (click)="toggleSound()">
          {{ soundEnabled() ? '🔔 Sound Enabled' : '🔇 Click to Enable Sound' }}
        </button>
        <button class="sound-btn" [class.enabled]="speechEnabled()"
          (click)="toggleSpeech()">
          {{ speechEnabled() ? '🗣️ Speech Enabled' : '🗣️ Enable Speech' }}
        </button>
        <button class="control-btn" (click)="toggleFooter()">⤢ Hide Panel</button>
        <button class="control-btn" (click)="toggleFullscreen()">
          {{ isFullscreen() ? '⤫ Exit Fullscreen' : '⛶ Fullscreen' }}
        </button>
      </div>
      <div class="footer-info">
        <strong>{{ messageCount() }}</strong> updates received
      </div>
    </div>

    <!-- Floating handle to bring back footer -->
    @if (footerHidden()) {
      <button class="footer-handle" (click)="toggleFooter()">⬆ Show Panel</button>
    }

    <!-- Hidden audio element -->
    <audio #notifAudio preload="auto" style="display:none">
      <source src="assets/new-notification.mp3" type="audio/mpeg">
    </audio>
  `,
  styles: [`
    :host {
      display: block;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      z-index: 9999;
      overflow: auto;
      background: #f8f9fa;
    }

    :host {
      --brand-green: #10b981;
      --brand-green-dark: #059669;
      --brand-green-light: #34d399;
      --brand-orange: #f97316;
      --brand-orange-dark: #ea580c;
      --text-dark: #1a1a1a;
      --text-muted: #6b7280;
      --border-light: #e5e7eb;
      --white: #ffffff;
    }

    .kiosk-container {
      min-height: 100vh;
      padding: 24px;
      padding-bottom: 100px;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      color: var(--text-dark);
    }

    /* ===== Header ===== */
    .kiosk-header {
      text-align: center;
      margin-bottom: 24px;
      padding: 20px;
      background: var(--white);
      border-radius: 16px;
      border: 1px solid var(--border-light);
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    }
    .kiosk-title-row {
      display: flex; align-items: center; justify-content: center; gap: 18px;
    }
    .kiosk-title-stack {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
    }
    .kiosk-logo {
      width: 120px; height: auto; border-radius: 8px;
      box-shadow: 0 6px 18px rgba(5,150,105,0.08); object-fit: cover;
    }
    .kiosk-title {
      font-size: 2.8rem; font-weight: 700; color: var(--brand-green-dark);
      margin: 0; letter-spacing: 0.2px;
    }
    .kiosk-subtitle {
      font-size: 1.25rem; color: var(--text-dark); margin: 0; font-weight: 600;
    }
    .kiosk-time {
      font-size: 2rem; color: var(--brand-orange); font-weight: 700;
      margin-top: 12px; font-variant-numeric: tabular-nums;
    }
    .kiosk-date {
      font-size: 1rem; color: var(--text-muted); margin-top: 6px; font-weight: 600;
    }

    /* ===== Status Bar ===== */
    .status-bar {
      display: flex; justify-content: center; gap: 32px;
      margin-bottom: 24px; flex-wrap: wrap;
    }
    .status-indicator {
      display: flex; align-items: center; gap: 8px; color: var(--text-muted);
      font-size: 1rem; background: var(--white); padding: 10px 20px;
      border-radius: 50px; border: 1px solid var(--border-light);
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .status-dot {
      width: 12px; height: 12px; border-radius: 50%;
      animation: pulse 2s infinite; display: inline-block;
    }
    .status-dot.connected {
      background: var(--brand-green); box-shadow: 0 0 12px var(--brand-green);
    }
    .status-dot.disconnected {
      background: #ef4444; box-shadow: 0 0 12px #ef4444; animation: none;
    }
    .status-dot.connecting {
      background: var(--brand-orange); box-shadow: 0 0 12px var(--brand-orange);
    }

    /* ===== Areas Grid ===== */
    .areas-grid {
      display: grid; grid-template-columns: repeat(5, 1fr);
      gap: 20px; max-width: 1800px; margin: 0 auto;
    }
    @media (max-width: 1400px) { .areas-grid { grid-template-columns: repeat(4, 1fr); } }
    @media (max-width: 1100px) { .areas-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 800px) { .areas-grid { grid-template-columns: repeat(2, 1fr); } }

    /* ===== Area Card ===== */
    .area-card {
      background: var(--white); border-radius: 16px; padding: 20px;
      border: 2px solid var(--border-light); transition: all 0.3s ease;
      position: relative; overflow: hidden;
      box-shadow: 0 4px 15px rgba(0,0,0,0.04);
    }
    .area-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
      background: var(--border-light); border-radius: 16px 16px 0 0;
    }
    .area-card.has-patients::before {
      background: linear-gradient(90deg, var(--brand-green), var(--brand-green-light));
    }
    .area-card.has-patients {
      border-color: var(--brand-green);
      box-shadow: 0 4px 20px rgba(16,185,129,0.15);
    }
    .area-card.highlight {
      animation: highlightPulse 1s ease;
    }

    .area-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 16px;
    }
    .area-name {
      font-size: 1.1rem; font-weight: 700; color: var(--text-dark);
      margin: 0; line-height: 1.3;
    }
    .area-count {
      background: #f8f9fa; color: var(--text-muted); font-size: 0.9rem;
      font-weight: 700; padding: 4px 12px; border-radius: 20px;
      min-width: 36px; text-align: center; border: 1px solid var(--border-light);
    }
    .area-count.active {
      background: linear-gradient(135deg, var(--brand-green), var(--brand-green-dark));
      color: var(--white); border-color: var(--brand-green);
      box-shadow: 0 4px 12px rgba(16,185,129,0.3);
    }

    .area-content { text-align: center; padding: 12px 0; }
    .now-serving-label {
      font-size: 0.85rem; color: var(--brand-orange); text-transform: uppercase;
      letter-spacing: 1px; margin-bottom: 8px; font-weight: 600;
    }
    .patient-number {
      font-size: 5rem; font-weight: 800; color: var(--text-muted);
      line-height: 1; margin-bottom: 8px; font-variant-numeric: tabular-nums;
    }
    .area-card.has-patients .patient-number { color: var(--text-dark); }
    .patient-number.empty { color: var(--border-light); font-size: 2rem; }

    .next-section {
      margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-light);
    }
    .next-label {
      font-size: 0.85rem; color: var(--brand-green); margin-bottom: 8px;
      text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700;
    }
    .next-list {
      display: grid; grid-template-columns: repeat(2, 1fr);
      gap: 8px; max-width: 260px; max-height: 220px;
      overflow: hidden; margin: 0 auto;
    }
    .next-item {
      background: linear-gradient(180deg, #f8fafc, #ffffff);
      color: var(--text-dark); padding: 8px 10px; border-radius: 8px;
      font-weight: 800; font-size: 1.05rem; text-align: center;
      box-shadow: 0 6px 18px rgba(2,6,23,0.06);
      font-variant-numeric: tabular-nums;
    }

    /* ===== Marquee ===== */
    .kiosk-marquee {
      position: fixed; left: 0; right: 0; bottom: 12px; z-index: 1150;
      width: 100%; overflow: hidden; white-space: nowrap;
      padding: 8px 16px;
      background: linear-gradient(90deg, rgba(16,185,129,0.06), rgba(11,61,145,0.03));
      border-radius: 8px 8px 0 0; max-width: 1600px; margin: 0 auto;
      font-weight: 700; color: #0b3d91; font-size: 1.25rem;
    }
    .kiosk-marquee.footer-up { bottom: 84px; }
    .marquee-inner {
      display: inline-block; padding-left: 100%; will-change: transform;
      animation: marqueeScroll 25s linear infinite;
    }

    /* ===== Footer ===== */
    .kiosk-footer {
      position: fixed; bottom: 0; left: 0; right: 0;
      background: var(--white); backdrop-filter: blur(10px);
      padding: 16px 24px; display: flex; justify-content: center;
      align-items: center; gap: 24px;
      border-top: 3px solid var(--brand-green);
      box-shadow: 0 -4px 20px rgba(0,0,0,0.05);
      transition: transform 0.3s ease, opacity 0.3s ease;
      z-index: 1200;
    }
    .kiosk-footer.hidden {
      transform: translateY(110%); opacity: 0; pointer-events: none;
    }
    .footer-controls {
      display: flex; gap: 12px; align-items: center;
    }
    .sound-btn {
      background: #f8f9fa; color: var(--text-muted);
      border: 2px solid var(--border-light); padding: 12px 24px;
      border-radius: 50px; font-size: 1rem; font-weight: 600;
      cursor: pointer; transition: all 0.3s ease;
    }
    .sound-btn:hover {
      background: var(--white); border-color: var(--brand-orange); color: var(--text-dark);
    }
    .sound-btn.enabled {
      background: linear-gradient(135deg, var(--brand-green), var(--brand-green-dark));
      color: var(--white); border-color: var(--brand-green);
      box-shadow: 0 4px 15px rgba(16,185,129,0.3);
    }
    .control-btn {
      background: transparent; color: var(--text-muted);
      border: 2px solid var(--border-light); padding: 10px 18px;
      border-radius: 50px; font-size: 0.95rem; font-weight: 600;
      cursor: pointer; transition: all 0.25s ease;
    }
    .control-btn:hover { background: #f5f5f5; color: var(--text-dark); }
    .footer-info { color: var(--text-muted); font-size: 0.95rem; }
    .footer-info strong { color: var(--brand-orange); }

    .footer-handle {
      position: fixed; bottom: 12px; right: 12px; z-index: 1200;
      padding: 10px 14px; border-radius: 999px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.12); background: var(--white);
      border: 2px solid var(--border-light); color: var(--text-muted);
      cursor: pointer; font-weight: 600;
    }

    /* ===== Animations ===== */
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.1); }
    }
    @keyframes highlightPulse {
      0% { transform: scale(1); box-shadow: 0 4px 15px rgba(0,0,0,0.04); }
      50% { transform: scale(1.02); box-shadow: 0 8px 40px rgba(249,115,22,0.3); border-color: var(--brand-orange); }
      100% { transform: scale(1); box-shadow: 0 4px 20px rgba(16,185,129,0.15); }
    }
    @keyframes marqueeScroll {
      0% { transform: translateX(0%); }
      100% { transform: translateX(-100%); }
    }

    /* ===== Landscape TV-optimized 5x2 ===== */
    @media (orientation: landscape) {
      .kiosk-container { display: flex; flex-direction: column; height: 100vh; padding: 12px; padding-bottom: 12px; }
      .kiosk-header { padding: 12px; margin-bottom: 12px; }
      .kiosk-title { font-size: 2.4rem; }
      .kiosk-subtitle { font-size: 1.15rem; }
      .kiosk-time { font-size: 1.4rem; margin-top: 8px; }
      .kiosk-date { font-size: 0.95rem; }
      .areas-grid {
        grid-template-columns: repeat(5, 1fr) !important;
        grid-template-rows: repeat(2, 1fr);
        gap: 12px; flex: 1 1 auto; overflow: hidden;
      }
      .area-card { padding: 12px; }
      .area-name { font-size: clamp(0.85rem, 1.4vw, 1.05rem); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .area-count { font-size: clamp(0.7rem, 1.2vw, 0.95rem); padding: 3px 8px; }
      .now-serving-label { font-size: clamp(0.65rem, 1.1vw, 0.9rem); }
      .patient-number { font-size: clamp(1rem, 4vw, 2.2rem); line-height: 1; }
      .patient-number.empty { font-size: clamp(0.9rem, 2.8vw, 1.4rem); }
      .next-section { font-size: clamp(0.7rem, 1.1vw, 0.9rem); }
    }
  `]
})
export class KioskComponent implements OnInit, OnDestroy {
  private cfg = inject(AppConfigService);

  // --- Signals ---
  areas = signal<AreaDisplay[]>([]);
  adText = signal('');
  currentTime = signal('');
  currentDate = signal('');
  connectionStatus = signal<'connected' | 'connecting' | 'disconnected'>('connecting');
  connectionLabel = signal('Connecting...');
  lastUpdateTime = signal('Waiting for data...');
  soundEnabled = signal(false);
  speechEnabled = signal(false);
  footerHidden = signal(false);
  isFullscreen = signal(false);
  messageCount = signal(0);
  highlightedArea = signal('');

  private timer: any;
  private eventSource: EventSource | null = null;
  private lastAreas: Record<string, string[]> = {};
  private lastShownPatients: Record<string, string> = {};
  private audioCtx: AudioContext | null = null;
  private audioBuffer: AudioBuffer | null = null;
  private speechQueue: string[] = [];
  private isSpeaking = false;

  ngOnInit() {
    this.updateTime();
    this.timer = setInterval(() => this.updateTime(), 1000);
    this.restoreState();
    this.loadKiosk();
    this.connectSSE();
    this.initAudio();
    document.addEventListener('fullscreenchange', this.onFsChange);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
    this.eventSource?.close();
    document.removeEventListener('fullscreenchange', this.onFsChange);
  }

  // ===== Time =====
  private updateTime() {
    const now = new Date();
    this.currentTime.set(now.toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }));
    this.currentDate.set(now.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    }));
  }

  // ===== Data =====
  private loadKiosk() {
    fetch(`${this.cfg.apiUrl}/reception/kiosk`)
      .then(r => r.json())
      .then((res: any) => this.processData(res))
      .catch(() => {});
  }

  private processData(res: any) {
    const areaData: Record<string, string[]> = res.areas || {};
    const displayAreas: AreaDisplay[] = [];

    for (const [name, patients] of Object.entries(areaData)) {
      const patientList = patients as string[];
      const shortCodes = patientList.map(c => this.shortCode(c));
      displayAreas.push({
        name,
        count: patientList.length,
        nowServing: shortCodes[0] || '',
        nextList: shortCodes.slice(1, 11),
      });
    }

    // Detect changes for sound & speech
    const hasChanges = Object.keys(this.lastAreas).length > 0 &&
      JSON.stringify(areaData) !== JSON.stringify(this.lastAreas);

    if (hasChanges) {
      this.playNotificationSound();
      this.announceChanges(areaData);
    }

    this.lastAreas = areaData;
    this.areas.set(displayAreas);
    if (res.ad) this.adText.set(res.ad);
    this.lastUpdateTime.set('Updated: ' + new Date().toLocaleTimeString());
  }

  private shortCode(code: string): string {
    if (!code) return '—';
    return code.includes('-') ? code.split('-').pop() || code : code;
  }

  // ===== SSE =====
  private connectSSE() {
    this.eventSource = new EventSource(`${this.cfg.apiUrl}/reception/events`);
    this.eventSource.onopen = () => {
      this.connectionStatus.set('connected');
      this.connectionLabel.set('🟢 Live Connected');
    };
    this.eventSource.onmessage = () => {
      this.messageCount.update(c => c + 1);
      this.loadKiosk();
    };
    this.eventSource.onerror = () => {
      this.connectionStatus.set('disconnected');
      this.connectionLabel.set('🔴 Disconnected - Reconnecting...');
      setTimeout(() => {
        this.eventSource?.close();
        this.connectSSE();
      }, 3000);
    };
  }

  // ===== Sound =====
  private async initAudio() {
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AC();
      const resp = await fetch('assets/new-notification.mp3');
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        this.audioCtx!.decodeAudioData(buf, decoded => { this.audioBuffer = decoded; });
      }
    } catch (e) { /* ignore */ }
  }

  private playNotificationSound() {
    if (!this.soundEnabled()) return;
    if (this.audioCtx && this.audioBuffer) {
      try {
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        const src = this.audioCtx.createBufferSource();
        src.buffer = this.audioBuffer;
        const gain = this.audioCtx.createGain();
        gain.gain.value = 0.45;
        src.connect(gain);
        gain.connect(this.audioCtx.destination);
        src.start(0);
        return;
      } catch (e) { /* fallback below */ }
    }
    const el = document.querySelector('audio') as HTMLAudioElement;
    if (el) { el.volume = 0.45; el.currentTime = 0; el.play().catch(() => {}); }
  }

  toggleSound() {
    if (!this.soundEnabled()) {
      if (this.audioCtx?.state === 'suspended') this.audioCtx.resume();
      this.soundEnabled.set(true);
      setTimeout(() => this.playNotificationSound(), 100);
    } else {
      this.soundEnabled.set(false);
    }
  }

  // ===== Speech =====
  private announceChanges(newAreas: Record<string, string[]>) {
    for (const [area, patients] of Object.entries(newAreas)) {
      const pats = patients as string[];
      if (!pats.length) {
        this.lastShownPatients[area] = '';
        continue;
      }
      const nowCode = this.shortCode(pats[0]);
      const prev = this.lastShownPatients[area] || '';
      if (nowCode && nowCode !== prev) {
        this.lastShownPatients[area] = nowCode;
        const areaLower = area.toLowerCase();
        if (areaLower.includes('releas')) continue;

        const spokenNum = String(parseInt(nowCode.replace(/\D/g, ''), 10) || nowCode);
        let msg: string;
        if (areaLower.includes('doctor')) {
          const docName = area.replace(/Doctor'?s?\s*Check-?up\s*-?\s*/i, '').trim();
          msg = `Now serving Patient ${spokenNum} please proceed to Doctor ${docName} for Check-up`;
        } else {
          msg = `Now serving Patient ${spokenNum} please proceed to ${area}`;
        }
        this.enqueueSpeech(msg);

        this.highlightedArea.set(area);
        setTimeout(() => this.highlightedArea.set(''), 1200);
      }
    }
  }

  private enqueueSpeech(text: string) {
    if (!this.speechEnabled()) return;
    this.speechQueue.push(text);
    this.processSpeechQueue();
  }

  private async processSpeechQueue() {
    if (this.isSpeaking) return;
    const next = this.speechQueue.shift();
    if (!next) return;
    this.isSpeaking = true;

    try {
      if ('speechSynthesis' in window) {
        await new Promise<void>((resolve) => {
          const utter = new SpeechSynthesisUtterance(next);
          utter.rate = 0.6;
          utter.pitch = 1;
          utter.volume = 1.0;
          try {
            const voices = window.speechSynthesis.getVoices() || [];
            const prefer = voices.find(v => /female|zira|amy|samantha|google/i.test(v.name || ''))
              || voices.find(v => v.lang?.startsWith('en'))
              || voices[0];
            if (prefer) utter.voice = prefer;
          } catch (e) { /* ignore */ }
          utter.onend = () => resolve();
          utter.onerror = () => resolve();
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
        });
      }
    } catch (e) { /* ignore */ }

    this.isSpeaking = false;
    setTimeout(() => this.processSpeechQueue(), 120);
  }

  toggleSpeech() {
    this.speechEnabled.update(v => !v);
    try { localStorage.setItem('kioskSpeechEnabled', this.speechEnabled() ? '1' : '0'); } catch (e) {}
    if (this.speechEnabled()) {
      this.enqueueSpeech('Welcome');
    }
  }

  // ===== Footer =====
  toggleFooter() {
    this.footerHidden.update(v => !v);
    try { localStorage.setItem('kioskFooterHidden', this.footerHidden() ? '1' : '0'); } catch (e) {}
  }

  // ===== Fullscreen =====
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  private onFsChange = () => {
    this.isFullscreen.set(!!document.fullscreenElement);
  };

  // ===== Restore persisted state =====
  private restoreState() {
    try {
      if (localStorage.getItem('kioskFooterHidden') === '1') this.footerHidden.set(true);
      if (localStorage.getItem('kioskSpeechEnabled') === '1') this.speechEnabled.set(true);
    } catch (e) { /* ignore */ }
  }
}
