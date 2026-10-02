import { Router } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware';
import { validateTerritory } from '../validation';

/** Sınırlar: krallık/bölge çokgenleri. Herkes okur, editör ve yöneticiler çizer. */
const router = Router();

type Row = { id: number; points: string; [k: string]: unknown };
const toJson = (r: Row) => ({ ...r, points: JSON.parse(r.points) as [number, number][] });
const getTerritory = (id: number) => db.prepare('SELECT * FROM territories WHERE id = ?').get(id) as Row | undefined;
const regionExists = (id: number) => !!db.prepare('SELECT 1 FROM regions WHERE id = ?').get(id);

router.get('/', (_req, res) => {
    const rows = db.prepare('SELECT * FROM territories ORDER BY sort, id').all() as Row[];
    res.json(rows.map(toJson));
});

router.post('/', requireAuth, (req, res) => {
    const v = validateTerritory(req.body, false);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const t = v.value;
    if (t.region_id && !regionExists(t.region_id)) return res.status(400).json({ error: 'Bölge bulunamadı' });
    const r = db
        .prepare('INSERT INTO territories (name, kind, color, points, region_id, note, sort, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(t.name!, t.kind ?? 'kingdom', t.color ?? '#c9a24d', t.points!, t.region_id ?? null, t.note ?? null, t.sort ?? 0, new Date().toISOString());
    res.status(201).json(toJson(getTerritory(Number(r.lastInsertRowid))!));
});

router.put('/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !getTerritory(id)) return res.status(404).json({ error: 'Sınır bulunamadı' });
    const v = validateTerritory(req.body, true);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (v.value.region_id && !regionExists(v.value.region_id)) return res.status(400).json({ error: 'Bölge bulunamadı' });
    // Sütun adları sabit listeden (validateTerritory) gelir; değerler parametreli
    const fields = Object.entries(v.value).filter(([, val]) => val !== undefined) as [string, string | number | null][];
    fields.push(['updated_at', new Date().toISOString()]);
    db.prepare(`UPDATE territories SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, val]) => val), id);
    res.json(toJson(getTerritory(id)!));
});

router.delete('/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const r = Number.isInteger(id) ? db.prepare('DELETE FROM territories WHERE id = ?').run(id) : { changes: 0 };
    if (r.changes === 0) return res.status(404).json({ error: 'Sınır bulunamadı' });
    res.json({ success: true });
});

export default router;
