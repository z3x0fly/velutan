'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Dices, Hand, ScrollText, Settings2, Smartphone, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { DieShape } from '../DiceTray';
import { diceStore, type RollMode } from '../dice3d/diceStore';
import { unlockAudio } from '../dice3d/sound';
import type { LogTone } from './battle';
import { Edge, signed } from './rules';
import type { BattleController, Toast } from './useBattleController';

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
const MODE_ICON: Record<RollMode, React.ElementType> = { hand: Hand, auto: Dices, quick: Zap };
const MODE_LABEL: Record<RollMode, string> = { hand: 'Elle salla', auto: 'Otomatik', quick: 'Hızlı' };
const NEXT_MODE: Record<RollMode, RollMode> = { hand: 'auto', auto: 'quick', quick: 'hand' };

export const TONE: Record<LogTone, string> = {
    info: 'text-amber-100/75',
    roll: 'text-amber-100',
    hit: 'text-orange-300',
    miss: 'text-slate-300/80',
    crit: 'text-yellow-300',
    fumble: 'text-red-400',
    heal: 'text-green-300',
    death: 'text-red-300',
    turn: 'text-[#e2c178]',
};

/** Ortada beliren sonuç: isabet, kritik, hasar… */
export function ResultToast({ toast }: { toast: Toast | null }) {
    if (!toast) return null;
    const big = toast.tone === 'crit' ? 'text-yellow-300 dice-glow' : toast.tone === 'fumble' || toast.tone === 'death' ? 'text-red-400' : toast.tone === 'heal' ? 'text-green-300' : toast.tone === 'miss' ? 'text-slate-200' : 'text-[#f6e3b4]';
    return (
        <div key={toast.id} className="dice-land pointer-events-none flex flex-col items-center text-center">
            <div className={`font-display text-4xl font-bold tracking-wider [text-shadow:0_2px_12px_#000,0_0_2px_#000] md:text-5xl ${big}`}>{toast.title}</div>
            {toast.sub && <div className="mt-1 rounded-full bg-black/70 px-3 py-0.5 text-[13px] font-semibold text-amber-100/90">{toast.sub}</div>}
        </div>
    );
}

/** Alt orta: hızlı zar, atış biçimi, günlük ve kurallar */
export default function DiceDock({ ctrl, onRules }: { ctrl: BattleController; onRules?: () => void }) {
    const dice = useSyncExternalStore(diceStore.subscribe, diceStore.get, diceStore.get);
    const [die, setDie] = useState<(typeof DICE)[number]>(20);
    const [count, setCount] = useState(1);
    const [bonus, setBonus] = useState(0);
    const [edge, setEdge] = useState<Edge>('normal');
    const [logOpen, setLogOpen] = useState(false);
    const [touch, setTouch] = useState(false);
    const logEnd = useRef<HTMLDivElement>(null);
    const log = ctrl.battle.log ?? [];
    const ModeIcon = MODE_ICON[dice.mode];
    useEffect(() => setTouch(window.matchMedia?.('(pointer: coarse)').matches ?? false), []);
    useEffect(() => logEnd.current?.scrollIntoView({ block: 'end' }), [log.length, logOpen]);

    const expr = `${count > 1 ? count : ''}d${die}${bonus ? signed(bonus) : ''}`;
    const d20 = die === 20 && count === 1;

    const pickDie = (d: (typeof DICE)[number]) => {
        if (d === die) setCount((c) => (c >= 6 ? 1 : c + 1));
        else {
            setDie(d);
            setCount(1);
            if (d !== 20) setEdge('normal');
        }
    };

    // iOS hareket izni kullanıcı dokunuşuyla istenir
    const toggleShake = async () => {
        if (dice.shake) return diceStore.setShake(false);
        const DM = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
        try {
            if (DM?.requestPermission && (await DM.requestPermission()) !== 'granted') return;
        } catch {
            return;
        }
        diceStore.setShake(true);
    };

    return (
        <div className="pointer-events-auto flex flex-col items-center gap-2">
            {logOpen && ctrl.R('log') && (
                <div className="vl-leather w-[min(440px,calc(100vw-24px))] rounded-xl p-2.5">
                    <div className="mb-1 flex items-center justify-between">
                        <span className="font-display text-[12px] tracking-[0.22em] text-[#c9a35a]">SAVAŞ GÜNLÜĞÜ</span>
                        <button onClick={() => setLogOpen(false)} aria-label="Günlüğü kapat" className="text-[#c9a35a]/60 hover:text-[#f1dca6]">
                            <X size={14} />
                        </button>
                    </div>
                    <div className="max-h-48 space-y-0.5 overflow-y-auto pr-1 text-[12px] leading-snug custom-scrollbar">
                        {log.length === 0 && <div className="py-2 text-center italic text-amber-100/40">Henüz bir şey olmadı.</div>}
                        {log.map((e) => (
                            <div key={e.id} className={`${TONE[e.tone]} ${e.tone === 'turn' ? 'pt-1 font-bold' : ''}`}>
                                {e.text}
                            </div>
                        ))}
                        <div ref={logEnd} />
                    </div>
                </div>
            )}

            <div className="vl-leather flex max-w-[calc(100vw-16px)] flex-wrap items-center justify-center gap-x-1.5 gap-y-1 rounded-2xl px-2 py-1.5 md:rounded-full">
                <div className="order-1 flex items-center">
                    {DICE.map((d) => (
                        <button
                            key={d}
                            onClick={() => pickDie(d)}
                            aria-pressed={die === d}
                            title={die === d ? 'Tekrar tıkla: bir zar daha' : `d${d}`}
                            className={`relative flex flex-col items-center rounded-md px-0.5 pt-0.5 transition-colors ${die === d ? 'bg-[#c9a35a]/15' : 'hover:bg-white/5'}`}
                        >
                            <DieShape die={d} size={22} tone={die === d ? undefined : 'muted'} />
                            <span className={`text-[9.5px] font-bold leading-tight ${die === d ? 'text-[#f1dca6]' : 'text-[#c9a35a]/55'}`}>d{d}</span>
                            {die === d && count > 1 && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-[#e2c178] px-1 text-[9px] font-black text-black">×{count}</span>}
                        </button>
                    ))}
                </div>

                <div className="order-3 flex items-center gap-1 md:order-2">
                    <span className="flex items-center rounded-md border border-[#c9a35a]/30 bg-black/40 text-[12px]" title="Bonus">
                        <button onClick={() => setBonus((b) => Math.max(-20, b - 1))} className="px-1.5 py-1 text-amber-300">−</button>
                        <span className="w-7 text-center font-bold text-[#f1dca6]">{signed(bonus)}</span>
                        <button onClick={() => setBonus((b) => Math.min(20, b + 1))} className="px-1.5 py-1 text-amber-300">+</button>
                    </span>
                    {d20 && (
                        <button
                            onClick={() => setEdge((e) => (e === 'normal' ? 'advantage' : e === 'advantage' ? 'disadvantage' : 'normal'))}
                            className={`rounded-md border px-1.5 py-1 text-[10.5px] font-bold ${edge === 'normal' ? 'border-[#c9a35a]/30 text-amber-100/60' : edge === 'advantage' ? 'border-green-400/60 text-green-300' : 'border-red-400/60 text-red-300'}`}
                            title="Avantaj / dezavantaj"
                        >
                            {edge === 'normal' ? 'Normal' : edge === 'advantage' ? 'Avantaj' : 'Dezavantaj'}
                        </button>
                    )}
                    <button
                        onClick={() => {
                            unlockAudio();
                            ctrl.freeRoll(`${count}d${die}${bonus ? signed(bonus) : ''}`, d20 ? edge : 'normal');
                        }}
                        disabled={ctrl.busy}
                        className="vl-seal rounded-full px-4 py-1.5 font-display text-[14px] font-bold tracking-wider disabled:opacity-50"
                    >
                        {expr} at
                    </button>
                </div>

                <div className="order-2 flex items-center gap-0 border-l border-[#c9a35a]/20 pl-1 md:order-3 md:gap-0.5 md:pl-1.5">
                    <button
                        onClick={() => diceStore.setMode(NEXT_MODE[dice.mode])}
                        title={`Atış: ${MODE_LABEL[dice.mode]} (değiştir)`}
                        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold text-[#f1dca6] hover:bg-white/5"
                    >
                        <ModeIcon size={15} /> <span className="hidden sm:inline">{MODE_LABEL[dice.mode]}</span>
                    </button>
                    {touch && (
                        <button onClick={toggleShake} aria-pressed={dice.shake} title="Telefonu sallayarak at" className={`rounded-md p-1.5 ${dice.shake ? 'bg-[#c9a35a]/25 text-[#f1dca6]' : 'text-[#c9a35a]/60'}`}>
                            <Smartphone size={15} />
                        </button>
                    )}
                    <button onClick={() => diceStore.setSound(!dice.sound)} aria-label="Zar sesi" title="Zar sesi" className="rounded-md p-1.5 text-[#c9a35a]/80 hover:text-[#f1dca6]">
                        {dice.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                    </button>
                    {ctrl.R('log') && (
                        <button onClick={() => setLogOpen((v) => !v)} aria-pressed={logOpen} title="Savaş günlüğü" className={`relative rounded-md p-1.5 ${logOpen ? 'bg-[#c9a35a]/25 text-[#f1dca6]' : 'text-[#c9a35a]/80 hover:text-[#f1dca6]'}`}>
                            <ScrollText size={15} />
                            {log.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#e2c178]" />}
                        </button>
                    )}
                    {onRules && (
                        <button onClick={onRules} title="Kurallar ve oyun ayarı" className="rounded-md p-1.5 text-[#c9a35a]/80 hover:text-[#f1dca6]">
                            <Settings2 size={15} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
