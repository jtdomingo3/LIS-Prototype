"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const Chatbot_1 = require("../models/Chatbot");
const gezyneBotService_1 = require("../services/gezyneBotService");
const router = (0, express_1.Router)();
// Get available AI models
router.get('/models', auth_1.requireAuth, (_req, res) => {
    res.json(gezyneBotService_1.AVAILABLE_MODELS);
});
// List conversations
router.get('/conversations', auth_1.requireAuth, (req, res) => {
    try {
        const userId = req.user ? req.user.userId : undefined;
        const convs = Chatbot_1.ChatbotModel.findConversations(userId);
        res.json(convs);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get conversation with messages
router.get('/conversations/:id', auth_1.requireAuth, (req, res) => {
    try {
        const conv = Chatbot_1.ChatbotModel.findConversationById(req.params.id);
        if (!conv) {
            res.status(404).json({ error: 'Conversation not found' });
            return;
        }
        res.json(conv);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Create new conversation
router.post('/conversations', auth_1.requireAuth, (req, res) => {
    try {
        const userId = req.user ? req.user.userId : null;
        const conv = Chatbot_1.ChatbotModel.createConversation({
            user_id: userId,
            title: req.body.title || 'New Conversation',
            last_model: req.body.model,
        });
        res.status(201).json(conv);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Delete conversation
router.delete('/conversations/:id', auth_1.requireAuth, (req, res) => {
    try {
        const ok = Chatbot_1.ChatbotModel.deleteConversation(req.params.id);
        if (!ok) {
            res.status(404).json({ error: 'Conversation not found' });
            return;
        }
        res.json({ message: 'Conversation deleted' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Send message & get AI response
router.post('/message', auth_1.requireAuth, async (req, res) => {
    try {
        const { conversation_id, content, model } = req.body;
        if (!content || !content.trim()) {
            res.status(400).json({ error: 'Message content is required' });
            return;
        }
        const userId = req.user ? req.user.userId : null;
        let convId = conversation_id;
        if (!convId) {
            // Auto-create conversation titled with first few words of question
            const title = content.trim().slice(0, 35) + (content.length > 35 ? '...' : '');
            const conv = Chatbot_1.ChatbotModel.createConversation({
                user_id: userId,
                title,
                last_model: model,
            });
            convId = conv.id;
        }
        // Save user message
        const userMsg = Chatbot_1.ChatbotModel.addMessage({
            conversation_id: convId,
            user_id: userId,
            role: 'user',
            content: content.trim(),
        });
        // Build chat history for context
        const fullConv = Chatbot_1.ChatbotModel.findConversationById(convId);
        const messagesHistory = (fullConv?.messages || []).map(m => ({
            role: m.role,
            content: m.content,
        }));
        // Call GezyneBot AI service
        const aiResult = await (0, gezyneBotService_1.askGezyneBot)(messagesHistory, model);
        // Save assistant reply
        const assistantMsg = Chatbot_1.ChatbotModel.addMessage({
            conversation_id: convId,
            user_id: null,
            role: 'assistant',
            content: aiResult.answer,
            sources: aiResult.model,
        });
        res.json({
            conversation_id: convId,
            user_message: userMsg,
            assistant_message: assistantMsg,
            model: aiResult.model,
            offlineFallback: aiResult.offlineFallback,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=chatbot.js.map