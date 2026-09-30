const express = require('express');
const router = express.Router();

function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    req.flash('error_msg', 'Please log in to access this feature');
    return res.redirect('/login');
}

// Resolve Central LIS Server URL
function getServerUrl(req) {
    const conf = (req.app && req.app.locals && req.app.locals.config) || global.dbConfig || {};
    let url = conf.SERVER_URL || process.env.SERVER_URL || 'http://127.0.0.1:3000';
    return (url || '').trim().replace(/\/$/, '');
}

// Ping server to detect live connectivity
async function checkServerReachable(serverUrl, timeoutMs = 3000) {
    if (!serverUrl) return false;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(serverUrl + '/', {
            method: 'HEAD',
            signal: controller.signal
        });
        clearTimeout(timer);
        return res.status < 500;
    } catch (_) {
        return false;
    }
}

// Construct authentication bootstrap headers to forward to central server
function getForwardHeaders(req) {
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    if (req.headers && req.headers.cookie) {
        headers['cookie'] = req.headers.cookie;
    }

    const userEmail = (req.session && req.session.user && req.session.user.email) || null;
    if (userEmail) {
        let passwordHash = null;
        if (global.db && typeof global.db.getUsers === 'function') {
            try {
                const users = global.db.getUsers() || [];
                const match = users.find(u => u && u.email && u.email.toLowerCase() === userEmail.toLowerCase());
                if (match && match.password) passwordHash = match.password;
            } catch (_) {}
        }
        if (!passwordHash && req.app && req.app.locals && req.app.locals.dataStore) {
            try {
                const dsUsers = req.app.locals.dataStore.getCollection('users') || [];
                const match = dsUsers.find(u => u && u.email && u.email.toLowerCase() === userEmail.toLowerCase());
                if (match && match.password) passwordHash = match.password;
            } catch (_) {}
        }

        if (passwordHash) {
            const { generateSyncToken } = require('../lib/syncAuth');
            headers['x-lis-sync-email'] = userEmail;
            headers['x-lis-sync-hash'] = generateSyncToken(userEmail, passwordHash);
        }
    }
    return headers;
}

const { getAvailableModels, fetchFreeOpenRouterModels, DEFAULT_MODELS, AVAILABLE_MODELS } = require('../lib/gezyneBotService');
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

// Render dedicated full-screen assistant page
router.get('/', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);
    let conversations = [];
    let activeConversation = null;
    let initialMessages = [];
    let ragStatus = { online: false, totalChunks: 0 };

    if (isOnline) {
        try {
            const headers = getForwardHeaders(req);
            const convRes = await fetch(`${serverUrl}/chatbot/api/conversations`, { headers });
            const convData = await convRes.json();
            if (convData && convData.conversations) {
                conversations = convData.conversations;
            }

            const activeConvId = req.query.conversationId || (conversations[0] ? conversations[0].id : null);
            if (activeConvId) {
                activeConversation = conversations.find(c => c.id === activeConvId) || null;
                const msgRes = await fetch(`${serverUrl}/chatbot/api/conversations/${encodeURIComponent(activeConvId)}`, { headers });
                const msgData = await msgRes.json();
                if (msgData && msgData.messages) {
                    initialMessages = msgData.messages;
                }
            }

            // Fetch live RAG microservice status from central server
            try {
                const ragRes = await fetch(`${serverUrl}/chatbot/api/rag-status`, { headers });
                if (ragRes.ok) {
                    ragStatus = await ragRes.json();
                }
            } catch (_) {}
        } catch (err) {
            console.warn('[Standalone Chatbot] error loading topics from server:', err && err.message);
        }
    }

    const modelData = getAvailableModels();

    res.render('chatbot/index', {
        title: 'GezyneBot AI Assistant',
        conversations,
        activeConversation,
        initialMessages,
        defaultModels: modelData.defaultModels,
        freeModels: modelData.freeModels,
        availableModels: modelData.allModels,
        defaultModel: DEFAULT_MODEL,
        serverUrl,
        isOnline,
        ragStatus
    });
});

// Proxy live RAG status check to central server
router.get(['/api/rag-status', '/rag-status'], requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);
    if (!isOnline) {
        return res.json({ success: false, online: false, totalChunks: 0, error: 'Central server offline' });
    }
    try {
        const headers = getForwardHeaders(req);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(`${serverUrl}/chatbot/api/rag-status`, { headers, signal: controller.signal });
        clearTimeout(timer);
        const data = await response.json();
        return res.json(data);
    } catch (err) {
        return res.json({ success: false, online: false, totalChunks: 0, error: err && err.message });
    }
});

// Fetch available models
router.get('/api/models', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);
    if (isOnline) {
        try {
            const headers = getForwardHeaders(req);
            const response = await fetch(`${serverUrl}/chatbot/api/models`, { headers });
            const data = await response.json();
            return res.json(data);
        } catch (_) {}
    }
    const modelData = getAvailableModels();
    res.json({
        success: true,
        defaultModels: modelData.defaultModels,
        freeModels: modelData.freeModels,
        availableModels: modelData.allModels
    });
});

// Refresh free models from OpenRouter
router.post('/api/models/refresh', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);
    if (isOnline) {
        try {
            const headers = getForwardHeaders(req);
            headers['Content-Type'] = 'application/json';
            const response = await fetch(`${serverUrl}/chatbot/api/models/refresh`, {
                method: 'POST',
                headers
            });
            const data = await response.json();
            return res.json(data);
        } catch (_) {}
    }
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

// Real-time server connectivity status endpoint
router.get('/api/status', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);

    res.json({
        success: true,
        online: isOnline,
        serverUrl
    });
});

// In-flight query deduplication map to prevent double uploads to central server
const inFlightStandaloneQueries = new Map();

// Query endpoint: strictly proxies to the central server when online
router.post('/api/query', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);

    // Enforce offline dependency: GezyneBot will not work without central server connection
    if (!isOnline) {
        return res.json({
            success: false,
            offline: true,
            answer: `⚠️ **Central Server Offline**\n\nGezyneBot is fully dependent on the central LIS server and cannot operate while the app is offline or disconnected.\n\n**Server Target:** \`${serverUrl || 'Not Configured'}\`\n\nPlease connect to the central server network and try again.`
        });
    }

    const question = String((req.body && req.body.question) || '').trim();
    const convId = (req.body && req.body.conversationId) || 'new';
    const userId = req.session.user ? (req.session.user.id || req.session.user.username) : 'anon';
    const dedupeKey = `${userId}:${convId}:${question}`;

    if (inFlightStandaloneQueries.has(dedupeKey)) {
        console.log('[Standalone Proxy] In-flight query already active, attaching to existing request:', dedupeKey);
        try {
            const sharedResult = await inFlightStandaloneQueries.get(dedupeKey);
            return res.json(sharedResult);
        } catch (e) {
            return res.status(500).json({ success: false, error: e && e.message });
        }
    }

    const executeProxy = async () => {
        const headers = getForwardHeaders(req);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);

        try {
            const response = await fetch(`${serverUrl}/chatbot/api/query`, {
                method: 'POST',
                headers,
                body: JSON.stringify(req.body || {}),
                signal: controller.signal
            });
            clearTimeout(timer);

            if (!response.ok) {
                const errorText = await response.text();
                let parsedErr;
                try { parsedErr = JSON.parse(errorText); } catch (_) {}
                return {
                    status: response.status,
                    body: parsedErr || {
                        success: false,
                        error: `Server responded with status ${response.status}`,
                        answer: `⚠️ Server returned error status ${response.status}.`
                    }
                };
            }

            const data = await response.json();
            return { status: 200, body: data };
        } catch (err) {
            clearTimeout(timer);
            console.error('[Standalone Chatbot Proxy Error]', err && err.message);
            return {
                status: 200,
                body: {
                    success: false,
                    offline: true,
                    answer: `⚠️ **Connection Error**\n\nFailed to reach the central LIS server at \`${serverUrl}\`: ${err.message || 'Server timeout'}.\n\nGezyneBot is unavailable until the server connection is restored.`
                }
            };
        }
    };

    const taskPromise = executeProxy();
    inFlightStandaloneQueries.set(dedupeKey, taskPromise);

    try {
        const result = await taskPromise;
        return res.status(result.status || 200).json(result.body);
    } finally {
        inFlightStandaloneQueries.delete(dedupeKey);
    }
});

// Fetch conversation topics from central server
router.get('/api/conversations', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);

    if (!isOnline) {
        return res.json({
            success: false,
            offline: true,
            conversations: [],
            message: 'Server is currently offline. Conversation history is stored on the central server.'
        });
    }

    try {
        const headers = getForwardHeaders(req);
        const response = await fetch(`${serverUrl}/chatbot/api/conversations`, {
            method: 'GET',
            headers
        });
        const data = await response.json();
        return res.json(data);
    } catch (err) {
        return res.json({ success: false, offline: true, conversations: [] });
    }
});

// Create new conversation topic on central server
router.post('/api/conversations', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);

    if (!isOnline) {
        return res.status(503).json({
            success: false,
            offline: true,
            error: 'Cannot create topics while offline.'
        });
    }

    try {
        const headers = getForwardHeaders(req);
        const response = await fetch(`${serverUrl}/chatbot/api/conversations`, {
            method: 'POST',
            headers,
            body: JSON.stringify(req.body || {})
        });
        const data = await response.json();
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Fetch messages for a conversation from central server
router.get('/api/conversations/:id', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);

    if (!isOnline) {
        return res.json({ success: false, offline: true, messages: [] });
    }

    try {
        const headers = getForwardHeaders(req);
        const response = await fetch(`${serverUrl}/chatbot/api/conversations/${encodeURIComponent(req.params.id)}`, {
            method: 'GET',
            headers
        });
        const data = await response.json();
        return res.json(data);
    } catch (err) {
        return res.json({ success: false, offline: true, messages: [] });
    }
});

// Delete a conversation topic on central server
router.delete('/api/conversations/:id', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);

    if (!isOnline) {
        return res.status(503).json({ success: false, offline: true, error: 'Cannot delete topics while offline.' });
    }

    try {
        const headers = getForwardHeaders(req);
        const response = await fetch(`${serverUrl}/chatbot/api/conversations/${encodeURIComponent(req.params.id)}`, {
            method: 'DELETE',
            headers
        });
        const data = await response.json();
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
