/**
 * Bölge seed'i: seed/regions.json -> veritabanı.
 *   npm run seed                  eksik slug'ları ekler (mevcutlara dokunmaz)
 *   npm run seed -- --force       mevcut slug'ları da seed içeriğiyle günceller
 *   npm run seed -- --remove-demo eski 2D haritanın deneme kayıtlarını siler
 * 360° panoramalar seed/panoramas.json'dan (kaynak: velutanmap.com) eklenir.
 */
import fs from 'fs';
import path from 'path';
import { db } from './db';
import { validatePanorama, validateRegion } from './validation';

const DEMO_SLUGS = ['test', 'velutan-keep', 'crystal-valley', 'black-forest', 'dragons-tooth'];

const args = new Set(process.argv.slice(2));
const file = path.join(__dirname, '..', 'seed', 'regions.json');
const { regions } = JSON.parse(fs.readFileSync(file, 'utf8')) as { regions: unknown[] };

let inserted = 0, updated = 0, skipped = 0, panoInserted = 0;
const find = db.prepare('SELECT id FROM regions WHERE slug = ?');
const insert = db.prepare(
    'INSERT INTO regions (name, slug, description, lore, image, type, x, y, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
);
const update = db.prepare('UPDATE regions SET name = ?, description = ?, lore = ?, image = ?, type = ?, x = ?, y = ? WHERE id = ?');

db.exec('BEGIN');
try {
    if (args.has('--remove-demo')) {
        const del = db.prepare('DELETE FROM regions WHERE slug = ?');
        for (const slug of DEMO_SLUGS) del.run(slug);
    }
    for (const raw of regions) {
        const v = validateRegion(raw, false);
        if (!v.ok) throw new Error(`Geçersiz seed kaydı (${JSON.stringify(raw).slice(0, 60)}…): ${v.error}`);
        const r = v.value;
        const existing = find.get(r.slug!) as { id: number } | undefined;
        if (!existing) {
            insert.run(r.name!, r.slug!, r.description ?? '', r.lore ?? '', r.image ?? '', r.type ?? 'city', r.x!, r.y!, new Date().toISOString());
            inserted++;
        } else if (args.has('--force')) {
            update.run(r.name!, r.description ?? '', r.lore ?? '', r.image ?? '', r.type ?? 'city', r.x!, r.y!, existing.id);
            updated++;
        } else {
            skipped++;
        }
    }
    // --- 360° panoramalar
    const panoFile = path.join(__dirname, '..', 'seed', 'panoramas.json');
    if (fs.existsSync(panoFile)) {
        const { panoramas } = JSON.parse(fs.readFileSync(panoFile, 'utf8')) as { panoramas: ({ region: string } & Record<string, unknown>)[] };
        const findPano = db.prepare('SELECT id FROM panoramas WHERE slug = ?');
        const insertPano = db.prepare(
            'INSERT INTO panoramas (region_id, slug, title, image, thumb, initial_yaw, initial_pitch, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        const updatePano = db.prepare(
            'UPDATE panoramas SET region_id = ?, title = ?, image = ?, thumb = ?, initial_yaw = ?, initial_pitch = ?, sort = ? WHERE id = ?',
        );
        for (const raw of panoramas) {
            const region = find.get(raw.region) as { id: number } | undefined;
            if (!region) continue;
            const v = validatePanorama({ ...raw, region_id: region.id }, false);
            if (!v.ok) throw new Error(`Geçersiz panorama (${String(raw.slug)}): ${v.error}`);
            const p = v.value;
            const existing = findPano.get(p.slug!) as { id: number } | undefined;
            if (!existing) {
                insertPano.run(region.id, p.slug!, p.title!, p.image!, p.thumb ?? null, p.initial_yaw ?? 0, p.initial_pitch ?? 0, p.sort ?? 0, new Date().toISOString());
                panoInserted++;
            } else if (args.has('--force')) {
                updatePano.run(region.id, p.title!, p.image!, p.thumb ?? null, p.initial_yaw ?? 0, p.initial_pitch ?? 0, p.sort ?? 0, existing.id);
            }
        }
    }
    db.exec('COMMIT');
} catch (err) {
    db.exec('ROLLBACK');
    throw err;
}
console.log(`Seed tamam: ${inserted} bölge eklendi, ${updated} güncellendi, ${skipped} atlandı; ${panoInserted} panorama eklendi.`);
