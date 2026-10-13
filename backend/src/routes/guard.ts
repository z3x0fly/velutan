import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware';
import { ban, guardStats, unban } from '../guard';
import { attackStats } from '../attacks';

/** Admin: Bekçi kayıtları ve yasaklar */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', (_req, res) => {
    res.json({ ...guardStats(), attacks: attackStats() });
});

// "1.2.3.4" (bütün IP) ya da "1.2.3.4#imza" (tek istemci)
const IP = /^[0-9a-fA-F:.]{3,45}(#[0-9a-f]{10})?$/;
router.post('/yasakla', (req, res) => {
    const ip = String(req.body?.ip ?? '');
    if (!IP.test(ip)) return res.status(400).json({ error: 'Geçersiz IP' });
    ban(ip, `elle: ${req.user?.username}`);
    res.json({ ok: true });
});
router.post('/kaldir', (req, res) => {
    const ip = String(req.body?.ip ?? '');
    if (!IP.test(ip)) return res.status(400).json({ error: 'Geçersiz IP' });
    unban(ip);
    res.json({ ok: true });
});

export default router;
