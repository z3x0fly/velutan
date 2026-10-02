'use client';

import React, { useEffect, useMemo } from 'react';
import { Html } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { to3D } from './utils/coords';
import GroundPicker from './GroundPicker';
import { useHeightField } from './useHeightField';
import { Pin, pinStore, usePins } from './pinStore';
import { PIN_META } from './pinKinds';

/** Tek işaret: mühür biçimli rozet + başlık. Tıklayınca yan panelde düzenlenir. */
const PinItem = React.memo(function PinItem({ pin, y, active }: { pin: Pin; y: number; active: boolean }) {
    const [x, , z] = to3D(pin.x, pin.y);
    const meta = PIN_META[pin.kind];
    const Icon = meta.icon;
    return (
        <Html position={[x, y + 0.2, z]} center zIndexRange={[45, 0]} style={{ pointerEvents: 'none' }}>
            <button
                type="button"
                aria-label={pin.title || meta.label}
                onClick={(e) => {
                    e.stopPropagation();
                    pinStore.open(active ? null : pin.id);
                }}
                className="vl-marker pointer-events-auto group flex flex-col items-center cursor-pointer select-none"
            >
                <span
                    className={`vl-pin flex items-center justify-center w-7 h-7 rotate-45 rounded-[50%_50%_50%_4px] border-2 transition-transform group-hover:scale-110 ${active ? 'scale-125' : ''}`}
                    style={{ borderColor: meta.color, background: 'radial-gradient(circle at 35% 30%, #2b2117, #0c0805)' }}
                >
                    <Icon size={13} color={meta.color} strokeWidth={2.4} className="-rotate-45" />
                </span>
                {pin.title && (
                    <span className="mt-1.5 max-w-[160px] truncate rounded px-2 py-0.5 font-serif text-[12px] italic text-amber-50 shadow" style={{ background: 'rgba(10,7,4,0.82)' }}>
                        {pin.title}
                    </span>
                )}
            </button>
        </Html>
    );
});

/** Ziyaretçinin kendi işaretleri ve "işaret bırak" modu (haritaya tık = yeni işaret). */
const PersonalPins = () => {
    const { pins, placing, activeId } = usePins();
    const field = useHeightField();
    const { invalidate } = useThree();

    useEffect(() => invalidate(), [pins, activeId, invalidate]);

    const heights = useMemo(
        () => pins.map((p) => {
            const [x, , z] = to3D(p.x, p.y);
            return Math.max(field?.sample(x, z) ?? 0, 0);
        }),
        [pins, field],
    );

    return (
        <group>
            {pins.map((p, i) => (
                <PinItem key={p.id} pin={p} y={heights[i]} active={p.id === activeId} />
            ))}
            {placing && <GroundPicker onPick={(x, y) => pinStore.add(x, y)} />}
        </group>
    );
};

export default PersonalPins;
