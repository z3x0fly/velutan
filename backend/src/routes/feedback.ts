import crypto from 'crypto';
import { Router } from 'express';
import { db } from '../db';
import { rateLimit, requireAdmin, requireAuth } from '../middleware';
import { isTrusted, record } from '../guard';

/**
 * Geri bildirim: ziyaretçiler öneri, hata, istek yazar; topluluk oylamalarına katılır (ilki: gezegen kurgusu).
 * Spam'e karşı: hız sınırı, bot tuzağı alanı ("website" doluysa bot), Bekçi (tarayıcı olmayan istemciye
 * "kaydedildi" denir ama kaydedilmez). Oy: kişi başına bir (IP + tarayıcı özeti), değiştirilebilir.
 * Yönetim panelinde listelenir, durum (yeni / okundu / yapıldı / reddedildi) ve not eklenir.
 */
db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT,
        name TEXT,
        contact TEXT,
        poll TEXT,
        vote TEXT,
        page TEXT,
        voter TEXT,
        status TEXT NOT NULL DEFAULT 'yeni',
        note TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_feedback_poll ON feedback (poll, voter);
`);

const KINDS = ['oneri', 'hata', 'istek', 'diger', 'oy'] as const;
const STATUSES = ['yeni', 'okundu', 'yapildi', 'reddedildi'] as const;
/** Açık oylamalar ve seçenekleri */
export const POLLS: Record<string, { title: string; options: Record<string, string> }> = {
    gezegen: { title: 'Velutan gezegeni nasıl olsun?', options: { tam: 'Harita tüm gezegen', kita: 'Dünya ölçeğinde kıta' } },
};

const SALT = process.env.GUARD_SECRET || 'velutan-geri-bildirim';
const voterId = (ip: string, ua: string) => crypto.createHash('sha256').update(`${SALT}|${ip}|${ua}`).digest('hex').slice(0, 24);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const router = Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 8, message: 'Çok sık gönderdin, biraz sonra tekrar dene' });

/** Oylama sonuçları (herkese açık) */
router.get('/oylar', (_req, res) => {
    const out: Record<string, { title: string; options: Record<string, { label: string; count: number }>; total: number }> = {};
    for (const [poll, def] of Object.entries(POLLS)) {
        const rows = db.prepare('SELECT vote, COUNT(*) AS n FROM feedback WHERE poll = ? GROUP BY vote').all(poll) as { vote: string; n: number }[];
        const options: Record<string, { label: string; count: number }> = {};
        let total = 0;
        for (const [k, label] of Object.entries(def.options)) {
            const n = rows.find((r) => r.vote === k)?.n ?? 0;
            options[k] = { label, count: n };
            total += n;
        }
        out[poll] = { title: def.title, options, total };
    }
    res.set('Cache-Control', 'no-store');
    res.json(out);
});

router.post('/', limiter, (req, res) => {
    const b = req.body ?? {};
    // Bot tuzağı: görünmez alan doluysa ya da istemci tarayıcı değilse kaydetme (ama başarılı de)
    if (str(b.website, 200) || !isTrusted(req)) {
        record(req, 'bot-istemci');
        return res.json({ ok: true });
    }
    const kind = KINDS.includes(b.kind) ? (b.kind as (typeof KINDS)[number]) : 'diger';
    const now = new Date().toISOString();
    const page = str(b.page, 200);
    if (kind === 'oy') {
        const poll = str(b.poll, 40);
        const vote = str(b.vote, 40);
        if (!POLLS[poll] || !POLLS[poll].options[vote]) return res.status(400).json({ error: 'Geçersiz oy' });
        const voter = voterId(req.ip || '?', String(req.headers['user-agent'] || ''));
        const prev = db.prepare('SELECT id FROM feedback WHERE poll = ? AND voter = ?').get(poll, voter) as { id: number } | undefined;
        const text = str(b.text, 2000) || null;
        if (prev) db.prepare('UPDATE feedback SET vote = ?, at = ?, text = COALESCE(?, text) WHERE id = ?').run(vote, now, text, prev.id);
        else db.prepare("INSERT INTO feedback (at, kind, text, poll, vote, page, voter) VALUES (?, 'oy', ?, ?, ?, ?, ?)").run(now, text, poll, vote, page, voter);
        return res.json({ ok: true, changed: !!prev });
    }
    const text = str(b.text, 4000);
    if (text.length < 3) return res.status(400).json({ error: 'Biraz daha yaz' });
    db.prepare('INSERT INTO feedback (at, kind, text, name, contact, page) VALUES (?, ?, ?, ?, ?, ?)').run(now, kind, text, str(b.name, 60) || null, str(b.contact, 120) || null, page);
    res.json({ ok: true });
});

// --- Yönetim ---
router.get('/', requireAuth, (req, res) => {
    const status = STATUSES.includes(req.query.durum as never) ? String(req.query.durum) : null;
    const rows = db
        .prepare(`SELECT id, at, kind, text, name, contact, poll, vote, page, status, note FROM feedback ${status ? 'WHERE status = ?' : ''} ORDER BY id DESC LIMIT 500`)
        .all(...(status ? [status] : []));
    const counts = db.prepare('SELECT status, COUNT(*) AS n FROM feedback GROUP BY status').all();
    res.json({ items: rows, counts });
});

router.put('/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const status = STATUSES.includes(req.body?.status) ? req.body.status : null;
    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 1000) : null;
    if (status) db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id);
    if (note !== null) db.prepare('UPDATE feedback SET note = ? WHERE id = ?').run(note, id);
    res.json({ ok: true });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
    db.prepare('DELETE FROM feedback WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
});

export default router;
