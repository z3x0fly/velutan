'use client';

import React from 'react';
import { ChevronRight, Footprints, Square, Swords } from 'lucide-react';
import { initials, Token, TOKEN_KINDS } from './battle';
import { CONDITIONS, defaultSheet, sanityOf } from './rules';
import type { BattleController } from './useBattleController';

export const Portrait = ({ t, size = 40, dim }: { t: Token; size?: number; dim?: boolean }) => (
    <span
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-[#120c06] font-serif font-black text-amber-50 ${dim ? 'grayscale opacity-50' : ''}`}
        style={{ width: size, height: size, borderColor: TOKEN_KINDS[t.kind].color, fontSize: size * 0.36 }}
    >
        {t.image ? <img src={t.image} alt="" className="h-full w-full object-cover object-top" /> : initials(t.name)}
    </span>
);

export const Bar = ({ value, max, color, h = 4 }: { value: number; max: number; color: string; h?: number }) => (
    <span className="block w-full overflow-hidden rounded-full bg-black/70" style={{ height: h }}>
        <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0}%`, background: color }} />
    </span>
);

export const hpColor = (hp: number, max: number) => (hp / Math.max(max, 1) > 0.5 ? '#22c55e' : hp / Math.max(max, 1) > 0.25 ? '#eab308' : '#ef4444');

/** Üstte: inisiyatif sırası, tur, sıradaki; savaş yoksa "Savaşı başlat" */
export default function InitiativeBar({ ctrl }: { ctrl: BattleController }) {
    const { battle, R, activeId } = ctrl;
    const c = battle.combat;
    if (!R('initiative')) return null;
    // Ortak masada oyuncu: sırayı görür, yönetmez
    const ro = ctrl.isPlayer;

    if (!c)
        return ro ? null : (
            <div className="pointer-events-auto flex flex-col items-center gap-1">
                <button
                    onClick={ctrl.startCombat}
                    disabled={ctrl.busy || battle.tokens.length === 0}
                    className="vl-seal flex items-center gap-2 rounded-full px-5 py-2 font-display text-[15px] font-bold tracking-[0.15em] transition-transform active:scale-95 disabled:opacity-40"
                    title={battle.tokens.length ? 'Herkes d20 + Dex atar, sıra kurulur' : 'Önce token yerleştir'}
                >
                    <Swords size={16} /> Savaşı başlat
                </button>
                <span className="text-[11px] text-amber-100/60 [text-shadow:0_1px_3px_#000]">{battle.tokens.length ? 'Herkes inisiyatif atar, sıra kurulur' : 'Önce token yerleştir'}</span>
            </div>
        );

    const active = battle.tokens.find((t) => t.id === activeId);
    const sheet = active ? active.sheet ?? defaultSheet(active.kind, active.size) : null;
    const speed = sheet ? (sheet.conditions.includes('tutsak') ? 0 : sheet.speed) * (c.dashed ? 2 : 1) : 0;

    return (
        <div className="pointer-events-auto flex max-w-[calc(100vw-24px)] flex-col items-center gap-1.5">
            <div className="vl-leather flex max-w-full items-center gap-2 rounded-xl px-2 py-1.5">
                <div className="flex shrink-0 flex-col items-center px-1.5 leading-none">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#c9a35a]/70">Tur</span>
                    <span className="font-display text-2xl font-bold text-[#f1dca6]">{c.round}</span>
                </div>
                <div className="flex min-w-0 items-end gap-1.5 overflow-x-auto px-1 pb-0.5 custom-scrollbar">
                    {c.order.map((o, i) => {
                        const t = battle.tokens.find((x) => x.id === o.id);
                        if (!t) return null;
                        const s = t.sheet ?? defaultSheet(t.kind, t.size);
                        const isActive = i === c.turn;
                        const dead = s.state === 'dead';
                        return (
                            <button
                                key={o.id}
                                onClick={() => ctrl.setSelectedId(t.id)}
                                title={`${t.name} · inisiyatif ${o.init}`}
                                className={`relative flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-1 pb-1 pt-1.5 transition-all ${isActive ? 'bg-[#c9a35a]/20 shadow-[0_0_18px_rgba(226,193,120,0.45)]' : 'hover:bg-white/5'} ${ctrl.selectedId === t.id && !isActive ? 'ring-1 ring-[#c9a35a]/60' : ''}`}
                            >
                                <Portrait t={t} size={isActive ? 46 : 34} dim={dead} />
                                <span className="absolute -right-0.5 top-0 rounded-full border border-black/50 bg-[#2b1c0e] px-1 font-mono text-[9px] font-bold text-[#f1dca6]">{o.init}</span>
                                {dead && <span className="absolute left-1/2 top-3 -translate-x-1/2 text-lg">☠</span>}
                                {s.state === 'down' && <span className="absolute left-1/2 top-3 -translate-x-1/2 text-[11px] font-black text-red-400">0 HP</span>}
                                <span className={`max-w-[64px] truncate text-[10px] font-bold ${isActive ? 'text-[#f1dca6]' : 'text-amber-100/70'}`}>{t.name}</span>
                                {R('hp') && <span className="w-full px-0.5"><Bar value={s.hp} max={s.hpMax} color={hpColor(s.hp, s.hpMax)} h={3} /></span>}
                                {R('mana') && s.manaMax > 0 && <span className="w-full px-0.5"><Bar value={s.mana} max={s.manaMax} color="#60a5fa" h={2} /></span>}
                                {R('sanity') && <span className="w-full px-0.5"><Bar value={sanityOf(s).cur} max={sanityOf(s).max} color="#a78bfa" h={2} /></span>}
                                {R('conditions') && s.conditions.length > 0 && (
                                    <span className="flex gap-px text-[9px] leading-none text-amber-200">{s.conditions.slice(0, 3).map((k) => CONDITIONS.find((x) => x.key === k)?.icon)}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
                {!ro && (
                <div className="flex shrink-0 flex-col gap-1 pl-1">
                    <button onClick={ctrl.nextTurn} disabled={ctrl.busy} className="vl-seal flex items-center gap-1 rounded-md px-2.5 py-1.5 font-display text-[13px] font-bold tracking-wider disabled:opacity-50" title="Sıradaki (sıra sonuna gelince yeni tur)">
                        Sıradaki <ChevronRight size={14} />
                    </button>
                    <button onClick={ctrl.endCombat} className="flex items-center justify-center gap-1 rounded-md border border-[#c9a35a]/25 px-2 py-0.5 text-[10px] font-bold text-amber-100/60 hover:border-red-400/60 hover:text-red-300" title="Savaşı bitir">
                        <Square size={9} /> Bitir
                    </button>
                </div>
                )}
            </div>
            {active && R('movement') && sheet && !sheet.state && (
                <div className="flex items-center gap-2 rounded-full border border-[#c9a35a]/30 bg-black/75 px-3 py-1 text-[12px] text-amber-100/80">
                    <Footprints size={13} className="text-[#c9a35a]" />
                    <span>
                        {active.name}: hareket{' '}
                        <b className={c.moved > speed ? 'text-red-400' : 'text-[#f1dca6]'}>
                            {c.moved} / {speed}
                        </b>{' '}
                        kare
                    </span>
                    {!c.dashed && !ro && (
                        <button onClick={ctrl.dash} className="rounded-full border border-[#c9a35a]/40 px-2 py-px text-[10.5px] font-bold text-[#f1dca6] hover:bg-[#c9a35a]/15" title="Atıl (Dash): bu tur hareket iki kat">
                            Atıl
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
