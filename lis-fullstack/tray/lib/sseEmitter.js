const EventEmitter = require('events');

// Single shared SSE emitter instance used across routes to notify connected clients
// This avoids circular requires and makes it simple for any module to emit SSE updates.
const sseEmitter = new EventEmitter();

module.exports = sseEmitter;
