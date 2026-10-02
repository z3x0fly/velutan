'use client';

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { diceStore, fairUnit, setTableMounted, type RollRequest } from './diceStore';
import { getShape, readDie, type DieKind, type DieShape } from './shapes';
import { clack, unlockAudio } from './sound';

/**
 * Zar masası: ekranın üstünde şeffaf bir fizik masası. Zarlar ekran kenarlarına çarpıp seker, durunca
 * üstteki yüz okunur. "Elle" kipte zarlar alttaki kupada bekler: basılı tut, salla, fırlat (bırakma hızı
 * atış gücü olur); kısa dokunuş otomatik atar. Telefonda istenirse sallayarak atılır.
 */

const FOV = 30;
const HOLD_Y = 4.2;
const DEFAULT_COLOR = '#7a1d1d';
const INK = '#f6d98b';

type Phase = 'idle' | 'ready' | 'holding' | 'rolling' | 'done';

interface LiveDie {
    shape: DieShape;
    body: CANNON.Body;
    color: string;
    /** İstekteki zarın sırası; d100 iki gövdeden oluşur */
    slot: number;
    part: 'single' | 'tens' | 'units';
    offset: THREE.Vector3;
    value?: number;
    lastClack: number;
}

interface Ctrl {
    phase: Phase;
    request: RollRequest | null;
    pointer: { x: number; y: number; vx: number; vy: number; t: number; startX: number; startY: number; startT: number };
    command: 'auto' | 'release' | null;
    shakeBoost: number;
    sound: boolean;
}

// --- Yüz yazıları (önbellekli dokular)
const labelTextures = new Map<string, THREE.Texture>();
function labelTexture(text: string) {
    const hit = labelTextures.get(text);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = INK;
    ctx.font = `bold ${text.length > 1 ? 62 : 82}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, 64, 68);
    // 6 ile 9 karışmasın
    if (text === '6' || text === '9') ctx.fillRect(44, 108, 40, 7);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    labelTextures.set(text, tex);
    return tex;
}

const DieMesh = ({ die, groupRef }: { die: LiveDie; groupRef: (g: THREE.Group | null) => void }) => {
    const { shape, color } = die;
    const s = shape.labelSize;
    const labels = useMemo(
        () =>
            shape.labels.map((l) => {
                // Yazı düzlemi: normal yüzün normali, "yukarı" yazının üstü
                const m = new THREE.Matrix4();
                const x = new THREE.Vector3().crossVectors(l.up, l.normal).normalize();
                m.makeBasis(x, l.up, l.normal);
                const q = new THREE.Quaternion().setFromRotationMatrix(m);
                return { pos: l.pos, q, tex: labelTexture(l.text) };
            }),
        [shape],
    );
    return (
        <group ref={groupRef}>
            <mesh geometry={shape.geometry} castShadow>
                <meshStandardMaterial color={color} roughness={0.38} metalness={0.12} flatShading />
            </mesh>
            <lineSegments geometry={shape.edges}>
                <lineBasicMaterial color={INK} transparent opacity={0.45} />
            </lineSegments>
            {labels.map((l, i) => (
                <mesh key={i} position={l.pos} quaternion={l.q}>
                    <planeGeometry args={[s, s]} />
                    <meshBasicMaterial map={l.tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
                </mesh>
            ))}
            {die.value !== undefined && (
                <Html center position={[0, 1.6, 0]} zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
                    <div className="dice-land rounded-full border-2 border-amber-300 bg-black/85 px-2.5 py-0.5 font-serif text-lg font-black text-amber-100 shadow-[0_0_16px_rgba(251,191,36,0.6)]">
                        {die.part === 'tens' ? `${die.value * 10}`.padStart(2, '0') : die.value}
                    </div>
                </Html>
            )}
        </group>
    );
};

function makeWorld() {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -60, 0) });
    world.allowSleep = true;
    world.broadphase = new CANNON.NaiveBroadphase();
    (world.solver as CANNON.GSSolver).iterations = 14;
    const diceMat = new CANNON.Material('dice');
    const floorMat = new CANNON.Material('floor');
    const wallMat = new CANNON.Material('wall');
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat, floorMat, { friction: 0.32, restitution: 0.38 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat, wallMat, { friction: 0.05, restitution: 0.6 }));
    world.addContactMaterial(new CANNON.ContactMaterial(diceMat, diceMat, { friction: 0.15, restitution: 0.45 }));
    const floor = new CANNON.Body({ mass: 0, material: floorMat, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floor);
    const walls: CANNON.Body[] = [];
    // +x, -x, +z, -z ve tavan
    const eulers: [number, number, number][] = [
        [0, -Math.PI / 2, 0],
        [0, Math.PI / 2, 0],
        [0, Math.PI, 0],
        [0, 0, 0],
        [Math.PI / 2, 0, 0],
    ];
    for (const e of eulers) {
        const b = new CANNON.Body({ mass: 0, material: wallMat, shape: new CANNON.Plane() });
        b.quaternion.setFromEuler(...e);
        world.addBody(b);
        walls.push(b);
    }
    return { world, diceMat, walls };
}

function Table({ ctrl, onPhase }: { ctrl: React.MutableRefObject<Ctrl>; onPhase: (p: Phase) => void }) {
    const { camera, size } = useThree();
    const phys = useMemo(makeWorld, []);
    const [dice, setDice] = useState<LiveDie[]>([]);
    const diceRef = useRef<LiveDie[]>([]);
    const groups = useRef<(THREE.Group | null)[]>([]);
    // Masanın oynanabilir alanı (dünya): yan paneller, üst şerit ve alt zar çubuğu dışarıda kalır
    const bounds = useRef({ minX: -6, maxX: 6, minZ: -6, maxZ: 6 });
    const still = useRef(0);
    const rollingSince = useRef(0);
    const nudges = useRef(0);
    const doneAt = useRef(0);
    const lastReq = useRef<number | null>(null);
    const fade = useRef(1);

    // Kamera tepeden bakar; kısa kenar her ekranda ~8,5 birim kalacak şekilde yükselir (zar ≈ ekranın %10'u)
    useEffect(() => {
        const aspect = size.width / Math.max(size.height, 1);
        const t = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
        const half = 8.5;
        const h = aspect >= 1 ? half / t : half / (t * aspect);
        const cam = camera as THREE.PerspectiveCamera;
        cam.position.set(0, h, 0.0001);
        cam.up.set(0, 0, -1);
        cam.lookAt(0, 0, 0);
        cam.updateProjectionMatrix();
        const hh = h * t;
        const k = (2 * hh) / Math.max(size.height, 1); // piksel -> dünya
        // Geniş ekranda yan panellerin (kart, token paneli) üstüne yuvarlanmasın
        const side = size.width >= 1100 ? 345 : 12;
        const b = {
            minX: -(size.width / 2 - side) * k,
            maxX: (size.width / 2 - side) * k,
            minZ: -(size.height / 2 - (size.width >= 768 ? 150 : 190)) * k,
            maxZ: (size.height / 2 - 78) * k,
        };
        bounds.current = b;
        const [px, nx, pz, nz, top] = phys.walls;
        px.position.set(b.maxX, 0, 0);
        nx.position.set(b.minX, 0, 0);
        pz.position.set(0, 0, b.maxZ);
        nz.position.set(0, 0, b.minZ);
        top.position.set(0, 14, 0);
    }, [camera, size, phys]);

    const clear = () => {
        for (const d of diceRef.current) phys.world.removeBody(d.body);
        diceRef.current = [];
        setDice([]);
    };

    const setPhase = (p: Phase) => {
        ctrl.current.phase = p;
        onPhase(p);
    };

    // Yeni istek: zarları kupaya diz
    const spawn = (req: RollRequest) => {
        clear();
        fade.current = 1;
        const live: LiveDie[] = [];
        req.dice.forEach((d, slot) => {
            const parts: { kind: DieKind; part: LiveDie['part']; tens: boolean }[] =
                d.sides === 100 ? [{ kind: 10, part: 'tens', tens: true }, { kind: 10, part: 'units', tens: false }] : [{ kind: d.sides as DieKind, part: 'single', tens: false }];
            for (const p of parts) {
                const shape = getShape(p.kind, p.tens);
                const body = new CANNON.Body({
                    mass: 1,
                    type: CANNON.Body.KINEMATIC,
                    material: phys.diceMat,
                    shape: new CANNON.ConvexPolyhedron({ vertices: shape.vertices.map((v) => new CANNON.Vec3(v.x, v.y, v.z)), faces: shape.faces }),
                    linearDamping: 0.12,
                    angularDamping: 0.12,
                    allowSleep: true,
                    sleepSpeedLimit: 0.2,
                    sleepTimeLimit: 0.25,
                });
                body.quaternion.setFromEuler(fairUnit() * 6.28, fairUnit() * 6.28, fairUnit() * 6.28);
                const die: LiveDie = { shape, body, color: d.color ?? DEFAULT_COLOR, slot, part: p.part, offset: new THREE.Vector3(), lastClack: 0 };
                body.addEventListener('collide', (e: { contact: CANNON.ContactEquation; body: CANNON.Body }) => {
                    if (!ctrl.current.sound) return;
                    const now = performance.now();
                    if (now - die.lastClack < 40) return;
                    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
                    if (v < 1.2) return;
                    die.lastClack = now;
                    clack(Math.min(1, v / 22), e.body.mass > 0 ? 'die' : 'table');
                });
                live.push(die);
            }
        });
        // Kupa: ekranın alt ortasında sıra
        const n = live.length;
        const gap = 2.3;
        live.forEach((d, i) => {
            d.offset.set((i - (n - 1) / 2) * gap, 0, 0);
            d.body.position.set(d.offset.x, 2.2, bounds.current.maxZ - 1.6);
            phys.world.addBody(d.body);
        });
        diceRef.current = live;
        setDice(live);
        nudges.current = 0;
        setPhase('ready');
    };

    const launch = (vel: THREE.Vector3) => {
        rollingSince.current = performance.now();
        still.current = 0;
        for (const d of diceRef.current) {
            const b = d.body;
            b.type = CANNON.Body.DYNAMIC;
            b.mass = 1;
            b.updateMassProperties();
            b.velocity.set(vel.x + (fairUnit() - 0.5) * 4, vel.y + fairUnit() * 3, vel.z + (fairUnit() - 0.5) * 4);
            b.angularVelocity.set((fairUnit() - 0.5) * 40, (fairUnit() - 0.5) * 40, (fairUnit() - 0.5) * 40);
            b.wakeUp();
        }
        setPhase('rolling');
    };

    // Ekran noktası -> tutma yüksekliğindeki dünya noktası
    const ray = useMemo(() => new THREE.Raycaster(), []);
    const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -HOLD_Y), []);
    const toWorld = (x: number, y: number, out: THREE.Vector3) => {
        ray.setFromCamera(new THREE.Vector2((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1), camera);
        return ray.ray.intersectPlane(plane, out);
    };
    const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion() }), []);

    useFrame((_, delta) => {
        const c = ctrl.current;
        const dt = Math.min(delta, 1 / 30);
        // İstek geldi mi?
        if (c.request && c.request.id !== lastReq.current) {
            lastReq.current = c.request.id;
            spawn(c.request);
        }
        if (!c.request && c.phase === 'done' && performance.now() - doneAt.current > 5000) {
            // Sonuçtan bir süre sonra zarlar solar
            fade.current = Math.max(0, fade.current - dt * 1.5);
            if (fade.current === 0) {
                clear();
                setPhase('idle');
            }
        }
        const live = diceRef.current;
        if (live.length === 0) return;

        if (c.phase === 'ready') {
            // Kupada hafifçe dönen zarlar
            for (const d of live) {
                d.body.angularVelocity.set(0.6, 0.9, 0.3);
                d.body.position.y = 2.2 + Math.sin(performance.now() / 300 + d.offset.x) * 0.15;
            }
            if (c.command === 'auto') {
                c.command = null;
                const { minX, maxX } = bounds.current;
                launch(new THREE.Vector3((fairUnit() - 0.5) * (maxX - minX) * 0.6, 6, -(26 + fairUnit() * 10)));
            }
        }

        if (c.phase === 'holding') {
            const target = toWorld(c.pointer.x, c.pointer.y, tmp.a);
            if (target) {
                const { minX, maxX, minZ, maxZ } = bounds.current;
                target.x = THREE.MathUtils.clamp(target.x, minX + 1.2, maxX - 1.2);
                target.z = THREE.MathUtils.clamp(target.z, minZ + 1.2, maxZ - 1.2);
                const shake = Math.min(1, Math.hypot(c.pointer.vx, c.pointer.vy) / 2500) + c.shakeBoost;
                live.forEach((d, i) => {
                    // Avuçta: zarlar birbirine yakın, sallandıkça birbirine çarpar
                    const ang = (i / live.length) * Math.PI * 2 + performance.now() / 180;
                    const r = live.length > 1 ? 0.9 : 0;
                    tmp.b.set(target.x + Math.cos(ang) * r, HOLD_Y + Math.sin(performance.now() / 70 + i) * 0.25 * shake, target.z + Math.sin(ang) * r);
                    const b = d.body;
                    b.velocity.set((tmp.b.x - b.position.x) / dt, (tmp.b.y - b.position.y) / dt, (tmp.b.z - b.position.z) / dt);
                    b.angularVelocity.set((fairUnit() - 0.5) * (6 + 40 * shake), (fairUnit() - 0.5) * (6 + 40 * shake), (fairUnit() - 0.5) * (6 + 40 * shake));
                });
                if (c.sound && shake > 0.25 && fairUnit() < shake * 0.35) clack(0.25 + shake * 0.4, 'die');
            }
            c.shakeBoost = Math.max(0, c.shakeBoost - dt * 2);
            if (c.command === 'release') {
                c.command = null;
                // Ekran hızı (px/sn) -> dünya hızı
                const cam = camera as THREE.PerspectiveCamera;
                const k = (2 * cam.position.y * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / size.height;
                const v = new THREE.Vector3(c.pointer.vx * k, 0, c.pointer.vy * k);
                const speed = v.length();
                if (speed < 10) {
                    // Hafif bırakış: masanın ortasına doğru makul bir atış
                    const pos = live[0].body.position;
                    v.set(-pos.x, 0, -pos.z).normalize().multiplyScalar(18).add(new THREE.Vector3((fairUnit() - 0.5) * 6, 0, (fairUnit() - 0.5) * 6));
                } else if (speed > 60) v.multiplyScalar(60 / speed);
                v.y = 5 + fairUnit() * 4;
                launch(v);
            }
        }

        phys.world.step(1 / 120, dt, 8);
        live.forEach((d, i) => {
            const g = groups.current[i];
            if (!g) return;
            g.position.set(d.body.position.x, d.body.position.y, d.body.position.z);
            g.quaternion.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
            g.scale.setScalar(fade.current);
        });

        if (c.phase === 'rolling') {
            const calm = live.every((d) => d.body.sleepState === CANNON.Body.SLEEPING || (d.body.velocity.length() < 0.12 && d.body.angularVelocity.length() < 0.2));
            still.current = calm ? still.current + 1 : 0;
            const timeout = performance.now() - rollingSince.current > 8000;
            if (still.current > 18 || timeout) {
                // Kenara/başka zara yaslanıp eğik kalan zarı hafifçe dürt
                const cocked = live.filter((d) => {
                    tmp.q.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
                    return readDie(d.shape, tmp.q).flatness < 0.94;
                });
                if (cocked.length && nudges.current < 3 && !timeout) {
                    nudges.current++;
                    still.current = 0;
                    for (const d of cocked) {
                        d.body.wakeUp();
                        d.body.velocity.set((fairUnit() - 0.5) * 6, 9, (fairUnit() - 0.5) * 6);
                        d.body.angularVelocity.set((fairUnit() - 0.5) * 20, (fairUnit() - 0.5) * 20, (fairUnit() - 0.5) * 20);
                    }
                    return;
                }
                for (const d of live) {
                    tmp.q.set(d.body.quaternion.x, d.body.quaternion.y, d.body.quaternion.z, d.body.quaternion.w);
                    d.value = readDie(d.shape, tmp.q).value;
                }
                const req = c.request!;
                const values = req.dice.map((r, slot) => {
                    const parts = live.filter((d) => d.slot === slot);
                    if (r.sides === 100) {
                        const t = parts.find((p) => p.part === 'tens')!.value!;
                        const u = parts.find((p) => p.part === 'units')!.value!;
                        return t * 10 + u === 0 ? 100 : t * 10 + u;
                    }
                    const v = parts[0].value!;
                    return r.sides === 10 && v === 0 ? 10 : v;
                });
                setDice([...live]);
                doneAt.current = performance.now();
                setPhase('done');
                diceStore.finish(req.id, values);
            }
        }
    });

    return (
        <>
            <ambientLight intensity={0.55} />
            <directionalLight
                position={[-6, 18, -4]}
                intensity={2.2}
                castShadow
                shadow-mapSize={[1024, 1024]}
                shadow-camera-left={-14}
                shadow-camera-right={14}
                shadow-camera-top={14}
                shadow-camera-bottom={-14}
            />
            <pointLight position={[5, 8, 6]} intensity={30} color="#ffcf8a" />
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[80, 80]} />
                <shadowMaterial transparent opacity={0.35} />
            </mesh>
            {dice.map((d, i) => (
                <DieMesh key={`${d.slot}-${d.part}-${i}`} die={d} groupRef={(g) => (groups.current[i] = g)} />
            ))}
        </>
    );
}

/** Masa + kupa etkileşimi. Savaş açıkken 360° görünümün üstünde durur. */
export default function DiceBox() {
    const dice = useSyncExternalStore(diceStore.subscribe, diceStore.get, diceStore.get);
    const ctrl = useRef<Ctrl>({
        phase: 'idle',
        request: null,
        pointer: { x: 0, y: 0, vx: 0, vy: 0, t: 0, startX: 0, startY: 0, startT: 0 },
        command: null,
        shakeBoost: 0,
        sound: true,
    });
    const [phase, setPhase] = useState<Phase>('idle');
    ctrl.current.request = dice.pending;
    ctrl.current.sound = dice.sound;

    useEffect(() => {
        setTableMounted(true);
        return () => setTableMounted(false);
    }, []);

    // Otomatik kip: istek gelince kendiliğinden fırlat
    useEffect(() => {
        if (phase === 'ready' && dice.mode === 'auto') {
            const t = setTimeout(() => (ctrl.current.command = 'auto'), 250);
            return () => clearTimeout(t);
        }
    }, [phase, dice.mode]);

    // Telefonu sallayınca at
    useEffect(() => {
        if (!dice.shake || phase !== 'ready') return;
        const onMotion = (e: DeviceMotionEvent) => {
            const a = e.acceleration ?? e.accelerationIncludingGravity;
            if (!a) return;
            const m = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) - (e.acceleration ? 0 : 9.8);
            if (m > 13) ctrl.current.command = 'auto';
        };
        window.addEventListener('devicemotion', onMotion);
        return () => window.removeEventListener('devicemotion', onMotion);
    }, [dice.shake, phase]);

    // Kupadan tut-salla-fırlat
    const onGrab = (e: React.PointerEvent) => {
        if (ctrl.current.phase !== 'ready') return;
        e.preventDefault();
        e.stopPropagation();
        unlockAudio();
        const now = performance.now();
        ctrl.current.pointer = { x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: now, startX: e.clientX, startY: e.clientY, startT: now };
        ctrl.current.phase = 'holding';
        setPhase('holding');
        const move = (ev: PointerEvent) => {
            const p = ctrl.current.pointer;
            const t = performance.now();
            const dtm = Math.max(1, t - p.t) / 1000;
            // Hız yumuşatılır: bırakma anındaki savuruş atış gücünü belirler
            p.vx = p.vx * 0.6 + ((ev.clientX - p.x) / dtm) * 0.4;
            p.vy = p.vy * 0.6 + ((ev.clientY - p.y) / dtm) * 0.4;
            p.x = ev.clientX;
            p.y = ev.clientY;
            p.t = t;
        };
        const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', up);
            const p = ctrl.current.pointer;
            // Hareketsiz kısa dokunuş: otomatik atış
            if (Math.hypot(p.x - p.startX, p.y - p.startY) < 10 && performance.now() - p.startT < 300) {
                ctrl.current.phase = 'ready';
                ctrl.current.command = 'auto';
                return;
            }
            // Bırakmadan önce durduysa hız sönmüş sayılır
            if (performance.now() - p.t > 120) {
                p.vx = 0;
                p.vy = 0;
            }
            ctrl.current.command = 'release';
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
    };

    const req = dice.pending;
    const active = phase !== 'idle';

    return (
        <div className="pointer-events-none fixed inset-0 z-[12400]">
            <Canvas
                shadows
                frameloop={active || req ? 'always' : 'demand'}
                dpr={[1, 2]}
                gl={{ alpha: true, antialias: true }}
                camera={{ fov: FOV, near: 0.5, far: 200, position: [0, 30, 0] }}
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
                <Table ctrl={ctrl} onPhase={setPhase} />
            </Canvas>

            {req && (phase === 'ready' || phase === 'holding') && (
                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-[84px]">
                    <div className="mb-2 rounded-full border border-amber-500/40 bg-black/80 px-4 py-1 text-center font-serif text-[15px] font-bold text-amber-100 shadow-lg">
                        {req.label}
                    </div>
                    {/* Kupanın tutma alanı: zarların üstü */}
                    <button
                        onPointerDown={onGrab}
                        aria-label="Zarları tut, salla ve fırlat"
                        className={`pointer-events-auto relative h-28 w-[min(460px,90vw)] touch-none rounded-[40px] border-2 border-dashed transition-colors ${
                            phase === 'holding' ? 'cursor-grabbing border-transparent' : 'cursor-grab border-amber-400/50 bg-amber-500/5 hover:bg-amber-500/10'
                        }`}
                    >
                        {phase === 'ready' && (
                            <span className="absolute inset-x-0 bottom-1 whitespace-nowrap text-center text-[10.5px] font-bold uppercase tracking-[0.2em] text-amber-200/85 [text-shadow:0_1px_4px_#000]">
                                Basılı tut · salla · fırlat — ya da dokun
                            </span>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
