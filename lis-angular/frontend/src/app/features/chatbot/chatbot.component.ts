import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatbotService } from '../../core/services/chatbot.service';
import { ToastService } from '../../shared/services/toast.service';
import { ChatConversation, ChatMessage, ChatModelOption } from '../../core/models';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="chatbot-layout">
      <!-- Conversations Sidebar -->
      <aside class="chat-sidebar">
        <div class="sidebar-header">
          <button type="button" class="btn btn-primary btn-block" (click)="newConversation()">
            <i class="fa fa-plus"></i> New Discussion
          </button>
        </div>
        <div class="conv-list">
          @for (conv of conversations(); track conv.id) {
            <div class="conv-item" [class.active]="currentConvId() === conv.id" (click)="selectConversation(conv.id)">
              <div class="conv-title"><i class="fa fa-comment-dots"></i> {{ conv.title }}</div>
              <button type="button" class="del-btn" (click)="deleteConversation(conv.id, $event)">×</button>
            </div>
          }
          @if (conversations().length === 0) {
            <div class="empty-conv">No previous discussions.</div>
          }
        </div>
      </aside>

      <!-- Main Chat Area -->
      <main class="chat-main">
        <header class="chat-header">
          <div class="bot-info">
            <div class="bot-avatar">🤖</div>
            <div>
              <h2>GezyneBot AI Assistant</h2>
              <div class="bot-status">Clinical Laboratory &amp; Consultation Intelligence</div>
            </div>
          </div>
          <div class="model-picker">
            <label>Model:</label>
            <select class="form-control form-control-sm" [(ngModel)]="selectedModel">
              @for (m of models(); track m.id) {
                <option [value]="m.id">{{ m.name }}</option>
              }
            </select>
          </div>
        </header>

        <!-- Message Stream -->
        <div class="messages-container" #scrollArea>
          <!-- Welcome message if empty -->
          @if (messages().length === 0) {
            <div class="welcome-box">
              <div class="welcome-icon">🩺</div>
              <h3>Welcome to GezyneBot AI</h3>
              <p>Your comprehensive assistant for clinical outpatient consultations, DOH PhilPEN guidelines, laboratory panic values, tube order of draw, and Westgard quality control rules.</p>

              <div class="chips-grid">
                @for (chip of quickChips; track chip.label) {
                  <button type="button" class="quick-chip" (click)="sendPreset(chip.query)">
                    <span class="chip-icon">{{ chip.icon }}</span>
                    <span>{{ chip.label }}</span>
                  </button>
                }
              </div>
            </div>
          }

          @for (msg of messages(); track msg.id) {
            <div class="msg-row" [class.msg-user]="msg.role === 'user'" [class.msg-bot]="msg.role === 'assistant'">
              <div class="msg-bubble">
                <div class="msg-header">
                  <strong>{{ msg.role === 'user' ? 'You' : 'GezyneBot' }}</strong>
                  <span class="msg-time">{{ msg.created_at | date:'shortTime' }}</span>
                </div>
                <div class="msg-text" [innerHTML]="formatMessage(msg.content)"></div>
                @if (msg.sources) {
                  <div class="msg-source">Engine: {{ msg.sources }}</div>
                }
              </div>
            </div>
          }

          @if (thinking()) {
            <div class="msg-row msg-bot">
              <div class="msg-bubble thinking-bubble">
                <span>🤖 GezyneBot is analyzing...</span>
                <div class="dot-flashing"></div>
              </div>
            </div>
          }
        </div>

        <!-- Composer Box -->
        <footer class="chat-composer">
          <textarea
            class="form-control composer-textarea"
            rows="2"
            [(ngModel)]="inputText"
            (keydown.enter)="handleEnter($event)"
            placeholder="Ask GezyneBot about clinical consultation, SOAP, DOH BMI cutoffs, panic values, equipment QC... (Press Enter to send)"
          ></textarea>
          <button type="button" class="btn btn-primary send-btn" [disabled]="thinking() || !inputText.trim()" (click)="sendMessage()">
            <i class="fa fa-paper-plane"></i>
          </button>
        </footer>
      </main>
    </div>
  `,
  styles: [`
    .chatbot-layout {
      display: flex;
      height: calc(100vh - 65px);
      background: #f8fafc;
      font-family: 'Inter', sans-serif;
    }

    /* Sidebar */
    .chat-sidebar {
      width: 280px;
      background: white;
      border-right: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
    }

    .sidebar-header {
      padding: 1rem;
      border-bottom: 1px solid #e2e8f0;
    }

    .btn-block { width: 100%; justify-content: center; }

    .conv-list {
      flex: 1;
      overflow-y: auto;
      padding: 0.5rem;
    }

    .conv-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 0.85rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.85rem;
      color: #334155;
      margin-bottom: 4px;
      transition: background 0.15s ease;
    }

    .conv-item:hover { background: #f1f5f9; }
    .conv-item.active { background: #e0f2fe; color: #0284c7; font-weight: 600; }

    .conv-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .del-btn {
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 1.1rem;
      padding: 0 4px;
    }

    .del-btn:hover { color: #ef4444; }

    /* Main Area */
    .chat-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: white;
    }

    .chat-header {
      padding: 0.85rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fafafa;
    }

    .bot-info {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }

    .bot-avatar {
      font-size: 1.8rem;
    }

    .bot-info h2 {
      font-size: 1.15rem;
      margin: 0;
      font-weight: 700;
      color: #0f172a;
    }

    .bot-status {
      font-size: 0.75rem;
      color: #10b981;
      font-weight: 600;
    }

    .model-picker {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
    }

    /* Messages */
    .messages-container {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .msg-row {
      display: flex;
    }

    .msg-user { justify-content: flex-end; }
    .msg-bot { justify-content: flex-start; }

    .msg-bubble {
      max-width: 75%;
      padding: 1rem 1.25rem;
      border-radius: 12px;
      font-size: 0.9rem;
      line-height: 1.6;
    }

    .msg-user .msg-bubble {
      background: #10b981;
      color: white;
      border-bottom-right-radius: 2px;
    }

    .msg-bot .msg-bubble {
      background: #f1f5f9;
      color: #1e293b;
      border-bottom-left-radius: 2px;
    }

    .msg-header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      font-size: 0.75rem;
      margin-bottom: 0.35rem;
      opacity: 0.8;
    }

    .msg-source {
      font-size: 0.7rem;
      color: #64748b;
      margin-top: 0.5rem;
      border-top: 1px solid rgba(0,0,0,0.06);
      padding-top: 0.25rem;
    }

    /* Welcome state */
    .welcome-box {
      margin: auto;
      text-align: center;
      max-width: 600px;
      padding: 2rem;
    }

    .welcome-icon { font-size: 3rem; margin-bottom: 0.5rem; }
    .welcome-box h3 { font-size: 1.4rem; color: #0f172a; margin-bottom: 0.5rem; }
    .welcome-box p { color: #64748b; font-size: 0.9rem; line-height: 1.5; margin-bottom: 1.5rem; }

    .chips-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    .quick-chip {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-size: 0.85rem;
      color: #334155;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 0.65rem;
      transition: all 0.2s ease;
    }

    .quick-chip:hover {
      border-color: #10b981;
      background: #f0fdf4;
      color: #15803d;
    }

    .chip-icon { font-size: 1.2rem; }

    /* Composer */
    .chat-composer {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      background: white;
      display: flex;
      gap: 0.75rem;
      align-items: flex-end;
    }

    .composer-textarea {
      flex: 1;
      resize: none;
      padding: 0.75rem 1rem;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 0.9rem;
      font-family: inherit;
    }

    .composer-textarea:focus {
      outline: none;
      border-color: #10b981;
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
    }

    .send-btn {
      height: 52px;
      padding: 0 1.5rem;
    }

    /* Buttons & Controls */
    .btn {
      padding: 0.65rem 1.25rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: none;
    }

    .btn-primary { background: #10b981; color: white; }
    .btn-primary:hover { background: #059669; }

    .empty-conv {
      text-align: center;
      padding: 2rem 1rem;
      color: #94a3b8;
      font-size: 0.85rem;
    }
  `]
})
export class ChatbotComponent implements OnInit {
  private chatService = inject(ChatbotService);
  private toast = inject(ToastService);

  conversations = signal<ChatConversation[]>([]);
  messages = signal<ChatMessage[]>([]);
  models = signal<ChatModelOption[]>([]);
  currentConvId = signal<string | null>(null);
  thinking = signal<boolean>(false);

  selectedModel = 'openai/gpt-4o-mini';
  inputText = '';

  quickChips = [
    { label: 'Clinical Consultation & SOAP', icon: '🩺', query: 'How do I document outpatient visits using the SOAP format and generate official medical charts?' },
    { label: 'DOH BMI & PhilPEN Rules', icon: '⚖️', query: 'What are the Philippine DOH PhilPEN adult BMI classifications and smoking pack-years calculation?' },
    { label: 'Phlebotomy Order of Draw', icon: '🧪', query: 'What is the standard phlebotomy order of draw for blood collection tubes?' },
    { label: 'Equipment & Westgard QC', icon: '🔬', query: 'Explain the Westgard multirules used in the equipment quality control module.' }
  ];

  ngOnInit(): void {
    this.chatService.getModels().subscribe({
      next: (m) => {
        this.models.set(m);
        if (m.length > 0) this.selectedModel = m[0].id;
      }
    });
    this.loadConversations();
  }

  loadConversations(): void {
    this.chatService.getConversations().subscribe({
      next: (res) => this.conversations.set(res),
      error: () => {}
    });
  }

  selectConversation(id: string): void {
    this.currentConvId.set(id);
    this.chatService.getConversation(id).subscribe({
      next: (conv) => {
        this.messages.set(conv.messages || []);
      }
    });
  }

  newConversation(): void {
    this.currentConvId.set(null);
    this.messages.set([]);
  }

  deleteConversation(id: string, e: Event): void {
    e.stopPropagation();
    this.chatService.deleteConversation(id).subscribe({
      next: () => {
        this.loadConversations();
        if (this.currentConvId() === id) {
          this.newConversation();
        }
      }
    });
  }

  handleEnter(e: any): void {
    if (!e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  sendPreset(query: string): void {
    this.inputText = query;
    this.sendMessage();
  }

  sendMessage(): void {
    const text = this.inputText.trim();
    if (!text || this.thinking()) return;

    this.inputText = '';
    this.thinking.set(true);

    this.chatService.sendMessage({
      conversation_id: this.currentConvId() || undefined,
      content: text,
      model: this.selectedModel,
    }).subscribe({
      next: (res) => {
        this.thinking.set(false);
        this.currentConvId.set(res.conversation_id);
        this.messages.update(m => [...m, res.user_message, res.assistant_message]);
        this.loadConversations();
      },
      error: (err) => {
        this.thinking.set(false);
        this.toast.error(err?.error?.error || 'Failed to get AI response');
      }
    });
  }

  formatMessage(text: string): string {
    if (!text) return '';
    // Basic Markdown styling replacements
    return text
      .replace(/### (.*?)\n/g, '<h4 style="margin: 8px 0; color: #0f172a; font-weight:700;">$1</h4>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  }
}
