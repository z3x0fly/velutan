import type { WebGLRenderer } from 'three';

export type QualityTier = 'high' | 'low';

/**
 * Cihaza göre doku çözünürlüğü seçer. Eski sürüm 7 adet 8192px dokuyu aynı anda yüklüyordu
 * (~1.6 GB VRAM) — mobilde ve entegre GPU'larda çökmelerin ana sebebi buydu.
 */
export function detectQuality(gl: WebGLRenderer): QualityTier {
    if (typeof window !== 'undefined') {
        const forced = new URLSearchParams(window.location.search).get('kalite');
        if (forced === 'yuksek') return 'high';
        if (forced === 'dusuk') return 'low';
    }
    const maxTex = gl.capabilities.maxTextureSize;
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
    const lowMemory = nav?.deviceMemory !== undefined && nav.deviceMemory <= 4;
    const mobile = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    if (maxTex < 4096 || lowMemory || mobile) return 'low';
    return 'high';
}

export const textureSize = (tier: QualityTier) => (tier === 'high' ? 4096 : 2048);
