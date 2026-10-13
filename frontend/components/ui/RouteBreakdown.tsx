'use client';

import React from 'react';
import { GROUND_COLOR, GROUND_LABEL, Ground, RouteAnalysis } from '../map/travelAnalysis';

const ORDER: Ground[] = ['plain', 'forest', 'mud', 'rough', 'marsh', 'mountain', 'water'];

/** Rotanın geçtiği zeminler: oranlı şerit + km dökümü (haritadaki çizgi renkleriyle aynı) */
export default function RouteBreakdown({ route }: { route: RouteAnalysis | null }) {
    if (!route || route.km < 1) {
        return <p className="text-[12px] italic text-zinc-500">Haritaya tıklayarak durak ekle; arazi rotadan otomatik okunur.</p>;
    }
    const parts = ORDER.filter((g) => route.byGround[g] >= 0.5);
    return (
        <div className="flex flex-col gap-2">
            <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-black/40">
                {parts.map((g) => (
                    <div key={g} style={{ width: `${(route.byGround[g] / route.km) * 100}%`, background: GROUND_COLOR[g] }} />
                ))}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {parts.map((g) => (
                    <div key={g} className="flex items-center gap-2 text-[12px]">
                        <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: GROUND_COLOR[g] }} />
                        <span className="text-zinc-400 font-serif">{GROUND_LABEL[g]}</span>
                        <span className="ml-auto font-bold text-amber-100/80 tabular-nums">{Math.round(route.byGround[g])} km</span>
                    </div>
                ))}
            </div>
            {route.season && (
                <p className="text-[11px] leading-snug text-zinc-500">
                    {route.byGround.mud >= 0.5
                        ? `Mevsim ${route.season}: toprak ıslak (%${Math.round(route.wetness * 100)}), suya yakın alçak yerler çamur. `
                        : `Mevsim ${route.season}: toprak ${route.wetness < 0.3 ? 'kuru' : 'nemli'}, yolda çamur yok. `}
                    İlkbaharda kar erir, sonbaharda yağmur yağar: zamanı atlatırsan değişir.
                </p>
            )}
            {route.roadKm >= 1 && (
                <div className="flex items-center gap-2 text-[12px]">
                    <span className="h-0 w-2.5 shrink-0 border-t-2 border-dotted border-amber-200/80" />
                    <span className="text-zinc-400 font-serif">Yol üzerinde</span>
                    <span className="ml-auto font-bold text-amber-100/80 tabular-nums">{Math.round(route.roadKm)} km</span>
                </div>
            )}
        </div>
    );
}
