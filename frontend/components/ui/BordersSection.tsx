'use client';

import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { centroid, TERRITORY_KIND_LABEL, territoryStore, useTerritories } from '../map/territoryStore';
import { flyTo } from './PinsTab';

/** Lejant: panelden çizilen sınırlar. Göster/gizle, üzerine gelince haritada vurgula, tıklayınca oraya uç. */
export default function BordersSection() {
    const { list, visible, focusId } = useTerritories();
    if (!list.length) return null;
    return (
        <div className="flex flex-col gap-2 pt-4 border-t border-amber-500/10">
            <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold tracking-[0.3em] text-amber-500/60 uppercase">Sınırlar</span>
                <button
                    onClick={() => territoryStore.setVisible(!visible)}
                    className="flex items-center gap-1.5 text-[11px] uppercase font-bold tracking-widest text-amber-500/70 hover:text-amber-400"
                >
                    {visible ? <Eye size={13} /> : <EyeOff size={13} />} {visible ? 'Açık' : 'Kapalı'}
                </button>
            </div>
            {visible && (
                <div className="flex flex-col gap-1">
                    {list.map((t) => (
                        <button
                            key={t.id}
                            onMouseEnter={() => territoryStore.focus(t.id)}
                            onMouseLeave={() => territoryStore.focus(null)}
                            onClick={() => {
                                const [x, y] = centroid(t.points);
                                flyTo(x, y);
                            }}
                            title={t.note || undefined}
                            className={`flex items-center gap-3 p-1.5 rounded-lg text-left transition-colors ${focusId === t.id ? 'bg-white/5' : ''}`}
                        >
                            <span className="w-4 h-3 rounded-[2px] shrink-0 border" style={{ background: `${t.color}40`, borderColor: t.color }} />
                            <span className="text-[13px] font-bold uppercase tracking-widest text-zinc-400 truncate">{t.name}</span>
                            <span className="ml-auto text-[11px] italic text-zinc-600 shrink-0">{TERRITORY_KIND_LABEL[t.kind] ?? ''}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
