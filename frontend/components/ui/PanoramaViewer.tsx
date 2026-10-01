'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { mediaUrl } from '../map/media';
import type { Panorama } from '../map/types';

const MIN_FOV = 30;
const MAX_FOV = 95;

/** Velutanmap.com'dan içe aktarılan panoramalar seed klasöründe tutulur */
const isFromVelutanmap = (p: Panorama) => p.image.startsWith('/static/panoramas/seed/');

/**
 * Eşdikdörtgen (equirectangular) görseli kürenin içine giydirir. Sürükleyerek bakılır, tekerlekle FOV değişir.
 * Dokular önbelleğe alınmaz: panoramalar arasında gezinirken eskisi GPU'dan atılır.
 */
const Sphere = ({ url, yaw, pitch, onLoaded, onError }: { url: string; yaw: number; pitch: number; onLoaded: () => void; onError: () => void }) => {
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
            if (!drag) return;
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
    }, [camera, gl]);

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

    const go = useCallback(
        (d: number) => onIndexChange((index + d + panoramas.length) % panoramas.length),
        [index, panoramas.length, onIndexChange],
    );

    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') go(1);
            if (e.key === 'ArrowLeft') go(-1);
        };
        window.addEventListener('keydown', key);
        return () => window.removeEventListener('keydown', key);
    }, [go, onClose]);

    if (!pano || !url) return null;

    return (
        <div className="fixed inset-0 z-[12000] bg-black pointer-events-auto select-none" role="dialog" aria-label={`${pano.title} 360° görünüm`}>
            <Canvas flat dpr={[1, 1.75]} camera={{ fov: 75, near: 0.1, far: 200, position: [0, 0, 0] }} style={{ cursor: 'grab' }}>
                <Sphere
                    url={url}
                    yaw={pano.initial_yaw}
                    pitch={pano.initial_pitch}
                    onLoaded={() => setStatus('ready')}
                    onError={() => setStatus('error')}
                />
            </Canvas>

            {status !== 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="font-serif italic text-amber-100/80">{status === 'error' ? 'Panorama yüklenemedi' : 'Panorama yükleniyor…'}</span>
                </div>
            )}

            {/* Üst bar */}
            <div className="absolute top-0 inset-x-0 flex items-start justify-between p-4 md:p-6 bg-gradient-to-b from-black/80 to-transparent">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500/70">{regionName} · 360°</div>
                    <h3 className="font-serif text-2xl md:text-3xl font-black text-amber-50">{pano.title}</h3>
                    <div className="text-[11px] text-amber-100/50 mt-1">
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
                <button onClick={onClose} aria-label="Kapat" className="p-2 rounded-full bg-black/60 border border-amber-500/30 text-amber-400 hover:text-white">
                    <X size={22} />
                </button>
            </div>

            {panoramas.length > 1 && (
                <>
                    <button onClick={() => go(-1)} aria-label="Önceki" className="absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-amber-500/30 text-amber-400 hover:text-white">
                        <ChevronLeft size={24} />
                    </button>
                    <button onClick={() => go(1)} aria-label="Sonraki" className="absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 border border-amber-500/30 text-amber-400 hover:text-white">
                        <ChevronRight size={24} />
                    </button>

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
                                    <div className="bg-black/80 text-[10px] text-amber-50 px-1 py-0.5 truncate">{p.title}</div>
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
