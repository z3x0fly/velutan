'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Dices, Hand, Sparkles, Swords, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { diceStore, type RollMode } from '../dice3d/diceStore';
import { normalizeRules, presetOf, RULE_INFO, Rules, RULES_OFF, RULES_VELUTAN, RulesPreset } from './rules';

const PRESETS: { id: RulesPreset; title: string; desc: string; icon: React.ElementType }[] = [
    { id: 'sistemsiz', title: 'Sistemsiz', desc: 'Izgara, token ve serbest zar. Kuralları masa koyar; hikâye akar.', icon: Sparkles },
    { id: 'velutan', title: 'Velutan 5e', desc: 'İnisiyatif, HP ve MANA, saldırı ve ZS, durumlar, ölüm zarları: hepsi açık.', icon: Swords },
    { id: 'ozel', title: 'Kendi masam', desc: 'Mekanikleri tek tek seç; yalnızca istediğin açık olsun.', icon: Dices },
];

const MODES: { id: RollMode; title: string; desc: string; icon: React.ElementType }[] = [
    { id: 'hand', title: 'Elle salla', desc: 'Zarı tut, salla, fırlat', icon: Hand },
    { id: 'auto', title: 'Otomatik', desc: 'Zarlar kendiliğinden atılır', icon: Dices },
    { id: 'quick', title: 'Hızlı', desc: 'Animasyonsuz, anında sonuç', icon: Zap },
];

/** Oyun kurulumu: sistem seçimi, mekanikler ve zar atış biçimi */
export default function GameSetup({ initial, onStart, onClose }: { initial?: Rules; onStart: (r: Rules) => void; onClose: () => void }) {
    const [rules, setRules] = useState<Rules>(initial ?? RULES_VELUTAN);
    const [preset, setPreset] = useState<RulesPreset>(initial ? presetOf(initial) : 'velutan');
    const dice = useSyncExternalStore(diceStore.subscribe, diceStore.get, diceStore.get);

    const pick = (p: RulesPreset) => {
        setPreset(p);
        if (p === 'sistemsiz') setRules(RULES_OFF);
        if (p === 'velutan') setRules(RULES_VELUTAN);
    };
    const toggle = (k: keyof Rules) => {
        setPreset('ozel');
        setRules((r) => {
            const next = { ...r, [k]: !r[k] };
            // Açılan mekaniğin ihtiyacı olanları da aç
            for (const info of RULE_INFO) if (info.key === k && next[k]) info.needs?.forEach((n) => (next[n] = true));
            return normalizeRules(next);
        });
    };
    const count = Object.values(rules).filter(Boolean).length;

    return createPortal(
        <div className="fixed inset-0 z-[13000] flex items-center justify-center bg-black/75 p-3 backdrop-blur-[2px]" onClick={onClose}>
            <section
                role="dialog"
                aria-label="Oyun kur"
                onClick={(e) => e.stopPropagation()}
                className="vl-leather relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl"
            >
                <div className="relative px-5 pb-3 pt-5 text-center md:px-8">
                    <button onClick={onClose} aria-label="Kapat" className="absolute right-4 top-4 p-1 text-[#c9a35a]/70 hover:text-[#f1dca6]">
                        <X size={20} />
                    </button>
                    <div className="text-[11px] font-black uppercase tracking-[0.4em] text-[#c9a35a]/70">Masa kuruluyor</div>
                    <h2 className="font-display text-2xl font-bold tracking-[0.12em] text-[#f1dca6] md:text-3xl">Oyunu Kur</h2>
                    <div className="mx-auto mt-2 flex max-w-xs items-center gap-2">
                        <div className="vl-rule flex-1" />
                        <span className="text-[10px] text-[#c9a35a]">◆</span>
                        <div className="vl-rule flex-1" />
                    </div>
                </div>

                <div className="space-y-5 overflow-y-auto px-5 pb-5 custom-scrollbar md:px-8">
                    {/* Sistem */}
                    <div className="grid gap-2 sm:grid-cols-3">
                        {PRESETS.map((p) => {
                            const Icon = p.icon;
                            const on = preset === p.id;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => pick(p.id)}
                                    aria-pressed={on}
                                    className={`group relative rounded-lg border p-3 text-left transition-all ${on ? 'border-[#e2c178] bg-[#c9a35a]/15 shadow-[0_0_24px_rgba(226,193,120,0.25)]' : 'border-[#c9a35a]/25 bg-black/30 hover:border-[#c9a35a]/60'}`}
                                >
                                    <Icon size={22} className={on ? 'text-[#f1dca6]' : 'text-[#c9a35a]/70'} />
                                    <div className="mt-1.5 font-display text-[17px] font-bold tracking-wide text-[#f1dca6]">{p.title}</div>
                                    <div className="mt-0.5 text-[12px] leading-snug text-amber-100/55">{p.desc}</div>
                                    {on && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-[#e2c178] shadow-[0_0_10px_#e2c178]" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Mekanikler */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-display text-[13px] tracking-[0.2em] text-[#c9a35a]">MEKANİKLER</span>
                            <span className="text-[11px] text-amber-100/40">{count ? `${count} / ${RULE_INFO.length} açık` : 'hepsi kapalı · sistemsiz'}</span>
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                            {RULE_INFO.map((info) => {
                                const on = rules[info.key];
                                const blocked = info.needs?.filter((n) => !rules[n]) ?? [];
                                return (
                                    <button
                                        key={info.key}
                                        role="switch"
                                        aria-checked={on}
                                        onClick={() => toggle(info.key)}
                                        className={`flex items-start gap-3 rounded-md border px-3 py-2 text-left transition-colors ${on ? 'border-[#c9a35a]/60 bg-[#c9a35a]/10' : 'border-[#c9a35a]/15 bg-black/25 hover:border-[#c9a35a]/40'}`}
                                    >
                                        <span className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors ${on ? 'border-[#e2c178] bg-[#8a5d22]' : 'border-[#c9a35a]/30 bg-black/60'}`}>
                                            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${on ? 'left-[18px] bg-[#f6e3b4]' : 'left-0.5 bg-[#c9a35a]/40'}`} />
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-[13px] font-bold text-[#f1dca6]">{info.title}</span>
                                            <span className="block text-[11.5px] leading-snug text-amber-100/50">{info.desc}</span>
                                            {!on && blocked.length > 0 && (
                                                <span className="mt-0.5 block text-[10.5px] italic text-[#c9a35a]/60">
                                                    açınca {blocked.map((b) => RULE_INFO.find((r) => r.key === b)!.title).join(', ')} de açılır
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Zar */}
                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="font-display text-[13px] tracking-[0.2em] text-[#c9a35a]">ZARLAR NASIL ATILSIN?</span>
                            <button
                                onClick={() => diceStore.setSound(!dice.sound)}
                                className="flex items-center gap-1 text-[11px] text-amber-100/50 hover:text-amber-100"
                                aria-pressed={dice.sound}
                            >
                                {dice.sound ? <Volume2 size={13} /> : <VolumeX size={13} />} zar sesi {dice.sound ? 'açık' : 'kapalı'}
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                            {MODES.map((m) => {
                                const Icon = m.icon;
                                const on = dice.mode === m.id;
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => diceStore.setMode(m.id)}
                                        aria-pressed={on}
                                        className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-center transition-colors ${on ? 'border-[#e2c178] bg-[#c9a35a]/15' : 'border-[#c9a35a]/20 bg-black/25 hover:border-[#c9a35a]/50'}`}
                                    >
                                        <Icon size={18} className={on ? 'text-[#f1dca6]' : 'text-[#c9a35a]/60'} />
                                        <span className="text-[12.5px] font-bold text-[#f1dca6]">{m.title}</span>
                                        <span className="hidden text-[10.5px] leading-tight text-amber-100/45 sm:block">{m.desc}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[#c9a35a]/20 bg-black/30 px-5 py-3 md:px-8">
                    <span className="text-[11.5px] leading-snug text-amber-100/45">Kurallar bu mekânda saklanır; savaş panelinden istediğin an değiştirirsin.</span>
                    <button
                        onClick={() => onStart(rules)}
                        className="vl-seal shrink-0 rounded-md px-6 py-2.5 font-display text-[16px] font-bold tracking-[0.14em] transition-transform active:scale-[0.98]"
                    >
                        Oyunu başlat
                    </button>
                </div>
            </section>
        </div>,
        document.body,
    );
}
