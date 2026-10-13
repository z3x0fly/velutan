import { API_URL } from '../components/map/media';
import type { Region } from '../components/map/types';

export const SITE_URL = 'https://velutan.com.tr';
export const SITE_NAME = 'Velutan Haritası';
export const DEFAULT_TITLE = 'Velutan Haritası — Velutan 3D Dünya Haritası';
export const DEFAULT_DESCRIPTION =
    "Velutan evreninin interaktif 3D dünya haritası (Velutan 3D Map): Barglass, Atrapolis, Demir Yemin, Qasaar ve daha fazlası. Bölge kronikleri, karakterler, 360° mekân gezintisi ve seyahat hesaplayıcı.";
export const KEYWORDS = [
    'velutan',
    'velutan harita',
    'velutan haritası',
    'velutan 3d map',
    'velutan 3d harita',
    'velutan map',
    'velutan dünya haritası',
    'velutan interaktif harita',
    'velutan lore',
    'velutan wiki',
    'swaggybark velutan',
    'velutan frp',
    'velutan karakterleri',
    'atrapolis',
    'demir yemin',
    'barglass',
    'qasaar',
];

export const TYPE_LABEL: Record<string, string> = {
    capital: 'Başkent',
    city: 'Şehir',
    fortress: 'Kale / Hisar',
    ruin: 'Harabe / Zindan',
    landmark: 'Doğal Yapı',
    character: 'Karakter',
    lore: 'Lore / Hikâye',
    event: 'Olay / Savaş',
};

/** Sunucu tarafında bölgeler (sunucuda iç adres kullanılır). Hata olursa boş liste: sayfa yine render olur. */
export async function fetchRegions(): Promise<Region[]> {
    const base = (process.env.API_INTERNAL_URL || API_URL).replace(/\/$/, '');
    try {
        const res = await fetch(`${base}/regions/`, { next: { revalidate: 60 } });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

/** Lore'dan düz metin özet (görsel satırları ve kaynak satırı çıkarılır) */
export function plainSummary(text: string, max = 158): string {
    const clean = text
        .split('\n')
        .filter((l) => !/^!\[.*\]\(.*\)$/.test(l.trim()) && !/^Kaynak:/i.test(l.trim()))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    return clean.length > max ? `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : clean;
}

export interface LoreListItem {
    slug: string;
    kind: string;
    title: string;
    label: string | null;
    summary: string | null;
    cover: string | null;
    place: string | null;
    panorama_image: string | null;
    updated: string | null;
}

export interface LoreDetail {
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

const apiBase = () => (process.env.API_INTERNAL_URL || API_URL).replace(/\/$/, '');

/** velutanmap.com'dan senkronlanan wiki kayıtları (site haritası, dizin) */
export async function fetchLoreList(): Promise<LoreListItem[]> {
    try {
        const res = await fetch(`${apiBase()}/lore/kayitlar`, { next: { revalidate: 600 } });
        if (!res.ok) return [];
        const d = await res.json();
        return Array.isArray(d) ? d : [];
    } catch {
        return [];
    }
}

export async function fetchLore(slug: string): Promise<LoreDetail | null> {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
    try {
        const res = await fetch(`${apiBase()}/lore/kayit/${slug}`, { next: { revalidate: 600 } });
        return res.ok ? ((await res.json()) as LoreDetail) : null;
    } catch {
        return null;
    }
}

export const KIND_LABEL: Record<string, string> = { content: 'Kayıt', location: 'Yer', panorama: '360° Mekân' };
