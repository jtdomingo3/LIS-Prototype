import { Router, Request, Response } from 'express';
import { UserModel } from '../models/User';
import { generateToken, requireAuth } from '../middleware/auth';
import bcrypt from 'bcryptjs';

const router = Router();

/**
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = UserModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status !== 'Active') {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    UserModel.update(user.id, { last_login: new Date().toISOString() });

    // Generate token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    });

    // Return user data (without password)
    const { password: _, ...userData } = user;

    return res.json({
      token,
      user: userData,
    });
  } catch (err: any) {
    console.error('[auth] login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/register (development only)
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Registration disabled in production' });
    }

    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const existing = UserModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const user = await UserModel.create({ name, email, password, role });
    const { password: _, ...userData } = user;

    return res.status(201).json({ user: userData });
  } catch (err: any) {
    console.error('[auth] register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * GET /api/auth/me - Get current user profile
 */
router.get('/me', requireAuth, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = UserModel.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { password: _, ...userData } = user;
    return res.json({ user: userData });
  } catch (err: any) {
    console.error('[auth] me error:', err);
    return res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * POST /api/auth/refresh - Refresh JWT token
 */
router.post('/refresh', requireAuth, (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = UserModel.findById(req.user.userId);
    if (!user || user.status !== 'Active') {
      return res.status(401).json({ error: 'User is inactive' });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    });

    return res.json({ token });
  } catch (err: any) {
    console.error('[auth] refresh error:', err);
    return res.status(500).json({ error: 'Token refresh failed' });
  }
});

export default router;
