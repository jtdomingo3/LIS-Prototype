import { getDb } from '../db/connection';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
  id: string;
  conversation_id: string;
  user_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: string | null;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  user_id: string | null;
  title: string;
  last_model: string;
  created_at: string;
  updated_at: string;
  messages?: ChatMessage[];
}

export const ChatbotModel = {
  findConversations(userId?: string): ChatConversation[] {
    const db = getDb();
    let query = 'SELECT * FROM chatbot_conversations';
    const params: any[] = [];
    if (userId) {
      query += ' WHERE user_id = ?';
      params.push(userId);
    }
    query += ' ORDER BY updated_at DESC';
    return db.prepare(query).all(...params) as ChatConversation[];
  },

  findConversationById(id: string): ChatConversation | null {
    const db = getDb();
    const conv = db.prepare('SELECT * FROM chatbot_conversations WHERE id = ?').get(id) as ChatConversation | undefined;
    if (!conv) return null;
    conv.messages = db.prepare('SELECT * FROM chatbot_messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id) as ChatMessage[];
    return conv;
  },

  createConversation(data: { user_id?: string | null; title?: string; last_model?: string }): ChatConversation {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO chatbot_conversations (id, user_id, title, last_model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.user_id || null,
      data.title || 'New Conversation',
      data.last_model || 'openai/gpt-4o-mini',
      now,
      now
    );

    return this.findConversationById(id)!;
  },

  addMessage(data: {
    conversation_id: string;
    user_id?: string | null;
    role: 'user' | 'assistant' | 'system';
    content: string;
    sources?: string | null;
  }): ChatMessage {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO chatbot_messages (id, conversation_id, user_id, role, content, sources, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      data.conversation_id,
      data.user_id || null,
      data.role,
      data.content,
      data.sources || null,
      now
    );

    // Update conversation updated_at
    db.prepare('UPDATE chatbot_conversations SET updated_at = ? WHERE id = ?').run(now, data.conversation_id);

    return db.prepare('SELECT * FROM chatbot_messages WHERE id = ?').get(id) as ChatMessage;
  },

  deleteConversation(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM chatbot_conversations WHERE id = ?').run(id);
    return result.changes > 0;
  }
};
