'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, Grid3x3, X } from 'lucide-react';
import { mediaUrl } from '../map/media';
import type { Panorama } from '../map/types';
import BattleScene from './panorama/BattleScene';
import BattlePanel from './panorama/BattlePanel';
import BattleGuide from './panorama/BattleGuide';
import GameSetup from './panorama/GameSetup';
import InitiativeBar from './panorama/InitiativeBar';
import CharacterCard from './panorama/CharacterCard';
import DiceDock, { ResultToast } from './panorama/DiceDock';
import AttackConfirm from './panorama/AttackConfirm';
import DiceBox from './dice3d/DiceBox';
import { useBattleController } from './panorama/useBattleController';
import { RULES_OFF } from './panorama/rules';
import { GmSession, JoinDialog, PlayerSession } from './panorama/SessionUI';
import { sessionStore } from './panorama/session';
import HotspotMarkers from './panorama/HotspotMarkers';
import LoreEntryModal from './panorama/LoreEntryModal';
import { Hotspot, useHotspots, yawToLon } from './panorama/hotspots';

const GUIDE_SEEN = 'velutan_savas_rehber';

const MIN_FOV = 30;
const MAX_FOV = 95;

/** Velutanmap.com'dan içe aktarılan panoramalar seed klasöründe tutulur */
const isFromVelutanmap = (p: Panorama) => p.image.startsWith('/static/panoramas/seed/');

type View = { lon: number; lat: number; targetFov: number; aim?: { lon: number; lat: number } };

/**
 * Eşdikdörtgen (equirectangular) görseli kürenin içine giydirir. Sürükleyerek bakılır, tekerlekle FOV değişir.
 * Dokular önbelleğe alınmaz: panoramalar arasında gezinirken eskisi GPU'dan atılır.
 * yaw/pitch velutanmap.com düzenindedir (yaw 0 görselin ortası); bakış açısına yawToLon ile çevrilir.
 */
const Sphere = ({ url, yaw, pitch, lockRef, viewRef, onLoaded, onError }: { url: string; yaw: number; pitch: number; lockRef: React.MutableRefObject<boolean>; viewRef: React.MutableRefObject<View>; onLoaded: () => void; onError: () => void }) => {
    const [texture, setTexture] = useState<THREE.Texture | null>(null);
    const { camera, gl } = useThree();
    const view = viewRef;

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
        view.current = { lon: yawToLon(yaw), lat: pitch, targetFov: 75 };
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
            view.current.aim = undefined;
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
    }, [camera, gl, lockRef, view]);

    useFrame((_, delta) => {
        const cam = camera as THREE.PerspectiveCamera;
        // Bir noktaya geçerken bakış yumuşakça oraya döner
        const aim = view.current.aim;
        if (aim) {
            const a = 1 - Math.exp(-Math.min(delta, 0.05) * 9);
            const dLon = ((((aim.lon - view.current.lon) % 360) + 540) % 360) - 180;
            view.current.lon += dLon * a;
            view.current.lat += (aim.lat - view.current.lat) * a;
        }
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
    /** Ortak masa için bölge kimliği */
    regionSlug?: string;
    onIndexChange: (i: number) => void;
    onClose: () => void;
}

const PanoramaViewer = ({ panoramas, index, regionName, regionSlug = '', onIndexChange, onClose }: PanoramaViewerProps) => {
    const pano = panoramas[index];
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const url = useMemo(() => mediaUrl(pano?.image), [pano]);

    useEffect(() => {
        setStatus('loading');
    }, [url]);

    // Savaş: ızgara, token'lar, kurallar ve hamleler (bu mekâna özel, tarayıcıda saklanır)
    const ctrl = useBattleController(pano?.slug ?? '', regionSlug);
    const viewRef = useRef<View>({ lon: 0, lat: 0, targetFov: 75 });
    // velutanmap.com'daki geçiş ve bilgi noktaları
    const hotspots = useHotspots(pano?.slug);
    const [loreSlug, setLoreSlug] = useState<string | null>(null);
    const jumpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (jumpTimer.current) clearTimeout(jumpTimer.current);
    }, []);
    const gotoPanorama = (slug: string) => {
        const i = panoramas.findIndex((p) => p.slug === slug);
        if (i < 0) return false;
        onIndexChange(i);
        return true;
    };
    const pickHotspot = (h: Hotspot) => {
        if (h.nav === 'info' || !panoramas.some((p) => p.slug === h.target.slug)) return setLoreSlug(h.target.slug);
        // Street View gibi: noktaya dönüp yaklaş, sonra geç
        viewRef.current.aim = { lon: yawToLon(h.yaw), lat: h.pitch };
        viewRef.current.targetFov = MIN_FOV;
        if (jumpTimer.current) clearTimeout(jumpTimer.current);
        jumpTimer.current = setTimeout(() => gotoPanorama(h.target.slug), 420);
    };
    const sess = ctrl.session;
    const isPlayer = ctrl.isPlayer;
    const [picking, setPicking] = useState(false);
    const { battle, setBattle, placing, setPlacing, selectedId, targeting } = ctrl;
    const [panelOpen, setPanelOpen] = useState(true);
    const [guideOpen, setGuideOpen] = useState(false);
    const [setupOpen, setSetupOpen] = useState(false);
    const [confirm, setConfirm] = useState<{ actorId: string; targetId: string } | null>(null);
    const lockRef = useRef(false);
    const rules = battle.rules;
    // Kart: sistemli oyunda (kartla ilgili en az bir mekanik açıkken)
    const hasSheet = !!rules && (rules.hp || rules.mana || rules.attacks || rules.abilities || rules.conditions || rules.sanity);

    // Savaş açılınca kurallar yoksa kurulum ekranı gelir
    useEffect(() => {
        if (battle.on && !battle.rules && !isPlayer) setSetupOpen(true);
    }, [battle.on, battle.rules, isPlayer]);

    // GM sayfayı yenilediyse açık masasına geri döner
    useEffect(() => {
        void sessionStore.resumeGm();
    }, []);
    // Oyuncu GM'i izler: GM mekân değiştirince aynı mekâna geçer
    useEffect(() => {
        if (!isPlayer || !sess.pano || sess.pano.slug === pano?.slug) return;
        const i = panoramas.findIndex((p) => p.slug === sess.pano!.slug);
        if (i >= 0) onIndexChange(i);
    }, [isPlayer, sess.pano?.slug]); // eslint-disable-line react-hooks/exhaustive-deps
    // Oyuncu bağlanınca (GM'in durumu gelip oyuncu karakterleri görününce) bir kez karakter seçer
    const askedPick = useRef(false);
    const heroCount = battle.tokens.filter((t) => t.kind === 'oyuncu').length;
    useEffect(() => {
        if (!isPlayer || askedPick.current || sess.status !== 'live' || sess.character || heroCount === 0) return;
        askedPick.current = true;
        setPicking(true);
    }, [isPlayer, sess.status, sess.character, heroCount]);
    // Oyuncu masadan ayrılınca ya da masa kapanınca kendi görünümüne döner
    useEffect(() => {
        if (sess.status === 'closed') setPicking(false);
    }, [sess.status]);
    useEffect(() => {
        setConfirm(null);
    }, [pano?.slug]);

    const onTarget = (id: string) => {
        if (!targeting) return;
        if (id === targeting.actorId && targeting.mode === 'attack') return;
        if (targeting.mode === 'attack') setConfirm({ actorId: targeting.actorId, targetId: id });
        else if (targeting.spell) ctrl.castSpell(targeting.actorId, id, targeting.spell);
        ctrl.setTargeting(null);
    };
    const actorName = targeting ? battle.tokens.find((t) => t.id === targeting.actorId)?.name : '';

    const go = useCallback(
        (d: number) => onIndexChange((index + d + panoramas.length) % panoramas.length),
        [index, panoramas.length, onIndexChange],
    );

    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
            if (e.key === 'Escape') {
                if (targeting) ctrl.setTargeting(null);
                else if (confirm) setConfirm(null);
                else if (placing) setPlacing(null);
                else onClose();
            }
            // Savaşta oklar mekân değiştirmez (yanlışlıkla sahne kaybolmasın)
            if (!battle.on && e.key === 'ArrowRight') go(1);
            if (!battle.on && e.key === 'ArrowLeft') go(-1);
            if (e.key === 'Delete' && selectedId && battle.on) ctrl.removeToken(selectedId);
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    });

    if (!pano || !url) return null;

    return (
        <div className="fixed inset-0 z-[12000] bg-black pointer-events-auto select-none" role="dialog" aria-label={`${pano.title} 360° görünüm`}>
            <Canvas flat dpr={[1, 1.75]} camera={{ fov: 75, near: 0.1, far: 200, position: [0, 0, 0] }} style={{ cursor: 'grab' }}>
                <Sphere
                    url={url}
                    yaw={pano.initial_yaw}
                    pitch={pano.initial_pitch}
                    lockRef={lockRef}
                    viewRef={viewRef}
                    onLoaded={() => setStatus('ready')}
                    onError={() => setStatus('error')}
                />
                {/* Savaşta noktalar gizlenir (token'larla karışmasın); ortak masada oyuncu mekân değiştiremez */}
                {!battle.on && status === 'ready' && <HotspotMarkers hotspots={isPlayer ? hotspots.filter((h) => h.nav === 'info') : hotspots} onPick={pickHotspot} />}
                {battle.on && (
                    <BattleScene
                        grid={battle.grid}
                        tokens={battle.tokens}
                        selectedId={selectedId}
                        placing={!!placing}
                        lockRef={lockRef}
                        onSelect={ctrl.setSelectedId}
                        onMove={ctrl.moveToken}
                        onPlace={ctrl.placeToken}
                        onDragInfo={ctrl.setDragInfo}
                        dragLabel={(t, cx, cz, sx, sz) => ctrl.dragText(t, cx, cz, sx, sz, battle.grid.cell)}
                        activeId={ctrl.activeId}
                        showHp={!!rules?.hp}
                        showConditions={!!rules?.conditions}
                        targeting={!!targeting}
                        onTarget={onTarget}
                        canDrag={isPlayer ? (id) => sess.character === id : undefined}
                    />
                )}
            </Canvas>

            {battle.on && (
                <>
                    {/* Üst orta: sıra şeridi, sürükleme/hedef bilgisi */}
                    <div className="pointer-events-none absolute inset-x-0 top-[84px] z-20 flex flex-col items-center gap-2 px-3 md:top-6">
                        <InitiativeBar ctrl={ctrl} />
                        {ctrl.dragInfo && (
                            <div className={`rounded-full border bg-black/85 px-4 py-1.5 font-mono text-[13px] ${ctrl.dragInfo.over ? 'border-red-400/70 text-red-300' : 'border-amber-500/40 text-amber-200'}`}>
                                {ctrl.dragInfo.text}
                                {ctrl.dragInfo.over ? ' · hareket hakkı aşıldı' : ''}
                            </div>
                        )}
                        {targeting && (
                            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-red-400/60 bg-black/85 px-4 py-1.5 text-[13px] text-red-100 shadow-[0_0_24px_rgba(248,113,113,0.35)]">
                                <span className="animate-pulse">◎</span>
                                <span>
                                    <b>{actorName}</b> {targeting.mode === 'attack' ? 'saldırıyor' : `${targeting.spell?.name} yapıyor`}: hedefe tıkla
                                </span>
                                <button onClick={() => ctrl.setTargeting(null)} className="rounded-full border border-red-300/40 px-2 text-[11px] hover:bg-red-500/20">
                                    Vazgeç
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Orta: sonuç ve saldırı onayı */}
                    <div className="pointer-events-none absolute inset-x-0 top-[36%] z-40 flex justify-center px-3">
                        <ResultToast toast={ctrl.toast} />
                    </div>
                    {confirm && (
                        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center px-3">
                            <AttackConfirm ctrl={ctrl} actorId={confirm.actorId} targetId={confirm.targetId} onClose={() => setConfirm(null)} />
                        </div>
                    )}

                    {/* Sol: karakter kartı */}
                    {hasSheet && selectedId && !placing && (
                        // Telefonda alttan tabaka (zar çubuğunun üstünde), genişte sol panel
                        <div className="absolute inset-x-2 bottom-[132px] z-20 md:inset-x-auto md:bottom-auto md:left-3 md:top-28">
                            <CharacterCard ctrl={ctrl} id={selectedId} />
                        </div>
                    )}

                    {/* Alt orta: zarlar */}
                    <div className="absolute inset-x-0 bottom-3 z-20 flex justify-center px-2">
                        <DiceDock ctrl={ctrl} onRules={isPlayer ? undefined : () => setSetupOpen(true)} />
                    </div>

                    <DiceBox />
                </>
            )}

            {battle.on && panelOpen && !isPlayer && (
                <div className={`absolute right-3 top-24 md:top-28 z-10 ${hasSheet && selectedId ? 'hidden md:block' : ''}`}>
                    <BattlePanel
                        state={battle}
                        selectedId={selectedId}
                        placing={placing}
                        onSelect={ctrl.setSelectedId}
                        onStartPlacing={setPlacing}
                        onCancelPlacing={() => setPlacing(null)}
                        onRemove={ctrl.removeToken}
                        onClear={() => (setBattle((s) => ({ ...s, tokens: [], combat: null })), ctrl.setSelectedId(null))}
                        onGrid={(patch) => setBattle((s) => ({ ...s, grid: { ...s.grid, ...patch } }))}
                        onClose={() => setPanelOpen(false)}
                        onHelp={() => setGuideOpen(true)}
                    />
                </div>
            )}
            {guideOpen && <BattleGuide onClose={() => setGuideOpen(false)} />}
            {loreSlug && <LoreEntryModal slug={loreSlug} onClose={() => setLoreSlug(null)} onPanorama={isPlayer ? undefined : gotoPanorama} />}
            {isPlayer && <JoinDialog sess={sess} battle={battle} picking={picking && !sess.needsName} onDone={() => setPicking(false)} />}
            {setupOpen && (
                <GameSetup
                    initial={battle.rules}
                    onStart={(r) => {
                        ctrl.startGame(r);
                        setSetupOpen(false);
                        // İlk oyunda rehber
                        try {
                            if (!localStorage.getItem(GUIDE_SEEN)) {
                                localStorage.setItem(GUIDE_SEEN, '1');
                                setGuideOpen(true);
                            }
                        } catch {
                            /* yoksay */
                        }
                    }}
                    onClose={() => {
                        // Kurmadan kapatılırsa sistemsiz oynanır
                        if (!battle.rules) ctrl.startGame(RULES_OFF);
                        setSetupOpen(false);
                    }}
                />
            )}

            {status !== 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="font-serif italic text-amber-100/80">{status === 'error' ? 'Panorama yüklenemedi' : 'Panorama yükleniyor…'}</span>
                </div>
            )}

            {/* Üst bar */}
            <div className="pointer-events-none absolute top-0 inset-x-0 z-30 flex items-start justify-between gap-2 p-4 md:p-6 bg-gradient-to-b from-black/80 to-transparent">
                <div className="pointer-events-auto">
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
                <div className="pointer-events-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {isPlayer ? (
                        <PlayerSession sess={sess} battle={battle} onPick={() => setPicking(true)} />
                    ) : (
                        battle.on && <GmSession sess={sess} battle={battle} regionSlug={regionSlug} panoSlug={pano.slug} />
                    )}
                    {!isPlayer && (
                    <button
                        onClick={() => {
                            if (battle.on && !panelOpen) return setPanelOpen(true);
                            setBattle((s) => ({ ...s, on: !s.on }));
                            setPanelOpen(true);
                            setPlacing(null);
                            ctrl.setTargeting(null);
                        }}
                        aria-pressed={battle.on}
                        title="Savaş ızgarası ve token'lar"
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-black uppercase tracking-[0.15em] transition-colors ${
                            battle.on ? 'border-amber-400 bg-amber-500/20 text-amber-200' : 'border-amber-500/30 bg-black/60 text-amber-400 hover:text-white'
                        }`}
                    >
                        <Grid3x3 size={16} /> <span className="hidden sm:inline">{battle.on ? (panelOpen ? 'Izgarayı kapat' : 'Savaş paneli') : 'Savaş'}</span>
                    </button>
                    )}
                    <button onClick={onClose} aria-label="Kapat" className="p-2 rounded-full bg-black/60 border border-amber-500/30 text-amber-400 hover:text-white">
                        <X size={22} />
                    </button>
                </div>
            </div>

            {panoramas.length > 1 && (
                <>
                    {!battle.on && (
                    <>
                    <button onClick={() => go(-1)} aria-label="Önceki" className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-amber-500/30 text-amber-400 hover:text-white">
                        <ChevronLeft size={24} />
                    </button>
                    <button onClick={() => go(1)} aria-label="Sonraki" className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-amber-500/30 text-amber-400 hover:text-white">
                        <ChevronRight size={24} />
                    </button>
                    </>
                    )}

                    {/* Küçük resim şeridi (savaşta alt kısım zarlarındır) */}
                    {!battle.on && (
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
                    )}
                </>
            )}
        </div>
    );
};

export default PanoramaViewer;
