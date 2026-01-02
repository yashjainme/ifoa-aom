import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types/index.js';

// Extend Express Request type
declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        res.status(500).json({ error: 'JWT secret not configured' });
        return;
    }

    try {
        const decoded = jwt.verify(token, secret) as JwtPayload;
        req.user = decoded;
        next();
    } catch {
        res.status(403).json({ error: 'Invalid or expired token' });
    }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    if (req.user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }

    next();
}

export function generateToken(payload: JwtPayload): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET not configured');
    }
    return jwt.sign(payload, secret, { expiresIn: '24h' });
}
