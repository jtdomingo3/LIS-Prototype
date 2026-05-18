import { Request, Response, NextFunction } from 'express';
import { UserPermissions } from '../models/User';
export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
    permissions: UserPermissions;
}
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
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
/**
 * Require specific role(s). Must be used AFTER requireAuth.
 */
export declare function requireRole(...roles: string[]): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Require specific permission flag(s). Must be used AFTER requireAuth.
 */
export declare function requirePermission(...perms: (keyof UserPermissions)[]): (req: Request, res: Response, next: NextFunction) => void;
/**
 * Generate a JWT token for a user.
 */
export declare function generateToken(user: {
    id: string;
    email: string;
    role: string;
    permissions: UserPermissions;
}): string;
//# sourceMappingURL=auth.d.ts.map