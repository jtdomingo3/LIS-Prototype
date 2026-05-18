"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
exports.requirePermission = requirePermission;
exports.generateToken = generateToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-strong-secret';
/**
 * Require a valid JWT token in the Authorization header.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
/**
 * Require specific role(s). Must be used AFTER requireAuth.
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        // Admin always has access
        if (req.user.role === 'Admin') {
            next();
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        next();
    };
}
/**
 * Require specific permission flag(s). Must be used AFTER requireAuth.
 */
function requirePermission(...perms) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        // Admin always has access
        if (req.user.role === 'Admin') {
            next();
            return;
        }
        const userPerms = req.user.permissions || {};
        const hasAll = perms.every(p => userPerms[p]);
        if (!hasAll) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        next();
    };
}
/**
 * Generate a JWT token for a user.
 */
function generateToken(user) {
    const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
    };
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, {
        expiresIn: (process.env.JWT_EXPIRES_IN || '24h'),
    });
}
//# sourceMappingURL=auth.js.map