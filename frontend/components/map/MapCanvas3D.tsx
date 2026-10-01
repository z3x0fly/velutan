'use client';

import React, { Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, MapControls, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

import MapLayers from './layers/MapLayers';
import BrushTool from './layers/BrushTool';
import MapMarkers from './MapMarkers';
import MapTravel from './MapTravel';
import MapErrorBoundary from './MapErrorBoundary';
import { from3D, to3D, WORLD_HEIGHT, WORLD_WIDTH } from './utils/coords';
import { loadHeightField } from './terrain/heightField';
import { detectQuality, QualityTier } from './terrain/quality';
import type { MapPoint, Region } from './types';

// Kamera: hedef etrafında küresel koordinat. Yaklaştıkça eğim artar (Runeterra tarzı).
const MIN_DIST = 2.2;
const MAX_DIST = 46;
const START_DIST = 34;
const TILT_FAR = 0.18; // rad, neredeyse tepeden
const TILT_NEAR = 1.02; // rad, yakında yatık bakış
const FOCUS_DIST = 8;

const tiltFor = (dist: number) => {
    const t = THREE.MathUtils.clamp((dist - MIN_DIST) / (MAX_DIST * 0.75 - MIN_DIST), 0, 1);
    return THREE.MathUtils.lerp(TILT_NEAR, TILT_FAR, Math.pow(t, 0.7));
};

export interface MapCanvas3DProps {
    regions: Region[];
    onRegionClick: (region: Region) => void;
    onRotationChange?: (rotation: number) => void;
    /** 1 = açılış görünümü, büyüdükçe yakınlaşma */
    onZoom?: (zoom: number) => void;
    isTravelMode?: boolean;
    travelPath?: MapPoint[];
    onTravelPointAdd?: (point: MapPoint) => void;
    onSimulationEnd?: () => void;
    brushEnabled?: boolean;
}

export interface MapCanvas3DHandle {
    resetRotation: () => void;
    flyTo: (x: number, y: number) => void;
    startSimulation: (path: MapPoint[], durationSeconds: number) => void;
    stopSimulation: () => void;
}

type Controls = React.ElementRef<typeof MapControls>;

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);

/**
 * Eğim, sınırlar, sis, UI senkronu ve tekerlek zoom'u.
 *
 * Tekerlek zoom'u OrbitControls'a bırakılmaz: onun zoomToCursor'u, mesafeye bağlı eğimle birlikte
 * kamerayı sıçratıyordu. Burada imlecin altındaki zemin noktası zoom boyunca sabit tutulur.
 * Dokunmatik pinch zoom hâlâ OrbitControls'ta.
 */
const CameraRig = ({
    controlsRef,
    onRotationChange,
    onZoom,
    onUserZoom,
}: {
    controlsRef: React.RefObject<Controls>;
    onRotationChange?: (r: number) => void;
    onZoom?: (z: number) => void;
    onUserZoom?: () => void;
}) => {
    const { camera, scene, gl, raycaster } = useThree();
    const last = useRef({ az: 0, zoom: 0, t: 0 });
    const zoom = useRef<{ dist: number | null; ndc: THREE.Vector2 }>({ dist: null, ndc: new THREE.Vector2() });
    const onUserZoomRef = useRef(onUserZoom);
    onUserZoomRef.current = onUserZoom;

    useEffect(() => {
        const canvas = gl.domElement;
        const host = canvas.parentElement;
        if (!host) return;
        const onWheel = (e: WheelEvent) => {
            const c = controlsRef.current;
            if (!c || !c.enabled) return;
            e.preventDefault();
            e.stopPropagation(); // OrbitControls'un kendi tekerlek zoom'una ulaşmasın
            onUserZoomRef.current?.();
            const rect = canvas.getBoundingClientRect();
            const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? rect.height : 1; // satır / sayfa -> piksel
            const curDist = camera.position.distanceTo(c.target);

            // Touchpad iki parmak yatay ağırlıklı kaydırma: haritayı kaydır (zoom değil)
            if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.8) {
                const k = (curDist * 0.0012) * unit;
                const az = c.getAzimuthalAngle();
                const dx = e.deltaX * k, dz = e.deltaY * k;
                const mx = dx * Math.cos(az) + dz * Math.sin(az);
                const mz = -dx * Math.sin(az) + dz * Math.cos(az);
                c.target.x += mx; c.target.z += mz;
                camera.position.x += mx; camera.position.z += mz;
                return;
            }

            zoom.current.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
            // Touchpad pinch tarayıcıda ctrlKey'li küçük değerlerle gelir: daha hassas
            const dy = THREE.MathUtils.clamp(e.deltaY * unit * (e.ctrlKey ? 6 : 1), -240, 240);
            const from = zoom.current.dist ?? camera.position.distanceTo(c.target);
            zoom.current.dist = THREE.MathUtils.clamp(from * Math.pow(1.0014, dy), MIN_DIST, MAX_DIST);
        };
        host.addEventListener('wheel', onWheel, { capture: true, passive: false });
        return () => host.removeEventListener('wheel', onWheel, { capture: true });
    }, [gl, camera, controlsRef]);

    // Geliştirme ortamında hata ayıklama için kamera/kontrol erişimi
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') {
            (window as unknown as { __velutan?: unknown }).__velutan = { camera, controls: controlsRef };
        }
    }, [camera, controlsRef]);

    const groundUnder = (ndc: THREE.Vector2, out: THREE.Vector3) => {
        raycaster.setFromCamera(ndc, camera);
        return raycaster.ray.intersectPlane(GROUND, out);
    };
    const before = useMemo(() => new THREE.Vector3(), []);
    const after = useMemo(() => new THREE.Vector3(), []);

    useFrame((state, delta) => {
        const c = controlsRef.current;
        if (!c) return;

        // Yumuşak, imlece sabitlenmiş zoom
        const z = zoom.current;
        if (z.dist !== null) {
            const cur = camera.position.distanceTo(c.target);
            // Kare hızından bağımsız üstel yumuşatma (log uzayında: yakında da uzakta da aynı his)
            const k = 1 - Math.exp(-Math.min(delta, 0.05) * 10);
            const next = Math.exp(Math.log(cur) + (Math.log(z.dist) - Math.log(cur)) * k);
            const hadBefore = groundUnder(z.ndc, before) !== null;
            const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(c.target));
            sph.radius = next;
            sph.phi = tiltFor(next);
            camera.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(sph));
            camera.updateMatrixWorld();
            // İmleç ufka yakınsa zemin noktası çok uzaktadır; oraya sabitlemek hedefi fırlatır.
            // Yalnızca makul mesafedeki noktalara sabitle, kare başı kaydırmayı da sınırla.
            if (hadBefore && before.distanceTo(c.target) < cur * 1.6 && groundUnder(z.ndc, after) !== null) {
                let dx = before.x - after.x;
                let dz = before.z - after.z;
                const maxStep = next * 0.12;
                const len = Math.hypot(dx, dz);
                if (len > maxStep) {
                    dx *= maxStep / len;
                    dz *= maxStep / len;
                }
                // Harita sınırını aşacak kaydırmayı baştan uygulama (sınır ile savaşmasın)
                const hx = WORLD_WIDTH / 2, hz = WORLD_HEIGHT / 2;
                dx = THREE.MathUtils.clamp(c.target.x + dx, -hx, hx) - c.target.x;
                dz = THREE.MathUtils.clamp(c.target.z + dz, -hz, hz) - c.target.z;
                c.target.x += dx;
                c.target.z += dz;
                camera.position.x += dx;
                camera.position.z += dz;
            }
            if (Math.abs(z.dist - next) < 0.001 * next) z.dist = null;
        }

        const dist = camera.position.distanceTo(c.target);
        const phi = tiltFor(dist);
        c.minPolarAngle = phi;
        c.maxPolarAngle = phi;

        // Hedef harita dışına kaçmasın
        const hx = WORLD_WIDTH / 2, hz = WORLD_HEIGHT / 2;
        const tx = THREE.MathUtils.clamp(c.target.x, -hx, hx);
        const tz = THREE.MathUtils.clamp(c.target.z, -hz, hz);
        if (tx !== c.target.x || tz !== c.target.z) {
            camera.position.x += tx - c.target.x;
            camera.position.z += tz - c.target.z;
            c.target.x = tx;
            c.target.z = tz;
        }

        if (scene.fog instanceof THREE.Fog) {
            scene.fog.near = dist * 1.1;
            scene.fog.far = dist * 3.2 + 10;
        }

        const now = state.clock.elapsedTime;
        if (now - last.current.t > 0.1) {
            last.current.t = now;
            const az = c.getAzimuthalAngle();
            if (Math.abs(az - last.current.az) > 0.01) {
                last.current.az = az;
                onRotationChange?.(az);
            }
            const zoom = START_DIST / dist;
            if (Math.abs(zoom - last.current.zoom) > 0.02) {
                last.current.zoom = zoom;
                onZoom?.(zoom);
            }
        }
    });
    return null;
};

const Traveler = ({ pos }: { pos: THREE.Vector3 }) => (
    <group position={pos}>
        <mesh position={[0, 0.12, 0]}>
            <sphereGeometry args={[0.07, 16, 16]} />
            <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={2} />
        </mesh>
        <pointLight color="#ffb347" intensity={1.5} distance={1.5} position={[0, 0.3, 0]} />
        <Html center position={[0, 0.45, 0]} style={{ pointerEvents: 'none' }}>
            <div className="bg-amber-600 text-white text-[10px] font-black px-3 py-1 rounded-full whitespace-nowrap shadow-[0_0_20px_rgba(245,158,11,0.5)] border border-amber-400/50 animate-pulse">
                YOLCU
            </div>
        </Html>
    </group>
);

const LoadingLabel = () => (
    <Html center>
        <div className="text-amber-100/80 text-lg font-serif italic whitespace-nowrap">Harita yükleniyor…</div>
    </Html>
);

const SceneContents = ({
    quality,
    props,
    simPos,
}: {
    quality: QualityTier;
    props: MapCanvas3DProps;
    simPos: THREE.Vector3 | null;
}) => (
    <>
        <hemisphereLight args={['#fff4dc', '#3a3020', 0.9]} />
        <directionalLight position={[-14, 22, -10]} intensity={2.1} color="#fff1d6" />
        <directionalLight position={[12, 8, 14]} intensity={0.35} color="#9fb4d0" />

        <Suspense fallback={<LoadingLabel />}>
            <MapLayers quality={quality} />
        </Suspense>
        <MapMarkers regions={props.regions} onRegionClick={props.onRegionClick} />
        <MapTravel path={props.travelPath ?? []} isTravelMode={!!props.isTravelMode} />
        {simPos && <Traveler pos={simPos} />}
        {props.brushEnabled && <BrushTool />}

        {props.isTravelMode && (
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0.12, 0]}
                visible={false}
                onClick={(e) => {
                    if (e.delta > 4) return; // sürükleme, tıklama değil
                    e.stopPropagation();
                    const [x, y] = from3D(e.point.x, e.point.z);
                    props.onTravelPointAdd?.({ x: Math.round(x), y: Math.round(y) });
                }}
            >
                <planeGeometry args={[WORLD_WIDTH, WORLD_HEIGHT]} />
            </mesh>
        )}
    </>
);

const QualityProbe = ({ onDetect }: { onDetect: (q: QualityTier) => void }) => {
    const { gl } = useThree();
    useEffect(() => onDetect(detectQuality(gl)), [gl, onDetect]);
    return null;
};

const MapCanvas3D = React.forwardRef<MapCanvas3DHandle, MapCanvas3DProps>((props, ref) => {
    const controlsRef = useRef<Controls>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const tween = useRef<gsap.core.Animation | null>(null);
    const [simPos, setSimPos] = useState<THREE.Vector3 | null>(null);
    const simulating = useRef(false);

    // Kullanıcı devraldı: sinematik geçişi durdur (simülasyon hariç).
    // SABİT referans olmalı: drei MapControls, onStart değişince kontrolü dispose edip yeniden bağlar.
    // Sürükleme ortasında bu olursa pointerup dinleyicisi sökülür, three-stdlib parmağı basılı sanır
    // ve pan kalıcı olarak çalışmaz hâle gelir ('bir yerden sonra kaydıramıyoruz' hatası).
    const handleControlsStart = useCallback(() => {
        if (!simulating.current) tween.current?.kill();
    }, []);
    const [quality, setQuality] = useState<QualityTier | null>(null);
    const [dpr, setDpr] = useState(() => (typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 1.75)));
    const onSimulationEnd = useRef(props.onSimulationEnd);
    onSimulationEnd.current = props.onSimulationEnd;

    const initialCamera = useMemo(() => {
        const phi = tiltFor(START_DIST);
        return new THREE.Vector3(0, Math.cos(phi) * START_DIST, Math.sin(phi) * START_DIST);
    }, []);

    /** Kamerayı hedefe ve mesafeye yumuşakça taşı (mevcut açıyı korur) */
    const animateTo = (target: THREE.Vector3, dist: number, azimuth?: number, duration = 1.4) => {
        const c = controlsRef.current;
        const cam = cameraRef.current;
        if (!c || !cam) return;
        tween.current?.kill();
        const offset = cam.position.clone().sub(c.target);
        const sph = new THREE.Spherical().setFromVector3(offset);
        const from = { tx: c.target.x, tz: c.target.z, r: sph.radius, th: sph.theta };
        let toTh = azimuth ?? sph.theta;
        // en kısa yoldan dön
        while (toTh - from.th > Math.PI) toTh -= Math.PI * 2;
        while (toTh - from.th < -Math.PI) toTh += Math.PI * 2;
        const state = { ...from };
        tween.current = gsap.to(state, {
            tx: target.x,
            tz: target.z,
            r: dist,
            th: toTh,
            duration,
            ease: 'power3.inOut',
            onUpdate: () => {
                c.target.set(state.tx, 0, state.tz);
                const s = new THREE.Spherical(state.r, tiltFor(state.r), state.th);
                cam.position.copy(c.target).add(new THREE.Vector3().setFromSpherical(s));
                c.update();
            },
        });
    };

    // Açılış: yüksekten süzülerek gel
    useEffect(() => {
        if (!quality) return;
        const id = requestAnimationFrame(() => {
            const cam = cameraRef.current;
            const c = controlsRef.current;
            if (!cam || !c) return;
            cam.position.set(0, MAX_DIST * 1.15, 0.01);
            c.update();
            animateTo(new THREE.Vector3(0, 0, 0), START_DIST, 0, 2.6);
        });
        return () => cancelAnimationFrame(id);
    }, [quality]); // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, () => ({
        // Pusula: yalnızca kuzeyi yukarı çevir; yakınlık ve konum korunur
        resetRotation: () => {
            const c = controlsRef.current;
            const cam = cameraRef.current;
            if (c && cam) animateTo(c.target.clone(), cam.position.distanceTo(c.target), 0, 0.9);
        },
        flyTo: (x, y) => {
            const [tx, , tz] = to3D(x, y);
            animateTo(new THREE.Vector3(tx, 0, tz), FOCUS_DIST);
        },
        startSimulation: async (path, durationSeconds) => {
            tween.current?.kill();
            if (path.length < 2) return;
            simulating.current = true;
            const field = await loadHeightField().catch(() => null);
            const pts = path.map((p) => {
                const [x, , z] = to3D(p.x, p.y);
                return new THREE.Vector3(x, 0, z);
            });
            // Segment uzunluğuna göre sabit hız
            const lengths = pts.slice(1).map((p, i) => p.distanceTo(pts[i]));
            const total = lengths.reduce((a, b) => a + b, 0) || 1;
            const state = { d: 0 };
            const c = controlsRef.current;
            const cam = cameraRef.current;
            const moveFirst = !!c && !!cam && cam.position.distanceTo(c.target) > 14;
            if (moveFirst) animateTo(pts[0], 12, undefined, 1);
            tween.current = gsap.to(state, {
                d: total,
                duration: Math.max(3, durationSeconds),
                ease: 'none',
                delay: moveFirst ? 1.05 : 0.2,
                onUpdate: () => {
                    let rest = state.d, i = 0;
                    while (i < lengths.length - 1 && rest > lengths[i]) rest -= lengths[i++];
                    const p = pts[i].clone().lerp(pts[i + 1], lengths[i] ? Math.min(rest / lengths[i], 1) : 1);
                    p.y = Math.max(field?.sample(p.x, p.z) ?? 0, 0);
                    setSimPos(p);
                    if (c && cam) {
                        const delta = new THREE.Vector3(p.x - c.target.x, 0, p.z - c.target.z);
                        c.target.add(delta);
                        cam.position.add(delta);
                        c.update();
                    }
                },
                onComplete: () => {
                    simulating.current = false;
                    setSimPos(null);
                    tween.current = null;
                    onSimulationEnd.current?.();
                },
            });
        },
        stopSimulation: () => {
            simulating.current = false;
            tween.current?.kill();
            tween.current = null;
            setSimPos(null);
        },
    }));

    useEffect(() => () => {
        tween.current?.kill();
    }, []);

    return (
        <div className="w-full h-full bg-[#0d1218]">
            <MapErrorBoundary>
                <Canvas
                    flat
                    dpr={dpr}
                    camera={{ fov: 40, near: 0.05, far: 400, position: initialCamera.toArray() }}
                    gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
                    onCreated={({ camera, gl }) => {
                        cameraRef.current = camera as THREE.PerspectiveCamera;
                        gl.setClearColor('#0d1218');
                    }}
                >
                    <fog attach="fog" args={['#0d1218', 30, 120]} />
                    {/* Sürekli düşük FPS'te bir kez çözünürlüğü düşür; ileri-geri zıplamasın */}
                    <PerformanceMonitor flipflops={2} onDecline={() => setDpr(1)} onFallback={() => setDpr(1)} />
                    <QualityProbe onDetect={setQuality} />

                    <MapControls
                        ref={controlsRef}
                        enableDamping
                        dampingFactor={0.09}
                        screenSpacePanning={false}
                        minDistance={MIN_DIST}
                        maxDistance={MAX_DIST}
                        zoomSpeed={1.1}
                        rotateSpeed={0.5}
                        onStart={handleControlsStart}
                    />
                    <CameraRig
                        controlsRef={controlsRef}
                        onRotationChange={props.onRotationChange}
                        onZoom={props.onZoom}
                        onUserZoom={handleControlsStart}
                    />

                    {quality && <SceneContents quality={quality} props={props} simPos={simPos} />}
                </Canvas>
            </MapErrorBoundary>
        </div>
    );
});

MapCanvas3D.displayName = 'MapCanvas3D';

export default MapCanvas3D;
