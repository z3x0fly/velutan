'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, Grid3x3, X } from 'lucide-react';
import { mediaUrl } from '../map/media';
import type { Panorama } from '../map/types';
import { useBattle, worldToCell } from './panorama/battle';
import BattleScene from './panorama/BattleScene';
import BattlePanel, { PendingToken } from './panorama/BattlePanel';
import BattleGuide from './panorama/BattleGuide';

const GUIDE_SEEN = 'velutan_savas_rehber';

const MIN_FOV = 30;
const MAX_FOV = 95;

/** Velutanmap.com'dan içe aktarılan panoramalar seed klasöründe tutulur */
const isFromVelutanmap = (p: Panorama) => p.image.startsWith('/static/panoramas/seed/');

/**
 * Eşdikdörtgen (equirectangular) görseli kürenin içine giydirir. Sürükleyerek bakılır, tekerlekle FOV değişir.
 * Dokular önbelleğe alınmaz: panoramalar arasında gezinirken eskisi GPU'dan atılır.
 */
const Sphere = ({ url, yaw, pitch, lockRef, onLoaded, onError }: { url: string; yaw: number; pitch: number; lockRef: React.MutableRefObject<boolean>; onLoaded: () => void; onError: () => void }) => {
    const [texture, setTexture] = useState<THREE.Texture | null>(null);
    const { camera, gl } = useThree();
    const view = useRef({ lon: yaw, lat: pitch, targetFov: 75 });

    useEffect(() => {
        let alive = true;
        let loaded: THREE.Texture | null = null;
        new THREE.TextureLoader().setCrossOrigin('anonymous').load(
            url,
            (t) => {
                if (!alive) return t.dispose();
                t.colorSpace = THREE.SRGBColorSpace;
                t.anisotropy = gl.capabilities.getMaxAnisotropy();
                loaded = t;
                setTexture(t);
                onLoaded();
            },
            undefined,
            () => alive && onError(),
        );
        view.current = { lon: yaw, lat: pitch, targetFov: 75 };
        return () => {
            alive = false;
            loaded?.dispose();
        };
    }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sürükleme + tekerlek
    useEffect(() => {
        const el = gl.domElement;
        let drag: { x: number; y: number; lon: number; lat: number } | null = null;
        const down = (e: PointerEvent) => {
            el.setPointerCapture(e.pointerId);
            drag = { x: e.clientX, y: e.clientY, lon: view.current.lon, lat: view.current.lat };
        };
        const move = (e: PointerEvent) => {
            // Token sürüklenirken bakış dönmez
            if (!drag || lockRef.current) return;
            const cam = camera as THREE.PerspectiveCamera;
            const k = cam.fov / el.clientHeight; // ekran pikseli -> derece
            view.current.lon = drag.lon - (e.clientX - drag.x) * k;
            view.current.lat = THREE.MathUtils.clamp(drag.lat + (e.clientY - drag.y) * k, -85, 85);
        };
        const up = () => (drag = null);
        const wheel = (e: WheelEvent) => {
            e.preventDefault();
            view.current.targetFov = THREE.MathUtils.clamp(view.current.targetFov + e.deltaY * 0.05, MIN_FOV, MAX_FOV);
        };
        el.addEventListener('pointerdown', down);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('wheel', wheel, { passive: false });
        return () => {
            el.removeEventListener('pointerdown', down);
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            el.removeEventListener('wheel', wheel);
        };
    }, [camera, gl, lockRef]);

    useFrame((_, delta) => {
        const cam = camera as THREE.PerspectiveCamera;
        const phi = THREE.MathUtils.degToRad(90 - view.current.lat);
        const theta = THREE.MathUtils.degToRad(view.current.lon);
        cam.lookAt(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
        const k = 1 - Math.exp(-Math.min(delta, 0.05) * 12);
        cam.fov += (view.current.targetFov - cam.fov) * k;
        cam.updateProjectionMatrix();
    });

    // three.js panorama örneğiyle aynı: geometri x'te ters çevrilir, yüzler içe bakar ve görsel aynalanmaz
    const geometry = useMemo(() => new THREE.SphereGeometry(50, 96, 48).scale(-1, 1, 1), []);
    useEffect(() => () => geometry.dispose(), [geometry]);

    if (!texture) return null;
    return (
        <mesh geometry={geometry}>
            <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
    );
};

interface PanoramaViewerProps {
    panoramas: Panorama[];
    index: number;
    regionName: string;
    onIndexChange: (i: number) => void;
    onClose: () => void;
}

const PanoramaViewer = ({ panoramas, index, regionName, onIndexChange, onClose }: PanoramaViewerProps) => {
    const pano = panoramas[index];
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const url = useMemo(() => mediaUrl(pano?.image), [pano]);

    useEffect(() => setStatus('loading'), [url]);

    // Savaş ızgarası ve token'lar (bu mekâna özel, tarayıcıda saklanır)
    const [battle, setBattle] = useBattle(pano?.slug ?? '');
    const [panelOpen, setPanelOpen] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [placing, setPlacing] = useState<PendingToken | null>(null);
    const [dragInfo, setDragInfo] = useState<string | null>(null);
    const [guideOpen, setGuideOpen] = useState(false);
    const lockRef = useRef(false);
    useEffect(() => {
        setSelectedId(null);
        setPlacing(null);
    }, [pano?.slug]);

    const placeToken = useCallback(
        (x: number, z: number) => {
            if (!placing) return;
            const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
            setBattle((s) => {
                const [cx, cz] = worldToCell(x, z, placing.size, s.grid);
                return { ...s, tokens: [...s.tokens, { id, ...placing, cx, cz }] };
            });
            setSelectedId(id);
            setPlacing(null);
        },
        [placing, setBattle],
    );
    const removeToken = useCallback(
        (id: string) => {
            setBattle((s) => ({ ...s, tokens: s.tokens.filter((t) => t.id !== id) }));
            setSelectedId((cur) => (cur === id ? null : cur));
        },
        [setBattle],
    );
    const moveToken = useCallback(
        (id: string, cx: number, cz: number) => setBattle((s) => ({ ...s, tokens: s.tokens.map((t) => (t.id === id ? { ...t, cx, cz } : t)) })),
        [setBattle],
    );

    const go = useCallback(
        (d: number) => onIndexChange((index + d + panoramas.length) % panoramas.length),
        [index, panoramas.length, onIndexChange],
    );

    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
            if (e.key === 'Escape') {
                if (placing) setPlacing(null);
                else onClose();
            }
            if (e.key === 'ArrowRight') go(1);
            if (e.key === 'ArrowLeft') go(-1);
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && battle.on) removeToken(selectedId);
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, [go, onClose, placing, selectedId, battle.on, removeToken]);

    if (!pano || !url) return null;

    return (
        <div className="fixed inset-0 z-[12000] bg-black pointer-events-auto select-none" role="dialog" aria-label={`${pano.title} 360° görünüm`}>
            <Canvas flat dpr={[1, 1.75]} camera={{ fov: 75, near: 0.1, far: 200, position: [0, 0, 0] }} style={{ cursor: 'grab' }}>
                <Sphere
                    url={url}
                    yaw={pano.initial_yaw}
                    pitch={pano.initial_pitch}
                    lockRef={lockRef}
                    onLoaded={() => setStatus('ready')}
                    onError={() => setStatus('error')}
                />
                {battle.on && (
                    <BattleScene
                        grid={battle.grid}
                        tokens={battle.tokens}
                        selectedId={selectedId}
                        placing={!!placing}
                        lockRef={lockRef}
                        onSelect={setSelectedId}
                        onMove={moveToken}
                        onPlace={placeToken}
                        onDragInfo={setDragInfo}
                    />
                )}
            </Canvas>

            {dragInfo && (
                <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 rounded-full border border-amber-500/40 bg-black/80 px-4 py-1.5 font-mono text-[13px] text-amber-200">
                    {dragInfo}
                </div>
            )}

            {battle.on && panelOpen && (
                <div className="absolute right-3 top-24 md:top-28 z-10">
                    <BattlePanel
                        state={battle}
                        selectedId={selectedId}
                        placing={placing}
                        onSelect={setSelectedId}
                        onStartPlacing={setPlacing}
                        onCancelPlacing={() => setPlacing(null)}
                        onRemove={removeToken}
                        onClear={() => (setBattle((s) => ({ ...s, tokens: [] })), setSelectedId(null))}
                        onGrid={(patch) => setBattle((s) => ({ ...s, grid: { ...s.grid, ...patch } }))}
                        onClose={() => setPanelOpen(false)}
                        onHelp={() => setGuideOpen(true)}
                    />
                </div>
            )}
            {guideOpen && <BattleGuide onClose={() => setGuideOpen(false)} />}

            {status !== 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="font-serif italic text-amber-100/80">{status === 'error' ? 'Panorama yüklenemedi' : 'Panorama yükleniyor…'}</span>
                </div>
            )}

            {/* Üst bar */}
            <div className="absolute top-0 inset-x-0 z-30 flex items-start justify-between gap-2 p-4 md:p-6 bg-gradient-to-b from-black/80 to-transparent">
                <div>
                    <div className="text-[12px] font-black uppercase tracking-[0.3em] text-amber-500/70">{regionName} · 360°</div>
                    <h3 className="font-serif text-2xl md:text-3xl font-black text-amber-50">{pano.title}</h3>
                    <div className="text-[13px] text-amber-100/50 mt-1">
                        {index + 1} / {panoramas.length}
                        {isFromVelutanmap(pano) && (
                            <>
                                {' · '}Kaynak:{' '}
                                <a href="https://velutanmap.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-300">
                                    velutanmap.com
                                </a>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                    <button
                        onClick={() => {
                            if (battle.on && !panelOpen) return setPanelOpen(true);
                            setBattle((s) => ({ ...s, on: !s.on }));
                            setPanelOpen(true);
                            setPlacing(null);
                            // İlk açılışta rehberi göster
                            if (!battle.on) {
                                try {
                                    if (!localStorage.getItem(GUIDE_SEEN)) {
                                        localStorage.setItem(GUIDE_SEEN, '1');
                                        setGuideOpen(true);
                                    }
                                } catch {
                                    /* yoksay */
                                }
                            }
                        }}
                        aria-pressed={battle.on}
                        title="Savaş ızgarası ve token'lar"
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-black uppercase tracking-[0.15em] transition-colors ${
                            battle.on ? 'border-amber-400 bg-amber-500/20 text-amber-200' : 'border-amber-500/30 bg-black/60 text-amber-400 hover:text-white'
                        }`}
                    >
                        <Grid3x3 size={16} /> <span className="hidden sm:inline">{battle.on ? (panelOpen ? 'Izgarayı kapat' : 'Savaş paneli') : 'Savaş'}</span>
                    </button>
                    <button onClick={onClose} aria-label="Kapat" className="p-2 rounded-full bg-black/60 border border-amber-500/30 text-amber-400 hover:text-white">
                        <X size={22} />
                    </button>
                </div>
            </div>

            {panoramas.length > 1 && (
                <>
                    {!(battle.on && panelOpen) && (
                    <>
                    <button onClick={() => go(-1)} aria-label="Önceki" className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-amber-500/30 text-amber-400 hover:text-white">
                        <ChevronLeft size={24} />
                    </button>
                    <button onClick={() => go(1)} aria-label="Sonraki" className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-amber-500/30 text-amber-400 hover:text-white">
                        <ChevronRight size={24} />
                    </button>
                    </>
                    )}

                    {/* Küçük resim şeridi */}
                    <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/85 to-transparent">
                        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 justify-start md:justify-center">
                            {panoramas.map((p, i) => (
                                <button
                                    key={p.id}
                                    onClick={() => onIndexChange(i)}
                                    className={`shrink-0 w-32 rounded-md overflow-hidden border-2 transition-all ${i === index ? 'border-amber-400' : 'border-transparent opacity-60 hover:opacity-100'}`}
                                    title={p.title}
                                >
                                    <img src={mediaUrl(p.thumb) ?? mediaUrl(p.image)} alt={p.title} loading="lazy" className="w-full h-16 object-cover" />
                                    <div className="bg-black/80 text-[12px] text-amber-50 px-1 py-0.5 truncate">{p.title}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default PanoramaViewer;
