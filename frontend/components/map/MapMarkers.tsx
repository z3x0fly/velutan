'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { to3D } from './utils/coords';
import { useHeightField } from './useHeightField';
import { markerStyle } from './markerStyle';
import type { Region } from './types';

interface MapMarkersProps {
    regions: Region[];
    onRegionClick?: (region: Region) => void;
}

interface Placed {
    region: Region;
    pos: THREE.Vector3;
    showWithin: number;
    priority: number;
}

// Çakışmada önde kalma sırası
const PRIORITY: Record<string, number> = { capital: 0, fortress: 1, city: 2, ruin: 3, landmark: 4, lore: 5, event: 6, character: 7 };

/**
 * Tek işaretçi. Üzerine gelme vurgusu yalnızca CSS ile yapılır: React state'i değişse drei Html
 * içeriğini yeniden render eder ve işaretçi üstünde zoom yaparken takılma olur.
 */
const MarkerItem = React.memo(function MarkerItem({
    placed,
    onClick,
    elRef,
}: {
    placed: Placed;
    onClick?: (r: Region) => void;
    elRef: (el: HTMLDivElement | null) => void;
}) {
    const style = markerStyle(placed.region.type);
    const Icon = style.icon;
    const major = placed.region.type === 'capital';

    return (
        <group position={placed.pos}>
            {/* Zemine düşen ışık halkası */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
                <ringGeometry args={[0.07, 0.13, 24]} />
                <meshBasicMaterial color={style.color} transparent opacity={0.6} depthWrite={false} />
            </mesh>
            <Html position={[0, 0.25, 0]} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
                <div ref={elRef} className="flex flex-col items-center transition-opacity duration-300" style={{ opacity: 0 }}>
                    <button
                        type="button"
                        aria-label={placed.region.name}
                        onClick={(e) => {
                            e.stopPropagation();
                            onClick?.(placed.region);
                        }}
                        className="pointer-events-auto flex flex-col items-center gap-1 group cursor-pointer select-none"
                        style={{ ['--mc' as string]: style.color }}
                    >
                        <span
                            className={`flex items-center justify-center rounded-full border-2 shadow-[0_4px_14px_rgba(0,0,0,0.7)] transition-transform duration-200 group-hover:scale-125 ${major ? 'w-10 h-10' : 'w-8 h-8'}`}
                            style={{ background: 'radial-gradient(circle at 35% 30%, #2a2116, #0d0905)', borderColor: style.color }}
                        >
                            <Icon size={major ? 20 : 16} color={style.color} strokeWidth={2.2} />
                        </span>
                        <span
                            data-marker-name
                            className={`whitespace-nowrap rounded-full border border-[rgba(168,147,97,0.6)] px-3 py-0.5 transition-[opacity,border-color] group-hover:!opacity-100 group-hover:[border-color:var(--mc)] font-serif font-bold uppercase tracking-wider text-amber-50 shadow-lg ${major ? 'text-[14px]' : 'text-[12px]'}`}
                            style={{ background: 'rgba(10,7,4,0.85)' }}
                        >
                            {placed.region.name}
                        </span>
                    </button>
                </div>
            </Html>
        </group>
    );
});

const MapMarkers: React.FC<MapMarkersProps> = ({ regions, onRegionClick }) => {
    const field = useHeightField();
    const placed = useMemo<Placed[]>(
        () =>
            regions
                .filter((r) => Number.isFinite(r.x) && Number.isFinite(r.y))
                .map((region) => {
                    const [x, , z] = to3D(region.x, region.y);
                    const y = Math.max(field?.sample(x, z) ?? 0, 0);
                    return {
                        region,
                        pos: new THREE.Vector3(x, y, z),
                        showWithin: markerStyle(region.type).showWithin,
                        priority: PRIORITY[region.type ?? ''] ?? 9,
                    };
                })
                .sort((a, b) => a.priority - b.priority),
        [regions, field],
    );

    // Yalnızca değişince çizilen kademede: bölgeler/yükselti gelince görünürlük hesabı için bir kare iste
    const { invalidate } = useThree();
    useEffect(() => {
        invalidate();
    }, [placed, invalidate]);

    // Görünürlük + çakışma önleme: DOM'a doğrudan yazılır (React render'ı tetiklemez)
    const els = useRef<(HTMLDivElement | null)[]>([]);
    const refSetters = useMemo(
        () => placed.map((_, i) => (el: HTMLDivElement | null) => {
            els.current[i] = el;
        }),
        [placed],
    );
    const tmp = useMemo(() => new THREE.Vector3(), []);
    const lastRun = useRef(0);
    useFrame(({ camera, size, clock }) => {
        if (clock.elapsedTime - lastRun.current < 0.08) {
            invalidate(); // 'demand' modunda son durum mutlaka hesaplansın
            return;
        }
        lastRun.current = clock.elapsedTime;
        const boxes: [number, number, number, number][] = [];
        const icons: [number, number][] = [];
        for (let i = 0; i < placed.length; i++) {
            const el = els.current[i];
            if (!el) continue;
            const p = placed[i];
            let visible = tmp.copy(p.pos).distanceTo(camera.position) < p.showWithin;
            let showName = visible;
            if (visible) {
                tmp.project(camera);
                const sx = (tmp.x * 0.5 + 0.5) * size.width;
                const sy = (-tmp.y * 0.5 + 0.5) * size.height;
                // İkonlar birbirine çok yakınsa düşük öncelikliyi gizle
                if (icons.some(([ix, iy]) => Math.abs(ix - sx) < 22 && Math.abs(iy - sy) < 22)) visible = showName = false;
                else icons.push([sx, sy]);
                if (showName) {
                    const w = p.region.name.length * 9 + 28;
                    const box: [number, number, number, number] = [sx - w / 2, sy + 4, sx + w / 2, sy + 26];
                    if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) showName = false;
                    else boxes.push(box);
                }
            }
            const want = visible ? '1' : '0';
            if (el.style.opacity !== want) {
                el.style.opacity = want;
                el.style.visibility = visible ? 'visible' : 'hidden';
            }
            const name = el.querySelector<HTMLElement>('[data-marker-name]');
            if (name) {
                const nameWant = showName ? '1' : '0';
                if (name.style.opacity !== nameWant) name.style.opacity = nameWant;
            }
        }
    });

    return (
        <group>
            {placed.map((p, i) => (
                <MarkerItem key={p.region.id} placed={p} onClick={onRegionClick} elRef={refSetters[i]} />
            ))}
        </group>
    );
};

export default React.memo(MapMarkers);
