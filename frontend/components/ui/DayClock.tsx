'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { Moon, Sun, Sunrise } from 'lucide-react';
import { dayStore, fmtHour, sunElevation } from '../map/dayStore';

const useDay = () => useSyncExternalStore(dayStore.subscribe, dayStore.get, dayStore.get);

/** Gece: haritanın üstüne lacivert karartma; işaretler fener gibi parlar (html.map-night) */
export function NightOverlay() {
    const d = useDay();
    const night = d.active ? d.night : 0;
    useEffect(() => {
        document.documentElement.classList.toggle('map-night', night > 0.5);
        return () => document.documentElement.classList.remove('map-night');
    }, [night]);
    return (
        <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-700"
            style={{
                opacity: night * 0.75,
                mixBlendMode: 'multiply',
                background: 'radial-gradient(ellipse at 50% 40%, rgba(120,140,190,0.45) 0%, rgba(40,52,92,0.7) 70%, rgba(12,16,34,0.88) 100%)',
            }}
        />
    );
}

/** Saat göstergesi (gün döngüsü açıkken ya da seyahat simülasyonunda) */
export function DayClockBadge() {
    const d = useDay();
    if (!d.active) return null;
    const elev = sunElevation(d.hour);
    const Icon = elev > 0.2 ? Sun : elev > -0.15 ? Sunrise : Moon;
    return (
        <div className="flex items-center gap-1.5 rounded-full border border-amber-600/30 bg-black/70 px-3 py-1.5 text-[12px] font-bold text-amber-100/90 shadow-lg backdrop-blur-sm" title="Gün döngüsü">
            <Icon size={14} className={elev > -0.15 ? 'text-amber-400' : 'text-sky-300'} />
            {d.day !== null && <span className="text-amber-500/80">{d.day}. gün ·</span>}
            <span className="font-mono">{fmtHour(d.hour)}</span>
        </div>
    );
}
