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
