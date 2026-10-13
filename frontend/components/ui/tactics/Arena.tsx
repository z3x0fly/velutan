'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import * as E from './engine';

/**
 * Taktik savaşın 3D arenası. Zemin, o 360° mekânın kendi zemininden üretilir: panoramadaki her yön, göz
 * hizasından (1,6 m) yere izdüşürülür; ufuk da panoramanın kendisidir. Figürler sınıfına göre silahlı, basit
 * ve okunur (lisanslı model gerekmez). Engeller yürüyüşü ve uzak saldırının görüşünü keser.
 */
export const ARENA = 16;
const EYE = 1.6;

export interface Anim {
    pts: E.Vec[];
    start: number;
    dur: number;
}

// --- Zemin: panoramanın yere izdüşümü + kenarda kararan toprak
const GROUND_VERT = /* glsl */ `
    varying vec3 vW;
    void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
    }`;
const GROUND_FRAG = /* glsl */ `
    uniform sampler2D pano;
    uniform float hasPano;
    uniform float R;
    varying vec3 vW;
    float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
    void main() {
        vec3 d = normalize(vec3(vW.x, -${EYE.toFixed(2)}, vW.z));
        float lon = atan(d.x, -d.z);
        float lat = asin(clamp(d.y, -1.0, 1.0));
        vec2 uv = vec2(lon / 6.2831853 + 0.5, 0.5 + lat / 3.1415927);
        vec3 photo = texture2D(pano, uv).rgb;
        float n = n2(vW.xz * 1.3) * 0.6 + n2(vW.xz * 5.0) * 0.4;
        vec3 dirt = mix(vec3(0.33, 0.28, 0.2), vec3(0.47, 0.41, 0.3), n);
        // Uzak toprak, mekânın kendi zemin renginde (panoramanın alt yarısının bulanık ortalaması)
        vec3 tint = texture2D(pano, vec2(uv.x, 0.12), 8.0).rgb;
        if (hasPano > 0.5) dirt = mix(dirt, tint * (0.75 + n * 0.5), 0.7);
        float r = length(vW.xz);
        // Uzakta izdüşüm uzar (duvarlar yere yayılır): fotoğraf yakında kalır, uzağı toprak
        float far = smoothstep(3.5, 9.5, r);
        vec3 col = mix(photo, dirt, hasPano > 0.5 ? far : 1.0);
        col *= 0.92 + n * 0.16;
        col *= mix(1.0, 0.25, smoothstep(R - 3.0, R, r));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
    }`;

function usePano(url?: string) {
    const [tex, setTex] = useState<THREE.Texture | null>(null);
    useEffect(() => {
        if (!url) return;
        let alive = true;
        new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, (t) => {
            if (!alive) return t.dispose();
            t.colorSpace = THREE.SRGBColorSpace;
            t.wrapS = THREE.RepeatWrapping;
            t.anisotropy = 8;
            setTex(t);
        });
        return () => {
            alive = false;
        };
    }, [url]);
    useEffect(() => () => tex?.dispose(), [tex]);
    return tex;
}

function Ground({ pano, onMove, onClick, onLeave }: { pano: THREE.Texture | null; onMove: (p: E.Vec) => void; onClick: (p: E.Vec) => void; onLeave: () => void }) {
    const mat = useMemo(
        () => new THREE.ShaderMaterial({ vertexShader: GROUND_VERT, fragmentShader: GROUND_FRAG, uniforms: { pano: { value: null }, hasPano: { value: 0 }, R: { value: ARENA } } }),
        [],
    );
    useEffect(() => {
        mat.uniforms.pano.value = pano;
        mat.uniforms.hasPano.value = pano ? 1 : 0;
    }, [pano, mat]);
    useEffect(() => () => mat.dispose(), [mat]);
    return (
        <mesh
            rotation-x={-Math.PI / 2}
            material={mat}
            onPointerMove={(e: ThreeEvent<PointerEvent>) => onMove({ x: e.point.x, z: e.point.z })}
            onPointerLeave={onLeave}
            onClick={(e: ThreeEvent<MouseEvent>) => {
                if (e.delta > 6) return; // sürükleme (kamera) tıklama sayılmaz
                onClick({ x: e.point.x, z: e.point.z });
            }}
        >
            <circleGeometry args={[ARENA + 6, 96]} />
        </mesh>
    );
}

/** Ufuk: panoramanın kendisi (içinden bakılan küre) */
function Horizon({ pano }: { pano: THREE.Texture | null }) {
    if (!pano) return null;
    return (
        <mesh position={[0, EYE, 0]} scale={[-1, 1, 1]}>
            <sphereGeometry args={[90, 64, 32]} />
            <meshBasicMaterial map={pano} side={THREE.BackSide} depthWrite={false} />
        </mesh>
    );
}

function Obstacle({ o }: { o: E.Obstacle }) {
    const seed = Math.abs(Math.sin(o.pos.x * 12.9 + o.pos.z * 78.2));
    if (o.kind === 'kutuk')
        return (
            <group position={[o.pos.x, 0.25, o.pos.z]} rotation-y={seed * Math.PI}>
                <mesh rotation-z={Math.PI / 2}>
                    <cylinderGeometry args={[0.28, 0.32, o.r * 2.2, 12]} />
                    <meshStandardMaterial color="#5b4129" roughness={0.95} />
                </mesh>
                <BlobShadow r={o.r * 1.1} />
            </group>
        );
    return (
        <group position={[o.pos.x, 0, o.pos.z]} rotation-y={seed * 6}>
            <mesh position-y={o.r * 0.45} scale={[1, o.kind === 'tas' ? 0.55 : 0.75, 1]}>
                {o.kind === 'tas' ? <icosahedronGeometry args={[o.r, 0]} /> : <dodecahedronGeometry args={[o.r, 0]} />}
                <meshStandardMaterial color={o.kind === 'tas' ? '#8d8a80' : '#6f6d66'} roughness={1} flatShading />
            </mesh>
            <BlobShadow r={o.r * 1.15} />
        </group>
    );
}

function BlobShadow({ r, opacity = 0.35 }: { r: number; opacity?: number }) {
    return (
        <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
            <circleGeometry args={[r, 24]} />
            <meshBasicMaterial color="#000" transparent opacity={opacity} depthWrite={false} />
        </mesh>
    );
}

// --- Figürler
type WeaponKind = 'kilic' | 'balta' | 'hancer' | 'asa' | 'yay' | 'buyu' | 'pence';
const WEAPON_OF: Record<string, WeaponKind> = {
    Savunucu: 'kilic',
    Öfkeli: 'balta',
    Gölge: 'hancer',
    Şifacı: 'asa',
    'Haydut Yağmacı': 'kilic',
    'Haydut Okçu': 'yay',
    Okültist: 'buyu',
    Canavar: 'pence',
};

function Weapon({ kind }: { kind: WeaponKind }) {
    const metal = <meshStandardMaterial color="#c9ccd2" metalness={0.7} roughness={0.35} />;
    const wood = <meshStandardMaterial color="#6b4a2b" roughness={0.9} />;
    switch (kind) {
        case 'kilic':
            return (
                <group position={[0.32, 1.0, 0.12]} rotation-x={-0.5}>
                    <mesh position-y={0.35}>
                        <boxGeometry args={[0.05, 0.7, 0.02]} />
                        {metal}
                    </mesh>
                    <mesh>
                        <boxGeometry args={[0.18, 0.04, 0.05]} />
                        {wood}
                    </mesh>
                </group>
            );
        case 'balta':
            return (
                <group position={[0.34, 1.0, 0.1]} rotation-x={-0.4}>
                    <mesh position-y={0.25}>
                        <cylinderGeometry args={[0.025, 0.025, 0.8, 6]} />
                        {wood}
                    </mesh>
                    <mesh position={[0.1, 0.58, 0]}>
                        <boxGeometry args={[0.22, 0.18, 0.03]} />
                        {metal}
                    </mesh>
                </group>
            );
        case 'hancer':
            return (
                <mesh position={[0.3, 0.95, 0.15]} rotation-x={-0.9}>
                    <boxGeometry args={[0.035, 0.32, 0.015]} />
                    {metal}
                </mesh>
            );
        case 'asa':
        case 'buyu':
            return (
                <group position={[0.32, 0.9, 0.05]}>
                    <mesh position-y={0.25}>
                        <cylinderGeometry args={[0.025, 0.03, 1.5, 6]} />
                        {wood}
                    </mesh>
                    <mesh position-y={1.02}>
                        <sphereGeometry args={[0.07, 12, 8]} />
                        <meshStandardMaterial color={kind === 'buyu' ? '#a855f7' : '#9fd8ff'} emissive={kind === 'buyu' ? '#7e22ce' : '#38bdf8'} emissiveIntensity={1.2} />
                    </mesh>
                </group>
            );
        case 'yay':
            return (
                <mesh position={[-0.3, 1.1, 0.1]} rotation-y={Math.PI / 2}>
                    <torusGeometry args={[0.42, 0.018, 6, 16, Math.PI]} />
                    {wood}
                </mesh>
            );
        default:
            return null;
    }
}

const _pos = new THREE.Vector3();

export function UnitFigure({
    u,
    active,
    anims,
    lunges,
    onClick,
    onHover,
    label,
}: {
    u: E.Unit;
    active: boolean;
    anims: React.MutableRefObject<Map<string, Anim>>;
    lunges: React.MutableRefObject<Map<string, { at: number; to: E.Vec }>>;
    onClick: (id: string) => void;
    onHover: (id: string | null) => void;
    label?: string;
}) {
    const group = useRef<THREE.Group>(null);
    const body = useRef<THREE.Group>(null);
    const prevHp = useRef(u.hp);
    const flash = useRef(0);
    const mats = useMemo(
        () => ({
            cloth: new THREE.MeshStandardMaterial({ color: u.color, roughness: 0.85 }),
            dark: new THREE.MeshStandardMaterial({ color: new THREE.Color(u.color).multiplyScalar(0.45), roughness: 0.9 }),
            skin: new THREE.MeshStandardMaterial({ color: u.role === 'Canavar' ? '#4b5a3a' : u.role === 'Okültist' ? '#d9cfc2' : '#c69c74', roughness: 0.8 }),
        }),
        [u.color, u.role],
    );
    useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
    useEffect(() => {
        if (u.hp < prevHp.current) flash.current = performance.now() + 380;
        prevHp.current = u.hp;
    }, [u.hp]);

    const big = u.role === 'Canavar' ? 1.35 : 1;
    const weapon = WEAPON_OF[u.role] ?? 'kilic';

    useFrame(() => {
        const g = group.current, b = body.current;
        if (!g || !b) return;
        const now = performance.now();
        const a = anims.current.get(u.id);
        let facing = u.facing;
        let walking = false;
        if (a) {
            // Yol boyunca yürüyüş
            const lens = a.pts.slice(1).map((p, i) => E.dist(a.pts[i], p));
            const total = lens.reduce((x, y) => x + y, 0) || 1;
            let d = Math.min(1, (now - a.start) / a.dur) * total;
            let i = 0;
            while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
            const p0 = a.pts[i], p1 = a.pts[i + 1] ?? p0;
            const t = lens[i] ? Math.min(1, d / lens[i]) : 1;
            _pos.set(p0.x + (p1.x - p0.x) * t, 0, p0.z + (p1.z - p0.z) * t);
            facing = Math.atan2(p1.x - p0.x, p1.z - p0.z);
            walking = true;
        } else _pos.set(u.pos.x, 0, u.pos.z);
        // Saldırı hamlesi: hedefe doğru kısa atılış
        const l = lunges.current.get(u.id);
        if (l && now - l.at < 320) {
            const k = Math.sin(((now - l.at) / 320) * Math.PI) * 0.45;
            const dx = l.to.x - _pos.x, dz = l.to.z - _pos.z, n = Math.hypot(dx, dz) || 1;
            _pos.x += (dx / n) * k;
            _pos.z += (dz / n) * k;
            facing = Math.atan2(dx, dz);
        }
        g.position.copy(_pos);
        g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, facing, 0.25);
        // Duruş: ayakta nefes, yürürken sallanma, baygın/ölü yerde
        const down = u.down || u.dead;
        b.rotation.x = THREE.MathUtils.lerp(b.rotation.x, down ? -Math.PI / 2 : 0, 0.12);
        b.position.y = THREE.MathUtils.lerp(b.position.y, down ? 0.18 : walking ? Math.abs(Math.sin(now / 110)) * 0.06 : Math.sin(now / 600 + u.pos.x) * 0.012, 0.3);
        const hit = flash.current > now;
        mats.cloth.emissive.set(hit ? '#ff2a1a' : '#000000');
        mats.cloth.emissiveIntensity = hit ? 0.9 : 0;
        mats.cloth.color.set(u.dead ? '#3a3632' : u.color);
    });

    return (
        <group
            ref={group}
            onClick={(e) => {
                e.stopPropagation();
                if (e.delta > 6) return;
                onClick(u.id);
            }}
            onPointerOver={(e) => {
                e.stopPropagation();
                onHover(u.id);
            }}
            onPointerOut={() => onHover(null)}
        >
            {/* Takım halkası */}
            <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
                <ringGeometry args={[0.42 * big, 0.5 * big, 32]} />
                <meshBasicMaterial color={u.team === 'yoldas' ? '#4f8cff' : '#e0453a'} transparent opacity={u.dead ? 0.15 : 0.75} depthWrite={false} />
            </mesh>
            {active && <ActiveRing big={big} />}
            <BlobShadow r={0.42 * big} />
            <group ref={body} scale={big}>
                {/* bacaklar */}
                <mesh position={[-0.1, 0.42, 0]} material={mats.dark}>
                    <capsuleGeometry args={[0.075, 0.6, 4, 8]} />
                </mesh>
                <mesh position={[0.1, 0.42, 0]} material={mats.dark}>
                    <capsuleGeometry args={[0.075, 0.6, 4, 8]} />
                </mesh>
                {/* gövde ve pelerin */}
                <mesh position-y={1.12} material={mats.cloth}>
                    <capsuleGeometry args={[0.2, 0.5, 4, 10]} />
                </mesh>
                <mesh position={[0, 1.0, -0.12]} material={mats.dark}>
                    <boxGeometry args={[0.42, 0.75, 0.04]} />
                </mesh>
                {/* kollar */}
                <mesh position={[-0.27, 1.1, 0.02]} rotation-z={0.15} material={mats.cloth}>
                    <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
                </mesh>
                <mesh position={[0.27, 1.1, 0.06]} rotation-z={-0.15} rotation-x={-0.3} material={mats.cloth}>
                    <capsuleGeometry args={[0.06, 0.45, 4, 8]} />
                </mesh>
                {/* baş */}
                <mesh position-y={1.6} material={mats.skin}>
                    <sphereGeometry args={[0.13, 16, 12]} />
                </mesh>
                {u.role === 'Okültist' || u.role === 'Şifacı' ? (
                    <mesh position-y={1.66} material={mats.dark}>
                        <coneGeometry args={[0.17, 0.32, 10]} />
                    </mesh>
                ) : null}
                {u.role === 'Canavar' && (
                    <>
                        <mesh position={[-0.09, 1.75, 0.04]} rotation-z={0.5} material={mats.dark}>
                            <coneGeometry args={[0.035, 0.22, 6]} />
                        </mesh>
                        <mesh position={[0.09, 1.75, 0.04]} rotation-z={-0.5} material={mats.dark}>
                            <coneGeometry args={[0.035, 0.22, 6]} />
                        </mesh>
                    </>
                )}
                {u.role === 'Savunucu' && (
                    <mesh position={[-0.33, 1.05, 0.1]} rotation-y={0.3}>
                        <cylinderGeometry args={[0.22, 0.22, 0.04, 16]} />
                        <meshStandardMaterial color="#8a6a32" metalness={0.5} roughness={0.5} />
                    </mesh>
                )}
                <Weapon kind={weapon} />
            </group>
            {/* İsim ve can (videodaki gibi) */}
            <Html position={[0, 2.15 * big, 0]} center distanceFactor={14} zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
                <div className={`whitespace-nowrap text-center font-bold ${u.dead ? 'opacity-40' : ''}`}>
                    <div className={`text-[13px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${u.team === 'yoldas' ? 'text-sky-200' : 'text-red-200'}`}>
                        {u.name} · {u.hp}/{u.hpMax}
                        {u.down ? ' · Baygın' : ''}
                    </div>
                    {label && <div className="mt-0.5 rounded bg-black/75 px-1.5 text-[12px] text-amber-200">{label}</div>}
                </div>
            </Html>
        </group>
    );
}

function ActiveRing({ big }: { big: number }) {
    const ref = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if (ref.current) (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(performance.now() / 260) * 0.35;
    });
    return (
        <mesh ref={ref} rotation-x={-Math.PI / 2} position-y={0.03}>
            <ringGeometry args={[0.58 * big, 0.68 * big, 40]} />
            <meshBasicMaterial color="#f5d36b" transparent depthWrite={false} />
        </mesh>
    );
}

/** Zemine yatık halka (menzil, hareket, alan) */
export function RangeRing({ at, r, color, dashed = false }: { at: E.Vec; r: number; color: string; dashed?: boolean }) {
    const pts = useMemo(() => {
        const out: [number, number, number][] = [];
        for (let i = 0; i <= 96; i++) {
            const a = (i / 96) * Math.PI * 2;
            out.push([at.x + Math.cos(a) * r, 0.04, at.z + Math.sin(a) * r]);
        }
        return out;
    }, [at.x, at.z, r]);
    if (r <= 0.05) return null;
    return <Line points={pts} color={color} lineWidth={2} dashed={dashed} dashSize={0.35} gapSize={0.2} transparent opacity={0.85} />;
}

export function PathLine({ pts, color, label }: { pts: E.Vec[]; color: string; label?: string }) {
    const p3 = useMemo(() => pts.map((p) => [p.x, 0.06, p.z] as [number, number, number]), [pts]);
    const end = pts[pts.length - 1];
    if (pts.length < 2) return null;
    return (
        <>
            <Line points={p3} color={color} lineWidth={3} transparent opacity={0.95} />
            <mesh position={[end.x, 0.05, end.z]} rotation-x={-Math.PI / 2}>
                <circleGeometry args={[0.18, 20]} />
                <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
            </mesh>
            {label && (
                <Html position={[end.x, 0.5, end.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[30, 0]}>
                    <div className="whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[12px] font-bold text-amber-100">{label}</div>
                </Html>
            )}
        </>
    );
}

// --- Etkiler
export type LiveFx = E.Fx & { t: number };

function FxView({ f }: { f: LiveFx }) {
    const ref = useRef<THREE.Group>(null);
    const ring = useRef<THREE.Mesh>(null);
    const div = useRef<HTMLDivElement>(null);
    useFrame(() => {
        const age = (performance.now() - f.t) / 1000;
        if (f.kind === 'projectile' && ref.current && f.from) {
            const k = Math.min(1, age / 0.35);
            ref.current.position.set(f.from.x + (f.to.x - f.from.x) * k, 1.2 + Math.sin(k * Math.PI) * 0.8, f.from.z + (f.to.z - f.from.z) * k);
            ref.current.visible = k < 1;
        }
        if (f.kind === 'blast' && ring.current) {
            const k = Math.min(1, age / 0.6);
            ring.current.scale.setScalar(0.2 + k);
            (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
        }
        if (div.current) {
            const delay = f.kind === 'hit' || f.kind === 'crit' || f.kind === 'miss' ? 0.3 : 0;
            const k = Math.max(0, age - delay);
            div.current.style.transform = `translateY(${-k * 40}px)`;
            div.current.style.opacity = String(age < delay ? 0 : Math.max(0, 1 - k / 1.1));
        }
    });
    if (f.kind === 'projectile')
        return (
            <group ref={ref}>
                <mesh>
                    <sphereGeometry args={[0.09, 10, 8]} />
                    <meshBasicMaterial color={f.color ?? '#e5d3a1'} />
                </mesh>
                <pointLight color={f.color ?? '#e5d3a1'} intensity={2} distance={3} />
            </group>
        );
    if (f.kind === 'blast')
        return (
            <mesh ref={ring} position={[f.to.x, 0.06, f.to.z]} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[(f.radius ?? 2) * 0.8, f.radius ?? 2, 48]} />
                <meshBasicMaterial color={f.color ?? '#ff7a2d'} transparent depthWrite={false} />
            </mesh>
        );
    if (!f.text) return null;
    const tone = f.kind === 'crit' ? 'text-amber-300 text-[22px]' : f.kind === 'hit' ? 'text-red-300 text-[18px]' : f.kind === 'heal' ? 'text-green-300 text-[18px]' : f.kind === 'miss' ? 'text-zinc-300 text-[15px]' : 'text-[15px]';
    return (
        <Html position={[f.to.x, 2.4, f.to.z]} center style={{ pointerEvents: 'none' }} zIndexRange={[40, 0]}>
            <div ref={div} className={`whitespace-nowrap font-black drop-shadow-[0_2px_3px_rgba(0,0,0,1)] ${tone}`} style={{ color: f.kind === 'status' ? f.color : undefined, opacity: 0 }}>
                {f.text}
            </div>
        </Html>
    );
}

/** Kamera: sıra kimdeyse ona yumuşakça döner */
function CameraRig({ focus }: { focus: E.Vec | null }) {
    const { controls } = useThree() as unknown as { controls: { target: THREE.Vector3; update: () => void } | null };
    const goal = useRef<THREE.Vector3 | null>(null);
    useEffect(() => {
        if (focus) goal.current = new THREE.Vector3(focus.x, 0, focus.z);
    }, [focus?.x, focus?.z]); // eslint-disable-line react-hooks/exhaustive-deps
    useFrame(({ camera }) => {
        if (!controls || !goal.current) return;
        const d = goal.current.clone().sub(controls.target);
        if (d.length() < 0.02) return (goal.current = null), undefined;
        const step = d.multiplyScalar(0.08);
        controls.target.add(step);
        camera.position.add(step);
        controls.update();
    });
    return null;
}

export interface ArenaProps {
    state: E.TacState;
    panoUrl?: string;
    anims: React.MutableRefObject<Map<string, Anim>>;
    lunges: React.MutableRefObject<Map<string, { at: number; to: E.Vec }>>;
    fx: LiveFx[];
    focus: E.Vec | null;
    overlay: React.ReactNode;
    labels: Record<string, string>;
    onGround: (p: E.Vec) => void;
    onHoverGround: (p: E.Vec | null) => void;
    onUnit: (id: string) => void;
    onHoverUnit: (id: string | null) => void;
}

export default function ArenaScene({ state, panoUrl, anims, lunges, fx, focus, overlay, labels, onGround, onHoverGround, onUnit, onHoverUnit }: ArenaProps) {
    const pano = usePano(panoUrl);
    const cur = E.current(state);
    return (
        <>
            <color attach="background" args={['#0b0906']} />
            <fog attach="fog" args={['#0b0906', 30, 95]} />
            <hemisphereLight args={['#fff4dc', '#3a2c1c', 0.9]} />
            <directionalLight position={[8, 14, 6]} intensity={1.6} />
            <Horizon pano={pano} />
            <Ground pano={pano} onMove={onHoverGround} onClick={onGround} onLeave={() => onHoverGround(null)} />
            {state.obstacles.map((o, i) => (
                <Obstacle key={i} o={o} />
            ))}
            {state.units.map((u) => (
                <UnitFigure key={u.id} u={u} active={!state.over && u.id === cur?.id} anims={anims} lunges={lunges} onClick={onUnit} onHover={onHoverUnit} label={labels[u.id]} />
            ))}
            {overlay}
            {fx.map((f) => (
                <FxView key={f.id} f={f} />
            ))}
            <OrbitControls makeDefault enablePan maxPolarAngle={1.2} minPolarAngle={0.35} minDistance={6} maxDistance={34} target={[0, 0, 2]} />
            <CameraRig focus={focus} />
        </>
    );
}
