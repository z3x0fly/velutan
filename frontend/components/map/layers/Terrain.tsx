'use client';

import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
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
