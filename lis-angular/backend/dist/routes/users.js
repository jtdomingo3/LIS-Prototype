"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const User_1 = require("../models/User");
const auth_1 = require("../middleware/auth");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const router = (0, express_1.Router)();
// All routes require authentication
router.use(auth_1.requireAuth);
/**
 * GET /api/users - List all users
 */
router.get('/', (0, auth_1.requirePermission)('users'), (req, res) => {
    try {
        const users = User_1.UserModel.findAll();
        const sanitized = users.map(({ password, ...u }) => u);
        return res.json({ users: sanitized });
    }
    catch (err) {
        console.error('[users] list error:', err);
        return res.status(500).json({ error: 'Failed to list users' });
    }
});
/**
 * GET /api/users/:id - Get user by ID
 */
router.get('/:id', (req, res) => {
    try {
        const user = User_1.UserModel.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { password, ...userData } = user;
        return res.json({ user: userData });
    }
    catch (err) {
        console.error('[users] get error:', err);
        return res.status(500).json({ error: 'Failed to get user' });
    }
});
/**
 * POST /api/users - Create new user
 */
router.post('/', (0, auth_1.requirePermission)('users'), async (req, res) => {
    try {
        const { name, email, password, role, license_number, permissions } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required' });
        }
        const existing = User_1.UserModel.findByEmail(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }
        const user = await User_1.UserModel.create({
            name, email, password, role, license_number, permissions,
        });
        const { password: _, ...userData } = user;
        return res.status(201).json({ user: userData });
    }
    catch (err) {
        console.error('[users] create error:', err);
        return res.status(500).json({ error: 'Failed to create user' });
    }
});
/**
 * PUT /api/users/:id - Update user
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // Non-admin can only edit their own profile
        if (req.user?.role !== 'Admin' && req.user?.userId !== id) {
            return res.status(403).json({ error: 'Cannot edit other users' });
        }
        const updateData = {};
        const allowedFields = ['name', 'email', 'role', 'status', 'license_number', 'permissions',
            'signature', 'auto_signature_enabled', 'auto_signature_until'];
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }
        // Handle password change
        if (req.body.password) {
            updateData.password = await bcryptjs_1.default.hash(req.body.password, 12);
        }
        const user = User_1.UserModel.update(id, updateData);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { password, ...userData } = user;
        return res.json({ user: userData });
    }
    catch (err) {
        console.error('[users] update error:', err);
        return res.status(500).json({ error: 'Failed to update user' });
    }
});
/**
 * DELETE /api/users/:id - Delete user
 */
router.delete('/:id', (0, auth_1.requirePermission)('users'), (req, res) => {
    try {
        const { id } = req.params;
        // Cannot delete self
        if (req.user?.userId === id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }
        const deleted = User_1.UserModel.delete(id);
        if (!deleted) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json({ message: 'User deleted' });
    }
    catch (err) {
        console.error('[users] delete error:', err);
        return res.status(500).json({ error: 'Failed to delete user' });
    }
});
/**
 * POST /api/users/:id/reset-password - Reset password to default
 */
router.post('/:id/reset-password', (0, auth_1.requirePermission)('users'), async (req, res) => {
    try {
        const { id } = req.params;
        const defaultPassword = 'gezyne';
        const hashed = await bcryptjs_1.default.hash(defaultPassword, 12);
        const user = User_1.UserModel.update(id, { password: hashed });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json({ message: 'Password reset to default' });
    }
    catch (err) {
        console.error('[users] reset-password error:', err);
        return res.status(500).json({ error: 'Failed to reset password' });
    }
});
/**
 * PUT /api/users/profile/me - Update own profile
 */
router.put('/profile/me', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        const updateData = {};
        const allowedSelfFields = ['name', 'email', 'signature', 'auto_signature_enabled', 'auto_signature_until'];
        for (const field of allowedSelfFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }
        if (req.body.password) {
            updateData.password = await bcryptjs_1.default.hash(req.body.password, 12);
        }
        const user = User_1.UserModel.update(req.user.userId, updateData);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { password, ...userData } = user;
        return res.json({ user: userData });
    }
    catch (err) {
        console.error('[users] profile update error:', err);
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});
exports.default = router;
//# sourceMappingURL=users.js.map