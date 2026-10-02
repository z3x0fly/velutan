/**
 * Cihaza göre kalite kademesi.
 *
 * Kademe, WebGL bağlamı açılmadan ÖNCE geçici bir bağlamla ekran kartı adı okunarak belirlenir;
 * çünkü antialias ve çizim döngüsü (sürekli / yalnızca değişince) bağlam oluşturulurken seçilmelidir.
 * Çalışırken FPS düşerse (PerformanceMonitor) ayarlar bir kademe daha hafifletilir.
 */
export type QualityTier = 'ultra' | 'high' | 'medium' | 'low' | 'minimal';

export interface QualitySettings {
    tier: QualityTier;
    textureSize: 4096 | 2048;
    terrainSegments: [number, number];
    /** Çizilecek ağaç oranı (0-1) */
    treeFraction: number;
    wind: boolean;
    clouds: boolean;
    waterAnimation: boolean;
    antialias: boolean;
    maxDpr: number;
    /** 'demand' = yalnızca kamera/içerik değişince çiz (zayıf cihazda CPU/GPU dinlenir) */
    frameloop: 'always' | 'demand';
    /** Haritayı tavaf eden ejderha ve gölgesi (sürekli çizim ister) */
    dragon: boolean;
}

const PRESETS: Record<QualityTier, Omit<QualitySettings, 'tier'>> = {
    // Güçlü ekran kartları için: zemin iki kat sık, ekranın tam çözünürlüğü. Otomatik seçilmez, elle açılır.
    ultra: { textureSize: 4096, terrainSegments: [768, 674], treeFraction: 1, wind: true, clouds: true, waterAnimation: true, antialias: true, maxDpr: 3, frameloop: 'always', dragon: true },
    high: { textureSize: 4096, terrainSegments: [512, 450], treeFraction: 1, wind: true, clouds: true, waterAnimation: true, antialias: true, maxDpr: 1.75, frameloop: 'always', dragon: true },
    medium: { textureSize: 4096, terrainSegments: [384, 337], treeFraction: 0.6, wind: true, clouds: true, waterAnimation: true, antialias: true, maxDpr: 1.5, frameloop: 'always', dragon: true },
    low: { textureSize: 2048, terrainSegments: [256, 225], treeFraction: 0.3, wind: false, clouds: false, waterAnimation: false, antialias: false, maxDpr: 1, frameloop: 'demand', dragon: false },
    minimal: { textureSize: 2048, terrainSegments: [128, 112], treeFraction: 0, wind: false, clouds: false, waterAnimation: false, antialias: false, maxDpr: 1, frameloop: 'demand', dragon: false },
};

export const QUALITY_ORDER: QualityTier[] = ['ultra', 'high', 'medium', 'low', 'minimal'];
const ORDER = QUALITY_ORDER;

export const settingsFor = (tier: QualityTier): QualitySettings => ({ tier, ...PRESETS[tier] });

/** Bir kademe hafiflet (FPS düşünce) */
export const stepDown = (tier: QualityTier): QualityTier => ORDER[Math.min(ORDER.indexOf(tier) + 1, ORDER.length - 1)];

interface GpuInfo {
    renderer: string;
    maxTexture: number;
}

function probeGpu(): GpuInfo | null {
    try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
        if (!gl) return null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return { renderer, maxTexture };
    } catch {
        return null;
    }
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
const WEAK_GPU = /intel\(r\) (hd|uhd) graphics|intel.*(hd|uhd) graphics|mali|adreno \(tm\) [1-5]\d\d|powervr|videocore|apple gpu/i;
const MID_GPU = /iris|intel\(r\) arc|apple m\d|radeon\(tm\) graphics|radeon graphics|vega \d|adreno \(tm\) [6-7]\d\d/i;

export function detectTier(): { tier: QualityTier; renderer: string } {
    const forced = new URLSearchParams(window.location.search).get('kalite');
    const forcedMap: Record<string, QualityTier> = { ultra: 'ultra', yuksek: 'high', orta: 'medium', dusuk: 'low', asgari: 'minimal' };
    const gpu = probeGpu();
    const renderer = gpu?.renderer ?? 'bilinmiyor';
    if (forced && forcedMap[forced]) return { tier: forcedMap[forced], renderer };
    if (!gpu) return { tier: 'minimal', renderer };

    const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
    const lowMemory = nav.deviceMemory !== undefined && nav.deviceMemory <= 4;
    const fewCores = (nav.hardwareConcurrency ?? 8) <= 2;
    const mobile = window.matchMedia?.('(pointer: coarse)').matches;

    if (SOFTWARE.test(renderer)) return { tier: 'minimal', renderer };
    if (gpu.maxTexture < 4096 || WEAK_GPU.test(renderer) || lowMemory || fewCores || mobile) return { tier: 'low', renderer };
    if (MID_GPU.test(renderer)) return { tier: 'medium', renderer };
    return { tier: 'high', renderer };
}
