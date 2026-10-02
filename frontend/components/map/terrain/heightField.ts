import { HEIGHT_MAX, HEIGHT_MIN, RELIEF } from '../generated/mapMeta';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { mapAsset } from '../media';

// Yükselti dokusu 0..1 -> dünya birimi: y = h * DISPLACEMENT_SCALE + DISPLACEMENT_BIAS (deniz seviyesi y = 0)
export const DISPLACEMENT_SCALE = (HEIGHT_MAX - HEIGHT_MIN) * RELIEF;
export const DISPLACEMENT_BIAS = HEIGHT_MIN * RELIEF;

export const HEIGHT_URL = mapAsset('height_1024.webp');

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
    cache = new Promise<HeightField>((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.crossOrigin = 'anonymous'; // farklı alan adından gelirse canvas kirlenmesin (CORS)
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return reject(new Error('2D context yok'));
            ctx.drawImage(img, 0, 0);
            const px = ctx.getImageData(0, 0, img.width, img.height).data;
            const data = new Float32Array(img.width * img.height);
            for (let i = 0; i < data.length; i++) data[i] = px[i * 4] / 255;
            const w = img.width;
            const h = img.height;
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
            resolve({ width: w, height: h, data, sample });
        };
        img.onerror = () => {
            cache = null;
            reject(new Error(`Yükselti haritası yüklenemedi: ${HEIGHT_URL}`));
        };
        img.src = HEIGHT_URL;
    });
    return cache;
}
