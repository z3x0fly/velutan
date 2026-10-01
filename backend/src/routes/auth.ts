import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db, ROLES, Role } from '../db';
import { rateLimit, requireAdmin, requireAuth } from '../middleware';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PASSWORD = 10;
// Zamanlama saldırısına karşı: kullanıcı yoksa da bcrypt karşılaştırması yap
const DUMMY_HASH = bcrypt.hashSync('velutan-dummy-password', 12);

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' });

router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return res.status(400).json({ error: 'Gerekli alanları doldurun' });
    }
    const user = db.prepare('SELECT id, username, password, role FROM users WHERE username = ?').get(username) as
        | { id: number; username: string; password: string; role: Role }
        | undefined;
    const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !valid) return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı' });

    const token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, {
        algorithm: 'HS256',
        expiresIn: config.jwtExpiresIn,
    });
    res.json({ token, username: user.username, role: user.role });
});

router.get('/me', requireAuth, (req, res) => {
    res.json(req.user);
});

router.post('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'Mevcut ve yeni şifre zorunlu' });
    }
    if (newPassword.length < MIN_PASSWORD) return res.status(400).json({ error: `Yeni şifre en az ${MIN_PASSWORD} karakter olmalı` });
    const row = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user!.id) as { password: string };
    if (!(await bcrypt.compare(currentPassword, row.password))) return res.status(401).json({ error: 'Mevcut şifre hatalı' });
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(await bcrypt.hash(newPassword, 12), req.user!.id);
    res.json({ success: true });
});

// --- Kullanıcı yönetimi (yalnızca yöneticiler; editörler içerik düzenler, kullanıcı yönetemez)
router.get('/users', requireAuth, requireAdmin, (_req, res) => {
    res.json(db.prepare('SELECT id, username, role FROM users ORDER BY id').all());
});

router.post('/users', requireAuth, requireAdmin, async (req, res) => {
    const { username, password } = req.body ?? {};
    const role: Role = req.body?.role ?? 'editor';
    if (!(ROLES as readonly string[]).includes(role)) return res.status(400).json({ error: 'Rol admin ya da editor olmalı' });
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
        return res.status(400).json({ error: 'Kullanıcı adı 3-32 karakter; harf, rakam, _ . - içerebilir' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
        return res.status(400).json({ error: `Şifre en az ${MIN_PASSWORD} karakter olmalı` });
    }
    try {
        const result = db
            .prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
            .run(username, await bcrypt.hash(password, 12), role);
        res.status(201).json({ id: Number(result.lastInsertRowid), username, role });
    } catch {
        res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış' });
    }
});

router.put('/users/:id/role', requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const role = req.body?.role;
    if (!Number.isInteger(id) || !(ROLES as readonly string[]).includes(role)) return res.status(400).json({ error: 'Geçersiz istek' });
    if (id === req.user!.id && role !== 'admin') return res.status(400).json({ error: 'Kendi yönetici yetkinizi kaldıramazsınız' });
    const result = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ success: true });
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Geçersiz id' });
    if (id === req.user!.id) return res.status(400).json({ error: 'Kendi hesabınızı silemezsiniz' });
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: Role } | undefined;
    if (!target) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    const { c } = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as { c: number };
    if (target.role === 'admin' && c <= 1) return res.status(400).json({ error: 'Son yöneticiyi silemezsiniz' });
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    res.json({ success: true });
});

export default router;
