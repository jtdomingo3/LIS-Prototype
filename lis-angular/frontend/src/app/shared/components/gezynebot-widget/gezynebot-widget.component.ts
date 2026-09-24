import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatbotService } from '../../../core/services/chatbot.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-gezynebot-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (auth.isAuthenticated()) {
      <div class="gezynebot-widget-container">
        <!-- Floating Launcher Button -->
        <button
          type="button"
          class="gezynebot-launcher"
          [class.active]="isOpen()"
          (click)="toggleOpen()"
          title="GezyneBot AI Clinical Assistant"
        >
          <span class="launcher-icon">🤖</span>
          <span class="badge-pulse"></span>
        </button>

        <!-- Floating Chat Panel -->
        @if (isOpen()) {
          <div class="gezynebot-panel">
            <header class="panel-header">
              <div class="header-left">
                <span class="panel-avatar">🤖</span>
                <div>
                  <div class="panel-title">GezyneBot AI</div>
                  <div class="panel-subtitle">Clinical LIS Assistant</div>
                </div>
              </div>
              <div class="header-actions">
                <button type="button" class="btn-icon" (click)="maximize()" title="Maximize to full page">
                  <i class="fa fa-expand"></i>
                </button>
                <button type="button" class="btn-icon" (click)="toggleOpen()" title="Close chat">
                  <i class="fa fa-times"></i>
                </button>
              </div>
            </header>

            <!-- Quick Suggestion Chips -->
            <div class="chips-container">
              <button type="button" class="chip" (click)="sendQuery('How do I document doctor visits and print SOAP charts?')">🩺 Consultation</button>
              <button type="button" class="chip" (click)="sendQuery('What are the DOH PhilPEN BMI cutoffs?')">⚖️ DOH BMI</button>
              <button type="button" class="chip" (click)="sendQuery('What is the tube order of draw?')">🧪 Tubes</button>
              <button type="button" class="chip" (click)="sendQuery('What are laboratory critical panic values?')">🚨 Panic Values</button>
            </div>

            <!-- Messages Stream -->
            <div class="panel-messages" #scrollBox>
              @for (msg of messages(); track $index) {
                <div class="chat-bubble" [class.user-bubble]="msg.role === 'user'" [class.bot-bubble]="msg.role === 'assistant'">
                  <div [innerHTML]="formatMessage(msg.content)"></div>
                </div>
              }
              @if (thinking()) {
                <div class="chat-bubble bot-bubble thinking">
                  <span>GezyneBot is thinking...</span>
                </div>
              }
            </div>

            <!-- Composer Input -->
            <footer class="panel-composer">
              <input
                type="text"
                class="composer-input"
                [(ngModel)]="inputText"
                (keydown.enter)="submitMessage()"
                placeholder="Ask GezyneBot anything..."
              />
              <button type="button" class="composer-send" [disabled]="thinking() || !inputText.trim()" (click)="submitMessage()">
                <i class="fa fa-paper-plane"></i>
              </button>
            </footer>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .gezynebot-widget-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      font-family: 'Inter', sans-serif;
    }

    .gezynebot-launcher {
      width: 58px;
      height: 58px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10b981 0%, #047857 100%);
      color: white;
      border: none;
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.45);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.6rem;
      position: relative;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .gezynebot-launcher:hover {
      transform: scale(1.08);
      box-shadow: 0 12px 28px rgba(16, 185, 129, 0.55);
    }

    .badge-pulse {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 14px;
      height: 14px;
      background: #22c55e;
      border: 2px solid white;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
      100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
    }

    /* Panel */
    .gezynebot-panel {
      position: absolute;
      bottom: 70px;
      right: 0;
      width: 380px;
      height: 520px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 15px 45px rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      animation: slideUp 0.25s ease-out;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .panel-header {
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: white;
      padding: 1rem 1.25rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .panel-avatar { font-size: 1.5rem; }
    .panel-title { font-weight: 700; font-size: 0.95rem; }
    .panel-subtitle { font-size: 0.75rem; color: #10b981; }

    .header-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn-icon {
      background: rgba(255,255,255,0.1);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
    }

    .btn-icon:hover { background: rgba(255,255,255,0.2); }

    .chips-container {
      display: flex;
      gap: 0.4rem;
      padding: 0.65rem 0.85rem;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      overflow-x: auto;
      white-space: nowrap;
    }

    .chip {
      background: white;
      border: 1px solid #cbd5e1;
      padding: 0.35rem 0.65rem;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      color: #334155;
      cursor: pointer;
    }

    .chip:hover { border-color: #10b981; color: #10b981; }

    .panel-messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .chat-bubble {
      max-width: 85%;
      padding: 0.65rem 0.95rem;
      border-radius: 10px;
      font-size: 0.85rem;
      line-height: 1.45;
    }

    .user-bubble {
      background: #10b981;
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 2px;
    }

    .bot-bubble {
      background: #f1f5f9;
      color: #1e293b;
      align-self: flex-start;
      border-bottom-left-radius: 2px;
    }

    .thinking { font-style: italic; color: #64748b; }

    .panel-composer {
      padding: 0.75rem 1rem;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 0.5rem;
      background: white;
    }

    .composer-input {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 20px;
      padding: 0.5rem 0.85rem;
      font-size: 0.85rem;
      outline: none;
    }

    .composer-input:focus { border-color: #10b981; }

    .composer-send {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #10b981;
      color: white;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .composer-send:disabled { background: #94a3b8; cursor: not-allowed; }
  `]
})
export class GezynebotWidgetComponent {
  auth = inject(AuthService);
  private chatService = inject(ChatbotService);
  private router = inject(Router);

  isOpen = signal<boolean>(false);
  thinking = signal<boolean>(false);
  inputText = '';

  messages = signal<{ role: string; content: string }[]>([
    {
      role: 'assistant',
      content: '👋 Hello! I am **GezyneBot**, your clinical and laboratory assistant. Ask me about doctor visits, SOAP notes, DOH BMI cutoffs, panic values, or equipment QC!'
    }
  ]);

  toggleOpen(): void {
    this.isOpen.update(v => !v);
  }

  maximize(): void {
    this.isOpen.set(false);
    this.router.navigate(['/chatbot']);
  }

  sendQuery(query: string): void {
    this.inputText = query;
    this.submitMessage();
  }

  submitMessage(): void {
    const text = this.inputText.trim();
    if (!text || this.thinking()) return;

    this.inputText = '';
    this.messages.update(m => [...m, { role: 'user', content: text }]);
    this.thinking.set(true);

    this.chatService.sendMessage({ content: text }).subscribe({
      next: (res) => {
        this.thinking.set(false);
        this.messages.update(m => [...m, { role: 'assistant', content: res.assistant_message.content }]);
      },
      error: () => {
        this.thinking.set(false);
        this.messages.update(m => [...m, {
          role: 'assistant',
          content: '⚠️ Unable to connect to GezyneBot service right now. Please try again shortly.'
        }]);
      }
    });
  }

  formatMessage(text: string): string {
    if (!text) return '';
    return text
      .replace(/### (.*?)\n/g, '<strong style="color:#0f172a; display:block; margin:4px 0;">$1</strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  }
}
