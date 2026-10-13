import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { config } from './config';
import { db } from './db';

/**
 * velutanmap.com senkronu (INTCH'in izniyle): oradaki yeni yerler, 360° mekânlar ve wiki kayıtları buraya
 * kendiliğinden gelir. Açılıştan 1 dakika sonra ve her 6 saatte bir çalışır; admin panelinden elle de.
 *
 * - Wiki kayıtlarının hepsi (karakter, yer, hikâye, 360°) lore_entries tablosuna: kendi sayfalarında
 *   (/kayit/...) yayınlanır, Google'da çıkar.
 * - Yeni yer (bizde olmayan): haritaya bölge olarak eklenir. Koordinat, iki haritada da bulunan yerlerden
 *   hesaplanan dönüşümle (en küçük kareler) velutanmap haritasından bizimkine çevrilir.
 * - Yeri velutanmap'te taşınan bölge: taşıma bizde de uygulanır (ilk senkron yalnızca başlangıcı kaydeder;
 *   editörlerin bizde elle yaptığı düzeltmeler ezilmez, yalnızca ORADAKİ değişiklik aktarılır).
 * - Yeni 360°: görsel indirilir (WebP q92 + küçük resim), bölgesine eklenir. Oradaki görsel değişirse yenilenir.
 * - Yeni sayfalar IndexNow ile Bing/Yandex'e bildirilir.
 */

const SOURCE = 'https://api.velutanmap.com/api/public/';
const SITE = process.env.SITE_URL || 'https://velutan.com.tr';
const UA = { 'User-Agent': 'velutan.com.tr senkron (INTCH izniyle)' };
const SLUG = /^[a-z0-9-]{1,80}$/;
const EVERY_MS = 6 * 60 * 60 * 1000;
const PANO_DIR = path.join(config.staticDir, 'panoramas', 'sync');

db.exec(`
    CREATE TABLE IF NOT EXISTS lore_entries (
        slug TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        title TEXT NOT NULL,
        label TEXT,
        summary TEXT,
        cover TEXT,
        body TEXT,
        refs TEXT,
        related TEXT,
        hotspots TEXT,
        place TEXT,
        panorama_image TEXT,
        source_updated TEXT,
        synced_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        ok INTEGER NOT NULL,
        summary TEXT NOT NULL
    );
`);
const regionCols = db.prepare('PRAGMA table_info(regions)').all() as { name: string }[];
if (!regionCols.some((c) => c.name === 'source')) db.exec('ALTER TABLE regions ADD COLUMN source TEXT');
const panoCols = db.prepare('PRAGMA table_info(panoramas)').all() as { name: string }[];
if (!panoCols.some((c) => c.name === 'source')) db.exec('ALTER TABLE panoramas ADD COLUMN source TEXT');

const metaGet = (k: string) => (db.prepare('SELECT value FROM meta WHERE key = ?').get(k) as { value: string } | undefined)?.value;
const metaSet = (k: string, v: string) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);

async function getJson<T>(url: string): Promise<T> {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return (await r.json()) as T;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Marker {
    mapId: string;
    x: number;
    y: number;
    slug: string;
    title: string;
}
interface Entry {
    entry: {
        slug: string;
        title: string;
        label: string | null;
        summary: string | null;
        coverImageUrl: string | null;
        bodyMd: string | null;
        kind: string;
        icon: string | null;
        panorama: { imageUrl: string; initialYaw: number; initialPitch: number } | null;
        updatedAt: string;
    };
    refs?: Record<string, { title?: string }>;
    groups?: { title: string; items: { slug: string; title: string; label: string | null; kind: string }[] }[];
    panoramas?: { slug: string; title: string }[];
    placedIn?: { slug: string; title: string; kind: string }[];
    hotspots?: unknown[];
    backlinks?: { slug: string; title: string }[];
}

const ICON_TYPE: Record<string, string> = {
    kale: 'fortress',
    kule: 'fortress',
    sehir: 'city',
    koy: 'city',
    liman: 'city',
    han: 'city',
    magara: 'ruin',
    tapinak: 'lore',
    dag: 'landmark',
    orman: 'landmark',
};

/** İsim karşılaştırma: Türkçe harfler, boşluk ve noktalama farkı yok sayılır */
const norm = (t: string) =>
    t
        .toLocaleLowerCase('tr')
        .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z]/g, '');
function lev(a: string, b: string) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
}
/** "Asna Ortelliath" ~ "Asna Orteliath", "Grim" ~ "Grim Adası", "Durnfalir" ~ "Durn Falir" */
function similarName(a: string, b: string) {
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    if (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x))) return true;
    return Math.min(x.length, y.length) >= 6 && lev(x, y) <= 2;
}

/** Affin dönüşüm (en küçük kareler): velutanmap'in 0..1 koordinatı -> bizim harita pikseli */
function fitAffine(pairs: { u: number; v: number; x: number; y: number }[]) {
    // Normal denklemler: [u v 1] * A = [x y]
    const m = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    const bx = [0, 0, 0];
    const by = [0, 0, 0];
    for (const p of pairs) {
        const r = [p.u, p.v, 1];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) m[i][j] += r[i] * r[j];
            bx[i] += r[i] * p.x;
            by[i] += r[i] * p.y;
        }
    }
    const solve = (b: number[]) => {
        const a = m.map((row, i) => [...row, b[i]]);
        for (let c = 0; c < 3; c++) {
            let piv = c;
            for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[piv][c])) piv = r;
            [a[c], a[piv]] = [a[piv], a[c]];
            for (let r = 0; r < 3; r++) {
                if (r === c) continue;
                const f = a[r][c] / a[c][c];
                for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
            }
        }
        return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
    };
    const cx = solve(bx);
    const cy = solve(by);
    const apply = (u: number, v: number) => [cx[0] * u + cx[1] * v + cx[2], cy[0] * u + cy[1] * v + cy[2]] as const;
    const err = Math.max(...pairs.map((p) => Math.hypot(apply(p.u, p.v)[0] - p.x, apply(p.u, p.v)[1] - p.y)));
    return { apply, err };
}

const safeUrl = (u: string) => {
    const p = new URL(u);
    p.pathname = p.pathname.split('/').map((s) => encodeURIComponent(decodeURIComponent(s))).join('/');
    return p.toString();
};

/** Görseli indirir: WebP q92 (kaynak kalitesinde, ~1/4 boyut) + 640px küçük resim. Dosya adı içerik özetli. */
async function downloadPanorama(slug: string, url: string) {
    const r = await fetch(safeUrl(url), { headers: UA, signal: AbortSignal.timeout(180000) });
    if (!r.ok) throw new Error(`görsel ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 60 * 1024 * 1024) throw new Error('görsel çok büyük');
    const hash = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 8);
    fs.mkdirSync(path.join(PANO_DIR, 'thumbs'), { recursive: true });
    const name = `${slug}-${hash}.webp`;
    await sharp(buf, { limitInputPixels: 80_000_000 }).webp({ quality: 92 }).toFile(path.join(PANO_DIR, name));
    await sharp(buf, { limitInputPixels: 80_000_000 }).resize(640).webp({ quality: 78 }).toFile(path.join(PANO_DIR, 'thumbs', name));
    return { image: `/static/panoramas/sync/${name}`, thumb: `/static/panoramas/sync/thumbs/${name}` };
}

/** IndexNow: yeni/değişen sayfaları Bing ve Yandex'e bildirir (Google sitemap'i okur) */
async function indexNow(paths: string[]) {
    const key = process.env.INDEXNOW_KEY || 'e772a4b5eeedaef0c5a98cac9a94be74';
    if (!key || paths.length === 0) return;
    const host = new URL(SITE).host;
    await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, key, keyLocation: `${SITE}/${key}.txt`, urlList: paths.slice(0, 1000).map((p) => SITE + p) }),
        signal: AbortSignal.timeout(15000),
    }).catch(() => undefined);
}

let running: Promise<SyncSummary> | null = null;

export interface SyncSummary {
    entries: number;
    newEntries: string[];
    newRegions: string[];
    movedRegions: string[];
    newPanoramas: string[];
    updatedPanoramas: string[];
    errors: string[];
    transformError: number | null;
    ms: number;
}

export function runSync(): Promise<SyncSummary> {
    if (!running) running = doSync().finally(() => (running = null));
    return running;
}
export const isSyncRunning = () => !!running;

async function doSync(): Promise<SyncSummary> {
    const t0 = Date.now();
    const s: SyncSummary = { entries: 0, newEntries: [], newRegions: [], movedRegions: [], newPanoramas: [], updatedPanoramas: [], errors: [], transformError: null, ms: 0 };
    try {
        // 1) Haritadaki işaretler ve hangi haritanın bizimkiyle örtüştüğü
        const boot = await getJson<{ markers: Marker[] }>(SOURCE + 'bootstrap');
        const ours = db.prepare('SELECT id, slug, name, x, y, source FROM regions').all() as { id: number; slug: string; name: string; x: number; y: number; source: string | null }[];
        const bySlug = new Map(ours.map((r) => [r.slug, r]));
        // velutanmap slug'ı -> bizdeki bölge: aynı slug, önceden kaydedilen eşleşme ya da benzer isim
        const resolve = (slug: string, title: string) => {
            const direct = bySlug.get(slug);
            if (direct) return direct;
            const alias = metaGet(`vm:alias:${slug}`);
            if (alias && bySlug.has(alias)) return bySlug.get(alias)!;
            // Önce birebir (harf farkı yok), yoksa tek bir benzer isim
            const exact = ours.filter((r) => norm(r.name) === norm(title) || norm(r.slug) === norm(slug));
            const byName = exact.length ? exact : ours.filter((r) => similarName(r.name, title) || similarName(r.slug, slug));
            if (byName.length === 1) {
                metaSet(`vm:alias:${slug}`, byName[0].slug);
                return byName[0];
            }
            return undefined;
        };
        const maps = new Map<string, Marker[]>();
        for (const m of boot.markers ?? []) if (m.slug && SLUG.test(m.slug)) maps.set(m.mapId, [...(maps.get(m.mapId) ?? []), m]);
        let best: { mapId: string; apply: (u: number, v: number) => readonly [number, number]; err: number } | null = null;
        for (const [mapId, ms] of maps) {
            // Taşınmış olabilecek yerler dışarıda kalsın: önceki senkronda kaydedilen konumla aynı olanlar
            const pairs = ms
                .filter((m) => resolve(m.slug, m.title) && (metaGet(`vm:pos:${m.slug}`) ?? `${m.x},${m.y}`) === `${m.x},${m.y}`)
                .map((m) => ({ u: m.x, v: m.y, x: resolve(m.slug, m.title)!.x, y: resolve(m.slug, m.title)!.y }));
            if (pairs.length < 4) continue;
            // Aykırı noktaları ayıkla (bizde elle düzeltilmiş ya da orada taşınmış yerler): en kötüsünü at, yeniden uydur
            let fit = fitAffine(pairs);
            while (fit.err > 30 && pairs.length > 6) {
                let worst = 0;
                let wd = -1;
                pairs.forEach((p, i) => {
                    const [x, y] = fit.apply(p.u, p.v);
                    const d = Math.hypot(x - p.x, y - p.y);
                    if (d > wd) (wd = d), (worst = i);
                });
                pairs.splice(worst, 1);
                fit = fitAffine(pairs);
            }
            if (!best || fit.err < best.err) best = { mapId, ...fit };
        }
        if (best) s.transformError = Math.round(best.err);
        const transformOk = !!best && best.err < 60;

        // 2) Bütün kayıtları dolaş (işaretlerden başlayıp bağlantılarla)
        const queue = [...new Set((boot.markers ?? []).map((m) => m.slug).filter((x) => SLUG.test(x)))];
        const known = db.prepare('SELECT slug FROM lore_entries').all() as { slug: string }[];
        for (const k of known) if (!queue.includes(k.slug)) queue.push(k.slug);
        const seen = new Map<string, Entry>();
        while (queue.length && seen.size < 2000) {
            const slug = queue.shift()!;
            if (seen.has(slug)) continue;
            try {
                const d = await getJson<Entry>(SOURCE + 'entries/' + encodeURIComponent(slug));
                seen.set(slug, d);
                const links = [
                    ...(d.groups ?? []).flatMap((g) => g.items.map((i) => i.slug)),
                    ...(d.panoramas ?? []).map((p) => p.slug),
                    ...(d.placedIn ?? []).map((p) => p.slug),
                    ...(d.backlinks ?? []).map((p) => p.slug),
                    ...Object.keys(d.refs ?? {}),
                ];
                for (const l of links) if (SLUG.test(l) && !seen.has(l)) queue.push(l);
            } catch (e) {
                if (!String(e).startsWith('Error: 404')) s.errors.push(`${slug}: ${String(e).slice(0, 80)}`);
            }
            await sleep(150); // kaynağa nazik ol
        }
        s.entries = seen.size;

        // 3) Wiki kayıtları
        const upsert = db.prepare(`INSERT INTO lore_entries (slug, kind, title, label, summary, cover, body, refs, related, hotspots, place, panorama_image, source_updated, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET kind=excluded.kind, title=excluded.title, label=excluded.label, summary=excluded.summary, cover=excluded.cover,
            body=excluded.body, refs=excluded.refs, related=excluded.related, hotspots=excluded.hotspots, place=excluded.place,
            panorama_image=excluded.panorama_image, source_updated=excluded.source_updated, synced_at=excluded.synced_at`);
        const existing = new Set(known.map((k) => k.slug));
        const now = new Date().toISOString();
        for (const [slug, d] of seen) {
            const e = d.entry;
            const related = [
                ...(d.groups ?? []).map((g) => ({ title: g.title, items: g.items.map((i) => ({ slug: i.slug, title: i.title, label: i.label, kind: i.kind })) })),
                ...((d.panoramas ?? []).length ? [{ title: '360° Mekânlar', items: d.panoramas!.map((p) => ({ slug: p.slug, title: p.title, label: '360°', kind: 'panorama' })) }] : []),
            ];
            const refs = Object.fromEntries(Object.entries(d.refs ?? {}).map(([k, v]) => [k, v?.title ?? k]));
            upsert.run(
                slug,
                e.kind,
                e.title,
                e.label,
                e.summary || null,
                e.coverImageUrl,
                e.bodyMd,
                JSON.stringify(refs),
                JSON.stringify(related),
                JSON.stringify(d.hotspots ?? []),
                d.placedIn?.[0]?.slug ?? null,
                e.panorama?.imageUrl ?? null,
                e.updatedAt,
                now,
            );
            if (!existing.has(slug) && known.length > 0) s.newEntries.push(slug);
        }

        // 4) Yerler: yeni olanı ekle, orada taşınanı burada da taşı
        const firstRun = !metaGet('vm:synced');
        if (best && transformOk) {
            const insertRegion = db.prepare(
                "INSERT INTO regions (name, slug, description, lore, image, type, x, y, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'velutanmap')",
            );
            for (const m of maps.get(best.mapId) ?? []) {
                const d = seen.get(m.slug);
                if (!d || d.entry.kind !== 'location') continue;
                const [x, y] = best.apply(m.x, m.y).map(Math.round);
                const prev = metaGet(`vm:pos:${m.slug}`);
                let ourRow = resolve(m.slug, d.entry.title);
                // İsim tutmasa da haritada aynı noktadaysa aynı yerdir
                if (!ourRow) {
                    const near = ours.find((r) => Math.hypot(r.x - x, r.y - y) < 60);
                    if (near) {
                        metaSet(`vm:alias:${m.slug}`, near.slug);
                        ourRow = near;
                    }
                }
                if (!ourRow) {
                    insertRegion.run(d.entry.title, m.slug, d.entry.summary ?? '', d.entry.bodyMd ?? '', d.entry.coverImageUrl ?? '', ICON_TYPE[d.entry.icon ?? ''] ?? 'lore', x, y, now);
                    s.newRegions.push(m.slug);
                } else if (!firstRun && prev && prev !== `${m.x},${m.y}`) {
                    db.prepare('UPDATE regions SET x = ?, y = ? WHERE id = ?').run(x, y, ourRow.id);
                    s.movedRegions.push(m.slug);
                }
                metaSet(`vm:pos:${m.slug}`, `${m.x},${m.y}`);
            }
        } else if (best) s.errors.push(`Harita dönüşümü güvenilmez (hata ${Math.round(best.err)} px): yerler aktarılmadı`);

        // 5) 360° mekânlar
        const regionId = new Map((db.prepare('SELECT id, slug FROM regions').all() as { id: number; slug: string }[]).map((r) => [r.slug, r.id]));
        const ourPanos = new Map(
            (db.prepare('SELECT id, slug FROM panoramas').all() as { id: number; slug: string }[]).map((p) => [p.slug, p.id]),
        );
        for (const [slug, d] of seen) {
            const p = d.entry.panorama;
            if (d.entry.kind !== 'panorama' || !p?.imageUrl) continue;
            const regionOf = (slug: string) => regionId.get(slug) ?? regionId.get(metaGet(`vm:alias:${slug}`) ?? '');
            const placeRef = d.placedIn?.find((x) => regionOf(x.slug));
            if (!placeRef) continue;
            const place = { slug: placeRef.slug, id: regionOf(placeRef.slug)! };
            const prevUrl = metaGet(`vm:pano:${slug}`);
            const id = ourPanos.get(slug);
            try {
                if (!id) {
                    const files = await downloadPanorama(slug, p.imageUrl);
                    const sort = (db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM panoramas WHERE region_id = ?').get(place.id) as { n: number }).n;
                    db.prepare(
                        "INSERT INTO panoramas (region_id, slug, title, image, thumb, initial_yaw, initial_pitch, sort, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'velutanmap')",
                    ).run(place.id, slug, d.entry.title, files.image, files.thumb, p.initialYaw || 0, p.initialPitch || 0, sort, now);
                    s.newPanoramas.push(slug);
                } else if (!firstRun && prevUrl && prevUrl !== `${p.imageUrl}|${d.entry.updatedAt}`) {
                    const files = await downloadPanorama(slug, p.imageUrl);
                    db.prepare('UPDATE panoramas SET image = ?, thumb = ?, title = ? WHERE id = ?').run(files.image, files.thumb, d.entry.title, id);
                    s.updatedPanoramas.push(slug);
                }
                metaSet(`vm:pano:${slug}`, `${p.imageUrl}|${d.entry.updatedAt}`);
            } catch (e) {
                s.errors.push(`360 ${slug}: ${String(e).slice(0, 80)}`);
            }
        }
        metaSet('vm:synced', now);

        await indexNow([
            ...s.newRegions.map((x) => `/bolge/${x}`),
            ...s.movedRegions.map((x) => `/bolge/${x}`),
            ...s.newEntries.map((x) => `/kayit/${x}`),
        ]);
    } catch (e) {
        s.errors.push(String(e).slice(0, 200));
    }
    s.ms = Date.now() - t0;
    db.prepare('INSERT INTO sync_log (at, ok, summary) VALUES (?, ?, ?)').run(new Date().toISOString(), s.errors.length ? 0 : 1, JSON.stringify(s));
    db.prepare('DELETE FROM sync_log WHERE id NOT IN (SELECT id FROM sync_log ORDER BY id DESC LIMIT 100)').run();
    console.log(`[senkron] ${s.entries} kayıt, yeni yer ${s.newRegions.length}, taşınan ${s.movedRegions.length}, yeni 360 ${s.newPanoramas.length}, hata ${s.errors.length} (${s.ms} ms)`);
    return s;
}

export function startSync() {
    if (process.env.SYNC_DISABLED === '1') return;
    setTimeout(() => void runSync(), 60_000).unref();
    setInterval(() => void runSync(), EVERY_MS).unref();
}
