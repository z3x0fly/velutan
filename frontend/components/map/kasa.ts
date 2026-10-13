import * as THREE from 'three';
import { suspend } from 'suspend-react';
import { KASA } from './generated/kasa';
import { API_URL, ASSET_BASE } from './media';

/**
 * Harita kasası: harita verisi şifreli paketlerde (map3d/k/*.bin, AES-256-GCM). Anahtar API'den, yalnızca
 * kendi sayfalarımıza verilir; çözme tarayıcının kendi şifre birimiyle yapılır, görseller bellekte açılır
 * (ağ sekmesinde ya da doğrudan indirilen dosyada okunur bir görüntü yoktur).
 */
let keyP: Promise<CryptoKey> | null = null;
function getKey() {
    if (!keyP)
        keyP = fetch(`${API_URL}/harita/anahtar`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Kasa anahtarı alınamadı (${r.status})`))))
            .then((d: { k: string }) => {
                const raw = Uint8Array.from(atob(d.k), (c) => c.charCodeAt(0));
                return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
            })
            .catch((e) => {
                keyP = null;
                throw e;
            });
    return keyP;
}

const buffers = new Map<string, Promise<ArrayBuffer>>();

/** Kasadaki bir dosyanın çözülmüş içeriği (dosya adı: "height_1024.webp" gibi) */
export function kasaBuffer(file: string): Promise<ArrayBuffer> {
    let p = buffers.get(file);
    if (!p) {
        const id = KASA[file];
        if (!id) return Promise.reject(new Error(`Kasada yok: ${file}`));
        p = Promise.all([fetch(`${ASSET_BASE}/map3d/k/${id}.bin`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`Paket yüklenemedi (${r.status})`)))), getKey()])
            .then(([buf, key]) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12) }, key, new Uint8Array(buf, 12)))
            .catch((e) => {
                buffers.delete(file);
                throw e;
            });
        buffers.set(file, p);
    }
    return p;
}

export const kasaJson = <T>(file: string): Promise<T> => kasaBuffer(file).then((b) => JSON.parse(new TextDecoder().decode(b)) as T);

/** Görsel: flip = dokuya yüklemek için (three'nin flipY'si ImageBitmap'te çalışmaz) */
export function kasaBitmap(file: string, flip = false): Promise<ImageBitmap> {
    return kasaBuffer(file).then((b) => createImageBitmap(new Blob([b], { type: 'image/webp' }), { imageOrientation: flip ? 'flipY' : 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
}

/** Görselin pikselleri (yükselti ve örtü örneklemesi için) */
export async function kasaPixels(file: string) {
    const bmp = await kasaBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return { width: canvas.width, height: canvas.height, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

export async function kasaTexture(file: string): Promise<THREE.Texture> {
    const bmp = await kasaBitmap(file, true);
    const t = new THREE.Texture(bmp as unknown as HTMLImageElement);
    t.flipY = false;
    t.needsUpdate = true;
    return t;
}

const texCache = new Map<string, THREE.Texture>();
/** React (Suspense) içinde: useTexture yerine; dokular bir kez yüklenir, paylaşılır */
export function useKasaTextures<T extends Record<string, string>>(files: T): { [K in keyof T]: THREE.Texture } {
    const keys = Object.keys(files).sort();
    return suspend(async () => {
        const out: Record<string, THREE.Texture> = {};
        await Promise.all(
            keys.map(async (k) => {
                const f = files[k];
                let t = texCache.get(f);
                if (!t) {
                    t = await kasaTexture(f);
                    texCache.set(f, t);
                }
                out[k] = t;
            }),
        );
        return out as { [K in keyof T]: THREE.Texture };
    }, ['kasa', ...keys.map((k) => `${k}=${files[k]}`)]);
}
