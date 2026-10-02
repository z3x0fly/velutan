export const MAP_WIDTH = 8192;
export const MAP_HEIGHT = 7192;
export const REGION_TYPES = ['capital', 'city', 'fortress', 'ruin', 'landmark', 'character', 'lore', 'event'] as const;

export interface RegionInput {
    name?: string;
    slug?: string;
    description?: string;
    lore?: string;
    image?: string;
    type?: string;
    x?: number;
    y?: number;
}

type Result = { ok: true; value: RegionInput } | { ok: false; error: string };

const LIMITS = { name: 120, slug: 120, description: 1000, lore: 50000, image: 500 };

/** Bölge gövdesini doğrular. partial=true ise (PUT) yalnızca gönderilen alanlar kontrol edilir. */
export function validateRegion(body: unknown, partial: boolean): Result {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Geçersiz gövde' };
    const b = body as Record<string, unknown>;
    const out: RegionInput = {};

    for (const key of ['name', 'slug', 'description', 'lore', 'image', 'type'] as const) {
        const v = b[key];
        if (v === undefined || v === null) continue;
        if (typeof v !== 'string') return { ok: false, error: `${key} metin olmalı` };
        if (v.length > LIMITS[key as keyof typeof LIMITS]) return { ok: false, error: `${key} çok uzun` };
        out[key] = v.trim();
    }
    for (const key of ['x', 'y'] as const) {
        const v = b[key];
        if (v === undefined || v === null || v === '') continue;
        const n = typeof v === 'number' ? v : Number(v);
        const max = key === 'x' ? MAP_WIDTH : MAP_HEIGHT;
        if (!Number.isFinite(n) || n < 0 || n > max) return { ok: false, error: `${key} 0-${max} arasında olmalı` };
        out[key] = n;
    }

    if (out.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(out.slug)) {
        return { ok: false, error: 'slug yalnızca küçük harf, rakam ve tire içerebilir' };
    }
    if (out.type !== undefined && !(REGION_TYPES as readonly string[]).includes(out.type)) {
        return { ok: false, error: `type şunlardan biri olmalı: ${REGION_TYPES.join(', ')}` };
    }
    if (out.image && !/^(https?:\/\/|\/static\/)/.test(out.image)) {
        return { ok: false, error: 'image bir http(s) adresi ya da /static/ yolu olmalı' };
    }
    if (!partial) {
        if (!out.name) return { ok: false, error: 'name zorunlu' };
        if (!out.slug) return { ok: false, error: 'slug zorunlu' };
        if (out.x === undefined || out.y === undefined) return { ok: false, error: 'x ve y zorunlu' };
    }
    return { ok: true, value: out };
}

export interface PanoramaInput {
    region_id?: number;
    slug?: string;
    title?: string;
    image?: string;
    thumb?: string;
    initial_yaw?: number;
    initial_pitch?: number;
    sort?: number;
}

type PanoramaResult = { ok: true; value: PanoramaInput } | { ok: false; error: string };

export function validatePanorama(body: unknown, partial: boolean): PanoramaResult {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Geçersiz gövde' };
    const b = body as Record<string, unknown>;
    const out: PanoramaInput = {};
    for (const key of ['slug', 'title', 'image', 'thumb'] as const) {
        const v = b[key];
        if (v === undefined || v === null) continue;
        if (typeof v !== 'string' || v.length > 500) return { ok: false, error: `${key} geçersiz` };
        out[key] = v.trim();
    }
    for (const key of ['region_id', 'initial_yaw', 'initial_pitch', 'sort'] as const) {
        const v = b[key];
        if (v === undefined || v === null || v === '') continue;
        const n = Number(v);
        if (!Number.isFinite(n)) return { ok: false, error: `${key} sayı olmalı` };
        out[key] = n;
    }
    if (out.slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(out.slug)) {
        return { ok: false, error: 'slug yalnızca küçük harf, rakam ve tire içerebilir' };
    }
    for (const key of ['image', 'thumb'] as const) {
        const v = out[key];
        if (v && !/^(https?:\/\/|\/static\/)/.test(v)) return { ok: false, error: `${key} bir http(s) adresi ya da /static/ yolu olmalı` };
    }
    if (out.initial_yaw !== undefined) out.initial_yaw = ((out.initial_yaw % 360) + 360) % 360;
    if (out.initial_pitch !== undefined) out.initial_pitch = Math.max(-85, Math.min(85, out.initial_pitch));
    if (!partial && (!out.region_id || !out.slug || !out.title || !out.image)) {
        return { ok: false, error: 'region_id, slug, title ve image zorunlu' };
    }
    return { ok: true, value: out };
}

export const TERRITORY_KINDS = ['kingdom', 'province', 'wild', 'danger', 'sacred'] as const;

export interface TerritoryInput {
    name?: string;
    kind?: string;
    color?: string;
    points?: string;
    region_id?: number | null;
    note?: string;
    sort?: number;
}

type TerritoryResult = { ok: true; value: TerritoryInput } | { ok: false; error: string };

/** Sınır çokgeni: 3-400 köşe, her köşe harita sınırları içinde; JSON olarak saklanır. */
export function validateTerritory(body: unknown, partial: boolean): TerritoryResult {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Geçersiz gövde' };
    const b = body as Record<string, unknown>;
    const out: TerritoryInput = {};
    if (b.name !== undefined) {
        if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 120) return { ok: false, error: 'name geçersiz' };
        out.name = b.name.trim();
    }
    if (b.note !== undefined && b.note !== null) {
        if (typeof b.note !== 'string' || b.note.length > 2000) return { ok: false, error: 'note geçersiz' };
        out.note = b.note.trim();
    }
    if (b.kind !== undefined) {
        if (!(TERRITORY_KINDS as readonly unknown[]).includes(b.kind)) return { ok: false, error: `kind şunlardan biri olmalı: ${TERRITORY_KINDS.join(', ')}` };
        out.kind = b.kind as string;
    }
    if (b.color !== undefined) {
        if (typeof b.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(b.color)) return { ok: false, error: 'color #rrggbb olmalı' };
        out.color = b.color.toLowerCase();
    }
    if (b.points !== undefined) {
        const pts = b.points;
        if (!Array.isArray(pts) || pts.length < 3 || pts.length > 400) return { ok: false, error: 'points 3-400 köşe olmalı' };
        const clean: [number, number][] = [];
        for (const p of pts) {
            if (!Array.isArray(p) || p.length !== 2) return { ok: false, error: 'points [[x,y],...] biçiminde olmalı' };
            const [x, y] = p.map(Number);
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > MAP_WIDTH || y < 0 || y > MAP_HEIGHT) {
                return { ok: false, error: 'Köşe harita dışında' };
            }
            clean.push([Math.round(x), Math.round(y)]);
        }
        out.points = JSON.stringify(clean);
    }
    if (b.region_id !== undefined) {
        if (b.region_id === null || b.region_id === '') out.region_id = null;
        else {
            const n = Number(b.region_id);
            if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'region_id geçersiz' };
            out.region_id = n;
        }
    }
    if (b.sort !== undefined) {
        const n = Number(b.sort);
        if (!Number.isInteger(n) || n < 0 || n > 10000) return { ok: false, error: 'sort geçersiz' };
        out.sort = n;
    }
    if (!partial) {
        if (!out.name) return { ok: false, error: 'name zorunlu' };
        if (!out.points) return { ok: false, error: 'points zorunlu' };
    }
    return { ok: true, value: out };
}
