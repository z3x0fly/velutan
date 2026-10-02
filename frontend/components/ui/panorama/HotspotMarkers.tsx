'use client';

import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowUp, Info } from 'lucide-react';
import { Hotspot, yawToLon } from './hotspots';

/** Bakış yönü (lon/lat, derece) -> kürenin içinde bir nokta */
export function dirFromView(lon: number, lat: number, r = 40) {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lon);
    return new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

/**
 * Panoramadaki noktalar (velutanmap.com'daki gibi): geçiş noktası yukarı oklu halka, bilgi noktası "i" halkası.
 * Üzerine gelince ya da dokununca adı görünür; tıklayınca geçilir ya da wiki kaydı açılır.
 */
export default function HotspotMarkers({ hotspots, onPick }: { hotspots: Hotspot[]; onPick: (h: Hotspot) => void }) {
    const placed = useMemo(() => hotspots.map((h) => ({ h, pos: dirFromView(yawToLon(h.yaw), h.pitch) })), [hotspots]);
    return (
        <>
            {placed.map(({ h, pos }) => (
                <Html key={h.id} position={pos} center zIndexRange={[15, 0]}>
                    <button
                        onClick={() => onPick(h)}
                        aria-label={h.nav === 'jump' ? `${h.label}: oraya git` : `${h.label}: bilgi`}
                        className="group relative flex flex-col items-center"
                    >
                        <span className="pointer-events-none absolute bottom-full mb-2 whitespace-nowrap rounded-md border border-amber-500/30 bg-black/80 px-2.5 py-1 text-[12px] font-bold text-amber-50 shadow-lg backdrop-blur-sm transition-opacity md:opacity-80 md:group-hover:opacity-100">
                            {h.label}
                        </span>
                        <span
                            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-black/45 text-white shadow-[0_0_18px_rgba(0,0,0,0.6)] backdrop-blur-[2px] transition-transform duration-200 group-hover:scale-110 ${
                                h.nav === 'jump' ? 'border-white/85 group-hover:border-amber-300' : 'border-amber-300/90'
                            }`}
                        >
                            {h.nav === 'jump' ? <ArrowUp size={18} strokeWidth={2.5} /> : <Info size={18} strokeWidth={2.5} className="text-amber-200" />}
                        </span>
                        {/* Dikkat çeken nabız */}
                        <span className="pointer-events-none absolute bottom-0 h-10 w-10 animate-ping rounded-full border border-white/40 [animation-duration:2.4s]" />
                    </button>
                </Html>
            ))}
        </>
    );
}
