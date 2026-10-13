'use client';

import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useKasaTextures } from '../kasa';
import * as THREE from 'three';
import { seasonUniforms } from '../seasonStore';
import { CLOUD_GLSL, cloudUniforms } from '../cloudField';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { DISPLACEMENT_BIAS, DISPLACEMENT_SCALE, HEIGHT_FILE } from '../terrain/heightField';

interface TerrainProps {
    textureSize: 4096 | 2048;
    segments: [number, number];
    /** Işıklandırma detayı; zayıf kademede indirilmez */
    normalMap?: boolean;
}

// 1x1 düz normal (normal haritası istenmediğinde)
const FLAT_NORMAL = (() => {
    if (typeof document === 'undefined') return null;
    const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    t.needsUpdate = true;
    return t;
})();

/**
 * Yükseltili zemin: isimsiz boyalı harita dokusu (su + kara + yollar + dağ çizimleri + çerçeve),
 * yükselti haritasıyla gerçek 3D röliefe dönüşür. İsimler ayrı katmandadır (Labels.tsx).
 */
const Terrain = React.memo(({ textureSize: size, segments, normalMap: withNormal = true }: TerrainProps) => {
    const { gl } = useThree();
    // Girdi nesnesi sabit olmalı: her render'da yeni nesne giderse drei dokuları yeniden
    // GPU'ya yükler (zoom sırasında 4096px dokunun sürekli yüklenmesi = kasma).
    const urls = useMemo(() => {
        const u: Record<string, string> = { map: `terrain_${size}.webp`, height: HEIGHT_FILE };
        if (withNormal) u.normal = 'normal_1024.webp';
        return u;
    }, [size, withNormal]);
    const textures = useKasaTextures(urls) as Record<string, THREE.Texture>;
    const { map, height } = textures;
    const normal = textures.normal ?? FLAT_NORMAL!;

    // Doku ayarları yalnızca bir kez (yükleme sonrası) yapılır
    useMemo(() => {
        const aniso = gl.capabilities.getMaxAnisotropy();
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = aniso;
        for (const tex of [map, height, normal]) {
            tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.needsUpdate = true;
        }
    }, [map, height, normal, gl]);

    const geometry = useMemo(() => {
        const g = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT, segments[0], segments[1]);
        g.rotateX(-Math.PI / 2);
        return g;
    }, [segments[0], segments[1]]); // eslint-disable-line react-hooks/exhaustive-deps

    const material = useMemo(() => {
        const m = new THREE.MeshStandardMaterial({
            map,
            normalMap: normal,
            normalScale: new THREE.Vector2(1.1, 1.1),
            displacementMap: height,
            displacementScale: DISPLACEMENT_SCALE,
            displacementBias: DISPLACEMENT_BIAS,
            roughness: 0.92,
            metalness: 0,
        });
        // Mevsim: kışta karla örtülü arazi, sonbaharda altın-kızıl çayırlar. Çizgiler (yol, kıyı, dağ taraması,
        // nehir) karın altından seçilsin diye koyu mürekkep pikselleri örtülmez.
        m.onBeforeCompile = (shader) => {
            shader.uniforms.uAutumn = seasonUniforms.uAutumn;
            shader.uniforms.uWinter = seasonUniforms.uWinter;
            shader.uniforms.uCloudTime = cloudUniforms.uCloudTime;
            shader.uniforms.uCloudVis = cloudUniforms.uCloudVis;
            shader.uniforms.uCloudCover = cloudUniforms.uCloudCover;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec3 vSeason;')
                .replace('#include <displacementmap_vertex>', '#include <displacementmap_vertex>\nvSeason = transformed;');
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    uniform float uAutumn;
                    uniform float uWinter;
                    varying vec3 vSeason;
                    ${CLOUD_GLSL}
                    float sHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
                    float sNoise(vec2 p) {
                        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
                        return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
                    }`,
                )
                .replace(
                    '#include <normal_fragment_maps>',
                    `#include <normal_fragment_maps>
                    // Yüzey eğimi (normal haritasından, pürüzsüz): 1 düz, 0 dik. Renk ışıklandırmadan önce değişir.
                    vec3 wn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
                    float flatness = abs(wn.y);
                    float high = smoothstep(0.34, 0.5, vSeason.y);
                    if (uAutumn > 0.001 || uWinter > 0.001) {
                        float land = smoothstep(0.004, 0.03, vSeason.y);
                        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                        float ink = smoothstep(0.12, 0.34, lum); // koyu çizgiler 0
                        float n = sNoise(vSeason.xz * 1.6) * 0.6 + sNoise(vSeason.xz * 5.3) * 0.4;
                        // Sonbahar: yeşil-bej çayır altın, yer yer kızıl
                        vec3 autumn = diffuseColor.rgb * vec3(1.12, 0.9, 0.62) + vec3(0.05, 0.015, 0.0);
                        autumn = mix(autumn, autumn * vec3(1.05, 0.72, 0.55), smoothstep(0.55, 0.8, n) * 0.6);
                        diffuseColor.rgb = mix(diffuseColor.rgb, autumn, uAutumn * land * ink * 0.75);
                        // Kış: yükseldikçe kalınlaşan, gürültüyle öbeklenen kar
                        float snow = clamp(0.62 + vSeason.y * 0.9 + (n - 0.5) * 0.7, 0.0, 1.0);
                        // Dik dağ yüzlerinde kar tutmaz: kaya ve dağ çizimi görünür kalır
                        snow *= mix(1.0, smoothstep(0.5, 0.82, flatness + (n - 0.5) * 0.2), high);
                        vec3 snowCol = vec3(0.86, 0.9, 0.95) * (0.9 + 0.1 * n);
                        diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, uWinter * land * snow * mix(0.25, 0.92, ink));
                    }
                    {
                        // Dağ tepeleri, iklime göre. İklim, arazinin geniş çevresinin renginden okunur (ham haritada karlı
                        // diyarlar beyaz-gri, çöller kumlu sarı) + enlem (kuzey soğuk):
                        //  soğuk: kar sınırı aşağıda, kaya mavimsi gri · ılıman: yalnız yüksek zirvelerde kar ·
                        //  kurak: zirvede kar yok, kaya kızıl-kahve. Dik kayada kar tutmaz; mürekkep çizgileri korunur.
                        vec3 region = texture2D(map, vMapUv, 7.0).rgb;
                        float rMax = max(region.r, max(region.g, region.b));
                        float rSat = (rMax - min(region.r, min(region.g, region.b))) / max(rMax, 0.001);
                        float snowy = smoothstep(0.2, 0.08, rSat) * smoothstep(0.45, 0.65, rMax);
                        float north = smoothstep(4.0, -14.0, vSeason.z);
                        float cold = clamp(snowy + north * 0.45, 0.0, 1.0);
                        // Kurak: Qasaar çölü (Sharz'Abad, Ira'Zherak çevresi); haritada ova ile çöl aynı bej, renkten ayrılmaz
                        float dry = smoothstep(5.5, 3.0, length((vSeason.xz - vec2(4.3, -1.1)) * vec2(0.75, 1.0))) * (1.0 - cold);

                        float pn = sNoise(vSeason.xz * 2.2) * 0.65 + sNoise(vSeason.xz * 7.0) * 0.35;
                        float plum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                        float pink = smoothstep(0.12, 0.34, plum);
                        // Kaya: yükseklerde dik yamaçlar; iklime göre renk (kışın karın yanında koyu, keskin)
                        float rock = high * smoothstep(0.85, 0.55, flatness);
                        vec3 rockTint = mix(mix(vec3(0.9, 0.93, 1.0), vec3(0.82, 0.88, 0.98), cold), vec3(1.06, 0.9, 0.76), dry);
                        vec3 rockCol = mix(vec3(plum), diffuseColor.rgb, 0.45) * mix(rockTint, vec3(0.52, 0.56, 0.64), uWinter);
                        diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rock * mix(0.55, 0.8, uWinter) * mix(pink, 1.0, uWinter * 0.5));
                        // Kar sınırı: ılıman 0.6, soğuk 0.4, kurak yok (1.2); kışın her yerde aşağı iner
                        float line = mix(mix(0.6, 0.4, cold), 1.2, dry);
                        line = mix(line, min(line, 0.32 + dry * 0.25), uWinter) + (pn - 0.5) * 0.1;
                        float cap = smoothstep(line, line + 0.08, vSeason.y) * smoothstep(0.45, 0.8, flatness + (pn - 0.5) * 0.3);
                        // Zirvenin en tepesinde dik kayada da ince kar (soğukta)
                        cap = max(cap, smoothstep(line + 0.14, line + 0.24, vSeason.y) * cold * 0.7);
                        vec3 capCol = mix(vec3(0.86, 0.9, 0.96), vec3(0.97, 0.98, 1.0), pn);
                        diffuseColor.rgb = mix(diffuseColor.rgb, capCol, cap * mix(0.35, 0.95, pink));
                    }
                    // Bulut gölgesi: bulut katmanı (y≈6.2) güneş yönünde kaydırılarak okunur; yalnızca bulutlar görünürken
                    if (uCloudVis > 0.01) {
                        vec2 sxz = vSeason.xz + vec2(-14.0, -10.0) / 22.0 * (6.2 - vSeason.y);
                        float cs = cloudDensity(sxz, 4);
                        diffuseColor.rgb *= 1.0 - cs * 0.38 * uCloudVis;
                    }`,
                );
        };
        return m;
    }, [map, height, normal]);

    useEffect(() => () => {
        geometry.dispose();
        material.dispose();
    }, [geometry, material]);

    return <mesh geometry={geometry} material={material} receiveShadow />;
});
Terrain.displayName = 'Terrain';

export default Terrain;
