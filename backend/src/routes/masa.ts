import express, { Request, Response, Router } from 'express';
import crypto from 'crypto';

/**
 * Ortak masa: 360° savaşını oyuncularla canlı paylaşma.
 *
 * GM bir masa açar (gizli GM anahtarı alır) ve savaş durumunu buraya gönderir; oyuncular bağlantıyla
 * katılır, durumu Server-Sent Events ile canlı alır. Oyuncular durumu değiştiremez: yalnızca küçük
 * "eylem"ler yollar (kendi token'ını taşıma isteği, attığı zarın sonucu, karakter seçimi); GM'in
 * tarayıcısı bunları uygulayıp yeni durumu gönderir. Masalar bellekte tutulur (API tek süreç);
 * boş kalan masa 12 saat sonra silinir.
 */

interface Client {
    id: string;
    name: string;
    gm: boolean;
    character: string | null;
    res: Response;
}

interface Room {
    id: string;
    gmKey: string;
    /** Akış adresinde anahtarın kendisi değil özeti gezer (kayıtlara düşse de durum değiştirilemez) */
    gmHash: string;
    pano: { region: string; slug: string };
    state: unknown;
    version: number;
    createdAt: number;
    touchedAt: number;
    clients: Map<string, Client>;
}

const rooms = new Map<string, Room>();
const MAX_ROOMS = 300;
const MAX_CLIENTS = 40;
const IDLE_MS = 12 * 60 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // karışan harfler yok (0/O, 1/I)

const newCode = () => {
    const bytes = crypto.randomBytes(8);
    let s = '';
    for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
    return s;
};

const safeEq = (a: string, b: string) => {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Ad: kontrol karakterleri atılır, 24 karakter */
const cleanName = (v: unknown) =>
    String(v ?? '')
        .replace(/[\u0000-\u001f\u007f<>]/g, '')
        .trim()
        .slice(0, 24);
const slugOk = (v: unknown) => typeof v === 'string' && /^[a-z0-9-]{1,80}$/.test(v);
const idOk = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{4,40}$/.test(v);

function send(c: Client, event: string, data: unknown) {
    c.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function roster(room: Room) {
    return Array.from(room.clients.values()).map((c) => ({ id: c.id, name: c.name, gm: c.gm, character: c.character }));
}

function broadcast(room: Room, event: string, data: unknown, except?: string) {
    for (const c of room.clients.values()) if (c.id !== except) send(c, event, data);
}

// Boş ve eski masaları temizle
setInterval(() => {
    const now = Date.now();
    for (const [id, r] of rooms) if (r.clients.size === 0 && now - r.touchedAt > IDLE_MS) rooms.delete(id);
}, 10 * 60 * 1000).unref();

// Basit hız sınırı (IP başına)
const hits = new Map<string, { n: number; t: number }>();
function limited(key: string, max: number, windowMs: number) {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || now - h.t > windowMs) {
        hits.set(key, { n: 1, t: now });
        return false;
    }
    h.n++;
    return h.n > max;
}
setInterval(() => hits.clear(), 60 * 60 * 1000).unref();

const router = Router();
// Durum token görsellerini (küçültülmüş data URL) taşır: genel 1 MB sınırından büyük
router.use(express.json({ limit: '3mb' }));

/** Masa aç */
router.post('/', (req: Request, res: Response) => {
    if (limited(`open:${req.ip}`, 20, 60 * 60 * 1000)) return res.status(429).json({ error: 'Çok fazla masa açıldı, biraz bekle' });
    const { region, slug } = req.body ?? {};
    if (!slugOk(region) || !slugOk(slug)) return res.status(400).json({ error: 'Geçersiz mekân' });
    if (rooms.size >= MAX_ROOMS) return res.status(503).json({ error: 'Şu an çok fazla masa açık' });
    let id = newCode();
    while (rooms.has(id)) id = newCode();
    const gmKey = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    const gmHash = crypto.createHash('sha256').update(gmKey).digest('hex');
    rooms.set(id, { id, gmKey, gmHash, pano: { region, slug }, state: null, version: 0, createdAt: now, touchedAt: now, clients: new Map() });
    res.status(201).json({ id, gmKey });
});

/** Masa bilgisi (katılmadan önce: hangi mekân) */
router.get('/:id', (req: Request, res: Response) => {
    const room = rooms.get(String(req.params.id).toUpperCase());
    if (!room) return res.status(404).json({ error: 'Masa bulunamadı ya da kapandı' });
    res.json({ id: room.id, pano: room.pano, players: roster(room), gmOnline: roster(room).some((c) => c.gm) });
});

/** Canlı akış (SSE). ?istemci=..&ad=..&gm=<anahtarın sha256 özeti> */
router.get('/:id/akis', (req: Request, res: Response) => {
    const room = rooms.get(String(req.params.id).toUpperCase());
    if (!room) return res.status(404).json({ error: 'Masa bulunamadı ya da kapandı' });
    const clientId = req.query.istemci;
    if (!idOk(clientId)) return res.status(400).json({ error: 'Geçersiz istemci' });
    const gmKey = typeof req.query.gm === 'string' ? req.query.gm : '';
    const gm = !!gmKey && safeEq(gmKey, room.gmHash);
    if (room.clients.size >= MAX_CLIENTS && !room.clients.has(clientId as string)) return res.status(503).json({ error: 'Masa dolu' });

    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // nginx tamponlamasın: olaylar anında gitsin
        'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    // Aynı istemci yeniden bağlandıysa eski bağlantıyı kapat
    const old = room.clients.get(clientId as string);
    old?.res.end();
    const client: Client = { id: clientId as string, name: cleanName(req.query.ad) || (gm ? 'GM' : 'Oyuncu'), gm, character: old?.character ?? null, res };
    room.clients.set(client.id, client);
    room.touchedAt = Date.now();

    send(client, 'hos-geldin', { id: room.id, pano: room.pano, gm, you: client.id });
    if (room.state) send(client, 'durum', { version: room.version, state: room.state });
    broadcast(room, 'oyuncular', roster(room));

    const beat = setInterval(() => res.write(': nabız\n\n'), 25000);
    req.on('close', () => {
        clearInterval(beat);
        if (room.clients.get(client.id) === client) {
            room.clients.delete(client.id);
            room.touchedAt = Date.now();
            broadcast(room, 'oyuncular', roster(room));
        }
    });
});

/** GM durumu gönderir */
router.put('/:id/durum', (req: Request, res: Response) => {
    const room = rooms.get(String(req.params.id).toUpperCase());
    if (!room) return res.status(404).json({ error: 'Masa bulunamadı' });
    const { gmKey, state, pano } = req.body ?? {};
    if (typeof gmKey !== 'string' || !safeEq(gmKey, room.gmKey)) return res.status(403).json({ error: 'Yetki yok' });
    if (!state || typeof state !== 'object' || Array.isArray(state)) return res.status(400).json({ error: 'Geçersiz durum' });
    // GM mekân değiştirdiyse masa da taşınır
    if (pano && slugOk(pano.region) && slugOk(pano.slug)) room.pano = { region: pano.region, slug: pano.slug };
    room.state = state;
    room.version++;
    room.touchedAt = Date.now();
    broadcast(room, 'durum', { version: room.version, state, pano: room.pano });
    res.json({ version: room.version });
});

/** Oyuncu eylemi: GM'e (ve zar sonuçları herkese) iletilir */
const ACTIONS = new Set(['tasi', 'zar', 'karakter']);
router.post('/:id/eylem', (req: Request, res: Response) => {
    const room = rooms.get(String(req.params.id).toUpperCase());
    if (!room) return res.status(404).json({ error: 'Masa bulunamadı' });
    const { istemci, type } = req.body ?? {};
    const client = idOk(istemci) ? room.clients.get(istemci) : undefined;
    if (!client) return res.status(403).json({ error: 'Önce masaya bağlan' });
    if (!ACTIONS.has(type)) return res.status(400).json({ error: 'Geçersiz eylem' });
    if (limited(`act:${client.id}`, 60, 10 * 1000)) return res.status(429).json({ error: 'Yavaş' });
    if (JSON.stringify(req.body).length > 4000) return res.status(413).json({ error: 'Çok büyük' });

    const b = req.body;
    let payload: Record<string, unknown>;
    if (type === 'tasi') {
        if (!idOk(b.tokenId) || !Number.isInteger(b.cx) || !Number.isInteger(b.cz) || Math.abs(b.cx) > 500 || Math.abs(b.cz) > 500) return res.status(400).json({ error: 'Geçersiz hamle' });
        payload = { tokenId: b.tokenId, cx: b.cx, cz: b.cz };
    } else if (type === 'zar') {
        const values = Array.isArray(b.values) ? b.values.slice(0, 20).filter((v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 100) : [];
        // Atılan zarlar (günlükte şekilleriyle görünür): yalnızca geçerli zar türleri ve değerleri
        const SIDES = [4, 6, 8, 10, 12, 20, 100];
        const dice = Array.isArray(b.dice)
            ? b.dice
                  .slice(0, 20)
                  .filter((d: { s?: unknown; v?: unknown }) => d && SIDES.includes(d.s as number) && Number.isInteger(d.v) && (d.v as number) >= 0 && (d.v as number) <= (d.s as number))
                  .map((d: { s: number; v: number }) => ({ s: d.s, v: d.v }))
            : [];
        payload = { label: String(b.label ?? '').slice(0, 160), expr: String(b.expr ?? '').slice(0, 20), values, dice, total: Number.isFinite(b.total) ? Math.round(b.total) : 0, tone: String(b.tone ?? 'roll').slice(0, 10) };
    } else {
        if (b.tokenId !== null && !idOk(b.tokenId)) return res.status(400).json({ error: 'Geçersiz karakter' });
        client.character = b.tokenId;
        payload = { tokenId: b.tokenId };
        broadcast(room, 'oyuncular', roster(room));
    }
    room.touchedAt = Date.now();
    broadcast(room, 'eylem', { type, from: { id: client.id, name: client.name, character: client.character }, ...payload });
    res.json({ ok: true });
});

/** GM masayı kapatır */
router.delete('/:id', (req: Request, res: Response) => {
    const room = rooms.get(String(req.params.id).toUpperCase());
    if (!room) return res.status(204).end();
    const gmKey = String(req.body?.gmKey ?? req.query.gm ?? '');
    if (!safeEq(gmKey, room.gmKey)) return res.status(403).json({ error: 'Yetki yok' });
    broadcast(room, 'kapandi', {});
    for (const c of room.clients.values()) c.res.end();
    rooms.delete(room.id);
    res.status(204).end();
});

export default router;
