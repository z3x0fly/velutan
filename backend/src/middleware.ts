import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';
import { db, Role } from './db';

export interface AuthUser {
    id: number;
    username: string;
    role: Role;
}

declare module 'express-serve-static-core' {
    interface Request {
        user?: AuthUser;
    }
}

/** Bearer JWT doğrular; kullanıcı silinmişse token geçersiz sayılır. */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor' });
    try {
        const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as jwt.JwtPayload;
        const user = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(Number(payload.id)) as AuthUser | undefined;
        if (!user) return res.status(401).json({ error: 'Oturum geçersiz' });
        req.user = user;
        next();
    } catch {
        return res.status(401).json({ error: 'Oturum süresi doldu ya da geçersiz' });
    }
}

/** requireAuth'tan sonra kullanılır: yalnızca yönetici (kullanıcı yönetimi vb.) */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Bu işlem için yönetici yetkisi gerekiyor' });
    next();
}

/** Basit bellek içi hız sınırlayıcı (tek süreçli kurulum için yeterli). */
export function rateLimit({ windowMs, max, message }: { windowMs: number; max: number; message: string }) {
    const hits = new Map<string, { count: number; reset: number }>();
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    }, windowMs).unref();

    return (req: Request, res: Response, next: NextFunction) => {
        const key = req.ip || 'unknown';
        const now = Date.now();
        const entry = hits.get(key);
        if (!entry || entry.reset < now) {
            hits.set(key, { count: 1, reset: now + windowMs });
            return next();
        }
        entry.count++;
        if (entry.count > max) {
            res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
            return res.status(429).json({ error: message });
        }
        next();
    };
}
