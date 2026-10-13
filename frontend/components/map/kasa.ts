import * as THREE from 'three';
import { suspend } from 'suspend-react';
import { KASA } from './generated/kasa';
import { API_URL, ASSET_BASE } from './media';

/**
 * Harita kasası: harita verisi şifreli paketlerde (map3d/k/*.bin, AES-256-GCM). Anahtar, yalnızca kendi
 * sayfalarımıza, oturuma özel bir anahtar değişimiyle şifreli verilir; çözme tarayıcının kendi şifre birimiyle
 * yapılır, görseller bellekte açılır
 * (ağ sekmesinde ya da doğrudan indirilen dosyada okunur bir görüntü yoktur).
 */
let keyP: Promise<CryptoKey> | null = null;
const unb64 = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
const b64 = (b: ArrayBuffer) => btoa(Array.from(new Uint8Array(b), (c) => String.fromCharCode(c)).join(""));

/**
 * Veri anahtarı ağdan açık geçmez: geçici ECDH (P-256) ile ortak sır, HKDF ile sarma anahtarı; sunucu veri
 * anahtarını onunla şifreli yollar. Anahtar tarayıcıda dışa aktarılamaz bir CryptoKey olarak kalır.
 */
async function handshake(): Promise<CryptoKey> {
    const subtle = crypto.subtle;
    const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const pub = await subtle.exportKey('raw', pair.publicKey);
    const r = await fetch(`${API_URL}/oturum`, { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p: b64(pub) }) });
    if (!r.ok) throw new Error(`Oturum açılamadı (${r.status})`);
    const d: { s: string; n: string; w: string } = await r.json();
    const serverPub = await subtle.importKey('raw', unb64(d.s), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const bits = await subtle.deriveBits({ name: 'ECDH', public: serverPub }, pair.privateKey, 256);
    const hk = await subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    const wrap = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: unb64(d.n), info: new TextEncoder().encode('velutan-kasa') }, hk, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const w = unb64(d.w);
    const raw = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: w.subarray(0, 12) }, wrap, w.subarray(12)));
    const key = await subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    raw.fill(0);
    return key;
}

function getKey() {
    if (!keyP)
        keyP = handshake().catch((e) => {
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
