'use client';

import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { seasonUniforms } from '../seasonStore';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { DISPLACEMENT_BIAS, DISPLACEMENT_SCALE, HEIGHT_URL } from '../terrain/heightField';
import { mapAsset } from '../media';

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
        const u: Record<string, string> = { map: mapAsset(`terrain_${size}.webp`), height: HEIGHT_URL };
        if (withNormal) u.normal = mapAsset('normal_1024.webp');
        return u;
    }, [size, withNormal]);
    const textures = useTexture(urls) as Record<string, THREE.Texture>;
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
                    float sHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
                    float sNoise(vec2 p) {
                        vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
                        return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
                    }`,
                )
                .replace(
                    '#include <map_fragment>',
                    `#include <map_fragment>
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
                        vec3 snowCol = vec3(0.9, 0.93, 0.97) * (0.92 + 0.08 * n);
                        diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, uWinter * land * snow * mix(0.25, 0.92, ink));
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
