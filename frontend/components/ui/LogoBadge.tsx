'use client';

import React from 'react';
import { useCameraState } from '../map/cameraStore';

/** Üst ortadaki logo: yakınlaştıkça küçülür. Yalnızca kendisi re-render olur. */
export default function LogoBadge() {
    // 0.05'lik adımlarla: her küçük zoom değişiminde render olmasın
    const scale = useCameraState((s) => Math.round(Math.max(0.7, 1 / (1 + (s.zoom - 1) * 0.4)) * 20) / 20);
    return (
        <div
            className="absolute top-3 md:top-10 left-1/2 flex flex-col items-center pointer-events-none transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Velutan" fetchPriority="high" decoding="async" width={128} height={103} className="w-16 md:w-32 object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,1)] opacity-90" />
            <div className="hidden md:flex items-center gap-6 mt-2 opacity-80">
                <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
                <p className="text-amber-100/70 font-bold tracking-[0.5em] uppercase text-[13px] whitespace-nowrap">Kayıp Dünyanın Kronikleri</p>
                <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
            </div>
        </div>
    );
}
