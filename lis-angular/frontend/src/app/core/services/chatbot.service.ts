import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChatConversation, ChatMessage, ChatModelOption } from '../models';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class ChatbotService {
  private get apiUrl() { return `${this.config.apiUrl}/chatbot`; }

  constructor(private http: HttpClient, private config: AppConfigService) {}

  getModels(): Observable<ChatModelOption[]> {
    return this.http.get<ChatModelOption[]>(`${this.apiUrl}/models`);
  }

  getConversations(): Observable<ChatConversation[]> {
    return this.http.get<ChatConversation[]>(`${this.apiUrl}/conversations`);
  }

  getConversation(id: string): Observable<ChatConversation> {
    return this.http.get<ChatConversation>(`${this.apiUrl}/conversations/${id}`);
  }

  createConversation(data: { title?: string; model?: string }): Observable<ChatConversation> {
    return this.http.post<ChatConversation>(`${this.apiUrl}/conversations`, data);
  }

  deleteConversation(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/conversations/${id}`);
  }

  sendMessage(data: {
    conversation_id?: string;
    content: string;
    model?: string;
  }): Observable<{
    conversation_id: string;
    user_message: ChatMessage;
    assistant_message: ChatMessage;
    model: string;
    offlineFallback?: boolean;
  }> {
    return this.http.post<any>(`${this.apiUrl}/message`, data);
  }
}
