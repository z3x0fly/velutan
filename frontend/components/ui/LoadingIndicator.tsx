'use client';

import React, { useEffect, useState } from 'react';
import { useLoadState } from '../map/loadStore';

/**
 * Harita dokuları inerken görünen ilerleme göstergesi. Yavaş bağlantıda ya da zayıf cihazda
 * kullanıcı boş/siyah bir ekran yerine ne olduğunu görür.
 */
export default function LoadingIndicator() {
    const { active, progress } = useLoadState();
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (active) {
            setVisible(true);
            return;
        }
        const t = setTimeout(() => setVisible(false), 400);
        return () => clearTimeout(t);
    }, [active]);

    if (!visible) return null;
    const pct = Math.round(progress);
    return (
        <div
            role="status"
            aria-live="polite"
            className={`pointer-events-none absolute bottom-24 left-1/2 z-40 -translate-x-1/2 transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`}
        >
            <div className="flex items-center gap-3 rounded-full border border-amber-600/40 bg-black/85 px-5 py-2 shadow-xl">
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-amber-900/40">
                    <div className="h-full bg-amber-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </div>
                <span className="font-serif text-sm text-amber-100/90">Harita yükleniyor… %{pct}</span>
            </div>
        </div>
    );
}
