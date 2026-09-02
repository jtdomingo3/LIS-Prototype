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
    const altUserId = user ? (user.email || user.id) : null;
    let conversations = [];

    if (global.db && typeof global.db.getChatbotConversations === 'function') {
      try {
        conversations = global.db.getChatbotConversations(userId);
        if ((!conversations || conversations.length === 0) && altUserId && altUserId !== userId) {
          conversations = global.db.getChatbotConversations(altUserId);
        }
        if (!conversations || conversations.length === 0) {
          conversations = global.db.getChatbotConversations(null);
        }
      } catch (_) {
        conversations = [];
      }
    }
    
    // Check if a specific conversation was requested via query param (e.g. from maximize button)
    const activeConvId = req.query.conversationId || (conversations[0] ? conversations[0].id : null);
    let activeConversation = null;
    let initialMessages = [];

    if (activeConvId && global.db) {
      if (typeof global.db.getChatbotConversation === 'function') {
        activeConversation = global.db.getChatbotConversation(activeConvId, userId) || global.db.getChatbotConversation(activeConvId);
      }
      if (typeof global.db.getChatbotMessages === 'function') {
        initialMessages = global.db.getChatbotMessages(activeConvId) || [];
      }
    }

    res.render('chatbot/index', {
      title: 'GezyneBot AI Assistant',
      conversations: conversations || [],
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
    const altUserId = user ? (user.email || user.id) : null;
    let conversations = [];

    if (global.db && typeof global.db.getChatbotConversations === 'function') {
      try {
        conversations = global.db.getChatbotConversations(userId);
        if ((!conversations || conversations.length === 0) && altUserId && altUserId !== userId) {
          conversations = global.db.getChatbotConversations(altUserId);
        }
        if (!conversations || conversations.length === 0) {
          conversations = global.db.getChatbotConversations(null);
        }
      } catch (_) {
        conversations = [];
      }
    }
    res.json({ success: true, conversations: conversations || [] });
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

    const conversation = (typeof global.db.getChatbotConversation === 'function')
      ? (global.db.getChatbotConversation(convId, userId) || global.db.getChatbotConversation(convId))
      : null;
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const messages = (typeof global.db.getChatbotMessages === 'function')
      ? (global.db.getChatbotMessages(convId) || [])
      : [];
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

    const selectedModel = model
      || (global.db && typeof global.db.getSettings === 'function' && (global.db.getSettings() || {}).openrouterModel)
      || process.env.OPENROUTER_DEFAULT_MODEL
      || DEFAULT_MODEL;

    let activeConvId = conversationId;
    let isNewConv = false;
    let assistantMessage = null;

    // Ensure or create conversation in database
    let existingConv = null;
    if (activeConvId && global.db && typeof global.db.getChatbotConversation === 'function') {
      try {
        existingConv = global.db.getChatbotConversation(activeConvId, userId) || global.db.getChatbotConversation(activeConvId);
      } catch (_) {}
    }

    if (!existingConv) {
      if (!activeConvId) {
        activeConvId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      }
      const titleCandidate = String(question).trim().slice(0, 42);
      const newConv = {
        id: activeConvId,
        user_id: userId,
        title: titleCandidate || 'New Discussion',
        last_model: selectedModel,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (global.db && typeof global.db.saveChatbotConversation === 'function') {
        global.db.saveChatbotConversation(newConv);
      }
      isNewConv = true;
    }

    // Retrieve previous messages for context
    let history = [];
    if (activeConvId && global.db && typeof global.db.getChatbotMessages === 'function') {
      try { history = global.db.getChatbotMessages(activeConvId) || []; } catch (_) {}
    }

    const trimmedQuestion = String(question).trim();

    // Deduplication guard: if an identical question was answered in this conversation within the last 20 seconds, return the cached result
    if (history.length >= 2) {
      const lastMsg = history[history.length - 1];
      const secondLastMsg = history[history.length - 2];
      if (secondLastMsg && secondLastMsg.role === 'user' && secondLastMsg.content === trimmedQuestion && lastMsg && lastMsg.role === 'assistant') {
        const timeDiff = Date.now() - new Date(secondLastMsg.created_at).getTime();
        if (timeDiff >= 0 && timeDiff < 20000) {
          console.log('[Chatbot] Returning deduplicated response for repeat query in conv:', activeConvId);
          return res.json({
            success: true,
            conversationId: activeConvId,
            answer: lastMsg.content,
            sources: lastMsg.sources || [],
            model: selectedModel,
            deduplicated: true
          });
        }
      }
    }

    // Save user's question to message history
    if (activeConvId && global.db && typeof global.db.addChatbotMessage === 'function') {
      try {
        global.db.addChatbotMessage({
          conversation_id: activeConvId,
          user_id: userId,
          role: 'user',
          content: String(question).trim(),
          created_at: new Date().toISOString()
        });
      } catch (_) {}
    }

    // Query OpenRouter with clinical knowledge context
    const aiResult = await queryOpenRouter({
      question: String(question).trim(),
      history,
      user: req.session.user || null,
      model: selectedModel
    });

    // Save assistant's answer to message history
    if (activeConvId && global.db && aiResult.answer && typeof global.db.addChatbotMessage === 'function') {
      try {
        assistantMessage = global.db.addChatbotMessage({
          conversation_id: activeConvId,
          user_id: 'gezynebot',
          role: 'assistant',
          content: aiResult.answer,
          sources: aiResult.sources || [
            { source: 'Gezyne LIS Standard Operating Procedures' },
            { source: 'CLSI Clinical Laboratory Reference Guidelines' }
          ],
          created_at: new Date().toISOString()
        });
      } catch (_) {}

      // Update conversation title and last updated timestamp
      if (typeof global.db.getChatbotConversation === 'function' && typeof global.db.saveChatbotConversation === 'function') {
        try {
          const conv = global.db.getChatbotConversation(activeConvId, userId) || global.db.getChatbotConversation(activeConvId);
          if (conv) {
            conv.updated_at = new Date().toISOString();
            if (isNewConv || !conv.title || conv.title === 'New Discussion' || conv.title === 'New Topic') {
              let smartTitle = String(question).trim();
              smartTitle = smartTitle.replace(/^[?.,\s]+|[?.,\s]+$/g, '');
              if (smartTitle.length > 40) smartTitle = smartTitle.slice(0, 38) + '...';
              conv.title = smartTitle;
            }
            conv.last_model = selectedModel;
            global.db.saveChatbotConversation(conv);
          }
        } catch (_) {}
      }

      // Flush immediately to disk in sql.js adapter
      if (global.db && typeof global.db.checkpoint === 'function') {
        global.db.checkpoint();
      }
    }

    res.json({
      success: true,
      answer: aiResult.answer,
      conversationId: activeConvId,
      model: aiResult.model || selectedModel,
      messageId: assistantMessage ? assistantMessage.id : null
    });
  } catch (err) {
    console.error('[chatbot route query error]:', err);
    res.status(500).json({ success: false, error: err.message, answer: 'Sorry, an unexpected server error occurred.' });
  }
});

module.exports = router;
