import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { mapAsset } from '../media';

/**
 * Arazi örtüsü (tools/build_map_assets.py -> cover_1024.webp): ham haritadaki çizimden.
 * R: orman yoğunluğu, G: bataklık (sık çimen/saz tutamı). Seyahat hızında kullanılır.
 */
export interface CoverField {
    /** Dünya koordinatında (x, z): orman ve bataklık 0..1 */
    sample: (x: number, z: number) => { forest: number; marsh: number };
}

const COVER_URL = mapAsset('cover_1024.webp');
let cache: Promise<CoverField> | null = null;

export function loadCoverField(): Promise<CoverField> {
    if (cache) return cache;
    cache = new Promise<CoverField>((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return reject(new Error('2D context yok'));
            ctx.drawImage(img, 0, 0);
            const px = ctx.getImageData(0, 0, img.width, img.height).data;
            const w = img.width;
            const h = img.height;
            resolve({
                sample: (x, z) => {
                    const u = Math.round(Math.min(Math.max(x / WORLD_WIDTH + 0.5, 0), 1) * (w - 1));
                    const v = Math.round(Math.min(Math.max(z / WORLD_HEIGHT + 0.5, 0), 1) * (h - 1));
                    const i = (v * w + u) * 4;
                    return { forest: px[i] / 255, marsh: px[i + 1] / 255 };
                },
            });
        };
        img.onerror = () => {
            cache = null;
            reject(new Error(`Arazi örtüsü yüklenemedi: ${COVER_URL}`));
        };
        img.src = COVER_URL;
    });
    return cache;
}
