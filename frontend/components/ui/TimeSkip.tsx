'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Hourglass, Moon, RotateCcw, Sun, X } from 'lucide-react';
import { dayStore, fmtHour } from '../map/dayStore';
import { skyClock } from '../map/skyClock';
import { MOON_PHASE_NAME } from '../map/astro';

const useDay = () => useSyncExternalStore(dayStore.subscribe, dayStore.get, dayStore.get);
const useSkipping = () => useSyncExternalStore(skyClock.subscribe, skyClock.skipping, () => false);

const SEASON = (doyMonth: number) => (doyMonth < 2 || doyMonth === 11 ? 'Kış' : doyMonth < 5 ? 'İlkbahar' : doyMonth < 8 ? 'Yaz' : 'Sonbahar');

/** Kadran üstündeki açı (derece, 0 = gece yarısı aşağıda, öğle yukarıda) -> saat */
const angleToHour = (a: number) => (((a / 15) + 12) % 24 + 24) % 24;
const hourToAngle = (h: number) => ((h - 12) * 15 + 360) % 360;

/**
 * Zaman atlatma (Witcher'daki meditasyon gibi): kadranda hedef saati seç, "Bekle": zaman hızla akar; güneş, ay,
 * gece-gündüz gözünün önünde değişir. Günler, haftalar, aylar da atlatılabilir (ay evresi, mevsim, gün uzunluğu
 * değişir). Altta eğitici bilgiler: güneşin yüksekliği, gün uzunluğu, ay evresi, mevsim.
 */
export default function TimeSkip() {
    const [open, setOpen] = useState(false);
    const d = useDay();
    const skipping = useSkipping();
    const [target, setTarget] = useState<number | null>(null);
    const dial = useRef<SVGSVGElement>(null);
    const dragging = useRef(false);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const pick = (e: React.PointerEvent) => {
        const r = dial.current?.getBoundingClientRect();
        if (!r) return;
        const x = e.clientX - (r.left + r.width / 2);
        const y = e.clientY - (r.top + r.height / 2);
        // Yukarı = öğle (12:00), saat yönünde ilerler
        const a = (Math.atan2(x, -y) * 180) / Math.PI;
        setTarget(Math.round(angleToHour(a) * 4) / 4);
    };

    const hoursUntil = (h: number) => {
        const diff = (((h - d.hour) % 24) + 24) % 24;
        return diff < 0.05 ? 24 : diff;
    };
    const wait = (hours: number) => {
        skyClock.advance(hours);
        setTarget(null);
    };

    const cur = hourToAngle(d.hour);
    const tgt = target !== null ? hourToAngle(target) : null;
    const pt = (angle: number, r: number) => {
        const a = (angle * Math.PI) / 180;
        return [100 + Math.sin(a) * r, 100 - Math.cos(a) * r];
    };
    const [sx, sy] = pt(cur, 70);
    const month = new Date(Date.now() + skyClock.offset() * 3600000).getMonth();
    const offsetDays = skyClock.offset() / 24;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                title="Zamanı atlat (meditasyon)"
                aria-label="Zamanı atlat"
                className="flex h-9 items-center gap-1.5 rounded-full border border-amber-600/40 bg-black/70 px-3 text-[12px] font-bold text-amber-200 hover:border-amber-400"
            >
                <Hourglass size={14} className={skipping ? 'animate-spin text-amber-300' : 'text-amber-400'} />
                <span className="hidden md:inline">Zaman</span>
            </button>
            {open &&
                createPortal(
                    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/55 p-3" onClick={() => setOpen(false)}>
                        <section onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Zamanı atlat" className="vl-leather relative w-full max-w-sm rounded-2xl p-5 text-amber-50">
                            <button onClick={() => setOpen(false)} aria-label="Kapat" className="absolute right-3 top-3 text-[#c9a35a]/70 hover:text-[#f1dca6]">
                                <X size={18} />
                            </button>
                            <div className="text-center">
                                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-[#c9a35a]/80">Meditasyon</div>
                                <h2 className="font-display text-2xl font-bold text-[#f1dca6]">Zamanı atlat</h2>
                            </div>

                            <svg
                                ref={dial}
                                viewBox="0 0 200 200"
                                className="mx-auto mt-3 block h-56 w-56 cursor-pointer touch-none select-none"
                                onPointerDown={(e) => {
                                    dragging.current = true;
                                    (e.target as Element).setPointerCapture?.(e.pointerId);
                                    pick(e);
                                }}
                                onPointerMove={(e) => dragging.current && pick(e)}
                                onPointerUp={() => (dragging.current = false)}
                            >
                                <defs>
                                    <linearGradient id="skygr" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0" stopColor="#f7c46a" stopOpacity="0.35" />
                                        <stop offset="0.5" stopColor="#c46a3a" stopOpacity="0.25" />
                                        <stop offset="1" stopColor="#1d2a52" stopOpacity="0.55" />
                                    </linearGradient>
                                </defs>
                                <circle cx="100" cy="100" r="88" fill="url(#skygr)" stroke="#c9a35a" strokeOpacity="0.5" />
                                {Array.from({ length: 24 }, (_, h) => {
                                    const [x1, y1] = pt(hourToAngle(h), h % 6 === 0 ? 74 : 80);
                                    const [x2, y2] = pt(hourToAngle(h), 86);
                                    return <line key={h} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f1dca6" strokeOpacity={h % 6 === 0 ? 0.8 : 0.35} strokeWidth={h % 6 === 0 ? 2 : 1} />;
                                })}
                                {[0, 6, 12, 18].map((h) => {
                                    const [x, y] = pt(hourToAngle(h), 62);
                                    return (
                                        <text key={h} x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="#f1dca6" fillOpacity="0.75" fontWeight="bold">
                                            {String(h).padStart(2, '0')}
                                        </text>
                                    );
                                })}
                                {tgt !== null && (
                                    <path
                                        d={`M ${sx} ${sy} A 70 70 0 ${((tgt - cur + 360) % 360) > 180 ? 1 : 0} 1 ${pt(tgt, 70)[0]} ${pt(tgt, 70)[1]}`}
                                        fill="none"
                                        stroke="#f7c46a"
                                        strokeWidth="4"
                                        strokeLinecap="round"
                                        strokeOpacity="0.8"
                                    />
                                )}
                                {/* Şimdi: güneş ya da ay */}
                                <circle cx={sx} cy={sy} r="9" fill={d.sunElevation > -6 ? '#f7c46a' : '#c9d6f5'} stroke="#000" strokeOpacity="0.4" />
                                {tgt !== null && <circle cx={pt(tgt, 70)[0]} cy={pt(tgt, 70)[1]} r="7" fill="#fff" stroke="#f7c46a" strokeWidth="2" />}
                                <text x="100" y="98" textAnchor="middle" fontSize="20" fill="#f6e3b4" fontWeight="bold" fontFamily="monospace">
                                    {fmtHour(d.hour)}
                                </text>
                                <text x="100" y="116" textAnchor="middle" fontSize="10" fill="#f1dca6" fillOpacity="0.7">
                                    {target !== null ? `→ ${fmtHour(target)}` : 'hedef saati seç'}
                                </text>
                            </svg>

                            <div className="mt-2 grid grid-cols-4 gap-1.5 text-[11px] font-bold">
                                {[
                                    ['Şafak', 6],
                                    ['Öğle', 12],
                                    ['Akşam', 19],
                                    ['Gece', 0],
                                ].map(([l, h]) => (
                                    <button key={l} onClick={() => wait(hoursUntil(h as number))} disabled={skipping} className="rounded-md border border-[#c9a35a]/35 bg-black/30 py-1.5 hover:border-[#e2c178] disabled:opacity-40">
                                        {l}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-[11px] font-bold">
                                {[
                                    ['+1 gün', 24],
                                    ['+1 hafta', 24 * 7],
                                    ['+1 ay', 24 * 30],
                                    ['+3 ay', 24 * 91],
                                ].map(([l, h]) => (
                                    <button key={l} onClick={() => wait(h as number)} disabled={skipping} className="rounded-md border border-[#c9a35a]/25 bg-black/20 py-1.5 text-amber-100/80 hover:border-[#e2c178] disabled:opacity-40">
                                        {l}
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => target !== null && wait(hoursUntil(target))}
                                disabled={target === null || skipping}
                                className="vl-seal mt-3 w-full rounded-md py-2.5 font-display text-[15px] font-bold tracking-[0.12em] disabled:opacity-40"
                            >
                                {skipping ? 'Zaman akıyor…' : target !== null ? `Bekle (${hoursUntil(target).toFixed(1).replace('.0', '')} saat)` : 'Bekle'}
                            </button>

                            {/* Eğitici bilgiler */}
                            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-[#c9a35a]/20 pt-3 text-[11.5px]">
                                <dt className="flex items-center gap-1 text-amber-100/55">
                                    <Sun size={12} /> Güneş
                                </dt>
                                <dd className="text-right">{d.sunElevation > 0 ? `ufkun ${d.sunElevation.toFixed(0)}° üstünde` : `ufkun ${(-d.sunElevation).toFixed(0)}° altında`}</dd>
                                <dt className="text-amber-100/55">Gün uzunluğu</dt>
                                <dd className="text-right">
                                    {Math.floor(d.dayLength)} sa {Math.round((d.dayLength % 1) * 60)} dk
                                </dd>
                                <dt className="flex items-center gap-1 text-amber-100/55">
                                    <Moon size={12} /> Ay
                                </dt>
                                <dd className="text-right">
                                    {MOON_PHASE_NAME(d.moonPhase)} (%{Math.round(((1 - Math.cos(d.moonPhase * 2 * Math.PI)) / 2) * 100)})
                                </dd>
                                <dt className="text-amber-100/55">Mevsim</dt>
                                <dd className="text-right">{SEASON(month)}</dd>
                            </dl>
                            <p className="mt-2 text-[10.5px] leading-snug text-amber-100/40">
                                Gün uzunluğu enleme ve mevsime göre değişir (eksen eğikliği 23,44°). Ay 29,5 günde bir dolunay olur. Saat, haritada baktığın yerin yerel saatidir.
                            </p>
                            {Math.abs(offsetDays) > 0.01 && (
                                <button onClick={() => skyClock.reset()} className="mt-2 flex w-full items-center justify-center gap-1.5 text-[11px] text-[#c9a35a] hover:text-[#f1dca6]">
                                    <RotateCcw size={12} /> Gerçek zamana dön ({offsetDays >= 1 ? `${Math.round(offsetDays)} gün ileride` : `${Math.round(offsetDays * 24)} saat ileride`})
                                </button>
                            )}
                        </section>
                    </div>,
                    document.body,
                )}
        </>
    );
}
