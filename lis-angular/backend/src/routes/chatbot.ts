import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { ChatbotModel } from '../models/Chatbot';
import { askGezyneBot, AVAILABLE_MODELS } from '../services/gezyneBotService';

const router = Router();

// Get available AI models
router.get('/models', requireAuth, (_req: Request, res: Response) => {
  res.json(AVAILABLE_MODELS);
});

// List conversations
router.get('/conversations', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = req.user ? req.user.userId : undefined;
    const convs = ChatbotModel.findConversations(userId);
    res.json(convs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get conversation with messages
router.get('/conversations/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const conv = ChatbotModel.findConversationById(req.params.id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json(conv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create new conversation
router.post('/conversations', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = req.user ? req.user.userId : null;
    const conv = ChatbotModel.createConversation({
      user_id: userId,
      title: req.body.title || 'New Conversation',
      last_model: req.body.model,
    });
    res.status(201).json(conv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete conversation
router.delete('/conversations/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const ok = ChatbotModel.deleteConversation(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    res.json({ message: 'Conversation deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send message & get AI response
router.post('/message', requireAuth, async (req: Request, res: Response) => {
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
      const conv = ChatbotModel.createConversation({
        user_id: userId,
        title,
        last_model: model,
      });
      convId = conv.id;
    }

    // Save user message
    const userMsg = ChatbotModel.addMessage({
      conversation_id: convId,
      user_id: userId,
      role: 'user',
      content: content.trim(),
    });

    // Build chat history for context
    const fullConv = ChatbotModel.findConversationById(convId);
    const messagesHistory = (fullConv?.messages || []).map(m => ({
      role: m.role,
      content: m.content,
    }));

    // Call GezyneBot AI service
    const aiResult = await askGezyneBot(messagesHistory, model);

    // Save assistant reply
    const assistantMsg = ChatbotModel.addMessage({
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Main query endpoint (alias matching fullstack /api/chatbot/query)
router.post('/query', requireAuth, async (req: Request, res: Response) => {
  try {
    const { question, content, conversationId, conversation_id, model } = req.body;
    const queryText = (question || content || '').trim();
    if (!queryText) {
      res.status(400).json({ success: false, error: 'Question is required' });
      return;
    }

    const userId = req.user ? req.user.userId : null;
    let convId = conversationId || conversation_id;

    if (!convId) {
      const title = queryText.slice(0, 35) + (queryText.length > 35 ? '...' : '');
      const conv = ChatbotModel.createConversation({
        user_id: userId,
        title,
        last_model: model,
      });
      convId = conv.id;
    }

    ChatbotModel.addMessage({
      conversation_id: convId,
      user_id: userId,
      role: 'user',
      content: queryText,
    });

    const fullConv = ChatbotModel.findConversationById(convId);
    const messagesHistory = (fullConv?.messages || []).map(m => ({
      role: m.role,
      content: m.content,
    }));

    const aiResult = await askGezyneBot(messagesHistory, model);

    ChatbotModel.addMessage({
      conversation_id: convId,
      user_id: null,
      role: 'assistant',
      content: aiResult.answer,
      sources: aiResult.model,
    });

    res.json({
      success: true,
      conversationId: convId,
      answer: aiResult.answer,
      model: aiResult.model,
      offlineFallback: aiResult.offlineFallback,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
