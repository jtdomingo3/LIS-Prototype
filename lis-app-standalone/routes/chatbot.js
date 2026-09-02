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
            headers['x-lis-sync-email'] = userEmail;
            headers['x-lis-sync-hash'] = passwordHash;
        }
    }
    return headers;
}

// Render dedicated full-screen assistant page
router.get('/', requireAuth, async (req, res) => {
    const serverUrl = getServerUrl(req);
    const isOnline = await checkServerReachable(serverUrl);

    res.render('chatbot/index', {
        title: 'GezyneBot AI Assistant',
        serverUrl,
        isOnline
    });
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

    try {
        const headers = getForwardHeaders(req);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);

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
            return res.status(response.status).json(parsedErr || {
                success: false,
                error: `Server responded with status ${response.status}`,
                answer: `⚠️ Server returned error status ${response.status}.`
            });
        }

        const data = await response.json();
        return res.json(data);
    } catch (err) {
        console.error('[Standalone Chatbot Proxy Error]', err && err.message);
        return res.json({
            success: false,
            offline: true,
            answer: `⚠️ **Connection Error**\n\nFailed to reach the central LIS server at \`${serverUrl}\`: ${err.message || 'Server timeout'}.\n\nGezyneBot is unavailable until the server connection is restored.`
        });
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
