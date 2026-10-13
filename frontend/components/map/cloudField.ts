/**
 * Bulut alanı: bulut katmanı (Clouds) ile arazideki bulut gölgesi (Terrain) aynı gürültüyü kullanır;
 * böylece gölge tam bulutun altına düşer. Ortak uniform'lar her karede Clouds tarafından güncellenir.
 */
export const cloudUniforms = {
    uCloudTime: { value: 0 },
    /** 0 görünmez .. 1 tam (kamera yükseldikçe artar) */
    uCloudVis: { value: 0 },
    /** Bulutluluk: 0.35 parçalı .. 0.6 kapalı */
    uCloudCover: { value: 0.45 },
};

export const CLOUD_GLSL = /* glsl */ `
    uniform float uCloudTime;
    uniform float uCloudVis;
    uniform float uCloudCover;
    float cHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float cNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(cHash(i), cHash(i + vec2(1, 0)), u.x), mix(cHash(i + vec2(0, 1)), cHash(i + vec2(1, 1)), u.x), u.y);
    }
    float cFbm(vec2 p, int oct) {
        float v = 0.0, a = 0.5;
        mat2 m = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 6; i++) {
            if (i >= oct) break;
            v += a * cNoise(p);
            p = m * p * 2.02 + 7.3;
            a *= 0.5;
        }
        return v;
    }
    // Bulut yoğunluğu (dünya xz): rüzgârla akan, bükülmüş (domain warp) gürültü -> kümülüs öbekleri
    float cloudDensity(vec2 xz, int oct) {
        vec2 p = xz * 0.11 + vec2(uCloudTime * 0.012, uCloudTime * 0.004);
        vec2 w = vec2(cFbm(p * 0.7 + 3.1, 3), cFbm(p * 0.7 - 5.7, 3)) - 0.5;
        float n = cFbm(p + w * 1.4, oct);
        return smoothstep(1.0 - uCloudCover - 0.12, 1.0 - uCloudCover + 0.22, n);
    }
`;
