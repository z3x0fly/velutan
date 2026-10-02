'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, GripHorizontal, Minus, Plus, X } from 'lucide-react';

/**
 * Zar Tepsisi: haritanın üstünde sürüklenebilen, FRP oturumları için zar paneli.
 * Velutan oturumları D&D 5e tabanlı (wiki karakter kartlarında Str/Dex/Con/Wis puanları, HP/MANA,
 * hizalama ve büyü seviyeleri): d20 merkezde, avantaj/dezavantaj ve yetenek puanından bonus (5e formülü).
 * Rastgelelik crypto.getRandomValues ile (adil, modulo yanlılığı yok).
 */

type Die = 4 | 6 | 8 | 10 | 12 | 20 | 100;
type Mode = 'normal' | 'advantage' | 'disadvantage';

const DICE: Die[] = [4, 6, 8, 10, 12, 20, 100];
const POS_KEY = 'velutan_dice_pos';

const SHAPES: Record<Die, string> = {
    4: '50,6 94,88 6,88',
    6: '12,12 88,12 88,88 12,88',
    8: '50,4 94,50 50,96 6,50',
    10: '50,4 92,40 50,96 8,40',
    12: '50,4 94,36 78,92 22,92 6,36',
    20: '50,3 92,27 92,73 50,97 8,73 8,27',
    100: '50,4 92,40 50,96 8,40',
};

interface Roll {
    id: number;
    die: Die;
    values: number[];
    dropped?: number;
    modifier: number;
    total: number;
    formula: string;
    crit?: 'crit' | 'fumble';
}

function rand(sides: number) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / sides) * sides;
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return (buf[0] % sides) + 1;
}

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

export function DieShape({ die, value, size = 72, rolling, tone }: { die: Die; value?: number | string; size?: number; rolling?: boolean; tone?: 'crit' | 'fumble' | 'dropped' | 'muted' }) {
    const stroke = tone === 'crit' ? '#facc15' : tone === 'fumble' ? '#f87171' : '#d6b36a';
    return (
        <div className={`relative shrink-0 ${rolling ? 'dice-rolling' : value !== undefined ? 'dice-land' : ''} ${tone === 'dropped' ? 'opacity-30' : ''}`} style={{ width: size, height: size }}>
            <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]">
                <polygon points={SHAPES[die]} fill={tone === 'muted' ? '#1a1209' : '#2b1e0e'} stroke={stroke} strokeWidth={tone === 'muted' ? 5 : 4} strokeLinejoin="round" />
                {die === 20 && <polygon points="50,3 72,48 28,48" fill="none" stroke={stroke} strokeOpacity=".3" strokeWidth="2" />}
            </svg>
            {value !== undefined && (
                <span
                    className={`absolute inset-0 flex items-center justify-center font-serif font-black ${tone === 'crit' ? 'text-yellow-300' : tone === 'fumble' ? 'text-red-400' : 'text-amber-50'}`}
                    style={{ fontSize: size * (String(value).length > 2 ? 0.26 : 0.34), paddingTop: die === 4 ? size * 0.18 : 0 }}
                >
                    {value}
                </span>
            )}
        </div>
    );
}

/** Panel köşelerindeki pirinç süsleme */
function Corner({ className }: { className: string }) {
    return (
        <svg viewBox="0 0 24 24" className={`pointer-events-none absolute h-6 w-6 text-[#c9a35a] ${className}`} aria-hidden>
            <path d="M2 22 V8 Q2 2 8 2 H22" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6 22 V10 Q6 6 10 6 H22" fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="1" />
            <circle cx="4.5" cy="4.5" r="1.6" fill="currentColor" />
        </svg>
    );
}

function Stepper({ label, value, onChange, min, max, format = String }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; format?: (v: number) => string }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="font-display text-[12px] tracking-wider text-[#c9a35a]">{label}</span>
            <div className="flex items-center justify-between rounded border border-[#c9a35a]/35 bg-black/45">
                <button aria-label={`${label} azalt`} onClick={() => onChange(Math.max(min, value - 1))} className="px-2.5 py-1.5 text-amber-400 hover:text-amber-200">
                    <Minus size={14} />
                </button>
                <span className="font-serif text-lg font-bold text-amber-50">{format(value)}</span>
                <button aria-label={`${label} artır`} onClick={() => onChange(Math.min(max, value + 1))} className="px-2.5 py-1.5 text-amber-400 hover:text-amber-200">
                    <Plus size={14} />
                </button>
            </div>
        </div>
    );
}

export default function DiceTray() {
    const [open, setOpen] = useState(false);
    const [die, setDie] = useState<Die>(20);
    const [count, setCount] = useState(1);
    const [modifier, setModifier] = useState(0);
    const [mode, setMode] = useState<Mode>('normal');
    const [showOptions, setShowOptions] = useState(false);
    const [rolling, setRolling] = useState(false);
    const [faces, setFaces] = useState<number[]>([]);
    const [history, setHistory] = useState<Roll[]>([]);
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ dx: number; dy: number } | null>(null);
    const idRef = useRef(0);

    const d20mode = die === 20 && count === 1;
    const last = history[0];

    const clamp = useCallback((x: number, y: number) => {
        const el = panelRef.current;
        const w = el?.offsetWidth ?? 360, h = el?.offsetHeight ?? 520;
        return { x: Math.min(Math.max(8, x), window.innerWidth - w - 8), y: Math.min(Math.max(8, y), window.innerHeight - h - 8) };
    }, []);

    // Açılışta: kayıtlı konum ya da sol alt; panel ölçüldükten sonra ekrana sığdır
    useLayoutEffect(() => {
        if (!open) return;
        let saved: { x: number; y: number } | null = null;
        try {
            saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
        } catch {}
        setPos(saved ?? { x: 24, y: window.innerHeight });
    }, [open]);
    useLayoutEffect(() => {
        if (open && pos && panelRef.current) {
            const c = clamp(pos.x, pos.y);
            if (c.x !== pos.x || c.y !== pos.y) setPos(c);
        }
    }, [open, pos, showOptions, clamp]);

    const onDragStart = (e: React.PointerEvent) => {
        if (!pos) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    };
    const onDragMove = (e: React.PointerEvent) => {
        if (drag.current) setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
    };
    const onDragEnd = () => {
        drag.current = null;
        try {
            if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos));
        } catch {}
    };

    const roll = useCallback(() => {
        if (rolling) return;
        setRolling(true);
        const n = d20mode && mode !== 'normal' ? 2 : count;
        const ticker = setInterval(() => setFaces(Array.from({ length: n }, () => rand(die))), 70);
        setTimeout(() => {
            clearInterval(ticker);
            const values = Array.from({ length: n }, () => rand(die));
            let kept = values.reduce((a, b) => a + b, 0);
            let dropped: number | undefined;
            if (d20mode && mode !== 'normal') {
                const pick = mode === 'advantage' ? Math.max(...values) : Math.min(...values);
                dropped = values.indexOf(pick) === 0 ? 1 : 0;
                kept = pick;
            }
            const natural = d20mode ? kept : undefined;
            const mod = modifier ? ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}` : '';
            const formula = d20mode && mode !== 'normal' ? `d20 (${mode === 'advantage' ? 'avantaj' : 'dezavantaj'})${mod}` : `${count}d${die}${mod}`;
            setFaces(values);
            setHistory((h) =>
                [{ id: ++idRef.current, die, values, dropped, modifier, total: kept + modifier, formula, crit: natural === 20 ? 'crit' : natural === 1 ? 'fumble' : undefined } as Roll, ...h].slice(0, 6),
            );
            setRolling(false);
        }, 650);
    }, [rolling, d20mode, mode, count, die, modifier]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key === 'Escape') setOpen(false);
            if ((e.key === ' ' || e.key === 'Enter') && panelRef.current?.contains(document.activeElement)) {
                e.preventDefault();
                roll();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, roll]);

    const showFaces = faces.length > 0 && (rolling || last?.die === die);
    const summary = !rolling && last && showFaces
        ? last.values.length > 1 || last.modifier
            ? `${last.formula} → ${last.dropped !== undefined ? last.values[1 - last.dropped] : last.values.join(' + ')}${last.modifier ? ` ${last.modifier > 0 ? '+' : '−'} ${Math.abs(last.modifier)}` : ''} =`
            : last.formula
        : null;

    return (
        <>
            {/* Tetikleyici: küçük pirinç levha */}
            <button
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                title={open ? 'Zar tepsisini kapat' : 'Zar tepsisini aç'}
                className={`vl-plaque group flex items-center gap-2.5 rounded-md py-1.5 pl-1.5 pr-3.5 transition-colors ${open ? 'border-[#e2c178]' : ''}`}
            >
                <span className="dice-wobble">
                    <DieShape die={20} value={last?.total ?? 20} size={36} tone={last?.crit ?? (last ? undefined : 'muted')} />
                </span>
                <span className="flex flex-col items-start leading-none">
                    <span className="font-display text-[15px] font-bold tracking-wider text-[#f1dca6]">Zar</span>
                    {last && <span className="mt-1 font-serif text-[13px] italic text-[#c9a35a]/80">son: {last.total}</span>}
                </span>
            </button>

            {open &&
                pos &&
                createPortal(
                    <div
                        ref={panelRef}
                        role="dialog"
                        aria-label="Zar Tepsisi"
                        className="vl-leather fixed z-[12500] flex max-h-[calc(100vh-16px)] w-[352px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-lg"
                        style={{ left: pos.x, top: pos.y }}
                    >
                        <Corner className="left-1.5 top-1.5" />
                        <Corner className="right-1.5 top-1.5 rotate-90" />
                        <Corner className="bottom-1.5 right-1.5 rotate-180" />
                        <Corner className="bottom-1.5 left-1.5 -rotate-90" />
                        <div
                            onPointerDown={onDragStart}
                            onPointerMove={onDragMove}
                            onPointerUp={onDragEnd}
                            className="relative flex cursor-grab touch-none flex-col items-center px-6 pb-2 pt-4 active:cursor-grabbing"
                            title="Sürükleyerek taşı"
                        >
                            <GripHorizontal size={14} className="absolute left-5 top-5 text-[#c9a35a]/50" />
                            <span className="font-display text-xl font-bold tracking-[0.18em] text-[#f1dca6]">Zar Tepsisi</span>
                            <div className="mt-2 flex w-full items-center gap-2">
                                <div className="vl-rule flex-1" />
                                <span className="text-[10px] text-[#c9a35a]">◆</span>
                                <div className="vl-rule flex-1" />
                            </div>
                            <button
                                aria-label="Kapat"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => setOpen(false)}
                                className="absolute right-4 top-3.5 p-1 text-[#c9a35a]/70 hover:text-[#f1dca6]"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-5 custom-scrollbar">
                            {/* Masa */}
                            <div className="vl-tray flex min-h-[150px] flex-col items-center justify-center gap-3 px-3 py-4">
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    {(showFaces ? faces : [undefined]).map((v, i) => (
                                        <DieShape
                                            key={i}
                                            die={die}
                                            value={v}
                                            size={faces.length > 3 ? 54 : 72}
                                            rolling={rolling}
                                            tone={!rolling && last && showFaces ? (last.dropped === i ? 'dropped' : last.crit) : showFaces ? undefined : 'muted'}
                                        />
                                    ))}
                                </div>
                                {rolling ? (
                                    <p className="font-serif text-lg italic text-[#c9a35a]">Zarlar dönüyor…</p>
                                ) : summary ? (
                                    <div className="text-center">
                                        <p className="font-serif text-[15px] text-[#d8c08a]">
                                            {summary}
                                            {/* Tek zar + bonus yok: sonuç zaten zarın üstünde, tekrar yazma */}
                                            {(last!.values.length > 1 || last!.modifier !== 0) && (
                                                <span className={`ml-1 font-serif text-2xl font-black ${last!.crit === 'crit' ? 'text-yellow-300 dice-glow' : last!.crit === 'fumble' ? 'text-red-400' : 'text-amber-50'}`}>{last!.total}</span>
                                            )}
                                        </p>
                                        {last!.crit && (
                                            <p className={`mt-1 text-[13px] font-black uppercase tracking-[0.3em] ${last!.crit === 'crit' ? 'text-yellow-300' : 'text-red-400'}`}>
                                                {last!.crit === 'crit' ? 'Kritik başarı!' : 'Kritik başarısızlık!'}
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="font-serif text-[15px] italic text-[#c9a35a]/70">Zarını seç, kaderini at</p>
                                )}
                            </div>

                            <button
                                onClick={roll}
                                disabled={rolling}
                                className="vl-seal rounded-md py-3 font-display text-[17px] font-bold tracking-[0.14em] transition-transform active:scale-[0.98] disabled:opacity-60"
                            >
                                {d20mode && mode !== 'normal' ? `d20 at (${mode === 'advantage' ? 'avantajlı' : 'dezavantajlı'})` : `${count > 1 ? count : ''}d${die} at`}
                                {modifier ? ` ${signed(modifier)}` : ''}
                            </button>

                            {/* Zar seçimi: şekilleriyle */}
                            <div className="grid grid-cols-7 gap-1">
                                {DICE.map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setDie(d)}
                                        aria-pressed={die === d}
                                        className={`flex flex-col items-center gap-0.5 border-b-2 py-1.5 transition-colors ${die === d ? 'border-[#c9a35a] bg-[#c9a35a]/10' : 'border-transparent hover:bg-[#c9a35a]/5'}`}
                                    >
                                        <DieShape die={d} size={28} tone={die === d ? undefined : 'muted'} />
                                        <span className={`font-display text-[12px] font-bold ${die === d ? 'text-[#f1dca6]' : 'text-[#c9a35a]/55'}`}>d{d}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Ayrıntılı ayarlar */}
                            <div className="rounded border border-[#c9a35a]/25 bg-black/25">
                                <button onClick={() => setShowOptions((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 font-serif text-[15px] text-[#d8c08a]">
                                    <span>
                                        Adet, bonus{die === 20 ? ', avantaj' : ''}
                                        {(count > 1 || modifier || mode !== 'normal') && <span className="ml-2 text-amber-400">• ayarlı</span>}
                                    </span>
                                    <ChevronDown size={16} className={`transition-transform ${showOptions ? 'rotate-180' : ''}`} />
                                </button>
                                {showOptions && (
                                    <div className="space-y-3 border-t border-[#c9a35a]/20 p-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <Stepper label="Kaç zar" value={count} onChange={setCount} min={1} max={6} />
                                            <Stepper label="Bonus" value={modifier} onChange={setModifier} min={-20} max={20} format={signed} />
                                        </div>
                                        <label className="flex items-center justify-between gap-3">
                                            <span className="font-display text-[12px] tracking-wider text-[#c9a35a]" title="Karakter kartındaki puan (Str, Dex, Con, Int, Wis, Cha). Bonus 5e formülüyle hesaplanır.">
                                                Yetenek puanından bonus
                                            </span>
                                            <input
                                                type="number"
                                                min={1}
                                                max={30}
                                                placeholder="örn. 16"
                                                onChange={(e) => {
                                                    const v = Number(e.target.value);
                                                    if (v >= 1 && v <= 30) setModifier(Math.floor((v - 10) / 2));
                                                }}
                                                className="w-20 rounded border border-[#c9a35a]/35 bg-black/45 px-2 py-1 text-center font-serif text-[#f1dca6] outline-none focus:border-[#e2c178]"
                                            />
                                        </label>
                                        {die === 20 && (
                                            <div className="grid grid-cols-3 gap-1 rounded border border-[#c9a35a]/25 bg-black/40 p-1 font-serif text-[14px]">
                                                {(['normal', 'advantage', 'disadvantage'] as Mode[]).map((m) => (
                                                    <button
                                                        key={m}
                                                        onClick={() => {
                                                            setMode(m);
                                                            if (m !== 'normal') setCount(1);
                                                        }}
                                                        className={`rounded-sm py-1.5 transition-colors ${mode === m ? 'vl-seal' : 'text-[#c9a35a]/70 hover:text-[#f1dca6]'}`}
                                                    >
                                                        {m === 'normal' ? 'Normal' : m === 'advantage' ? 'Avantaj' : 'Dezavantaj'}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {history.length > 1 && (
                                <div>
                                    <p className="mb-1.5 font-display text-[12px] tracking-wider text-[#c9a35a]/70">Önceki atışlar</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {history.slice(1).map((h) => (
                                            <span
                                                key={h.id}
                                                title={`${h.formula}: [${h.values.join(', ')}]`}
                                                className={`rounded-sm border px-2 py-0.5 font-serif text-[14px] ${h.crit === 'crit' ? 'border-yellow-500/50 text-yellow-300' : h.crit === 'fumble' ? 'border-red-500/40 text-red-300' : 'border-[#c9a35a]/30 text-[#d8c08a]'}`}
                                            >
                                                {h.formula.split(' ')[0]} <b className="font-serif">{h.total}</b>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}
