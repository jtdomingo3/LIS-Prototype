import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserModel, UserPermissions } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-to-a-strong-secret';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  permissions: UserPermissions;
}

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Require a valid JWT token in the Authorization header.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  let token: string | undefined;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token as string;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require specific role(s). Must be used AFTER requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
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
export function requirePermission(...perms: (keyof UserPermissions)[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
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
export function generateToken(user: { id: string; email: string; role: string; permissions: UserPermissions }): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '24h') as any,
  } as jwt.SignOptions);
}
