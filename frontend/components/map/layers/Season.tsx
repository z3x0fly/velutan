'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { seasonUniforms } from '../seasonStore';
import { useTheme } from '../themeStore';

const COUNT = 2600;

/**
 * Mevsim: Tema'da Sonbahar ya da Kış seçilince arazi, su (shader uniform'ları) ve hava değişir.
 * Kışta kar taneleri savrulur, sonbaharda dönerek yapraklar düşer. Parçacıklar kameranın baktığı yerin
 * çevresindeki bir kutuda döner (haritanın her yerine değil): ucuz, her yerde aynı yoğunluk.
 */
export default function Season({ particles = true }: { particles?: boolean }) {
    const trees = useTheme().trees;
    const { invalidate } = useThree();
    const target = { autumn: trees === 'sonbahar' ? 1 : 0, winter: trees === 'kis' ? 1 : 0 };
    const kind = trees === 'kis' ? 'snow' : trees === 'sonbahar' ? 'leaf' : null;

    // Yalnızca değişince çizilen kademede de geçiş tamamlansın
    useEffect(() => {
        const id = setInterval(() => invalidate(), 60);
        const stop = setTimeout(() => clearInterval(id), 2500);
        return () => {
            clearInterval(id);
            clearTimeout(stop);
        };
    }, [trees, invalidate]);

    useFrame((_, delta) => {
        const k = 1 - Math.exp(-Math.min(delta, 0.1) * 2.5);
        seasonUniforms.uAutumn.value += (target.autumn - seasonUniforms.uAutumn.value) * k;
        seasonUniforms.uWinter.value += (target.winter - seasonUniforms.uWinter.value) * k;
    });

    if (!particles || !kind) return null;
    return <Weather kind={kind} />;
}

const vertexShader = /* glsl */ `
    uniform float uTime;
    uniform float uBox;
    uniform vec3 uCenter;
    uniform float uSize;
    uniform float uFall;
    attribute vec4 seed;
    varying float vSpin;
    varying float vHue;
    varying float vFade;
    void main() {
        // Kutu içinde düşüş + rüzgâr; kutunun dışına çıkan kenardan geri girer (modulo)
        vec3 p = seed.xyz * uBox;
        p.y = mod(seed.y * uBox * 0.5 - uTime * uFall * (0.6 + seed.w * 0.8), uBox * 0.5);
        p.x += sin(uTime * 0.7 + seed.w * 40.0) * 0.25 + uTime * 0.18;
        p.z += cos(uTime * 0.5 + seed.w * 31.0) * 0.2;
        vec3 local = vec3(mod(p.x - uCenter.x + uBox * 0.5, uBox) - uBox * 0.5, p.y, mod(p.z - uCenter.z + uBox * 0.5, uBox) - uBox * 0.5);
        vec3 world = vec3(uCenter.x, 0.0, uCenter.z) + local;
        vec4 mv = modelViewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (0.6 + seed.w * 0.8) / -mv.z;
        vSpin = uTime * (1.5 + seed.w * 3.0) + seed.x * 20.0;
        vHue = seed.w;
        // Yere yakın ve kutunun kenarında söner (sınır görünmesin)
        vec2 e = abs(local.xz) / (uBox * 0.5);
        vFade = smoothstep(0.0, 0.25, p.y) * (1.0 - smoothstep(0.7, 1.0, max(e.x, e.y)));
    }
`;

const snowFragment = /* glsl */ `
    varying float vFade;
    void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.15, d) * vFade;
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), a * 0.9);
    }
`;

const leafFragment = /* glsl */ `
    varying float vSpin;
    varying float vHue;
    varying float vFade;
    void main() {
        // Dönen yaprak: döndürülmüş, iki ucu sivri elips
        vec2 q = gl_PointCoord - 0.5;
        float c = cos(vSpin), s = sin(vSpin);
        q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
        float leaf = 1.0 - smoothstep(0.0, 0.04, (q.x * q.x) / 0.09 + (q.y * q.y) / 0.02 - 1.0 + abs(q.x) * 1.5);
        float a = leaf * vFade * (0.6 + 0.4 * abs(cos(vSpin * 0.7)));
        if (a < 0.03) discard;
        vec3 col = mix(vec3(0.78, 0.33, 0.1), vec3(0.93, 0.62, 0.16), vHue);
        col = mix(col, vec3(0.55, 0.18, 0.08), step(0.82, vHue));
        gl_FragColor = vec4(col * (0.75 + 0.25 * abs(cos(vSpin))), a);
    }
`;

const _dir = new THREE.Vector3();
const _center = new THREE.Vector3();

function Weather({ kind }: { kind: 'snow' | 'leaf' }) {
    const { camera } = useThree();
    const geometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const n = kind === 'snow' ? COUNT : Math.round(COUNT * 0.35);
        const seed = new Float32Array(n * 4);
        for (let i = 0; i < n * 4; i++) seed[i] = Math.random();
        for (let i = 0; i < n; i++) {
            seed[i * 4] -= 0.5;
            seed[i * 4 + 2] -= 0.5;
        }
        g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
        // Konum shader'da hesaplanır; three'nin çizim sayısı için boş konum
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
        return g;
    }, [kind]);
    const material = useMemo(
        () =>
            new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader: kind === 'snow' ? snowFragment : leafFragment,
                transparent: true,
                depthWrite: false,
                uniforms: {
                    uTime: { value: 0 },
                    uBox: { value: 12 },
                    uCenter: { value: new THREE.Vector3() },
                    uSize: { value: kind === 'snow' ? 34 : 70 },
                    uFall: { value: kind === 'snow' ? 0.35 : 0.22 },
                },
            }),
        [kind],
    );
    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => () => material.dispose(), [material]);
    const t = useRef(0);

    useFrame((_, delta) => {
        t.current += Math.min(delta, 0.1);
        const u = material.uniforms;
        u.uTime.value = t.current;
        // Kameranın baktığı yer: bakış ışınının zeminle (y = 0) kesiştiği nokta
        camera.getWorldDirection(_dir);
        const tHit = _dir.y < -0.05 ? -camera.position.y / _dir.y : 10;
        const center = _center.copy(camera.position).addScaledVector(_dir, Math.min(tHit, 60));
        u.uCenter.value.copy(center);
        // Kutu kameranın uzaklığıyla büyür: yakında yoğun, uzakta seyrek ama hep görünür
        const dist = camera.position.distanceTo(center);
        u.uBox.value = THREE.MathUtils.clamp(dist * 1.4, 4, 40);
        u.uSize.value = (kind === 'snow' ? 34 : 70) * THREE.MathUtils.clamp(dist / 10, 0.6, 2.2);
    });

    return <points geometry={geometry} material={material} frustumCulled={false} renderOrder={30} />;
}
