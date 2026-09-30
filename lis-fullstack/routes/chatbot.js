const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const ragClient = require('../lib/ragClient');
const { 
  queryOpenRouter, 
  AVAILABLE_MODELS, 
  DEFAULT_MODELS, 
  DEFAULT_MODEL, 
  getAvailableModels, 
  fetchFreeOpenRouterModels 
} = require('../lib/gezyneBotService');

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

    const modelData = getAvailableModels();

    let ragStatus = { online: false, totalChunks: 0 };
    try {
      ragStatus = await ragClient.getRagStatus(1000);
    } catch (_) {}

    res.render('chatbot/index', {
      title: 'GezyneBot AI Assistant',
      conversations: conversations || [],
      activeConversation,
      initialMessages,
      defaultModels: modelData.defaultModels,
      freeModels: modelData.freeModels,
      availableModels: modelData.allModels,
      defaultModel: DEFAULT_MODEL,
      ragStatus
    });
  } catch (err) {
    console.error('[chatbot route] render error:', err);
    res.status(500).render('500', { title: 'Assistant Error', error: err });
  }
});

/**
 * GET /api/chatbot/rag-status - Check live status of Python/ChromaDB RAG microservice
 */
router.get(['/api/rag-status', '/rag-status'], requireAuth, async (req, res) => {
  try {
    const status = await ragClient.getRagStatus(1500);
    res.json({ success: true, ...status });
  } catch (err) {
    res.json({ success: false, online: false, error: err.message, totalChunks: 0 });
  }
});

/**
 * GET /api/chatbot/models (or /chatbot/api/models) - Get all available models
 */
router.get('/api/models', requireAuth, async (req, res) => {
  try {
    const modelData = getAvailableModels();
    res.json({
      success: true,
      defaultModels: modelData.defaultModels,
      freeModels: modelData.freeModels,
      availableModels: modelData.allModels
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/chatbot/models/refresh (or /chatbot/api/models/refresh) - Fetch latest free models from OpenRouter
 */
router.post('/api/models/refresh', requireAuth, async (req, res) => {
  try {
    const freeModels = await fetchFreeOpenRouterModels(true);
    const modelData = getAvailableModels();
    res.json({
      success: true,
      count: freeModels.length,
      defaultModels: modelData.defaultModels,
      freeModels: modelData.freeModels,
      availableModels: modelData.allModels
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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

// In-flight query deduplication map to prevent duplicate AI invocations on concurrent requests
const inFlightServerQueries = new Map();

/**
 * POST /api/chatbot/query - Main query endpoint (used by both floating widget and full page)
 */
router.post('/api/query', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    const userId = user ? (user.id || user.email) : 'default';
    const { question, conversationId, model, webSearch } = req.body || {};
    const enableWebSearch = webSearch === true || webSearch === 'true' || webSearch === 1 || webSearch === '1';

    if (!question || !String(question).trim()) {
      return res.status(400).json({ success: false, error: 'Question is required' });
    }

    const trimmedQuestion = String(question).trim();
    const selectedModel = model
      || (global.db && typeof global.db.getSettings === 'function' && (global.db.getSettings() || {}).openrouterModel)
      || process.env.OPENROUTER_DEFAULT_MODEL
      || DEFAULT_MODEL;

    let activeConvId = conversationId;
    let isNewConv = false;

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
      const titleCandidate = trimmedQuestion.slice(0, 42);
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

    // In-flight deduplication: if identical query is currently executing for this conversation, attach and share result
    const flightKey = `${userId}:${activeConvId}:${trimmedQuestion}`;
    if (inFlightServerQueries.has(flightKey)) {
      console.log('[Chatbot] Duplicate query in-flight, attaching to running execution:', flightKey);
      try {
        const sharedResult = await inFlightServerQueries.get(flightKey);
        return res.json({
          ...sharedResult,
          deduplicated: true
        });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // Retrieve previous messages for context
    let history = [];
    if (activeConvId && global.db && typeof global.db.getChatbotMessages === 'function') {
      try { history = global.db.getChatbotMessages(activeConvId) || []; } catch (_) {}
    }

    // Deduplication guard 1: if identical question was answered in this conversation within the last 30 seconds, return cached result
    if (history.length >= 2) {
      const lastMsg = history[history.length - 1];
      const secondLastMsg = history[history.length - 2];
      if (secondLastMsg && secondLastMsg.role === 'user' && secondLastMsg.content === trimmedQuestion && lastMsg && lastMsg.role === 'assistant') {
        const timeDiff = Date.now() - new Date(secondLastMsg.created_at).getTime();
        if (timeDiff >= 0 && timeDiff < 30000) {
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

    // Deduplication guard 2: avoid inserting duplicate user question into DB if already present in last 25s
    let userMsgAlreadySaved = false;
    if (history.length > 0) {
      const lastMsg = history[history.length - 1];
      if (lastMsg && lastMsg.role === 'user' && lastMsg.content === trimmedQuestion) {
        const elapsed = Date.now() - new Date(lastMsg.created_at).getTime();
        if (elapsed >= 0 && elapsed < 25000) {
          userMsgAlreadySaved = true;
          console.log('[Chatbot] User message already exists in DB (received within 25s), skipping redundant insert');
        }
      }
    }

    // Save user's question to message history only if not already saved
    if (!userMsgAlreadySaved && activeConvId && global.db && typeof global.db.addChatbotMessage === 'function') {
      try {
        global.db.addChatbotMessage({
          conversation_id: activeConvId,
          user_id: userId,
          role: 'user',
          content: trimmedQuestion,
          created_at: new Date().toISOString()
        });
      } catch (_) {}
    }

    // Wrap the query execution to register into in-flight tracker
    const executeQuery = async () => {
      let assistantMessage = null;

      // Query OpenRouter with clinical knowledge context and optional live web search
      const aiResult = await queryOpenRouter({
        question: trimmedQuestion,
        history,
        user: req.session.user || null,
        model: selectedModel,
        webSearch: enableWebSearch
      });

      // Save assistant's answer to message history
      if (activeConvId && global.db && aiResult.answer && typeof global.db.addChatbotMessage === 'function') {
        try {
          const sources = aiResult.sources || [
            { source: 'Gezyne LIS Standard Operating Procedures' },
            { source: 'CLSI Clinical Laboratory Reference Guidelines' }
          ];
          if (aiResult.webSearchUsed && Array.isArray(aiResult.webSources)) {
            aiResult.webSources.forEach(ws => {
              sources.push({ source: ws.title, url: ws.url });
            });
          }

          assistantMessage = global.db.addChatbotMessage({
            conversation_id: activeConvId,
            user_id: 'gezynebot',
            role: 'assistant',
            content: aiResult.answer,
            sources,
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
                let smartTitle = trimmedQuestion;
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

      return {
        success: true,
        answer: aiResult.answer,
        conversationId: activeConvId,
        model: aiResult.model || selectedModel,
        ragUsed: !!aiResult.ragUsed,
        ragChunks: aiResult.ragChunks || 0,
        webSearchUsed: !!aiResult.webSearchUsed,
        webSources: aiResult.webSources || [],
        messageId: assistantMessage ? assistantMessage.id : null
      };
    };

    const taskPromise = executeQuery();
    inFlightServerQueries.set(flightKey, taskPromise);

    try {
      const resultData = await taskPromise;
      return res.json(resultData);
    } finally {
      inFlightServerQueries.delete(flightKey);
    }
  } catch (err) {
    console.error('[chatbot route query error]:', err);
    res.status(500).json({ success: false, error: err.message, answer: 'Sorry, an unexpected server error occurred.' });
  }
});

module.exports = router;
