'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { cellToWorld, GridSettings, initials, Token, TOKEN_KINDS, worldToCell } from './battle';
import { CONDITIONS } from './rules';

/** Izgaranın kameradan en fazla kaç kare uzağa çizileceği (ötesi solar) */
const GRID_RADIUS_CELLS = 14;

const gridVertex = /* glsl */ `
    varying vec3 vWorld;
    void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
    }
`;

// Kenar yumuşatmalı çizgiler (fwidth): uzakta titremez; kameradan uzaklaştıkça solar
const gridFragment = /* glsl */ `
    uniform float uCell;
    uniform float uRot;
    uniform float uOpacity;
    uniform float uRadius;
    varying vec3 vWorld;
    void main() {
        float c = cos(-uRot), s = sin(-uRot);
        vec2 p = vec2(vWorld.x * c - vWorld.z * s, vWorld.x * s + vWorld.z * c) / uCell;
        vec2 g = abs(fract(p - 0.5) - 0.5) / max(fwidth(p), vec2(1e-4));
        float line = 1.0 - min(min(g.x, g.y), 1.0);
        float fade = smoothstep(uRadius, uRadius * 0.55, length(vWorld.xz));
        float a = line * fade * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.78), a);
    }
`;

const GridFloor = ({ grid }: { grid: GridSettings }) => {
    const material = useMemo(
        () =>
            new THREE.ShaderMaterial({
                vertexShader: gridVertex,
                fragmentShader: gridFragment,
                transparent: true,
                depthWrite: false,
                depthTest: false,
                uniforms: { uCell: { value: 1.5 }, uRot: { value: 0 }, uOpacity: { value: 0.5 }, uRadius: { value: 20 } },
            }),
        [],
    );
    useEffect(() => () => material.dispose(), [material]);
    material.uniforms.uCell.value = grid.cell;
    material.uniforms.uRot.value = (grid.rotation * Math.PI) / 180;
    material.uniforms.uOpacity.value = grid.opacity;
    material.uniforms.uRadius.value = grid.cell * GRID_RADIUS_CELLS;
    const size = grid.cell * GRID_RADIUS_CELLS * 2.2;
    return (
        <mesh position={[0, -grid.height, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={5}>
            <planeGeometry args={[size, size]} />
        </mesh>
    );
};

/** Görseli olmayan token'ın yüzü: taraf renginde halka içinde baş harfler */
function useCoinTexture(token: Token) {
    const color = TOKEN_KINDS[token.kind].color;
    const texture = useMemo(() => {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        const ctx = c.getContext('2d')!;
        ctx.beginPath();
        ctx.arc(128, 128, 120, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(128, 128, 100, 0, Math.PI * 2);
        ctx.fillStyle = '#120c06';
        ctx.fill();
        ctx.fillStyle = '#fef3c7';
        ctx.font = 'bold 96px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials(token.name), 128, 136);
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(128, 128, 120, 0, Math.PI * 2);
        ctx.stroke();
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }, [color, token.name]);
    useEffect(() => () => texture.dispose(), [texture]);
    return texture;
}

/** Karakter görseli (şeffaf arka planlı) ve en/boy oranı */
function useStandeeTexture(image: string) {
    const [state, setState] = React.useState<{ tex: THREE.Texture; aspect: number } | null>(null);
    useEffect(() => {
        let alive = true;
        let loaded: THREE.Texture | null = null;
        new THREE.TextureLoader().load(image, (tex) => {
            if (!alive) return tex.dispose();
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.anisotropy = 4;
            loaded = tex;
            const img = tex.image as HTMLImageElement;
            setState({ tex, aspect: img.width / Math.max(img.height, 1) });
        });
        return () => {
            alive = false;
            loaded?.dispose();
        };
    }, [image]);
    return state;
}

interface TokenProps {
    token: Token;
    grid: GridSettings;
    selected: boolean;
    /** Sürüklenirken geçici (yuvarlanmamış) konum */
    dragPos: [number, number] | null;
    onGrab: (id: string) => void;
    active: boolean;
    showHp: boolean;
    showConditions: boolean;
    targeting: boolean;
}

/** Pul kameraya dönük durur ve bu kadar geriye yatar (0 = dik, 90° = yere yatık) */
const LEAN = THREE.MathUtils.degToRad(58);

const grabHandlers = (id: string, onGrab: (id: string) => void) => ({
    onPointerDown: (e: { stopPropagation: () => void }) => {
        e.stopPropagation();
        onGrab(id);
    },
    onPointerOver: () => (document.body.style.cursor = 'grab'),
    onPointerOut: () => (document.body.style.cursor = ''),
});

/** Yarı yatık pul: merkezi taban dairesinin üstünde, alt kenarı zeminde */
const Coin = ({ token, r, yaw, order, onGrab, fallen, dead }: { token: Token; r: number; yaw: number; order: number; onGrab: (id: string) => void; fallen: boolean; dead: boolean }) => {
    const texture = useCoinTexture(token);
    // Baygın/ölü pul yere yatar
    const lean = fallen ? THREE.MathUtils.degToRad(84) : LEAN;
    return (
        <group position={[0, r * Math.cos(lean), 0]} rotation={[-lean, yaw, 0, 'YXZ']}>
            <mesh renderOrder={order} {...grabHandlers(token.id, onGrab)}>
                <planeGeometry args={[r * 2, r * 2]} />
                <meshBasicMaterial map={texture} transparent depthTest={false} toneMapped={false} side={THREE.DoubleSide} color={dead ? '#6b6b6b' : '#ffffff'} opacity={dead ? 0.6 : 1} />
            </mesh>
        </group>
    );
};

/** Ayakta duran 2D karakter: ayakları zeminde, kameraya döner. Boyu kareye göre (1 kare ≈ insan boyu). */
const Standee = ({ token, image, height, maxWidth, yaw, order, onGrab, onSize, fallen, dead }: { token: Token; image: string; height: number; maxWidth: number; yaw: number; order: number; onGrab: (id: string) => void; onSize: (h: number) => void; fallen: boolean; dead: boolean }) => {
    const art = useStandeeTexture(image);
    const aspect = art?.aspect ?? 0.5;
    // Çok geniş görselde (ör. kanatlı canavar) boy kısalır, genişlik kareyi fazla taşmaz
    const w = Math.min(height * aspect, maxWidth);
    const h = w / aspect;
    useEffect(() => {
        onSize(fallen ? h * 0.25 : h);
    }, [h, onSize, fallen]);
    if (!art) return null;
    return (
        // Baygın/ölü karakter sırtüstü yere düşer
        <group rotation={[fallen ? -1.45 : 0, yaw, 0, 'YXZ']}>
            <mesh position={[0, h / 2, 0]} renderOrder={order} {...grabHandlers(token.id, onGrab)}>
                <planeGeometry args={[w, h]} />
                <meshBasicMaterial map={art.tex} transparent alphaTest={0.35} depthTest={false} toneMapped={false} side={THREE.DoubleSide} color={dead ? '#6b6b6b' : '#ffffff'} opacity={dead ? 0.6 : 1} />
            </mesh>
        </group>
    );
};

const ActiveRing = ({ r, order }: { r: number; order: number }) => {
    const ref = useRef<THREE.Mesh>(null);
    useFrame(({ clock }) => {
        const k = 1 + Math.sin(clock.elapsedTime * 4) * 0.06;
        ref.current?.scale.set(k, k, 1);
    });
    return (
        <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} renderOrder={order - 1}>
            <ringGeometry args={[r * 1.12, r * 1.34, 56]} />
            <meshBasicMaterial color="#facc15" transparent opacity={0.9} depthTest={false} />
        </mesh>
    );
};

const TokenMesh = ({ token, grid, selected, dragPos, onGrab, active, showHp, showConditions, targeting }: TokenProps) => {
    const [x, z] = dragPos ?? cellToWorld(token.cx, token.cz, token.size, grid);
    const r = grid.cell * token.size * 0.42;
    const color = TOKEN_KINDS[token.kind].color;
    // Kamera merkezde: yüzü ona çevir. Yakındaki token uzaktakinin üstüne çizilsin (derinlik testi kapalı)
    const yaw = Math.atan2(-x, -z);
    const order = 1000 - Math.round(Math.hypot(x, z) * 10);
    const [standeeH, setStandeeH] = React.useState(grid.cell * token.size * 1.25);
    const sheet = token.sheet;
    const dead = sheet?.state === 'dead';
    const fallen = dead || sheet?.state === 'down' || sheet?.state === 'stable';
    const top = token.image ? standeeH : r * 2 * Math.cos(fallen ? THREE.MathUtils.degToRad(84) : LEAN);
    const hpPct = sheet && sheet.hpMax > 0 ? Math.max(0, Math.min(1, sheet.hp / sheet.hpMax)) : 1;

    return (
        <group position={[x, -grid.height, z]}>
            {active && <ActiveRing r={r} order={order} />}
            {/* Seçiliyken zeminde parlayan halka */}
            {selected && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} renderOrder={order - 1}>
                    <ringGeometry args={[r * 1.02, r * 1.18, 48]} />
                    <meshBasicMaterial color="#fde68a" transparent opacity={0.85} depthTest={false} />
                </mesh>
            )}
            {/* Taraf rengindeki taban: karakterin hangi tarafta olduğu buradan okunur */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} renderOrder={order - 2}>
                <circleGeometry args={[r, 48]} />
                <meshBasicMaterial color={color} transparent opacity={token.image ? 0.45 : 0.25} depthTest={false} />
            </mesh>
            {token.image ? (
                <Standee
                    token={token}
                    image={token.image}
                    height={grid.cell * token.size * 1.25}
                    maxWidth={grid.cell * token.size * 1.6}
                    yaw={yaw}
                    order={order}
                    onGrab={onGrab}
                    onSize={setStandeeH}
                    fallen={fallen}
                    dead={dead}
                />
            ) : (
                <Coin token={token} r={r} yaw={yaw} order={order} onGrab={onGrab} fallen={fallen} dead={dead} />
            )}
            <Html position={[0, top + r * 0.35, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
                <div className={`flex flex-col items-center gap-0.5 ${targeting && !dead ? 'scale-110' : ''}`}>
                    <div
                        className={`whitespace-nowrap rounded-full border bg-black/75 px-2 py-0.5 text-[11px] font-bold shadow ${active ? 'text-yellow-200' : 'text-amber-50'} ${targeting && !dead ? 'animate-pulse' : ''}`}
                        style={{ borderColor: targeting && !dead ? '#f87171' : active ? '#facc15' : color }}
                    >
                        {dead ? '☠ ' : ''}
                        {token.name}
                        {showConditions && sheet && sheet.conditions.length > 0 && (
                            <span className="ml-1 text-amber-300">{sheet.conditions.map((k) => CONDITIONS.find((c) => c.key === k)?.icon).join('')}</span>
                        )}
                    </div>
                    {showHp && sheet && !dead && (
                        <div className="h-1.5 w-14 overflow-hidden rounded-full border border-black/60 bg-black/70" title={`${sheet.hp}/${sheet.hpMax} HP`}>
                            <div className="h-full transition-[width] duration-500" style={{ width: `${hpPct * 100}%`, background: hpPct > 0.5 ? '#22c55e' : hpPct > 0.25 ? '#eab308' : '#ef4444' }} />
                        </div>
                    )}
                </div>
            </Html>
        </group>
    );
};

interface BattleSceneProps {
    grid: GridSettings;
    tokens: Token[];
    selectedId: string | null;
    /** Yerleştirme modunda: tıklanan kareye token konur */
    placing: boolean;
    /** Görünümü çevirmeyi kilitler (token sürüklenirken) */
    lockRef: React.MutableRefObject<boolean>;
    onSelect: (id: string | null) => void;
    onMove: (id: string, cx: number, cz: number) => void;
    onPlace: (x: number, z: number) => void;
    onDragInfo: (info: { text: string; over: boolean } | null) => void;
    /** Sürükleme yazısı (savaşta hareket hakkı) */
    dragLabel: (t: Token, cx: number, cz: number, startCx: number, startCz: number) => { text: string; over: boolean };
    activeId: string | null;
    showHp: boolean;
    showConditions: boolean;
    /** Hedef seçme: token'a tıklamak sürüklemez, hedef seçer */
    targeting: boolean;
    onTarget: (id: string) => void;
    /** Ortak masada oyuncu yalnızca kendi token'ını sürükler */
    canDrag?: (id: string) => boolean;
}

/** Ekrandaki noktadan zemin düzlemine ışın: zemindeki (x, z) */
function floorPoint(camera: THREE.Camera, el: HTMLElement, clientX: number, clientY: number, height: number): [number, number] | null {
    const rect = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), height), new THREE.Vector3());
    if (!hit || hit.length() > 200) return null;
    return [hit.x, hit.z];
}

const BattleScene = ({ grid, tokens, selectedId, placing, lockRef, onSelect, onMove, onPlace, onDragInfo, dragLabel, activeId, showHp, showConditions, targeting, onTarget, canDrag }: BattleSceneProps) => {
    const { camera, gl } = useThree();
    const [drag, setDrag] = React.useState<{ id: string; pos: [number, number] } | null>(null);
    const latest = useRef({ grid, tokens, onMove, onDragInfo, dragLabel });
    latest.current = { grid, tokens, onMove, onDragInfo, dragLabel };

    const grab = (id: string) => {
        if (targeting) return onTarget(id);
        if (canDrag && !canDrag(id)) return onSelect(id);
        lockRef.current = true;
        onSelect(id);
        const el = gl.domElement;
        const token = tokens.find((t) => t.id === id);
        if (!token) return;
        const start = [token.cx, token.cz];
        const move = (ev: PointerEvent) => {
            const p = floorPoint(camera, el, ev.clientX, ev.clientY, latest.current.grid.height);
            if (!p) return;
            setDrag({ id, pos: p });
            const [cx, cz] = worldToCell(p[0], p[1], token.size, latest.current.grid);
            // 5e kuralı: çapraz da tek kare sayılır (hesap dragLabel'da)
            latest.current.onDragInfo(latest.current.dragLabel(token, cx, cz, start[0], start[1]));
        };
        const up = (ev: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            lockRef.current = false;
            const p = floorPoint(camera, el, ev.clientX, ev.clientY, latest.current.grid.height);
            if (p) {
                const [cx, cz] = worldToCell(p[0], p[1], token.size, latest.current.grid);
                latest.current.onMove(id, cx, cz);
            }
            setDrag(null);
            latest.current.onDragInfo(null);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    };

    // Yerleştirme: sürüklemeden bırakılan tıklama zemine token koyar (bakış çevirmekle karışmasın)
    useEffect(() => {
        if (!placing) return;
        const el = gl.domElement;
        let down: { x: number; y: number } | null = null;
        const pd = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
        const pu = (e: PointerEvent) => {
            if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
            down = null;
            const p = floorPoint(camera, el, e.clientX, e.clientY, latest.current.grid.height);
            if (p) onPlace(p[0], p[1]);
        };
        el.addEventListener('pointerdown', pd);
        el.addEventListener('pointerup', pu);
        el.style.cursor = 'crosshair';
        return () => {
            el.removeEventListener('pointerdown', pd);
            el.removeEventListener('pointerup', pu);
            el.style.cursor = 'grab';
        };
    }, [placing, camera, gl, onPlace]);

    return (
        <group>
            <GridFloor grid={grid} />
            {tokens.map((t) => (
                <TokenMesh
                    key={t.id}
                    token={t}
                    grid={grid}
                    selected={t.id === selectedId}
                    dragPos={drag?.id === t.id ? drag.pos : null}
                    onGrab={grab}
                    active={t.id === activeId}
                    showHp={showHp}
                    showConditions={showConditions}
                    targeting={targeting}
                />
            ))}
        </group>
    );
};

export default BattleScene;
