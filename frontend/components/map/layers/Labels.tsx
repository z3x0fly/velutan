'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { to3D } from '../utils/coords';
import { DISPLACEMENT_BIAS, DISPLACEMENT_SCALE } from '../terrain/heightField';
import { mapAsset } from '../media';

interface LabelItem {
    x0: number; y0: number; x1: number; y1: number; // harita pikseli
    u0: number; v0: number; u1: number; v1: number; // atlas pikseli
    h: number; // altındaki en yüksek arazi (0..1)
}

interface LabelData {
    atlas: [number, number];
    items: LabelItem[];
}

const LIFT = 0.05;

/**
 * Haritadaki isimler (MP_7_labels): zeminden ayrı, her kelime grubu kendi altındaki en yüksek noktanın
 * hemen üstünde düz durur. Böylece dağların üstündeki isimler bükülmez. Tek draw call.
 */
const Labels = () => {
    const [data, setData] = useState<LabelData | null>(null);
    const { gl } = useThree();
    const texture = useTexture(mapAsset('labels_atlas.webp'));

    useEffect(() => {
        let alive = true;
        fetch(mapAsset('labels.json'))
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((d: LabelData) => alive && setData(d))
            .catch((err) => console.error('[Velutan] İsim katmanı yüklenemedi:', err));
        return () => {
            alive = false;
        };
    }, []);

    useMemo(() => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = gl.capabilities.getMaxAnisotropy();
        texture.needsUpdate = true;
    }, [texture, gl]);

    const geometry = useMemo(() => {
        if (!data) return null;
        const [aw, ah] = data.atlas;
        const n = data.items.length;
        const pos = new Float32Array(n * 4 * 3);
        const uv = new Float32Array(n * 4 * 2);
        const index: number[] = [];
        data.items.forEach((it, i) => {
            const y = Math.max(it.h * DISPLACEMENT_SCALE + DISPLACEMENT_BIAS, 0) + LIFT;
            const [ax, , az] = to3D(it.x0, it.y0);
            const [bx, , bz] = to3D(it.x1, it.y1);
            // sol-üst, sağ-üst, sol-alt, sağ-alt
            pos.set([ax, y, az, bx, y, az, ax, y, bz, bx, y, bz], i * 12);
            const u0 = it.u0 / aw, u1 = it.u1 / aw;
            const v0 = 1 - it.v0 / ah, v1 = 1 - it.v1 / ah;
            uv.set([u0, v0, u1, v0, u0, v1, u1, v1], i * 8);
            const b = i * 4;
            index.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(index);
        g.computeBoundingSphere();
        return g;
    }, [data]);

    const material = useMemo(
        () => new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, alphaTest: 0.02, fog: false }),
        [texture],
    );

    useEffect(() => () => {
        geometry?.dispose();
    }, [geometry]);
    useEffect(() => () => material.dispose(), [material]);

    // Çok yakında boyalı isimler biraz soluklaşır; işaretçi etiketleri öne çıkar
    useFrame(({ camera }) => {
        const target = camera.position.y < 5 ? 0.45 + (camera.position.y / 5) * 0.55 : 1;
        material.opacity += (target - material.opacity) * 0.1;
    });

    if (!geometry) return null;
    return <mesh geometry={geometry} material={material} renderOrder={5} />;
};

export default Labels;
