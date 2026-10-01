import { Router } from 'express';
import fs from 'fs';
import { config } from '../config';
import { hasImageSignature, imageUploader, uploadedUrl } from '../upload';
import { db } from '../db';
import { requireAuth } from '../middleware';
import { validateRegion } from '../validation';

const router = Router();
const upload = imageUploader('images', config.uploadMaxBytes);

interface RegionRow {
    id: number;
    created_at: string | null;
    [key: string]: unknown;
}

function formatRegion(r: RegionRow) {
    if (r.created_at) {
        const d = new Date(r.created_at.includes('T') ? r.created_at : r.created_at.replace(' ', 'T') + 'Z');
        if (!Number.isNaN(d.getTime())) r.created_at = d.toISOString();
    }
    return r;
}

const getRegion = (id: number) => db.prepare('SELECT * FROM regions WHERE id = ?').get(id) as RegionRow | undefined;

router.post('/upload-image/', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ detail: 'Görsel bulunamadı (jpg, png, webp, gif; en fazla 8 MB)' });
    if (!hasImageSignature(req.file.path)) {
        fs.unlink(req.file.path, () => undefined);
        return res.status(400).json({ detail: 'Dosya geçerli bir görsel değil' });
    }
    res.json({ url: uploadedUrl('images', req.file.filename) });
});

const PANORAMA_COLUMNS = 'id, region_id, slug, title, image, thumb, initial_yaw, initial_pitch, sort';

/** Bölgelere 360° panoramalarını ekler (tek sorgu) */
function withPanoramas(rows: RegionRow[]) {
    const all = db.prepare(`SELECT ${PANORAMA_COLUMNS} FROM panoramas ORDER BY region_id, sort, id`).all() as {
        region_id: number;
    }[];
    const byRegion = new Map<number, unknown[]>();
    for (const p of all) {
        const list = byRegion.get(p.region_id) ?? [];
        list.push(p);
        byRegion.set(p.region_id, list);
    }
    return rows.map((r) => ({ ...formatRegion(r), panoramas: byRegion.get(r.id) ?? [] }));
}

router.get('/', (req, res) => {
    const skip = Math.max(0, parseInt(String(req.query.skip), 10) || 0);
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit), 10) || 500));
    const rows = db.prepare('SELECT * FROM regions ORDER BY id LIMIT ? OFFSET ?').all(limit, skip) as RegionRow[];
    res.json(withPanoramas(rows));
});

router.get('/:slug', (req, res) => {
    const region = db.prepare('SELECT * FROM regions WHERE slug = ?').get(req.params.slug) as RegionRow | undefined;
    if (!region) return res.status(404).json({ detail: 'Bölge bulunamadı' });
    res.json(withPanoramas([region])[0]);
});

router.post('/', requireAuth, (req, res) => {
    const v = validateRegion(req.body, false);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const { name, slug, description, lore, image, type, x, y } = v.value;
    try {
        const result = db
            .prepare('INSERT INTO regions (name, slug, description, lore, image, type, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(name!, slug!, description ?? '', lore ?? '', image ?? '', type ?? 'city', x!, y!, new Date().toISOString());
        res.status(201).json(formatRegion(getRegion(Number(result.lastInsertRowid))!));
    } catch (err) {
        if (String(err).includes('UNIQUE')) return res.status(409).json({ error: 'Bu slug zaten kullanılıyor' });
        throw err;
    }
});

router.put('/:region_id', requireAuth, (req, res) => {
    const id = Number(req.params.region_id);
    if (!Number.isInteger(id) || !getRegion(id)) return res.status(404).json({ detail: 'Bölge bulunamadı' });
    const v = validateRegion(req.body, true);
    if (!v.ok) return res.status(400).json({ error: v.error });

    // Sütun adları sabit listeden gelir; değerler parametreli
    const fields = Object.entries(v.value).filter(([, val]) => val !== undefined) as [string, string | number][];
    if (fields.length > 0) {
        try {
            db.prepare(`UPDATE regions SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, val]) => val), id);
        } catch (err) {
            if (String(err).includes('UNIQUE')) return res.status(409).json({ error: 'Bu slug zaten kullanılıyor' });
            throw err;
        }
    }
    res.json(formatRegion(getRegion(id)!));
});

router.delete('/:region_id', requireAuth, (req, res) => {
    const id = Number(req.params.region_id);
    const result = Number.isInteger(id) ? db.prepare('DELETE FROM regions WHERE id = ?').run(id) : { changes: 0 };
    if (result.changes === 0) return res.status(404).json({ detail: 'Bölge bulunamadı' });
    res.json({ message: 'Bölge silindi' });
});

export default router;
