'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';

const CLOUD_COUNT = 18;

/** Prosedürel, yumuşak kenarlı bulut dokusu (harici dosya gerekmez). */
function makeCloudTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
        const x = size * (0.25 + rand() * 0.5);
        const y = size * (0.3 + rand() * 0.4);
        const r = size * (0.08 + rand() * 0.16);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,250,240,0.55)');
        g.addColorStop(0.6, 'rgba(255,250,240,0.18)');
        g.addColorStop(1, 'rgba(255,250,240,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

/** Uzaktan bakınca haritanın üstünde süzülen bulutlar; yaklaştıkça dağılır (Runeterra hissi). */
const Clouds = () => {
    const group = useRef<THREE.Group>(null);
    const texture = useMemo(makeCloudTexture, []);
    const material = useMemo(
        () => new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0, fog: false }),
        [texture],
    );

    const clouds = useMemo(() => {
        let seed = 42;
        const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        return Array.from({ length: CLOUD_COUNT }, () => ({
            x: (rand() - 0.5) * WORLD_WIDTH * 1.3,
            z: (rand() - 0.5) * WORLD_HEIGHT * 1.2,
            y: 4 + rand() * 3,
            s: 5 + rand() * 7,
            rot: rand() * Math.PI,
            speed: 0.08 + rand() * 0.12,
        }));
    }, []);

    useEffect(() => () => {
        texture.dispose();
        material.dispose();
    }, [texture, material]);

    useFrame(({ camera }, delta) => {
        const d = Math.min(delta, 0.1);
        // Kamera yükseldikçe görünür (y 22 -> 0, y 38 -> tam)
        const target = THREE.MathUtils.clamp((camera.position.y - 22) / 16, 0, 1) * 0.45;
        material.opacity += (target - material.opacity) * 0.05;
        const g = group.current;
        if (!g) return;
        g.visible = material.opacity > 0.01;
        if (!g.visible) return;
        g.children.forEach((child, i) => {
            child.position.x += clouds[i].speed * d;
            if (child.position.x > WORLD_WIDTH * 0.75) child.position.x = -WORLD_WIDTH * 0.75;
        });
    });

    return (
        <group ref={group}>
            {clouds.map((c, i) => (
                <mesh key={i} position={[c.x, c.y, c.z]} rotation={[-Math.PI / 2, 0, c.rot]} material={material}>
                    <planeGeometry args={[c.s, c.s * 0.7]} />
                </mesh>
            ))}
        </group>
    );
};

export default Clouds;
