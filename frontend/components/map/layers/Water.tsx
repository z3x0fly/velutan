'use client';

import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { DISPLACEMENT_BIAS, DISPLACEMENT_SCALE, HEIGHT_URL } from '../terrain/heightField';

// Çerçevenin (overlay) içinde kalsın
const INSET = 0.968;
// Deniz tabanının en derin yeri (dünya birimi): derinlik buna göre 0..1'e çekilir
const MAX_DEPTH = Math.max(-DISPLACEMENT_BIAS, 0.02);

/**
 * Su: yükselti haritasından derinliği okur. Kıyıda sığ, açık ve köpüklü; açık denizde koyu ve dalgalı.
 * Büyük okyanuslarda yüzey gerçekten kabarır (köşe kaydırma), ışık dalgaların eğiminden hesaplanır:
 * güneş parıltısı, ufka doğru gökyüzü yansıması (Fresnel), dalga tepesinde köpük. Ejderhanın gölgesini alır.
 */
const WAVES = /* glsl */ `
    uniform float uTime;
    uniform sampler2D uHeight;
    uniform vec2 uWorld;
    uniform float uSeaLevel;
    uniform float uDepthScale;

    // Haritada denizin derinliği 0 (kıyı) .. 1 (açık okyanus)
    float seaDepth(vec2 xz) {
        vec2 uv = vec2(xz.x / uWorld.x + 0.5, 0.5 - xz.y / uWorld.y);
        float h = texture2D(uHeight, uv).r;
        return clamp((uSeaLevel - h) * uDepthScale, 0.0, 1.0);
    }

    // Yumuşatılmış derinlik: 8 bitlik yükselti deniz tabanında yalnızca ~15 kademe verir; tek örnek
    // basamak basamak (kare kare) görünür. Çevredeki 5 örneğin ortalaması pürüzsüz geçiş verir.
    float seaDepthSmooth(vec2 xz) {
        float r = 0.09;
        return (seaDepth(xz) * 2.0 + seaDepth(xz + vec2(r, r)) + seaDepth(xz + vec2(-r, r))
            + seaDepth(xz + vec2(r, -r)) + seaDepth(xz + vec2(-r, -r))) / 6.0;
    }

    // Yönlü dalgalar (batıdan esen rüzgâr). xyz: yükseklik ve x/z eğimleri.
    // count: kaç dalga toplanır (yüzey kaydırmada yalnızca uzun dalgalar: örgü kısa dalgayı köşeli gösterir)
    vec3 waveSum(vec2 p, float t, int count) {
        vec3 acc = vec3(0.0);
        // yön, dalga boyu, genlik
        vec4 W[5];
        W[0] = vec4(normalize(vec2(1.0, 0.25)), 1.35, 1.0);
        W[1] = vec4(normalize(vec2(0.8, -0.6)), 0.82, 0.55);
        W[2] = vec4(normalize(vec2(0.95, 0.55)), 0.47, 0.32);
        W[3] = vec4(normalize(vec2(0.3, 1.0)), 0.29, 0.18);
        W[4] = vec4(normalize(vec2(-0.6, 0.8)), 0.17, 0.09);
        for (int i = 0; i < 5; i++) {
            if (i >= count) break;
            float k = 6.28318 / W[i].z;
            float speed = sqrt(9.8 / k) * 0.16;
            float ph = k * dot(W[i].xy, p) - speed * k * t;
            float a = W[i].w;
            acc.x += a * sin(ph);
            acc.yz += a * k * cos(ph) * W[i].xy;
        }
        return acc;
    }
`;

const vertexShader = /* glsl */ `
    #include <common>
    #include <fog_pars_vertex>
    #include <shadowmap_pars_vertex>
    ${WAVES}
    uniform float uAmp;
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
        vUv = uv;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        float d = seaDepth(worldPosition.xz);
        // Kıyıda dalga yok (karayı yalamasın), açıkta tam boy
        float amp = uAmp * smoothstep(0.08, 0.55, d);
        worldPosition.y += waveSum(worldPosition.xz, uTime, 2).x * amp;
        vWorld = worldPosition.xyz;
        vec3 transformedNormal = normalMatrix * vec3(0.0, 0.0, 1.0);
        #include <shadowmap_vertex>
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
    }
`;

const fragmentShader = /* glsl */ `
    #include <common>
    #include <packing>
    #include <fog_pars_fragment>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    ${WAVES}
    uniform float uAmp;
    uniform vec3 uDeep;
    uniform vec3 uMid;
    uniform vec3 uShallow;
    uniform vec3 uSky;
    uniform vec3 uFoam;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
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
        for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
    }

    void main() {
        float d = seaDepthSmooth(vWorld.xz);
        float t = uTime;
        vec2 p = vWorld.xz;

        // Uzaktan ince ayrıntı söner: parıltı şeritleri ve titreşim olmasın
        float detail = 1.0 - smoothstep(4.0, 16.0, length(cameraPosition - vWorld));

        // Eğim: büyük dalgalar (derinlikle güçlenir) + ince kırışıklık
        float swellK = smoothstep(0.08, 0.55, d);
        vec3 w = waveSum(p, t, 5);
        // Uzakta dalgalar üst üste binip kafes deseni yapar: eğim yakında tam, uzakta sıfır
        vec2 slope = w.yz * uAmp * swellK * 1.4 * detail * detail;
        // İnce kırışıklık yalnızca yakında hesaplanır (uzakta hem görünmez hem titreşir)
        if (detail > 0.01) {
            float rx = fbm(p * 7.0 + vec2(t * 0.35, -t * 0.22));
            float rz = fbm(p * 7.0 + vec2(-t * 0.27, t * 0.31) + 17.3);
            slope += (vec2(rx, rz) - 0.5) * 0.2 * detail;
        }
        vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

        vec3 V = normalize(cameraPosition - vWorld);
        vec3 L = normalize(uSunDir);
        float shadow = getShadowMask();

        // Derinliğe göre renk; açıkta dalga tepeleri biraz açık
        vec3 water = mix(uShallow, uMid, smoothstep(0.0, 0.25, d));
        water = mix(water, uDeep, smoothstep(0.25, 0.85, d));
        water *= 0.82 + 0.28 * max(dot(N, L), 0.0);
        water += (w.x * 0.5 + 0.5) * swellK * 0.06 * detail;
        // Uzaktan bakışta: yavaş kayan, büyük ölçekli yumuşak renk dalgalanması (desen tekrarı yok)
        float drift = noise(p * 0.22 + vec2(t * 0.02, -t * 0.015)) * 0.6 + noise(p * 0.55 - vec2(t * 0.03, t * 0.01)) * 0.4;
        water *= 0.9 + 0.18 * drift * swellK;

        // Gökyüzü yansıması (yatık bakışta artar) ve güneş parıltısı
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 color = mix(water, uSky, fres * 0.65);
        vec3 H = normalize(L + V);
        float nh = max(dot(N, H), 0.0);
        float spec = pow(nh, 260.0) * 1.1 * detail + pow(nh, 24.0) * 0.05;
        color += uSunColor * spec * shadow;

        // Kıyı köpüğü: kıyıya vuran dalga çizgileri
        float foam = 0.0;
        if (d < 0.12) {
            float n = noise(p * 5.0 + t * 0.15);
            float band = smoothstep(0.11, 0.0, d);
            float surf = smoothstep(0.55, 0.95, sin(d * 70.0 - t * 1.6 + n * 6.0) * 0.5 + 0.5) * smoothstep(0.1, 0.02, d);
            foam = (band * 0.3 + surf * 0.6) * (0.6 + 0.4 * n);
        }
        // Açık denizde dalga tepesinde ince beyaz köpük (yalnızca yakında)
        if (detail > 0.01 && swellK > 0.01) {
            float crest = smoothstep(0.88, 1.0, w.x * 0.5 + 0.5) * smoothstep(0.5, 0.95, noise(p * 22.0 - t * 0.4)) * swellK * detail;
            foam += crest * 0.18;
        }
        foam = clamp(foam, 0.0, 1.0);
        color = mix(color, uFoam, foam);

        // Ejderha gölgesi suya düşer
        color *= mix(0.55, 1.0, shadow);

        // Kıyıda boyalı haritanın sığlığı seçilsin; açıkta su örtsün
        float alpha = mix(0.38, 0.86, smoothstep(0.02, 0.5, d)) + foam * 0.3 + spec * 0.3;
        alpha = clamp(alpha, 0.0, 1.0);
        // Kenarlara doğru yumuşak geçiş (çerçeveye taşmasın)
        vec2 e = smoothstep(vec2(0.0), vec2(0.012), vUv) * smoothstep(vec2(0.0), vec2(0.012), 1.0 - vUv);
        alpha *= e.x * e.y;

        gl_FragColor = vec4(color, alpha);
        #include <fog_fragment>
    }
`;

const SUN_DIR = new THREE.Vector3(-14, 22, -10).normalize(); // MapCanvas3D'deki "sun" ile aynı yön

const Water = ({ animate = true }: { animate?: boolean }) => {
    const height = useTexture(HEIGHT_URL);
    const material = useMemo(
        () =>
            new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader,
                transparent: true,
                depthWrite: false,
                fog: true,
                lights: true,
                uniforms: THREE.UniformsUtils.merge([
                    THREE.UniformsLib.fog,
                    THREE.UniformsLib.lights,
                    {
                        uTime: { value: 0 },
                        uHeight: { value: null },
                        uWorld: { value: new THREE.Vector2(WORLD_WIDTH, WORLD_HEIGHT) },
                        uSeaLevel: { value: -DISPLACEMENT_BIAS / DISPLACEMENT_SCALE },
                        uDepthScale: { value: DISPLACEMENT_SCALE / MAX_DEPTH },
                        uAmp: { value: animate ? 0.012 : 0.008 },
                        uDeep: { value: new THREE.Color('#1d3a57') },
                        uMid: { value: new THREE.Color('#2f5d7c') },
                        uShallow: { value: new THREE.Color('#5c949a') },
                        uSky: { value: new THREE.Color('#b9c9d6') },
                        uFoam: { value: new THREE.Color('#f1eadb') },
                        uSunDir: { value: SUN_DIR },
                        uSunColor: { value: new THREE.Color('#fff1d6') },
                    },
                ]),
            }),
        [], // eslint-disable-line react-hooks/exhaustive-deps
    );
    // UniformsUtils.merge dokuları kopyalar; doku burada atanır
    material.uniforms.uHeight.value = height;

    // Durgun kademelerde düz bir dörtgen yeter; dalgalı yüzey için sık örgü
    const geometry = useMemo(() => {
        const [sx, sy] = animate ? [320, 281] : [1, 1];
        return new THREE.PlaneGeometry(WORLD_WIDTH * INSET, WORLD_HEIGHT * INSET, sx, sy);
    }, [animate]);

    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => () => material.dispose(), [material]);

    useFrame((_, delta) => {
        if (!animate) return;
        material.uniforms.uTime.value += Math.min(delta, 0.1);
    });

    return <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geometry} material={material} renderOrder={1} receiveShadow />;
};

export default Water;
