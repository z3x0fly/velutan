'use client';

import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { dayLight } from '../dayStore';
import { seasonUniforms } from '../seasonStore';
import { CLOUD_GLSL, cloudUniforms } from '../cloudField';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';


const vertexShader = /* glsl */ `
    varying vec3 vWorld;
    void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
    }
`;

const fragmentShader = /* glsl */ `
    ${CLOUD_GLSL}
    uniform vec3 uSun;
    uniform vec3 uSunColor;
    uniform vec3 uShade;
    uniform float uLayer;
    uniform float uNight;
    uniform vec2 uWorld;
    varying vec3 vWorld;
    void main() {
        vec2 xz = vWorld.xz + vec2(uLayer * 13.7, uLayer * -7.1);
        float d = cloudDensity(xz, 6);
        if (d < 0.01) discard;
        // Kendi gölgesi: güneşe doğru biraz ilerideki yoğunluk; kalın yerler altta koyulaşır
        float toward = cloudDensity(xz + uSun.xz * 0.9, 4);
        float light = clamp(1.0 - (toward - d * 0.35) * 1.1, 0.25, 1.0);
        // Kenarlar ince ve aydınlık (güneş kenardan geçer), çekirdek dolgun
        float edge = 1.0 - smoothstep(0.0, 0.55, d);
        vec3 col = mix(uShade, uSunColor, light);
        col += uSunColor * edge * 0.18;
        col *= mix(1.0, 0.32, uNight);
        float a = smoothstep(0.0, 0.6, d) * mix(0.92, 0.7, uLayer) * uCloudVis;
        // Harita çerçevesinin dışına taşmasın
        vec2 e = abs(vWorld.xz) / (uWorld * 0.5);
        a *= 1.0 - smoothstep(0.82, 1.0, max(e.x, e.y));
        // Kameraya yakın bulut açılır (uçaktan bakar gibi): yakındaki dev, bulanık lekeler olmasın
        float camDist = length(cameraPosition - vWorld);
        a *= smoothstep(5.0, 12.0, camDist);
        gl_FragColor = vec4(col, a);
    }
`;

/**
 * Bulutlar: iki katman (paralaks), gürültüyle şekillenen kümülüs öbekleri; güneş tarafı aydınlık, altı gri.
 * Yalnızca uzaktan görünür (kamera yükseldikçe belirir, yaklaşınca dağılır). Arazideki gölgeleri Terrain çizer.
 */
const Clouds = () => {
    const layers = useMemo(
        () =>
            [0, 1].map(
                (i) =>
                    new THREE.ShaderMaterial({
                        vertexShader,
                        fragmentShader,
                        transparent: true,
                        depthWrite: false,
                        fog: false,
                        uniforms: {
                            ...cloudUniforms,
                            uSun: { value: dayLight.sunDir },
                            uSunColor: { value: new THREE.Color('#fffaf0') },
                            uShade: { value: new THREE.Color('#8d97a6') },
                            uLayer: { value: i },
                            uNight: { value: 0 },
                            uWorld: { value: new THREE.Vector2(WORLD_WIDTH, WORLD_HEIGHT) },
                        },
                    }),
            ),
        [],
    );
    const geometry = useMemo(() => new THREE.PlaneGeometry(WORLD_WIDTH * 1.1, WORLD_HEIGHT * 1.1).rotateX(-Math.PI / 2), []);
    useEffect(
        () => () => {
            layers.forEach((m) => m.dispose());
            geometry.dispose();
        },
        [layers, geometry],
    );

    useFrame(({ camera }, delta) => {
        const d = Math.min(delta, 0.1);
        cloudUniforms.uCloudTime.value += d;
        // Kamera yükseldikçe görünür (y 15 -> 0, y 30 -> tam)
        const target = THREE.MathUtils.clamp((camera.position.y - 15) / 15, 0, 1);
        cloudUniforms.uCloudVis.value += (target - cloudUniforms.uCloudVis.value) * Math.min(1, d * 3);
        // Kışın daha kapalı
        cloudUniforms.uCloudCover.value = 0.42 + seasonUniforms.uWinter.value * 0.1;
        for (const m of layers) {
            m.uniforms.uSunColor.value.copy(dayLight.sun).lerp(new THREE.Color('#ffffff'), 0.5);
            m.uniforms.uNight.value = dayLight.night;
        }
    });

    return (
        <group visible>
            <mesh geometry={geometry} material={layers[0]} position={[0, 6.2, 0]} renderOrder={25} frustumCulled={false} />
            <mesh geometry={geometry} material={layers[1]} position={[0, 7.4, 0]} renderOrder={26} frustumCulled={false} />
        </group>
    );
};

export default Clouds;
