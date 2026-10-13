'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { mapAsset } from './media';
import { latLonToPixel, MAP_CENTER_LAT, MAP_CENTER_LON, pixelToLatLon, PLANET_RADIUS_KM, sky, SYNODIC_MONTH, sunDeclination, todayOfYear } from './astro';
import { themeStore, useTheme } from './themeStore';
import type { Region } from './types';

/**
 * Küre (gezegen) görünümü. Velutan haritası, Dünya ölçüsündeki gezegenin kuzey yarımküresinde gerçek enlem/boylam
 * yerinde (≈16°K..60°K, 31°B..31°D). Güneş gerçek gökyüzü mekaniğiyle (astro.ts): mevsime göre deklinasyon,
 * saate göre boylam; gece-gündüz sınırı gezegende ilerler. Gece yüzünde şehirler yanar. Ay, gerçek evresiyle
 * aynı güneşten aydınlanır (evre kendiliğinden doğru görünür). Ejderha gezegen üstünde fiziğe göre uçar.
 * Bir yere tıklayınca ya da çok yaklaşınca düz haritada oraya inilir.
 */

const R = 5;
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
const MAP_FRAME = 36 / 2048; // doku kenarındaki çerçeve payı
const deg = THREE.MathUtils.degToRad;

/** Enlem/boylam -> küre üstünde birim yön (boylam 0 +x, kuzey +y; doku eşlemesiyle aynı) */
export function latLonToVec(lat: number, lon: number, out = new THREE.Vector3()) {
    const φ = deg(lat), λ = deg(lon);
    return out.set(Math.cos(φ) * Math.cos(λ), Math.sin(φ), -Math.cos(φ) * Math.sin(λ));
}
function vecToLatLon(v: THREE.Vector3) {
    const n = v.clone().normalize();
    return { lat: THREE.MathUtils.radToDeg(Math.asin(n.y)), lon: THREE.MathUtils.radToDeg(Math.atan2(-n.z, n.x)) };
}

/** Gezegen dokusu: okyanus + harita (kenarları yumuşak) ve gece ışıkları (şehirler) */
function usePlanetTextures(regions: Region[]) {
    const [tex, setTex] = useState<{ day: THREE.CanvasTexture; lights: THREE.CanvasTexture } | null>(null);
    useEffect(() => {
        let alive = true;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            if (!alive) return;
            // Harita bütün gezegeni kaplar: eşdikdörtgen (360° x 180°), çerçeve kırpılır
            const W = 8192, H = 4096;
            const c = document.createElement('canvas');
            c.width = W;
            c.height = H;
            const g = c.getContext('2d')!;
            const fx = img.width * MAP_FRAME, fy = img.height * MAP_FRAME;
            g.drawImage(img, fx, fy, img.width - 2 * fx, img.height - 2 * fy, 0, 0, W, H);
            const day = new THREE.CanvasTexture(c);
            day.colorSpace = THREE.SRGBColorSpace;
            day.anisotropy = 8;
            // Gece ışıkları: şehir, başkent, kale büyüklüğüne göre parıltı
            const lc = document.createElement('canvas');
            lc.width = 4096;
            lc.height = 2048;
            const lg = lc.getContext('2d')!;
            lg.fillStyle = '#000';
            lg.fillRect(0, 0, lc.width, lc.height);
            for (const r of regions) {
                const { lat, lon } = pixelToLatLon(r.x, r.y);
                const px = ((lon + 180) / 360) * lc.width, py = ((90 - lat) / 180) * lc.height;
                const size = r.type === 'capital' ? 26 : r.type === 'city' ? 16 : r.type === 'fortress' ? 10 : 6;
                const gr = lg.createRadialGradient(px, py, 0, px, py, size);
                gr.addColorStop(0, 'rgba(255,214,140,1)');
                gr.addColorStop(0.35, 'rgba(255,170,80,0.55)');
                gr.addColorStop(1, 'rgba(255,140,40,0)');
                lg.fillStyle = gr;
                lg.fillRect(px - size, py - size, size * 2, size * 2);
                // Çevre köyler: küçük benekler
                for (let k = 0; k < (r.type === 'capital' ? 14 : 5); k++) {
                    const a = Math.random() * Math.PI * 2, d = size * (0.8 + Math.random() * 2.2);
                    lg.fillStyle = 'rgba(255,190,110,0.5)';
                    lg.fillRect(px + Math.cos(a) * d, py + Math.sin(a) * d, 1.6, 1.6);
                }
            }
            const lights = new THREE.CanvasTexture(lc);
            setTex({ day, lights });
        };
        img.src = mapAsset('terrain_2048.webp');
        return () => {
            alive = false;
        };
    }, [regions]);
    useEffect(() => () => {
        tex?.day.dispose();
        tex?.lights.dispose();
    }, [tex]);
    return tex;
}

const PLANET_VERT = /* glsl */ `
    varying vec3 vN;
    varying vec3 vWorld;
    void main() {
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
    }`;
const PLANET_FRAG = /* glsl */ `
    uniform sampler2D dayMap;
    uniform sampler2D lightsMap;
    uniform vec3 sunDir;
    varying vec3 vN;
    varying vec3 vWorld;
    void main() {
        vec3 n = normalize(vN);
        float lon = atan(-n.z, n.x);
        float lat = asin(clamp(n.y, -1.0, 1.0));
        vec2 uv = vec2(lon / 6.2831853 + 0.5, 0.5 + lat / 3.1415927);
        vec3 col = texture2D(dayMap, uv).rgb;
        float ndl = dot(n, sunDir);
        // Gündüz: Lambert + alacakaranlıkta turuncu; gece: koyu mavi + şehir ışıkları
        float dayK = smoothstep(-0.08, 0.18, ndl);
        vec3 lit = col * (0.06 + 1.05 * max(ndl, 0.0));
        float twilight = smoothstep(-0.1, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.12, ndl));
        lit += vec3(0.4, 0.18, 0.06) * twilight * 0.08;
        vec3 night = col * vec3(0.06, 0.08, 0.14) + texture2D(lightsMap, uv).rgb * 1.6;
        vec3 c = mix(night, lit, dayK);
        // Okyanus parıltısı (deniz: koyu, mavimsi pikseller)
        vec3 V = normalize(cameraPosition - vWorld);
        float sea = smoothstep(0.08, 0.0, abs(col.r - 0.2) + abs(col.g - 0.25) * 0.5 - 0.06) * step(col.b, col.r + 0.15);
        float spec = pow(max(dot(reflect(-sunDir, n), V), 0.0), 60.0) * dayK;
        c += vec3(1.0, 0.92, 0.78) * spec * (0.25 + sea * 0.6);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
    }`;

const CLOUD_FRAG = /* glsl */ `
    uniform vec3 sunDir;
    uniform float time;
    varying vec3 vN;
    float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n3(p); p = p * 2.03 + 3.1; a *= 0.5; } return v; }
    void main() {
        vec3 n = normalize(vN);
        // Rüzgâr: enleme göre doğuya/batıya kayan bantlar
        float ang = time * 0.004 * (n.y > 0.5 || n.y < -0.5 ? 1.0 : -0.7);
        vec3 p = vec3(n.x * cos(ang) - n.z * sin(ang), n.y, n.x * sin(ang) + n.z * cos(ang));
        float d = fbm(p * 3.2 + fbm(p * 1.6) * 1.2);
        float c = smoothstep(0.52, 0.72, d);
        float ndl = dot(n, sunDir);
        float lit = smoothstep(-0.1, 0.25, ndl);
        gl_FragColor = vec4(vec3(0.95, 0.96, 1.0) * (0.12 + 0.88 * lit), c * 0.85);
    }`;

const MOON_FRAG = /* glsl */ `
    uniform vec3 sunDir;
    varying vec3 vN;
    float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x) {
        vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
    }
    void main() {
        vec3 n = normalize(vN);
        float m = n3(n * 4.0) * 0.6 + n3(n * 11.0) * 0.3 + n3(n * 27.0) * 0.1;
        vec3 col = mix(vec3(0.42), vec3(0.82, 0.8, 0.76), smoothstep(0.35, 0.65, m));
        float ndl = max(dot(n, sunDir), 0.0);
        gl_FragColor = vec4(col * (0.015 + ndl * 1.1), 1.0);
        #include <colorspace_fragment>
    }`;

/** Gökyüzü saati: kip (döngü / gerçek saat); kapalıysa gerçek saat */
function useSkyClock() {
    const mode = useTheme().day;
    const start = useRef(performance.now());
    return () => {
        const now = new Date();
        let doy = todayOfYear(now);
        let hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
        let days = now.getTime() / 86400000 - NEW_MOON_EPOCH;
        if (mode === 'dongu') {
            const elapsed = (performance.now() - start.current) / 1000 / 240;
            hour = (13 + elapsed * 24) % 24;
            doy += Math.floor(13 / 24 + elapsed);
            days += elapsed;
        }
        return { doy: doy % 365.25, hour, days };
    };
}

const _sun = new THREE.Vector3();

function Planet({ regions, onPick }: { regions: Region[]; onPick: (r: Region) => void }) {
    const tex = usePlanetTextures(regions);
    const clock = useSkyClock();
    const sunDir = useMemo(() => new THREE.Vector3(1, 0, 0), []);
    const mats = useMemo(() => {
        const planet = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, uniforms: { dayMap: { value: null }, lightsMap: { value: null }, sunDir: { value: sunDir } } });
        const clouds = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: CLOUD_FRAG, uniforms: { sunDir: { value: sunDir }, time: { value: 0 } }, transparent: true, depthWrite: false });
        const moon = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: MOON_FRAG, uniforms: { sunDir: { value: sunDir } } });
        return { planet, clouds, moon };
    }, [sunDir]);
    useEffect(() => {
        if (!tex) return;
        mats.planet.uniforms.dayMap.value = tex.day;
        mats.planet.uniforms.lightsMap.value = tex.lights;
    }, [tex, mats]);
    useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
    const moonRef = useRef<THREE.Mesh>(null);
    const [info, setInfo] = useState('');

    useFrame((_, delta) => {
        const { doy, hour, days } = clock();
        // Güneşin tepede olduğu nokta: enlem = deklinasyon, boylam = haritanın öğle boylamından saat farkı kadar batı
        const dec = sunDeclination(doy);
        const subLon = MAP_CENTER_LON - (hour - 12) * 15;
        latLonToVec(dec, subLon, _sun);
        sunDir.copy(_sun);
        mats.clouds.uniforms.time.value += Math.min(delta, 0.1);
        // Ay: güneş yönünden evre * 360° doğuya; uzaklık görünürlük için kısaltılmış (gerçeği ≈ 60 yarıçap)
        const phase = (((days / SYNODIC_MONTH) % 1) + 1) % 1;
        const moonLon = subLon + phase * 360;
        if (moonRef.current) latLonToVec(dec * Math.cos(phase * Math.PI * 2), moonLon, moonRef.current.position).multiplyScalar(R * 7);
        const s = sky(doy, hour, days);
        const txt = `Gezegen yarıçapı ${Math.round(PLANET_RADIUS_KM)} km · haritanın ortasında güneş ${s.sun.elevation.toFixed(0)}° · ay %${Math.round(s.illumination * 100)}`;
        if (txt !== info) setInfo(txt);
    });

    // Bölge işaretleri: yalnızca önyüzde, başkent ve şehirler
    const markers = useMemo(
        () =>
            regions
                .filter((r) => ['capital', 'city', 'fortress'].includes(r.type ?? ''))
                .map((r) => {
                    const { lat, lon } = pixelToLatLon(r.x, r.y);
                    return { r, pos: latLonToVec(lat, lon).multiplyScalar(R * 1.004) };
                }),
        [regions],
    );

    return (
        <>
            <mesh material={mats.planet}>
                <sphereGeometry args={[R, 192, 96]} />
            </mesh>
            <mesh material={mats.clouds} scale={1.012}>
                <sphereGeometry args={[R, 128, 64]} />
            </mesh>
            <mesh ref={moonRef} material={mats.moon}>
                <sphereGeometry args={[R * 0.273, 64, 32]} />
            </mesh>
            <Stars />
            {markers.map(({ r, pos }) => (
                <GlobeMarker key={r.id} pos={pos} region={r} onPick={onPick} />
            ))}
            <GlobeDragon />
            <Html fullscreen style={{ pointerEvents: 'none' }}>
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full border border-amber-600/30 bg-black/60 px-3 py-1 text-[11px] text-amber-100/70">{info}</div>
            </Html>
        </>
    );
}

const _v = new THREE.Vector3();
function GlobeMarker({ pos, region, onPick }: { pos: THREE.Vector3; region: Region; onPick: (r: Region) => void }) {
    const ref = useRef<HTMLDivElement>(null);
    const { camera } = useThree();
    useFrame(() => {
        // Kürenin arkasındakiler gizlenir
        const facing = _v.copy(camera.position).sub(pos).normalize().dot(pos.clone().normalize());
        if (!ref.current) return;
        ref.current.style.opacity = facing > 0.15 ? String(Math.min(1, (facing - 0.15) * 4)) : '0';
        ref.current.style.pointerEvents = facing > 0.25 ? 'auto' : 'none';
        // Uzaktan yalnızca nokta (isimler üst üste binmesin); yaklaşınca isim (başkentler biraz daha erken)
        const near = camera.position.length() < R * (region.type === 'capital' ? 2.6 : 1.9);
        const label = ref.current.querySelector<HTMLElement>('[data-label]');
        if (label) label.style.display = near ? 'block' : 'none';
    });
    return (
        <Html position={pos} center zIndexRange={[20, 0]}>
            <div ref={ref} className="transition-opacity">
                <button onClick={() => onPick(region)} className="group flex flex-col items-center" title={`${region.name}: haritada aç`}>
                    <span className={`block rounded-full ${region.type === 'capital' ? 'h-2.5 w-2.5 bg-red-400' : 'h-2 w-2 bg-amber-300'} shadow-[0_0_10px_rgba(255,200,120,0.9)]`} />
                    <span data-label className="mt-0.5 whitespace-nowrap rounded bg-black/60 px-1.5 text-[10px] font-bold text-amber-100/90 opacity-80 group-hover:opacity-100">{region.name}</span>
                </button>
            </div>
        </Html>
    );
}

function Stars() {
    const geo = useMemo(() => {
        const n = 4000;
        const p = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            const v = new THREE.Vector3().randomDirection().multiplyScalar(220 + Math.random() * 60);
            p.set([v.x, v.y, v.z], i * 3);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(p, 3));
        return g;
    }, []);
    useEffect(() => () => geo.dispose(), [geo]);
    return (
        <points geometry={geo}>
            <pointsMaterial size={0.9} sizeAttenuation={false} color="#dfe8ff" transparent opacity={0.85} />
        </points>
    );
}

// Ejderha rotası (harita pikseli) küre üstünde; uçuş fiziği düz haritadakiyle aynı ilkeler
const TOUR: [number, number][] = [
    [5400, 5580], [6600, 6400], [5200, 6500], [3900, 6150], [2900, 5400], [2000, 4000], [1200, 3500], [900, 1900],
    [1500, 900], [2900, 1300], [4200, 1600], [3300, 2700], [4900, 2400], [5700, 1500], [6900, 2700], [7500, 3500], [6300, 3600], [4900, 3500],
];
function GlobeDragon() {
    const { scene, animations } = useGLTF('/models/dragon.glb');
    const model = useMemo(() => scene.clone(true), [scene]);
    const root = useRef<THREE.Group>(null);
    const { actions } = useAnimations(animations, root);
    const curve = useMemo(
        () =>
            new THREE.CatmullRomCurve3(
                TOUR.map(([x, y]) => {
                    const { lat, lon } = pixelToLatLon(x, y);
                    return latLonToVec(lat, lon).multiplyScalar(R * 1.03);
                }),
                true,
                'centripetal',
            ),
        [],
    );
    const length = useMemo(() => curve.getLength(), [curve]);
    const st = useRef({ u: 0, speed: 0.12, roll: 0, prev: null as THREE.Vector3 | null });
    useEffect(() => {
        const a = actions.flying ?? Object.values(actions)[0];
        a?.reset().play();
    }, [actions]);
    const fit = useMemo(() => {
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        model.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) m.frustumCulled = false;
        });
        return 0.22 / Math.max(size.x, size.z, 1e-6);
    }, [model]);
    const tmp = useMemo(() => ({ p: new THREE.Vector3(), t: new THREE.Vector3(), up: new THREE.Vector3(), m: new THREE.Matrix4(), side: new THREE.Vector3() }), []);
    useFrame((_, delta) => {
        const r = root.current;
        if (!r) return;
        const dt = Math.min(delta, 0.1);
        const s = st.current;
        s.u = (s.u + (dt * s.speed) / length) % 1;
        const { p, t, up, m, side } = tmp;
        curve.getPointAt(s.u, p);
        p.setLength(R * 1.03);
        curve.getTangentAt(s.u, t);
        up.copy(p).normalize();
        t.addScaledVector(up, -t.dot(up)).normalize(); // teğeti yüzeye paralel yap
        // Koordineli dönüş: ileriki teğetle açı farkı -> dönüş hızı -> yatış tan(φ) = v·ω / g
        const t2 = curve.getTangentAt((s.u + 0.004) % 1).clone();
        const turn = side.copy(t).cross(t2).dot(up);
        const bank = Math.atan((s.speed * turn * 60) / 0.5);
        s.roll += (THREE.MathUtils.clamp(-bank, -0.9, 0.9) - s.roll) * Math.min(dt * 2, 1);
        r.position.copy(p);
        // Yönelim: ileri = teğet, yukarı = küre normali
        side.copy(up).cross(t).normalize();
        m.makeBasis(side, up, t);
        r.quaternion.setFromRotationMatrix(m);
        r.rotateZ(s.roll);
    });
    return (
        <group ref={root}>
            <group scale={fit}>
                <primitive object={model} />
            </group>
        </group>
    );
}

/** Düz haritaya dönüş: bölgeye ya da bakılan noktaya inilir */
function exitTo(px: number, py: number) {
    themeStore.set({ world: 'duz' });
    // Düz harita yüklendikten sonra uç
    setTimeout(() => window.dispatchEvent(new CustomEvent('velutan:fly', { detail: { x: px, y: py } })), 2200);
}

function ZoomExit() {
    const { camera } = useThree();
    const done = useRef(false);
    useFrame(() => {
        if (done.current) return;
        // Çok yaklaşınca: altındaki noktaya düz haritada in
        if (camera.position.length() < R * 1.22) {
            done.current = true;
            const { lat, lon } = vecToLatLon(camera.position);
            const p = latLonToPixel(lat, lon);
            exitTo(p.x, p.y);
        }
    });
    return null;
}

export default function GlobeCanvas({ regions }: { regions: Region[] }) {
    const start = useMemo(() => latLonToVec(20, MAP_CENTER_LON).multiplyScalar(R * 3.1), []);
    return (
        <div className="h-full w-full bg-black">
            <Canvas camera={{ fov: 40, near: 0.05, far: 600, position: start.toArray() }} dpr={[1, 2]} flat>
                <Suspense fallback={null}>
                    <Planet regions={regions} onPick={(r) => exitTo(r.x, r.y)} />
                </Suspense>
                <OrbitControls enablePan={false} minDistance={R * 1.15} maxDistance={R * 8} rotateSpeed={0.45} zoomSpeed={0.7} enableDamping dampingFactor={0.08} />
                <ZoomExit />
            </Canvas>
        </div>
    );
}
