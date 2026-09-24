"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatbotModel = void 0;
const connection_1 = require("../db/connection");
const uuid_1 = require("uuid");
exports.ChatbotModel = {
    findConversations(userId) {
        const db = (0, connection_1.getDb)();
        let query = 'SELECT * FROM chatbot_conversations';
        const params = [];
        if (userId) {
            query += ' WHERE user_id = ?';
            params.push(userId);
        }
        query += ' ORDER BY updated_at DESC';
        return db.prepare(query).all(...params);
    },
    findConversationById(id) {
        const db = (0, connection_1.getDb)();
        const conv = db.prepare('SELECT * FROM chatbot_conversations WHERE id = ?').get(id);
        if (!conv)
            return null;
        conv.messages = db.prepare('SELECT * FROM chatbot_messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id);
        return conv;
    },
    createConversation(data) {
        const db = (0, connection_1.getDb)();
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO chatbot_conversations (id, user_id, title, last_model, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.user_id || null, data.title || 'New Conversation', data.last_model || 'openai/gpt-4o-mini', now, now);
        return this.findConversationById(id);
    },
    addMessage(data) {
        const db = (0, connection_1.getDb)();
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO chatbot_messages (id, conversation_id, user_id, role, content, sources, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.conversation_id, data.user_id || null, data.role, data.content, data.sources || null, now);
        // Update conversation updated_at
        db.prepare('UPDATE chatbot_conversations SET updated_at = ? WHERE id = ?').run(now, data.conversation_id);
        return db.prepare('SELECT * FROM chatbot_messages WHERE id = ?').get(id);
    },
    deleteConversation(id) {
        const db = (0, connection_1.getDb)();
        const result = db.prepare('DELETE FROM chatbot_conversations WHERE id = ?').run(id);
        return result.changes > 0;
    }
};
//# sourceMappingURL=Chatbot.js.map