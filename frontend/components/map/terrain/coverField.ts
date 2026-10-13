import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { kasaPixels } from '../kasa';

/**
 * Arazi örtüsü (tools/build_map_assets.py -> cover_1024.webp): ham haritadaki çizimden.
 * R: orman yoğunluğu, G: bataklık (sık çimen/saz tutamı). Seyahat hızında kullanılır.
 */
export interface CoverField {
    /** Dünya koordinatında (x, z): orman ve bataklık 0..1 */
    sample: (x: number, z: number) => { forest: number; marsh: number };
}

let cache: Promise<CoverField> | null = null;

export function loadCoverField(): Promise<CoverField> {
    if (cache) return cache;
    cache = kasaPixels('cover_1024.webp')
        .then(({ width: w, height: h, data: px }) => ({
            sample: (x: number, z: number) => {
                const u = Math.round(Math.min(Math.max(x / WORLD_WIDTH + 0.5, 0), 1) * (w - 1));
                const v = Math.round(Math.min(Math.max(z / WORLD_HEIGHT + 0.5, 0), 1) * (h - 1));
                const i = (v * w + u) * 4;
                return { forest: px[i] / 255, marsh: px[i + 1] / 255 };
            },
        }))
        .catch((e) => {
            cache = null;
            throw e;
        });
    return cache;
}
