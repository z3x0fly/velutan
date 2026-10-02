'use client';

import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';

// Çerçevenin (overlay) içinde kalsın
const INSET = 0.968;

const vertexShader = /* glsl */ `
    #include <fog_pars_vertex>
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }
`;

const fragmentShader = /* glsl */ `
    #include <fog_pars_fragment>
    uniform float uTime;
    uniform vec3 uDeep;
    uniform vec3 uGlint;
    varying vec2 vUv;
    varying vec3 vWorld;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
    }

    void main() {
        vec2 p = vWorld.xz * 1.6;
        float t = uTime * 0.05;
        float swell = fbm(p * 0.35 + vec2(t, -t * 0.7));
        float ripple = fbm(p * 2.2 + vec2(-t * 2.0, t * 1.4) + swell * 1.5);
        float glint = smoothstep(0.66, 0.82, ripple) * (0.5 + 0.5 * sin(uTime * 0.9 + swell * 12.0));

        vec3 color = mix(uDeep, uDeep * 1.35, swell);
        color += uGlint * glint * 0.35;
        float alpha = 0.05 + swell * 0.07 + glint * 0.22;

        // Kenarlara doğru yumuşak geçiş (çerçeveye taşmasın)
        vec2 e = smoothstep(vec2(0.0), vec2(0.012), vUv) * smoothstep(vec2(0.0), vec2(0.012), 1.0 - vUv);
        alpha *= e.x * e.y;

        gl_FragColor = vec4(color, alpha);
        #include <fog_fragment>
    }
`;

const Water = ({ animate = true }: { animate?: boolean }) => {
    const material = useMemo(
        () =>
            new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader,
                transparent: true,
                depthWrite: false,
                fog: true,
                uniforms: THREE.UniformsUtils.merge([
                    THREE.UniformsLib.fog,
                    {
                        uTime: { value: 0 },
                        uDeep: { value: new THREE.Color('#4a6788') },
                        uGlint: { value: new THREE.Color('#e8dcc0') },
                    },
                ]),
            }),
        [],
    );

    useFrame((_, delta) => {
        if (!animate) return;
        material.uniforms.uTime.value += Math.min(delta, 0.1);
    });

    return (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={1}>
            <planeGeometry args={[WORLD_WIDTH * INSET, WORLD_HEIGHT * INSET]} />
        </mesh>
    );
};

export default Water;
