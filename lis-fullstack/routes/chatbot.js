const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { queryOpenRouter, AVAILABLE_MODELS, DEFAULT_MODEL } = require('../lib/gezyneBotService');

/**
 * GET /chatbot - Dedicated full-page assistant view
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const userId = user ? (user.id || user.email) : 'default';
    const conversations = global.db && typeof global.db.getChatbotConversations === 'function'
      ? global.db.getChatbotConversations(userId)
      : [];
    
    // Check if a specific conversation was requested via query param (e.g. from maximize button)
    const activeConvId = req.query.conversationId || (conversations[0] ? conversations[0].id : null);
    let activeConversation = null;
    let initialMessages = [];

    if (activeConvId && global.db) {
      activeConversation = global.db.getChatbotConversation(activeConvId, userId);
      if (activeConversation) {
        initialMessages = global.db.getChatbotMessages(activeConvId);
      }
    }

    res.render('chatbot/index', {
      title: 'GezyneBot AI Assistant',
      conversations,
      activeConversation,
      initialMessages,
      availableModels: AVAILABLE_MODELS,
      defaultModel: DEFAULT_MODEL
    });
  } catch (err) {
    console.error('[chatbot route] render error:', err);
    res.status(500).render('500', { title: 'Assistant Error', error: err });
  }
});

/**
 * GET /api/chatbot/conversations - List conversations
 */
router.get('/api/conversations', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const userId = user ? (user.id || user.email) : 'default';
    const conversations = global.db && typeof global.db.getChatbotConversations === 'function'
      ? global.db.getChatbotConversations(userId)
      : [];
    res.json({ success: true, conversations });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/chatbot/conversations - Create a new topic
 */
router.post('/api/conversations', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const userId = user ? (user.id || user.email) : 'default';
    const { title, model } = req.body || {};
    
    const convId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const newConv = {
      id: convId,
      user_id: userId,
      title: (title && String(title).trim()) ? String(title).trim() : 'New Discussion',
      last_model: model || DEFAULT_MODEL,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (global.db && typeof global.db.saveChatbotConversation === 'function') {
      global.db.saveChatbotConversation(newConv);
    }

    res.json({ success: true, conversation: newConv });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/chatbot/conversations/:id - Get conversation messages
 */
router.get('/api/conversations/:id', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const userId = user ? (user.id || user.email) : 'default';
    const convId = req.params.id;

    if (!global.db) {
      return res.status(500).json({ success: false, error: 'Database unavailable' });
    }

    const conversation = global.db.getChatbotConversation(convId, userId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const messages = global.db.getChatbotMessages(convId);
    res.json({ success: true, conversation, messages });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/chatbot/conversations/:id - Delete a conversation
 */
router.delete('/api/conversations/:id', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const userId = user ? (user.id || user.email) : 'default';
    const convId = req.params.id;

    if (global.db && typeof global.db.deleteChatbotConversation === 'function') {
      const deleted = global.db.deleteChatbotConversation(convId, userId);
      if (!deleted) {
        return res.status(404).json({ success: false, error: 'Conversation not found or unauthorized' });
      }
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/chatbot/query - Main query endpoint (used by both floating widget and full page)
 */
router.post('/api/query', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const userId = user ? (user.id || user.email) : 'default';
    const { question, conversationId, model } = req.body || {};

    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, error: 'Question is required' });
    }

    let activeConvId = conversationId;
    let isNewConv = false;

    // Ensure or create conversation
    if (!activeConvId && global.db) {
      activeConvId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      const titleCandidate = String(question).trim().slice(0, 42);
      const newConv = {
        id: activeConvId,
        user_id: userId,
        title: titleCandidate || 'New Discussion',
        last_model: model || DEFAULT_MODEL,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      global.db.saveChatbotConversation(newConv);
      isNewConv = true;
    }

    // Retrieve previous messages for context
    let history = [];
    if (activeConvId && global.db) {
      history = global.db.getChatbotMessages(activeConvId);
    }

    // Save user's question to message history
    if (activeConvId && global.db) {
      global.db.addChatbotMessage({
        conversation_id: activeConvId,
        user_id: userId,
        role: 'user',
        content: String(question).trim(),
        created_at: new Date().toISOString()
      });
    }

    // Query OpenRouter with clinical knowledge context
    const aiResult = await queryOpenRouter({
      question: String(question).trim(),
      history,
      user,
      model: model || DEFAULT_MODEL
    });

    // Save assistant response to message history
    let assistantMessage = null;
    if (activeConvId && global.db) {
      assistantMessage = global.db.addChatbotMessage({
        conversation_id: activeConvId,
        user_id: 'gezynebot',
        role: 'assistant',
        content: aiResult.answer,
        sources: [
          { source: 'Gezyne LIS Standard Operating Procedures' },
          { source: 'CLSI Clinical Laboratory Reference Guidelines' }
        ],
        created_at: new Date().toISOString()
      });

      // If this was a new conversation, generate a smart short title from the question
      if (isNewConv) {
        try {
          const conv = global.db.getChatbotConversation(activeConvId, userId);
          if (conv) {
            let smartTitle = String(question).trim();
            // clean up trailing punctuation
            smartTitle = smartTitle.replace(/^[?.,\s]+|[?.,\s]+$/g, '');
            if (smartTitle.length > 40) smartTitle = smartTitle.slice(0, 38) + '...';
            conv.title = smartTitle;
            global.db.saveChatbotConversation(conv);
          }
        } catch (_) {}
      }
    }

    res.json({
      success: true,
      answer: aiResult.answer,
      conversationId: activeConvId,
      model: aiResult.model || model,
      messageId: assistantMessage ? assistantMessage.id : null
    });
  } catch (err) {
    console.error('[chatbot route query error]:', err);
    res.status(500).json({ success: false, error: err.message, answer: 'Sorry, an unexpected server error occurred.' });
  }
});

module.exports = router;
