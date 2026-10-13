import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware';
import { db } from '../db';
import { isSyncRunning, runSync } from '../sync';

/** Admin: velutanmap.com senkronu (durum, geçmiş, elle başlat) */
const router = Router();
router.use(requireAuth);

router.get('/', (_req, res) => {
    const log = (db.prepare('SELECT id, at, ok, summary FROM sync_log ORDER BY id DESC LIMIT 20').all() as { summary: string }[]).map((r) => ({
        ...r,
        summary: JSON.parse(r.summary),
    }));
    const counts = {
        kayit: (db.prepare('SELECT COUNT(*) AS n FROM lore_entries').get() as { n: number }).n,
        bolge: (db.prepare("SELECT COUNT(*) AS n FROM regions WHERE source = 'velutanmap'").get() as { n: number }).n,
        panorama: (db.prepare("SELECT COUNT(*) AS n FROM panoramas WHERE source = 'velutanmap'").get() as { n: number }).n,
    };
    res.json({ running: isSyncRunning(), log, counts });
});

router.post('/', requireAdmin, async (_req, res) => {
    const summary = await runSync();
    res.json(summary);
});

export default router;
