import { useEffect, useState } from 'react';
import { API_URL } from '../../map/media';

/**
 * velutanmap.com'daki panorama noktaları (API köprüsü: /lore). Koordinatlar oradaki gibi:
 * yaw 0 görselin ortası, sağa doğru artar; pitch yukarı doğru artar (derece).
 */
export interface Hotspot {
    id: string;
    yaw: number;
    pitch: number;
    /** jump: başka panoramaya geç · info: wiki kaydını aç */
    nav: 'jump' | 'info';
    label: string;
    target: { slug: string; title: string; kind: string };
}

export interface LoreEntry {
    slug: string;
    title: string;
    label: string | null;
    summary: string | null;
    cover: string | null;
    body: string | null;
    kind: string;
    url: string;
    refs: Record<string, string>;
    related: { title: string; items: { slug: string; title: string; label: string | null; kind: string }[] }[];
}

/** Görüntüleyicinin bakış açısına çevirir: lon 0 görselin sol kenarı (three.js küresi) */
export const yawToLon = (yaw: number) => yaw + 180;

const cache = new Map<string, Hotspot[]>();

export function useHotspots(slug: string | undefined) {
    const [list, setList] = useState<Hotspot[]>(() => (slug && cache.get(slug)) || []);
    useEffect(() => {
        if (!slug) return setList([]);
        const hit = cache.get(slug);
        setList(hit ?? []);
        if (hit) return;
        let alive = true;
        fetch(`${API_URL}/lore/panorama/${encodeURIComponent(slug)}/noktalar`)
            .then((r) => (r.ok ? r.json() : []))
            .then((d: Hotspot[]) => {
                const arr = Array.isArray(d) ? d : [];
                cache.set(slug, arr);
                if (alive) setList(arr);
            })
            .catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [slug]);
    return list;
}

const entries = new Map<string, LoreEntry>();

export async function fetchLoreEntry(slug: string): Promise<LoreEntry> {
    const hit = entries.get(slug);
    if (hit) return hit;
    const r = await fetch(`${API_URL}/lore/kayit/${encodeURIComponent(slug)}`);
    if (!r.ok) throw new Error(r.status === 404 ? 'Kayıt bulunamadı' : 'Kayıt yüklenemedi');
    const d = (await r.json()) as LoreEntry;
    entries.set(slug, d);
    return d;
}
