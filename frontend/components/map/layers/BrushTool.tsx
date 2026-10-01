'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { from3D, SCALE_FACTOR, to3D, WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';

export type BrushKind = 'forest' | 'autumn' | 'clear';

interface Zone {
    x: number; // harita pikseli
    y: number;
    r: number;
    type: BrushKind;
}

const ZONE_COLOR: Record<BrushKind, string> = { forest: '#10b981', autumn: '#f59e0b', clear: '#ef4444' };

/**
 * Geliştirici aracı (?firca=1): orman bölgeleri boyar, JSON'u panoya kopyalar.
 * Çıktı tools/forest_zones.json'a yapıştırılıp `python tools/build_map_assets.py` ile haritaya işlenir.
 */
const BrushTool = () => {
    const { controls } = useThree();
    const [mode, setMode] = useState<BrushKind | null>(null);
    const [size, setSize] = useState(0.8);
    const [zones, setZones] = useState<Zone[]>([]);
    const [cursor, setCursor] = useState<[number, number] | null>(null);
    const down = useRef(false);

    useEffect(() => {
        const onMode = (e: Event) => setMode((e as CustomEvent<BrushKind | null>).detail);
        const onSize = (e: Event) => setSize((e as CustomEvent<number>).detail);
        const onClear = () => setZones([]);
        window.addEventListener('set-paint-mode', onMode);
        window.addEventListener('set-brush-size', onSize);
        window.addEventListener('clear-zones', onClear);
        return () => {
            window.removeEventListener('set-paint-mode', onMode);
            window.removeEventListener('set-brush-size', onSize);
            window.removeEventListener('clear-zones', onClear);
        };
    }, []);

    useEffect(() => {
        const onCopy = async () => {
            const text = JSON.stringify(zones, null, 1);
            try {
                await navigator.clipboard.writeText(text);
                window.dispatchEvent(new CustomEvent('brush-status', { detail: `${zones.length} bölge panoya kopyalandı` }));
            } catch {
                window.dispatchEvent(new CustomEvent('brush-status', { detail: 'Panoya kopyalanamadı (tarayıcı izni)' }));
            }
        };
        window.addEventListener('copy-zones', onCopy);
        return () => window.removeEventListener('copy-zones', onCopy);
    }, [zones]);

    // Boyarken kamera kilitli
    useEffect(() => {
        if (controls) (controls as unknown as { enabled: boolean }).enabled = mode === null;
    }, [mode, controls]);

    const add = (e: ThreeEvent<PointerEvent>) => {
        if (!mode) return;
        const [x, y] = from3D(e.point.x, e.point.z);
        const r = size * SCALE_FACTOR;
        setZones((prev) => {
            const last = prev[prev.length - 1];
            if (last && Math.hypot(last.x - x, last.y - y) < r * 0.25) return prev;
            return [...prev, { x: Math.round(x), y: Math.round(y), r: Math.round(r), type: mode }];
        });
    };

    if (!mode && zones.length === 0) return null;

    return (
        <group>
            <mesh
                position={[0, 1.4, 0]}
                rotation={[-Math.PI / 2, 0, 0]}
                visible={false}
                onPointerDown={(e) => {
                    if (!mode) return;
                    e.stopPropagation();
                    down.current = true;
                    add(e);
                }}
                onPointerMove={(e) => {
                    if (!mode) return;
                    setCursor([e.point.x, e.point.z]);
                    if (down.current) add(e);
                }}
                onPointerUp={() => (down.current = false)}
                onPointerOut={() => {
                    down.current = false;
                    setCursor(null);
                }}
            >
                <planeGeometry args={[WORLD_WIDTH, WORLD_HEIGHT]} />
            </mesh>
            {cursor && mode && (
                <mesh position={[cursor[0], 1.41, cursor[1]]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[size * 0.92, size, 32]} />
                    <meshBasicMaterial color={ZONE_COLOR[mode]} transparent opacity={0.9} depthTest={false} />
                </mesh>
            )}
            {zones.map((z, i) => (
                <mesh
                    key={i}
                    position={[to3D(z.x, z.y)[0], 1.4, to3D(z.x, z.y)[2]]}
                    rotation={[-Math.PI / 2, 0, 0]}
                >
                    <circleGeometry args={[z.r / SCALE_FACTOR, 20]} />
                    <meshBasicMaterial color={ZONE_COLOR[z.type]} transparent opacity={0.25} depthWrite={false} depthTest={false} />
                </mesh>
            ))}
        </group>
    );
};

export default BrushTool;
