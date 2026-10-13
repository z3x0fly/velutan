import { HEIGHT_MAX, HEIGHT_MIN, RELIEF } from '../generated/mapMeta';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { kasaPixels } from '../kasa';

// Yükselti dokusu 0..1 -> dünya birimi: y = h * DISPLACEMENT_SCALE + DISPLACEMENT_BIAS (deniz seviyesi y = 0)
export const DISPLACEMENT_SCALE = (HEIGHT_MAX - HEIGHT_MIN) * RELIEF;
export const DISPLACEMENT_BIAS = HEIGHT_MIN * RELIEF;

/** Kasadaki yükselti dokusu */
export const HEIGHT_FILE = 'height_1024.webp';

export interface HeightField {
    width: number;
    height: number;
    data: Float32Array; // 0..1
    /** Dünya koordinatında (x, z) zemin yüksekliği */
    sample: (x: number, z: number) => number;
}

let cache: Promise<HeightField> | null = null;

/** Yükselti PNG'sini CPU'ya okur (işaretçi, rota ve ağaçların zemine oturması için). Tek sefer yüklenir. */
export function loadHeightField(): Promise<HeightField> {
    if (cache) return cache;
    cache = kasaPixels(HEIGHT_FILE)
        .then(({ width: w, height: h, data: px }) => {
            const data = new Float32Array(w * h);
            for (let i = 0; i < data.length; i++) data[i] = px[i * 4] / 255;
            const sample = (x: number, z: number) => {
                const u = Math.min(Math.max(x / WORLD_WIDTH + 0.5, 0), 1) * (w - 1);
                const v = Math.min(Math.max(z / WORLD_HEIGHT + 0.5, 0), 1) * (h - 1);
                const x0 = Math.floor(u), y0 = Math.floor(v);
                const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
                const fx = u - x0, fy = v - y0;
                const a = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx;
                const b = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx;
                return (a * (1 - fy) + b * fy) * DISPLACEMENT_SCALE + DISPLACEMENT_BIAS;
            };
            return { width: w, height: h, data, sample };
        })
        .catch((e) => {
            cache = null;
            throw e;
        });
    return cache;
}
