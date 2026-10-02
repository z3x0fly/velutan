import { Request, Response, Router } from 'express';

/**
 * velutanmap.com köprüsü: 360° panoramalardaki geçiş ve bilgi noktaları ile wiki kayıtları.
 *
 * Veriler velutanmap.com'un herkese açık API'sinden canlı okunur ve kısa süre önbellekte tutulur; orada
 * yeni bir nokta ya da karakter eklenince burada da kendiliğinden görünür. Kaynağa ulaşılamazsa eldeki
 * son veri döner (yoksa boş liste): panorama yine açılır, yalnızca noktalar görünmez.
 *
 * Koordinatlar velutanmap'teki gibidir (photo-sphere-viewer): yaw 0 görselin ortası, sağa doğru artar;
 * pitch yukarı doğru artar; ikisi de derece.
 */

const SOURCE = 'https://api.velutanmap.com/api/public/entries/';
const SITE = 'https://velutanmap.com';
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 500;
const SLUG = /^[a-z0-9-]{1,80}$/;

interface Target {
    slug: string;
    title: string;
    kind: string;
}

interface SourceEntry {
    entry?: {
        slug?: string;
        title?: string;
        label?: string | null;
        summary?: string | null;
        coverImageUrl?: string | null;
        bodyMd?: string | null;
        kind?: string;
    };
    hotspots?: { id?: string; x?: number; y?: number; nav?: string; label?: string | null; target?: Partial<Target> }[];
    groups?: { title?: string; items?: { slug?: string; title?: string; label?: string | null; kind?: string }[] }[];
    refs?: Record<string, { title?: string; slug?: string; kind?: string }>;
    panoramas?: { slug?: string; title?: string }[];
}

const cache = new Map<string, { at: number; data: SourceEntry | null }>();
const inflight = new Map<string, Promise<SourceEntry | null>>();

async function fetchEntry(slug: string): Promise<SourceEntry | null> {
    const hit = cache.get(slug);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
    const running = inflight.get(slug);
    if (running) return running;
    const job = (async () => {
        try {
            const r = await fetch(SOURCE + encodeURIComponent(slug), {
                headers: { 'User-Agent': 'velutan.com.tr (velutanmap.com köprüsü)' },
                signal: AbortSignal.timeout(8000),
            });
            // Kayıt yoksa bu da önbelleğe girer (her açılışta yeniden sorulmasın)
            const data = r.ok ? ((await r.json()) as SourceEntry) : r.status === 404 ? null : (hit?.data ?? null);
            if (r.ok || r.status === 404) {
                if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
                cache.set(slug, { at: Date.now(), data });
            }
            return data;
        } catch {
            return hit?.data ?? null;
        } finally {
            inflight.delete(slug);
        }
    })();
    inflight.set(slug, job);
    return job;
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const pageUrl = (kind: string, slug: string) => `${SITE}/${kind === 'panorama' ? '360' : kind === 'location' ? 'loc' : 'w'}/${slug}`;

const router = Router();

/** Bir panoramadaki noktalar: jump (başka panoramaya geç) ya da info (wiki kaydını aç) */
router.get('/panorama/:slug/noktalar', async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    if (!SLUG.test(slug)) return res.status(400).json({ error: 'Geçersiz panorama' });
    const d = await fetchEntry(slug);
    const list = (d?.hotspots ?? [])
        .filter((h) => h.target?.slug && SLUG.test(h.target.slug))
        .slice(0, 60)
        .map((h) => ({
            id: text(h.id, 64) ?? `${h.target!.slug}-${h.x}-${h.y}`,
            yaw: num(h.x),
            pitch: num(h.y),
            nav: h.nav === 'jump' ? 'jump' : 'info',
            label: text(h.label, 80) ?? text(h.target!.title, 80) ?? h.target!.slug,
            target: { slug: h.target!.slug!, title: text(h.target!.title, 120) ?? h.target!.slug!, kind: text(h.target!.kind, 20) ?? 'content' },
        }));
    res.set('Cache-Control', 'public, max-age=300');
    res.json(list);
});

/** Wiki kaydı: başlık, özet, kapak, metin ve ilgili kayıtlar */
router.get('/kayit/:slug', async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    if (!SLUG.test(slug)) return res.status(400).json({ error: 'Geçersiz kayıt' });
    const d = await fetchEntry(slug);
    if (!d?.entry) return res.status(404).json({ error: 'Kayıt bulunamadı' });
    const e = d.entry;
    const kind = text(e.kind, 20) ?? 'content';
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
        slug,
        title: text(e.title, 160) ?? slug,
        label: text(e.label, 60),
        summary: text(e.summary, 1000),
        cover: text(e.coverImageUrl, 500),
        body: text(e.bodyMd, 60000),
        kind,
        url: pageUrl(kind, slug),
        // Metindeki [[bağlantı]]ların başlıkları
        refs: Object.fromEntries(
            Object.entries(d.refs ?? {})
                .filter(([k]) => SLUG.test(k))
                .slice(0, 200)
                .map(([k, v]) => [k, text(v?.title, 120) ?? k]),
        ),
        related: [...(d.groups ?? []), { title: '360° Mekânlar', items: (d.panoramas ?? []).map((p) => ({ ...p, label: '360°', kind: 'panorama' })) }].slice(0, 11).map((g) => ({
            title: text(g.title, 60) ?? '',
            items: (g.items ?? [])
                .filter((i) => i.slug && SLUG.test(i.slug))
                .slice(0, 30)
                .map((i) => ({ slug: i.slug!, title: text(i.title, 120) ?? i.slug!, label: text(i.label, 60), kind: text(i.kind, 20) ?? 'content' })),
        })),
    });
});

export default router;
