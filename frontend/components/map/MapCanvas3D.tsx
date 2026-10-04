'use client';

import React, { Suspense, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, invalidate, useFrame, useThree } from '@react-three/fiber';
import { Html, MapControls, PerformanceMonitor, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';

import MapLayers from './layers/MapLayers';
import BrushTool from './layers/BrushTool';
import MapMarkers from './MapMarkers';
import PersonalPins from './PersonalPins';
import Territories from './layers/Territories';
import MapTravel from './MapTravel';
import GroundPicker from './GroundPicker';
import MapErrorBoundary from './MapErrorBoundary';
import { from3D, to3D, WORLD_HEIGHT, WORLD_WIDTH } from './utils/coords';
import { positionAtDay, type Ground, type RouteAnalysis } from './travelAnalysis';
import { detectTier, QualitySettings, stepDown } from './terrain/quality';
import { graphicsStore, resolveSettings } from './graphicsStore';
import type { MapPoint, Region } from './types';
import { cameraStore } from './cameraStore';
import { loadStore } from './loadStore';
import DayNight from './layers/DayNight';
import Season from './layers/Season';
import { dayClock } from './dayStore';

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
    isTravelMode?: boolean;
    travelRoute?: RouteAnalysis | null;
    onTravelPointAdd?: (point: MapPoint) => void;
    onSimulationEnd?: () => void;
    brushEnabled?: boolean;
}

export interface MapCanvas3DHandle {
    resetRotation: () => void;
    flyTo: (x: number, y: number) => void;
    startSimulation: (route: RouteAnalysis, durationSeconds: number) => void;
    stopSimulation: () => void;
}

type Controls = React.ElementRef<typeof MapControls>;

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.1);
// Her karede yeniden kullanılan geçici nesneler (çöp toplayıcı takılmalarını önler)
const _sph = new THREE.Spherical();
const _off = new THREE.Vector3();

/**
 * Eğim, sınırlar, sis, UI senkronu ve tekerlek zoom'u.
 *
 * Tekerlek zoom'u OrbitControls'a bırakılmaz: onun zoomToCursor'u, mesafeye bağlı eğimle birlikte
 * kamerayı sıçratıyordu. Burada imlecin altındaki zemin noktası zoom boyunca sabit tutulur.
 * Dokunmatik pinch zoom hâlâ OrbitControls'ta.
 */
const CameraRig = ({
    controlsRef,
    onUserZoom,
}: {
    controlsRef: React.RefObject<Controls>;
    onUserZoom?: () => void;
}) => {
    const { camera, scene, gl, raycaster, invalidate } = useThree();
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
            invalidate();
        };
        host.addEventListener('wheel', onWheel, { capture: true, passive: false });
        return () => host.removeEventListener('wheel', onWheel, { capture: true });
    }, [gl, camera, controlsRef, invalidate]);

    // Geliştirme ortamında hata ayıklama için kamera/kontrol erişimi
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') {
            (window as unknown as { __velutan?: unknown }).__velutan = { camera, controls: controlsRef, scene };
        }
    }, [camera, controlsRef, scene]);

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
            const sph = _sph.setFromVector3(_off.copy(camera.position).sub(c.target));
            sph.radius = next;
            sph.phi = tiltFor(next);
            camera.position.copy(c.target).add(_off.setFromSpherical(sph));
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
            else invalidate(); // 'demand' modunda animasyon sürsün
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
                cameraStore.set({ rotation: az });
            }
            const zoom = START_DIST / dist;
            if (Math.abs(zoom - last.current.zoom) > 0.02) {
                last.current.zoom = zoom;
                cameraStore.set({ zoom });
            }
        }
    });
    return null;
};

/**
 * Simülasyondaki yolcu. Konum her karede ref'ten okunur (React render'ı yok).
 * Işık kaynağı EKLENMEZ: ışık sayısı değişince tüm malzemelerin shader'ı yeniden derlenir (donma).
 */
const Traveler = ({ posRef, groundRef }: { posRef: React.MutableRefObject<THREE.Vector3>; groundRef: React.MutableRefObject<Ground> }) => {
    const group = useRef<THREE.Group>(null);
    const label = useRef<HTMLSpanElement>(null);
    useFrame(() => {
        group.current?.position.copy(posRef.current);
        const text = TRAVELER_LABEL[groundRef.current];
        if (label.current && label.current.textContent !== text) label.current.textContent = text;
    });
    return (
        <group ref={group}>
            <mesh position={[0, 0.12, 0]}>
                <sphereGeometry args={[0.07, 16, 16]} />
                <meshBasicMaterial color="#ffb347" toneMapped={false} />
            </mesh>
            <Html center position={[0, 0.45, 0]} style={{ pointerEvents: 'none' }}>
                <div className="bg-amber-600 text-white text-[12px] font-black px-3 py-1 rounded-full whitespace-nowrap shadow-[0_0_20px_rgba(245,158,11,0.5)] border border-amber-400/50">
                    YOLCU · <span ref={label}>{TRAVELER_LABEL.plain}</span>
                </div>
            </Html>
        </group>
    );
};

const TRAVELER_LABEL: Record<Ground, string> = { plain: 'Ova', forest: 'Orman', rough: 'Sarp yamaç', marsh: 'Bataklık', mountain: 'Dağ geçidi', water: 'Gemiyle' };

const LoadingLabel = () => (
    <Html center>
        <div className="text-amber-100/80 text-lg font-serif italic whitespace-nowrap">Harita yükleniyor…</div>
    </Html>
);

const SceneContents = ({
    settings,
    props,
    simActive,
    simPosRef,
    simGroundRef,
}: {
    settings: QualitySettings;
    props: MapCanvas3DProps;
    simActive: boolean;
    simPosRef: React.MutableRefObject<THREE.Vector3>;
    simGroundRef: React.MutableRefObject<Ground>;
}) => (
    <>
        <hemisphereLight name="hemi" args={['#fff4dc', '#3a3020', 0.9]} />
        <directionalLight name="sun" position={[-14, 22, -10]} intensity={2.1} color="#fff1d6" />
        <directionalLight name="fill" position={[12, 8, 14]} intensity={0.35} color="#9fb4d0" />
        <DayNight />
        <Season particles={settings.frameloop === 'always'} />

        <Suspense fallback={<LoadingLabel />}>
            <MapLayers settings={settings} />
        </Suspense>
        <Suspense fallback={null}>
            <Territories segments={settings.terrainSegments} />
        </Suspense>
        <MapMarkers regions={props.regions} onRegionClick={props.onRegionClick} />
        <PersonalPins />
        <MapTravel route={props.travelRoute ?? null} isTravelMode={!!props.isTravelMode} />
        {simActive && <Traveler posRef={simPosRef} groundRef={simGroundRef} />}
        {props.brushEnabled && <BrushTool />}

        {props.isTravelMode && props.onTravelPointAdd && (
            <GroundPicker onPick={(x, y) => props.onTravelPointAdd?.({ x, y })} />
        )}
    </>
);

/**
 * next/dynamic ile ayrı parça olarak yüklenir (ilk sayfa JS'i küçük kalsın). dynamic() ref iletmediği için
 * imperatif API `apiRef` prop'u ile verilir.
 */
const MapCanvas3D = (props: MapCanvas3DProps & { apiRef?: React.Ref<MapCanvas3DHandle> }) => {
    const controlsRef = useRef<Controls>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const tween = useRef<gsap.core.Animation | null>(null);
    const [simActive, setSimActive] = useState(false);
    const simPosRef = useRef(new THREE.Vector3());
    const simGroundRef = useRef<Ground>('plain');
    const simulating = useRef(false);

    // Kullanıcı devraldı: sinematik geçişi durdur (simülasyon hariç).
    // SABİT referans olmalı: drei MapControls, onStart değişince kontrolü dispose edip yeniden bağlar.
    // Sürükleme ortasında bu olursa pointerup dinleyicisi sökülür, three-stdlib parmağı basılı sanır
    // ve pan kalıcı olarak çalışmaz hâle gelir ('bir yerden sonra kaydıramıyoruz' hatası).
    const handleControlsStart = useCallback(() => {
        if (!simulating.current) tween.current?.kill();
    }, []);
    // Grafik ayarları: cihaza göre otomatik ya da kullanıcının Ayarlar'dan seçtiği (graphicsStore)
    const gfx = useSyncExternalStore(graphicsStore.subscribe, graphicsStore.get, graphicsStore.get);
    const settings = useMemo(() => resolveSettings(gfx), [gfx]);
    const autoMode = gfx.preset === 'auto';
    const [declined, setDeclined] = useState(false);
    useEffect(() => setDeclined(false), [gfx.preset]);
    const dpr = settings ? Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, declined ? 1 : settings.maxDpr) : 1;

    // Kalite kademesi WebGL bağlamı açılmadan önce belirlenir (antialias/çizim döngüsü buna bağlı)
    useEffect(() => {
        const { tier, renderer } = detectTier();
        console.info(`[Velutan] kalite: ${tier} (${renderer})`);
        graphicsStore.setDetected(tier);
    }, []);

    // Kenar yumuşatma yalnızca WebGL bağlamı açılırken seçilebilir: değişince tuval yeniden kurulur.
    // Kamera görünümü korunur (render sırasında, eski tuval sökülmeden önce kaydedilir).
    const canvasKey = settings?.antialias ? 'aa' : 'noaa';
    const prevKey = useRef(canvasKey);
    const savedView = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
    if (prevKey.current !== canvasKey) {
        prevKey.current = canvasKey;
        if (cameraRef.current && controlsRef.current) {
            savedView.current = { pos: cameraRef.current.position.clone(), target: controlsRef.current.target.clone() };
        }
    }
    useEffect(() => {
        const view = savedView.current;
        if (!view) return;
        let id = 0;
        const restore = () => {
            const c = controlsRef.current;
            const cam = cameraRef.current;
            if (!c || !cam) return void (id = requestAnimationFrame(restore));
            cam.position.copy(view.pos);
            c.target.copy(view.target);
            c.update();
            savedView.current = null;
            invalidate();
        };
        id = requestAnimationFrame(restore);
        return () => cancelAnimationFrame(id);
    }, [canvasKey]);

    // FPS izleme, harita yüklemesi BİTTİKTEN 4 sn sonra başlar: dokular GPU'ya yüklenirken ve
    // shader'lar derlenirken kareler doğal olarak yavaştır; güçlü cihazı yanlışlıkla düşürmesin.
    const { active: loading, progress } = useProgress();
    useEffect(() => loadStore.set({ active: loading, progress }), [loading, progress]);
    const [monitorReady, setMonitorReady] = useState(false);
    useEffect(() => {
        if (!settings || loading || monitorReady) return;
        const t = setTimeout(() => setMonitorReady(true), 4000);
        return () => clearTimeout(t);
    }, [!!settings, loading, monitorReady]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sürekli düşük FPS: bir kademe hafiflet (doku/zemin değişmez, ağaç/animasyon/çözünürlük düşer)
    // Yalnızca otomatik modda: kullanıcı elle seçtiyse onun kararına dokunulmaz
    const handleDecline = useCallback(() => {
        const cur = graphicsStore.get();
        if (cur.preset !== 'auto') return;
        setDeclined(true);
        const tier = cur.autoTier ?? cur.detected;
        if (!tier || tier === 'low' || tier === 'minimal') return;
        const next = stepDown(tier);
        console.info(`[Velutan] FPS düşük, kalite: ${next}`);
        graphicsStore.setAutoTier(next);
    }, []);
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
                _sph.set(state.r, tiltFor(state.r), state.th);
                cam.position.copy(c.target).add(_off.setFromSpherical(_sph));
                c.update();
            },
        });
    };

    // Açılış: yüksekten süzülerek gel
    useEffect(() => {
        if (!settings) return;
        const id = requestAnimationFrame(() => {
            const cam = cameraRef.current;
            const c = controlsRef.current;
            if (!cam || !c) return;
            const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (settings.frameloop === 'demand' || reduced) return; // zayıf cihaz: doğrudan son görünüm
            cam.position.set(0, MAX_DIST * 1.15, 0.01);
            c.update();
            animateTo(new THREE.Vector3(0, 0, 0), START_DIST, 0, 1.8);
        });
        return () => cancelAnimationFrame(id);
    }, [!!settings]); // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(props.apiRef, () => ({
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
        startSimulation: (route, durationSeconds) => {
            tween.current?.kill();
            if (route.samples.length < 2 || route.totalDays <= 0) return;
            simulating.current = true;
            const first = route.samples[0];
            simPosRef.current.set(first.x, first.y, first.z);
            simGroundRef.current = first.ground;
            setSimActive(true);
            // Oynatma süresi rotadaki GÜNLERE bölünür: dağ geçidinde yavaşlar, ovada ve denizde açılır
            const state = { day: 0 };
            let cursor = 0;
            // Gün döngüsü yolculuğun gününü izler (sabah 6'da yola çıkılır)
            dayClock.simDay = 0;
            dayClock.secPerDay = Math.max(3, durationSeconds) / route.totalDays;
            const c = controlsRef.current;
            const cam = cameraRef.current;
            const start = new THREE.Vector3(first.x, 0, first.z);
            const moveFirst = !!c && !!cam && (cam.position.distanceTo(c.target) > 14 || c.target.distanceTo(start) > 6);
            if (moveFirst) animateTo(start, 12, undefined, 1);
            tween.current = gsap.to(state, {
                day: route.totalDays,
                duration: Math.max(3, durationSeconds),
                ease: 'none',
                delay: moveFirst ? 1.05 : 0.2,
                onUpdate: () => {
                    dayClock.simDay = state.day;
                    const p = positionAtDay(route, state.day, cursor);
                    cursor = p.i;
                    simPosRef.current.set(p.x, p.y, p.z);
                    simGroundRef.current = p.ground;
                    if (c && cam) {
                        // Kamera yumuşak takip: hedefi yolcuya doğru çeker (ani sıçrama yok)
                        const delta = _off.set(p.x - c.target.x, 0, p.z - c.target.z).multiplyScalar(0.12);
                        c.target.add(delta);
                        cam.position.add(delta);
                        c.update();
                    }
                    invalidate();
                },
                onComplete: () => {
                    dayClock.simDay = null;
                    simulating.current = false;
                    setSimActive(false);
                    tween.current = null;
                    onSimulationEnd.current?.();
                },
            });
        },
        stopSimulation: () => {
            dayClock.simDay = null;
            simulating.current = false;
            tween.current?.kill();
            tween.current = null;
            setSimActive(false);
        },
    }));

    useEffect(() => () => {
        tween.current?.kill();
    }, []);

    return (
        <div className="w-full h-full bg-[#0d1218]">
            <MapErrorBoundary>
                {settings && (
                <Canvas
                    key={canvasKey}
                    flat
                    shadows={settings.dragon && settings.frameloop === 'always' ? 'percentage' : false}
                    dpr={dpr}
                    frameloop={settings.frameloop}
                    camera={{ fov: 40, near: 0.05, far: 400, position: (savedView.current?.pos ?? initialCamera).toArray() }}
                    gl={{ antialias: settings.antialias, powerPreference: 'high-performance', stencil: false }}
                    onCreated={({ camera, gl }) => {
                        cameraRef.current = camera as THREE.PerspectiveCamera;
                        gl.setClearColor('#0d1218');
                    }}
                >
                    <fog attach="fog" args={['#0d1218', 30, 120]} />
                    {/* Sürekli düşük FPS: kademe hafifler; ileri-geri zıplamasın diye en fazla 2 kez */}
                    {autoMode && settings.frameloop === 'always' && monitorReady && (
                        // 20 x 250 ms = 5 sn boyunca ortalama 25 FPS altı: gerçek zorlanma
                        <PerformanceMonitor bounds={() => [25, 45]} iterations={20} flipflops={3} onDecline={handleDecline} />
                    )}

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
                        onUserZoom={handleControlsStart}
                    />

                    <SceneContents settings={settings} props={props} simActive={simActive} simPosRef={simPosRef} simGroundRef={simGroundRef} />
                </Canvas>
                )}
            </MapErrorBoundary>
        </div>
    );
};

export default MapCanvas3D;
