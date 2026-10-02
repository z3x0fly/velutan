'use client';

import React, { useState } from 'react';
import { Swords, X } from 'lucide-react';
import { Portrait } from './InitiativeBar';
import { defaultSheet, Edge, signed, suggestEdge } from './rules';
import type { BattleController } from './useBattleController';

/** Saldırı öncesi: saldıran ↔ hedef, mesafe, ZS, isabet şansı ve durumlardan gelen avantaj önerisi */
export default function AttackConfirm({ ctrl, actorId, targetId, onClose }: { ctrl: BattleController; actorId: string; targetId: string; onClose: () => void }) {
    const a = ctrl.battle.tokens.find((t) => t.id === actorId);
    const t = ctrl.battle.tokens.find((x) => x.id === targetId);
    const as = a ? a.sheet ?? defaultSheet(a.kind, a.size) : null;
    const ts = t ? t.sheet ?? defaultSheet(t.kind, t.size) : null;
    const dist = ctrl.distance(actorId, targetId);
    const hint = suggestEdge(ctrl.R('conditions') ? as ?? undefined : undefined, ctrl.R('conditions') ? ts ?? undefined : undefined, dist);
    const [edge, setEdge] = useState<Edge>(hint.edge);
    if (!a || !t || !as || !ts) return null;

    // Doğal 20 her zaman, doğal 1 hiçbir zaman (kritik kuralı açıksa) isabet eder
    const need = Math.min(20, Math.max(ctrl.R('crits') ? 2 : 1, ts.ac - as.attack.bonus));
    let p = (21 - need) / 20;
    if (edge === 'advantage') p = 1 - (1 - p) ** 2;
    if (edge === 'disadvantage') p = p * p;
    const tooFar = dist > as.attack.reach;

    return (
        <div className="vl-leather pointer-events-auto relative w-[min(360px,calc(100vw-24px))] rounded-xl p-4 text-amber-50">
            <button onClick={onClose} aria-label="Vazgeç" className="absolute right-3 top-3 p-0.5 text-[#c9a35a]/60 hover:text-[#f1dca6]">
                <X size={16} />
            </button>
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-col items-center gap-1">
                    <Portrait t={a} size={50} />
                    <span className="max-w-[110px] truncate text-[12px] font-bold">{a.name}</span>
                    <span className="text-[10.5px] text-amber-100/50">
                        {as.attack.name} {signed(as.attack.bonus)} · {as.attack.damage}
                    </span>
                </div>
                <div className="flex flex-col items-center">
                    <Swords size={22} className="text-[#e2c178]" />
                    <span className={`mt-0.5 text-[11px] font-bold ${tooFar ? 'text-red-300' : 'text-amber-100/60'}`}>{dist} kare</span>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-1">
                    <Portrait t={t} size={50} />
                    <span className="max-w-[110px] truncate text-[12px] font-bold">{t.name}</span>
                    <span className="text-[10.5px] text-amber-100/50">
                        ZS {ts.ac}
                        {ctrl.R('hp') ? ` · ${ts.hp}/${ts.hpMax} HP` : ''}
                    </span>
                </div>
            </div>

            {tooFar && <div className="mt-2 rounded-md border border-red-500/30 bg-red-950/30 px-2 py-1 text-center text-[11px] text-red-200">Menzil {as.attack.reach} kare; hedef {dist} kare uzakta. Yine de atabilirsin (uzak saldırı ya da masa kararı).</div>}

            <div className="mt-3 grid grid-cols-3 gap-0.5 rounded-md border border-[#c9a35a]/25 bg-black/40 p-0.5 text-[11px] font-bold">
                {(['disadvantage', 'normal', 'advantage'] as Edge[]).map((e) => (
                    <button key={e} onClick={() => setEdge(e)} className={`rounded px-1.5 py-1.5 transition-colors ${edge === e ? 'vl-seal' : 'text-amber-100/55 hover:text-amber-100'}`}>
                        {e === 'normal' ? 'Normal' : e === 'advantage' ? 'Avantaj' : 'Dezavantaj'}
                    </button>
                ))}
            </div>
            {hint.why.length > 0 && <div className="mt-1 text-center text-[10.5px] italic text-[#c9a35a]/80">Öneri: {hint.edge === 'normal' ? 'birbirini götürüyor' : hint.edge === 'advantage' ? 'avantaj' : 'dezavantaj'} ({hint.why.join(', ')})</div>}

            <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-[11px] leading-tight text-amber-100/60">
                    {need}+ gerekli
                    <br />
                    <b className="text-[15px] text-[#f1dca6]">%{Math.round(p * 100)}</b> isabet
                </div>
                <button
                    onClick={() => {
                        ctrl.attack(actorId, targetId, edge);
                        onClose();
                    }}
                    className="vl-seal flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 font-display text-[17px] font-bold tracking-[0.14em] transition-transform active:scale-[0.98]"
                >
                    <Swords size={17} /> Saldır!
                </button>
            </div>
        </div>
    );
}
