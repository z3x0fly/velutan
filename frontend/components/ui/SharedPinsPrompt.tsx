'use client';

import React, { useEffect, useState } from 'react';
import { MapPinned } from 'lucide-react';
import { decodePins, Pin, pinStore } from '../map/pinStore';

/** ?isaretler=... ile gelen paylaşılmış işaretler: sormadan deftere yazılmaz. */
export default function SharedPinsPrompt() {
    const [incoming, setIncoming] = useState<Pin[]>([]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('isaretler');
        if (!code) return;
        setIncoming(decodePins(code));
        // Adres çubuğunu temizle: yenileyince tekrar sorulmasın
        params.delete('isaretler');
        const q = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
    }, []);

    if (!incoming.length) return null;
    const close = () => setIncoming([]);
    return (
        <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[9000] pointer-events-auto animate-in fade-in slide-in-from-top duration-500">
            <div className="vl-leather flex items-center gap-4 rounded-xl border-2 border-amber-600/40 px-5 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.7)]">
                <MapPinned size={20} className="text-amber-400 shrink-0" />
                <p className="font-serif text-[14px] text-amber-50">
                    Biri seninle <b className="text-amber-300">{incoming.length}</b> yer işareti paylaştı.
                </p>
                <button
                    onClick={() => {
                        pinStore.importPins(incoming);
                        close();
                    }}
                    className="rounded-lg bg-amber-600/25 border border-amber-500/50 px-3 py-1.5 text-[12px] font-black uppercase tracking-widest text-amber-300 hover:bg-amber-600/40"
                >
                    Deftere ekle
                </button>
                <button onClick={close} className="text-[12px] uppercase tracking-widest text-zinc-500 hover:text-zinc-300">
                    Yoksay
                </button>
            </div>
        </div>
    );
}
