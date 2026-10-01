import { Router } from 'express';
import fs from 'fs';
import { config } from '../config';
import { db } from '../db';
import { requireAuth } from '../middleware';
import { hasImageSignature, imageUploader, uploadedUrl } from '../upload';
import { validatePanorama } from '../validation';

/** 360° panoramalar: bölgeye bağlı eşdikdörtgen (equirectangular) görseller. Editör ve yöneticiler yönetir. */
const router = Router();
const upload = imageUploader('panoramas', config.panoramaMaxBytes);
const getPanorama = (id: number) => db.prepare('SELECT * FROM panoramas WHERE id = ?').get(id);
const regionExists = (id: number) => !!db.prepare('SELECT 1 FROM regions WHERE id = ?').get(id);

router.get('/', (req, res) => {
    const regionId = Number(req.query.region_id);
    const rows = Number.isInteger(regionId)
        ? db.prepare('SELECT * FROM panoramas WHERE region_id = ? ORDER BY sort, id').all(regionId)
        : db.prepare('SELECT * FROM panoramas ORDER BY region_id, sort, id').all();
    res.json(rows);
});

router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ detail: 'Görsel bulunamadı (jpg, png, webp; en fazla 30 MB)' });
    if (!hasImageSignature(req.file.path)) {
        fs.unlink(req.file.path, () => undefined);
        return res.status(400).json({ detail: 'Dosya geçerli bir görsel değil' });
    }
    res.json({ url: uploadedUrl('panoramas', req.file.filename) });
});

router.post('/', requireAuth, (req, res) => {
    const v = validatePanorama(req.body, false);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const p = v.value;
    if (!regionExists(p.region_id!)) return res.status(400).json({ error: 'Bölge bulunamadı' });
    const nextSort = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM panoramas WHERE region_id = ?').get(p.region_id!) as { n: number };
    try {
        const r = db
            .prepare(
                'INSERT INTO panoramas (region_id, slug, title, image, thumb, initial_yaw, initial_pitch, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            )
            .run(p.region_id!, p.slug!, p.title!, p.image!, p.thumb ?? null, p.initial_yaw ?? 0, p.initial_pitch ?? 0, p.sort ?? nextSort.n, new Date().toISOString());
        res.status(201).json(getPanorama(Number(r.lastInsertRowid)));
    } catch (err) {
        if (String(err).includes('UNIQUE')) return res.status(409).json({ error: 'Bu slug zaten kullanılıyor' });
        throw err;
    }
});

router.put('/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !getPanorama(id)) return res.status(404).json({ error: 'Panorama bulunamadı' });
    const v = validatePanorama(req.body, true);
    if (!v.ok) return res.status(400).json({ error: v.error });
    if (v.value.region_id !== undefined && !regionExists(v.value.region_id)) return res.status(400).json({ error: 'Bölge bulunamadı' });
    // Sütun adları sabit listeden (validatePanorama) gelir; değerler parametreli
    const fields = Object.entries(v.value).filter(([, val]) => val !== undefined) as [string, string | number][];
    if (fields.length > 0) {
        try {
            db.prepare(`UPDATE panoramas SET ${fields.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...fields.map(([, val]) => val), id);
        } catch (err) {
            if (String(err).includes('UNIQUE')) return res.status(409).json({ error: 'Bu slug zaten kullanılıyor' });
            throw err;
        }
    }
    res.json(getPanorama(id));
});

router.delete('/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const r = Number.isInteger(id) ? db.prepare('DELETE FROM panoramas WHERE id = ?').run(id) : { changes: 0 };
    if (r.changes === 0) return res.status(404).json({ error: 'Panorama bulunamadı' });
    res.json({ success: true });
});

export default router;
