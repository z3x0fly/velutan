import { ASSET_VERSION } from './generated/mapMeta';

// Resmi sunucular. Ortam değişkeni verilmezse uygulama bunlara bağlanır; sunucular yalnızca resmi alan
// adlarına CORS izni verdiği için kod başka bir yerde çalıştırılsa da harita verisi yüklenmez.
const OFFICIAL_API = 'https://api.velutan.com.tr';
const OFFICIAL_SITE = 'https://velutan.com.tr';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? OFFICIAL_API).replace(/\/$/, '');

/** Harita assetlerinin (doku, ağaç, isim verisi) kaynağı. "/" = aynı sunucu (yerel geliştirme; Next boş değeri gömmez). */
export const ASSET_BASE = (process.env.NEXT_PUBLIC_ASSET_URL ?? OFFICIAL_SITE).replace(/\/$/, '');

/** Harita dosyası adresi; sürüm özeti eklenir (dosyalar önbellekte 7 gün kalır, yeni derleme yeni adres demek) */
export const mapAsset = (file: string) => `${ASSET_BASE}/map3d/${file}?v=${ASSET_VERSION}`;

/** /static/ görselleri için önbellek kırıcı: panoramalar aynı adla daha kaliteli hâlleriyle değiştiğinde artır */
const MEDIA_VERSION = 2;

/** Backend'deki göreli "/static/..." yollarını API adresine göre çözer; tam adresleri olduğu gibi bırakır. */
export function mediaUrl(url?: string | null): string | undefined {
    if (!url) return undefined;
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith('/static/')) return `${API_URL}${url}${url.includes('?') ? '&' : '?'}v=${MEDIA_VERSION}`;
    return undefined; // bilinmeyen biçim: gösterme
}

export type LoreBlock = { kind: 'text'; text: string } | { kind: 'images'; images: { alt: string; src: string }[] };

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

/**
 * Lore metni düz yazıdır; yalnızca kendi satırındaki `![başlık](adres)` görsel olarak gösterilir.
 * Art arda görsel satırları tek galeriye toplanır. HTML yorumlanmaz.
 */
export function parseLore(lore: string): LoreBlock[] {
    const blocks: LoreBlock[] = [];
    let text: string[] = [];
    const flush = () => {
        const t = text.join('\n').trim();
        if (t) blocks.push({ kind: 'text', text: t });
        text = [];
    };
    for (const line of lore.split('\n')) {
        const m = IMAGE_LINE.exec(line.trim());
        const src = m ? mediaUrl(m[2]) : undefined;
        if (m && src) {
            flush();
            const last = blocks[blocks.length - 1];
            if (last?.kind === 'images') last.images.push({ alt: m[1], src });
            else blocks.push({ kind: 'images', images: [{ alt: m[1], src }] });
        } else {
            text.push(line);
        }
    }
    flush();
    return blocks;
}
