'use client';

import React, { useState } from 'react';
import { Crosshair, Link2, LocateFixed, Trash2, X } from 'lucide-react';
import { encodePins, NOTE_MAX, PIN_KINDS, pinStore, TITLE_MAX, usePins } from '../map/pinStore';
import { PIN_META } from '../map/pinKinds';
import { KM_PER_PIXEL } from '../map/utils/coords';

export const flyTo = (x: number, y: number) => window.dispatchEvent(new CustomEvent('velutan:fly', { detail: { x, y } }));

/** Lejant panelinin "İşaretler" sekmesi: kişisel yer işaretleri, notlar ve paylaşım. */
export default function PinsTab() {
    const { pins, placing, activeId } = usePins();
    const active = pins.find((p) => p.id === activeId) ?? null;
    const [copied, setCopied] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const share = async () => {
        const url = `${window.location.origin}/?isaretler=${encodePins(pins)}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2200);
        } catch {
            window.prompt('Bağlantıyı kopyalayın:', url);
        }
    };

    // Seçili işarete en yakın diğer işaret (yolculuk planlarken işe yarar)
    let nearest: { title: string; km: number } | null = null;
    if (active) {
        for (const p of pins) {
            if (p.id === active.id) continue;
            const km = Math.hypot(p.x - active.x, p.y - active.y) * KM_PER_PIXEL;
            if (!nearest || km < nearest.km) nearest = { title: p.title || PIN_META[p.kind].label, km };
        }
    }

    return (
        <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-left duration-300">
            <div className="flex flex-col gap-1">
                <span className="text-[12px] font-bold tracking-[0.3em] text-amber-500/60 uppercase">Seyyah Defteri</span>
                <h3 className="text-xl font-serif font-black text-amber-400 tracking-wide">Yer İşaretlerim</h3>
                <p className="text-[12px] text-zinc-500 italic leading-snug">Kampını, hazineni, notunu haritaya iğnele. Yalnızca bu tarayıcıda saklanır.</p>
            </div>

            <button
                onClick={() => pinStore.setPlacing(!placing)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-black uppercase tracking-[0.18em] text-[12px] transition-all ${placing ? 'border-amber-400 bg-amber-500/15 text-amber-300 animate-pulse' : 'border-amber-600/30 text-amber-500 hover:border-amber-500 hover:bg-amber-600/10'}`}
            >
                <Crosshair size={15} /> {placing ? 'Haritaya tıkla… (iptal)' : 'İşaret Bırak'}
            </button>

            {active && (
                <div className="flex flex-col gap-3 bg-black/40 p-4 rounded-xl border border-amber-600/25">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] uppercase tracking-[0.25em] text-amber-600/70 font-black">İşaret</span>
                        <button onClick={() => pinStore.open(null)} className="text-zinc-500 hover:text-amber-400" aria-label="Kapat">
                            <X size={15} />
                        </button>
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                        {PIN_KINDS.map((k) => {
                            const m = PIN_META[k];
                            const Icon = m.icon;
                            const on = active.kind === k;
                            return (
                                <button
                                    key={k}
                                    title={m.label}
                                    onClick={() => pinStore.update(active.id, { kind: k })}
                                    className={`aspect-square flex items-center justify-center rounded-lg border transition-colors ${on ? 'bg-amber-600/15' : 'border-white/5 hover:border-amber-600/30'}`}
                                    style={on ? { borderColor: m.color } : undefined}
                                >
                                    <Icon size={15} color={on ? m.color : '#8a7f6a'} />
                                </button>
                            );
                        })}
                    </div>
                    <input
                        value={active.title}
                        maxLength={TITLE_MAX}
                        onChange={(e) => pinStore.update(active.id, { title: e.target.value })}
                        placeholder={`${PIN_META[active.kind].label} — ad ver`}
                        className="bg-black/50 border border-amber-600/20 rounded-lg px-3 py-2 text-sm font-serif text-amber-50 placeholder:text-zinc-600 outline-none focus:border-amber-500/60"
                    />
                    <textarea
                        value={active.note}
                        maxLength={NOTE_MAX}
                        onChange={(e) => pinStore.update(active.id, { note: e.target.value })}
                        placeholder="Not düş: kim, ne zaman, neden…"
                        rows={3}
                        className="bg-black/50 border border-amber-600/20 rounded-lg px-3 py-2 text-[13px] font-serif italic text-amber-50/90 placeholder:text-zinc-600 outline-none focus:border-amber-500/60 resize-none"
                    />
                    {nearest && (
                        <p className="text-[12px] text-zinc-500 italic">
                            En yakın işaret: <span className="text-amber-200/80 not-italic">{nearest.title}</span> · {Math.round(nearest.km)} km
                        </p>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={() => flyTo(active.x, active.y)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-amber-600/30 text-amber-500 text-[12px] font-bold uppercase tracking-widest hover:bg-amber-600/10"
                        >
                            <LocateFixed size={13} /> Git
                        </button>
                        <button onClick={() => pinStore.remove(active.id)} className="px-3 rounded-lg border border-red-900/40 text-red-400/70 hover:text-red-400" aria-label="Sil">
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-1.5">
                {pins.length === 0 && <p className="text-[13px] text-zinc-600 italic">Defter boş. İlk işaretini bırak.</p>}
                {pins.map((p) => {
                    const m = PIN_META[p.kind];
                    const Icon = m.icon;
                    return (
                        <button
                            key={p.id}
                            onClick={() => {
                                pinStore.open(p.id);
                                flyTo(p.x, p.y);
                            }}
                            className={`flex items-center gap-3 p-2 rounded-lg text-left border transition-colors ${p.id === activeId ? 'bg-amber-600/15 border-amber-600/40' : 'border-transparent hover:bg-white/5'}`}
                        >
                            <Icon size={15} color={m.color} className="shrink-0" />
                            <span className="text-[13px] font-serif text-amber-50/90 truncate">{p.title || m.label}</span>
                        </button>
                    );
                })}
            </div>

            {pins.length > 0 && (
                <div className="flex gap-2 pt-3 border-t border-amber-600/10">
                    <button
                        onClick={share}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-600/15 border border-amber-600/30 text-amber-400 text-[12px] font-bold uppercase tracking-widest hover:bg-amber-600/25"
                    >
                        <Link2 size={13} /> {copied ? 'Kopyalandı' : 'Paylaş'}
                    </button>
                    <button
                        onClick={() => {
                            if (!confirmClear) {
                                setConfirmClear(true);
                                setTimeout(() => setConfirmClear(false), 3000);
                                return;
                            }
                            pinStore.clear();
                            setConfirmClear(false);
                        }}
                        className={`px-3 rounded-lg border text-[11px] font-bold uppercase tracking-widest ${confirmClear ? 'border-red-500 text-red-400' : 'border-white/10 text-zinc-500 hover:text-red-400'}`}
                    >
                        {confirmClear ? 'Emin misin?' : 'Temizle'}
                    </button>
                </div>
            )}
        </div>
    );
}
