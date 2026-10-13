'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { kasaBitmap } from './kasa';
import { latLonToPixel, MAP_CENTER_LON, mapBounds, mapCenterLat, pixelToLatLon, planetRadiusKm, sky, SYNODIC_MONTH, sunDeclination } from './astro';
import { MAP_HEIGHT_PIXELS, MAP_WIDTH_PIXELS } from './utils/coords';
import { themeStore } from './themeStore';
import { skyTime } from './skyClock';
import { dayStore } from './dayStore';
import { dayLength } from './astro';
import type { Region } from './types';

/**
 * Küre (gezegen) görünümü. Velutan, Jüpiter büyüklüğündeki gezegenin kuzey yarımküresinde 8000 km'lik bir kıta
 * (≈35°K..41°K, ≈4°B..4°D): ayrı, keskin bir yama olarak kürenin üstüne oturur. Güneş gerçek gökyüzü mekaniğiyle (astro.ts): mevsime göre deklinasyon,
 * saate göre boylam; gece-gündüz sınırı gezegende ilerler. Gece yüzünde şehirler yanar. Ay, gerçek evresiyle
 * aynı güneşten aydınlanır (evre kendiliğinden doğru görünür). 
 * Bir yere tıklayınca ya da çok yaklaşınca düz haritada oraya inilir.
 */

const R = 5;
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

interface PlanetTex {
    /** Okyanus gezegeni (eşdikdörtgen) */
    ocean: THREE.CanvasTexture;
    /** Kıta: harita (kenarları yumuşak) ve gece ışıkları (şehirler); kıta yamasının kendi uv'siyle */
    land: THREE.CanvasTexture;
    lights: THREE.CanvasTexture;
    none: THREE.DataTexture;
}

/** Gezegen dokuları: okyanus ve kutup buzulları; kıta ayrı ve keskin (gezegenin yanında çok küçük) */
function usePlanetTextures(regions: Region[]) {
    const [tex, setTex] = useState<PlanetTex | null>(null);
    useEffect(() => {
        let alive = true;
        kasaBitmap('terrain_4096.webp').then((img) => {
            if (!alive) return;
            const W = 4096, H = 2048;
            const c = document.createElement('canvas');
            c.width = W;
            c.height = H;
            const g = c.getContext('2d')!;
            g.fillStyle = '#40464d';
            g.fillRect(0, 0, W, H);
            for (let i = 0; i < 2600; i++) {
                const x = Math.random() * W, y = Math.random() * H, r = 10 + Math.random() * 90;
                const gr = g.createRadialGradient(x, y, 0, x, y, r);
                gr.addColorStop(0, `rgba(${Math.random() < 0.5 ? '84,92,100' : '46,52,60'},0.16)`);
                gr.addColorStop(1, 'rgba(0,0,0,0)');
                g.fillStyle = gr;
                g.fillRect(x - r, y - r, r * 2, r * 2);
            }
            for (const [from, to] of [[0, H * 0.12], [H, H * 0.86]]) {
                const ice = g.createLinearGradient(0, from, 0, to);
                ice.addColorStop(0, 'rgba(232,238,242,1)');
                ice.addColorStop(1, 'rgba(232,238,242,0)');
                g.fillStyle = ice;
                g.fillRect(0, Math.min(from, to), W, Math.abs(to - from));
            }
            const ocean = new THREE.CanvasTexture(c);
            ocean.colorSpace = THREE.SRGBColorSpace;
            ocean.anisotropy = 8;

            // Kıta: harita, çerçevesi kırpılmış, kenarları okyanusa karışır
            const fx = img.width * MAP_FRAME, fy = img.height * MAP_FRAME;
            const mw = 4096, mh = Math.round((4096 * (img.height - 2 * fy)) / (img.width - 2 * fx));
            const m = document.createElement('canvas');
            m.width = mw;
            m.height = mh;
            const mg = m.getContext('2d')!;
            mg.drawImage(img, fx, fy, img.width - 2 * fx, img.height - 2 * fy, 0, 0, mw, mh);
            mg.globalCompositeOperation = 'destination-in';
            const feather = Math.min(mw, mh) * 0.05;
            for (const [gx0, gy0, gx1, gy1] of [[0, 0, feather, 0], [mw, 0, mw - feather, 0], [0, 0, 0, feather], [0, mh, 0, mh - feather]]) {
                const lg = mg.createLinearGradient(gx0, gy0, gx1, gy1);
                lg.addColorStop(0, 'rgba(0,0,0,0)');
                lg.addColorStop(1, 'rgba(0,0,0,1)');
                mg.fillStyle = lg;
                mg.fillRect(0, 0, mw, mh);
            }
            const land = new THREE.CanvasTexture(m);
            land.colorSpace = THREE.SRGBColorSpace;
            land.anisotropy = 8;

            // Gece ışıkları: şehir, başkent, kale büyüklüğüne göre parıltı (harita pikselinde)
            const lc = document.createElement('canvas');
            lc.width = 2048;
            lc.height = Math.round((2048 * mh) / mw);
            const lg = lc.getContext('2d')!;
            lg.fillStyle = '#000';
            lg.fillRect(0, 0, lc.width, lc.height);
            const sx = lc.width / MAP_WIDTH_PIXELS, sy = lc.height / MAP_HEIGHT_PIXELS;
            for (const r of regions) {
                const px = r.x * sx, py = r.y * sy;
                const size = r.type === 'capital' ? 22 : r.type === 'city' ? 13 : r.type === 'fortress' ? 8 : 5;
                const gr = lg.createRadialGradient(px, py, 0, px, py, size);
                gr.addColorStop(0, 'rgba(255,214,140,1)');
                gr.addColorStop(0.35, 'rgba(255,170,80,0.55)');
                gr.addColorStop(1, 'rgba(255,140,40,0)');
                lg.fillStyle = gr;
                lg.fillRect(px - size, py - size, size * 2, size * 2);
                for (let k = 0; k < (r.type === 'capital' ? 14 : 5); k++) {
                    const a = Math.random() * Math.PI * 2, d = size * (0.8 + Math.random() * 2.2);
                    lg.fillStyle = 'rgba(255,190,110,0.5)';
                    lg.fillRect(px + Math.cos(a) * d, py + Math.sin(a) * d, 1.6, 1.6);
                }
            }
            const lights = new THREE.CanvasTexture(lc);
            const none = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
            none.needsUpdate = true;
            setTex({ ocean, land, lights, none });
            img.close();
        });
        return () => {
            alive = false;
        };
    }, [regions]);
    useEffect(
        () => () => {
            if (tex) Object.values(tex).forEach((t) => t.dispose());
        },
        [tex],
    );
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

const LAND_VERT = /* glsl */ `
    varying vec3 vN;
    varying vec3 vWorld;
    varying vec2 vUv;
    void main() {
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
    }`;
const LAND_FRAG = /* glsl */ `
    uniform sampler2D dayMap;
    uniform sampler2D lightsMap;
    uniform vec3 sunDir;
    varying vec3 vN;
    varying vec2 vUv;
    void main() {
        vec4 tex = texture2D(dayMap, vUv);
        vec3 col = tex.rgb;
        // Haritanın denizi (gri-mavi) okyanusa karışır
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        float sea = smoothstep(-0.03, 0.02, col.b - col.r) * (1.0 - smoothstep(0.38, 0.48, lum));
        tex.a *= 1.0 - sea * 0.96;
        vec3 n = normalize(vN);
        float ndl = dot(n, sunDir);
        float dayK = smoothstep(-0.08, 0.18, ndl);
        vec3 lit = col * (0.06 + 1.05 * max(ndl, 0.0));
        float twilight = smoothstep(-0.1, 0.0, ndl) * (1.0 - smoothstep(0.0, 0.12, ndl));
        lit += vec3(0.4, 0.18, 0.06) * twilight * 0.08;
        vec3 night = col * vec3(0.06, 0.08, 0.14) + texture2D(lightsMap, vUv).rgb * 1.6;
        gl_FragColor = vec4(mix(night, lit, dayK), tex.a);
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
        float ang = time * 0.004 * mix(-0.7, 1.0, smoothstep(0.35, 0.65, abs(n.y)));
        vec3 p = vec3(n.x * cos(ang) - n.z * sin(ang), n.y, n.x * sin(ang) + n.z * cos(ang));
        float d = fbm(p * 26.0 + fbm(p * 9.0) * 1.4);
        float c = smoothstep(0.58, 0.8, d);
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

const _sun = new THREE.Vector3();

function Planet({ regions, onPick }: { regions: Region[]; onPick: (r: Region) => void }) {
    const tex = usePlanetTextures(regions);
    const sunDir = useMemo(() => new THREE.Vector3(1, 0, 0), []);
    const mats = useMemo(() => {
        const planet = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG, uniforms: { dayMap: { value: null }, lightsMap: { value: null }, sunDir: { value: sunDir } } });
        const clouds = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: CLOUD_FRAG, uniforms: { sunDir: { value: sunDir }, time: { value: 0 } }, transparent: true, depthWrite: false });
        const moon = new THREE.ShaderMaterial({ vertexShader: PLANET_VERT, fragmentShader: MOON_FRAG, uniforms: { sunDir: { value: sunDir } } });
        const land = new THREE.ShaderMaterial({ vertexShader: LAND_VERT, fragmentShader: LAND_FRAG, uniforms: { dayMap: { value: null }, lightsMap: { value: null }, sunDir: { value: sunDir } }, transparent: true, depthWrite: false });
        return { planet, clouds, moon, land };
    }, [sunDir]);
    useEffect(() => {
        if (!tex) return;
        mats.planet.uniforms.dayMap.value = tex.ocean;
        mats.planet.uniforms.lightsMap.value = tex.none;
        mats.land.uniforms.dayMap.value = tex.land;
        mats.land.uniforms.lightsMap.value = tex.lights;
    }, [tex, mats]);
    useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
    // Küreden çıkınca saat göstergesi düz haritanın gün döngüsüne bırakılır
    useEffect(() => () => dayStore.publish({ active: false, hour: 13, night: 0, day: null, sunElevation: 50, moonPhase: 0, dayLength: 12 }), []);
    const land = useMemo(() => {
        const b = mapBounds();
        return [R * 1.0001, 256, 192, Math.PI + deg(b.lonW), deg(b.lonE - b.lonW), deg(90 - b.latN), deg(b.latN - b.latS)] as [number, number, number, number, number, number, number];
    }, []);
    const moonRef = useRef<THREE.Mesh>(null);
    const [info, setInfo] = useState('');

    useFrame((_, delta) => {
        const { doy, hour, days } = skyTime();
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
        dayStore.publish({ active: true, hour, night: 0, day: null, sunElevation: s.sun.elevation, moonPhase: s.phase, dayLength: dayLength(mapCenterLat(), doy) });
        const txt = `Jüpiter büyüklüğünde gezegen (yarıçap ${planetRadiusKm().toLocaleString('tr-TR')} km) · kıta 8000 km · haritanın ortasında güneş ${s.sun.elevation.toFixed(0)}° · ay %${Math.round(s.illumination * 100)}`;
        if (txt !== info) setInfo(txt);
    });

    // Bölge işaretleri: yalnızca önyüzde, başkent ve şehirler
    const markers = useMemo(
        () =>
            regions
                .filter((r) => ['capital', 'city', 'fortress'].includes(r.type ?? ''))
                .map((r) => {
                    const { lat, lon } = pixelToLatLon(r.x, r.y);
                    return { r, pos: latLonToVec(lat, lon).multiplyScalar(R * 1.0008) };
                }),
        [regions],
    );

    return (
        <>
            <mesh material={mats.planet}>
                <sphereGeometry args={[R, 192, 96]} />
            </mesh>
            <mesh material={mats.land} renderOrder={1}>
                <sphereGeometry args={land} />
            </mesh>
            <mesh material={mats.clouds} scale={1.0005}>
                <sphereGeometry args={[R, 128, 64]} />
            </mesh>
            <mesh ref={moonRef} material={mats.moon}>
                <sphereGeometry args={[R * 0.273, 64, 32]} />
            </mesh>
            <Stars />
            {markers.map(({ r, pos }) => (
                <GlobeMarker key={r.id} pos={pos} region={r} onPick={onPick} />
            ))}
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
        const d = camera.position.length() / R;
        const near = d < (region.type === 'capital' ? 1.32 : 1.1);
        const show = d < (region.type === 'capital' ? 9 : region.type === 'city' ? 1.6 : 1.25);
        if (!show) ref.current.style.opacity = '0';
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

/** Düz haritaya dönüş: bölgeye ya da bakılan noktaya inilir */
function exitTo(px: number, py: number) {
    themeStore.set({ world: 'duz' });
    // Düz harita yüklendikten sonra uç
    setTimeout(() => window.dispatchEvent(new CustomEvent('velutan:fly', { detail: { x: px, y: py } })), 2200);
}

/** Yüzeye yaklaştıkça döndürme yavaşlar (dev gezegende kıta küçük; sürükleyince kaçmasın) */
function NearSurface() {
    const { camera, controls } = useThree() as unknown as { camera: THREE.Camera; controls: { rotateSpeed: number; zoomSpeed: number } | null };
    useFrame(() => {
        if (!controls) return;
        const h = camera.position.length() / R - 1;
        controls.rotateSpeed = THREE.MathUtils.clamp(h * 0.6, 0.02, 0.45);
        controls.zoomSpeed = THREE.MathUtils.clamp(0.3 + h * 0.5, 0.3, 0.7);
    });
    return null;
}

function ZoomExit() {
    const { camera } = useThree();
    const done = useRef(false);
    useFrame(() => {
        if (done.current) return;
        // Çok yaklaşınca: altındaki noktaya düz haritada in
        if (camera.position.length() < R * 1.03) {
            done.current = true;
            const { lat, lon } = vecToLatLon(camera.position);
            const p = latLonToPixel(lat, lon);
            exitTo(p.x, p.y);
        }
    });
    return null;
}

export default function GlobeCanvas({ regions }: { regions: Region[] }) {
    const start = useMemo(() => latLonToVec(mapCenterLat() - 6, MAP_CENTER_LON).multiplyScalar(R * 2.6), []);
    return (
        <div className="h-full w-full bg-black">
            <Canvas camera={{ fov: 40, near: 0.02, far: 600, position: start.toArray() }} dpr={[1, 2]} flat>
                <Suspense fallback={null}>
                    <Planet regions={regions} onPick={(r) => exitTo(r.x, r.y)} />
                </Suspense>
                <OrbitControls makeDefault enablePan={false} minDistance={R * 1.02} maxDistance={R * 8} rotateSpeed={0.45} zoomSpeed={0.7} enableDamping dampingFactor={0.08} />
                <NearSurface />
                <ZoomExit />
            </Canvas>
        </div>
    );
}
