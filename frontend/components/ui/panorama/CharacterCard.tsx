'use client';

import React, { useEffect, useState } from 'react';
import { BookmarkPlus, Brain, Check, Heart, Shield, Sparkles, Swords, Trash2, X, Zap } from 'lucide-react';
import { saveToLibrary, TOKEN_KINDS } from './battle';
import { Bar, hpColor, Portrait } from './InitiativeBar';
import { Ability, ABILITIES, CONDITIONS, defaultSheet, Edge, mod, parseDice, sanityOf, Sheet, signed } from './rules';
import type { BattleController, Spell } from './useBattleController';

/** Tıklayınca düzenlenen küçük sayı */
const Num = ({ value, onChange, min = -99, max = 999, className = '', title }: { value: number; onChange: (v: number) => void; min?: number; max?: number; className?: string; title?: string }) => {
    const [edit, setEdit] = useState<string | null>(null);
    if (edit !== null)
        return (
            <input
                autoFocus
                inputMode="numeric"
                value={edit}
                onChange={(e) => setEdit(e.target.value.replace(/[^\d-]/g, ''))}
                onBlur={() => {
                    const v = Number(edit);
                    if (edit !== '' && Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
                    setEdit(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className={`w-12 rounded border border-[#e2c178] bg-black/70 px-1 text-center text-amber-50 outline-none ${className}`}
            />
        );
    return (
        <button onClick={() => setEdit(String(value))} title={title ?? 'Düzenle'} className={`rounded px-0.5 hover:bg-[#c9a35a]/15 ${className}`}>
            {value}
        </button>
    );
};

const EdgePick = ({ edge, onChange }: { edge: Edge; onChange: (e: Edge) => void }) => (
    <div className="grid grid-cols-3 gap-0.5 rounded-md border border-[#c9a35a]/25 bg-black/40 p-0.5 text-[10.5px] font-bold">
        {(['disadvantage', 'normal', 'advantage'] as Edge[]).map((e) => (
            <button key={e} onClick={() => onChange(e)} className={`rounded px-1.5 py-1 transition-colors ${edge === e ? 'vl-seal' : 'text-amber-100/55 hover:text-amber-100'}`}>
                {e === 'normal' ? 'Normal' : e === 'advantage' ? 'Avantaj' : 'Dezavantaj'}
            </button>
        ))}
    </div>
);

const Section = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
    <div className="border-t border-[#c9a35a]/15 pt-2.5">
        <div className="mb-1.5 flex items-center justify-between">
            <span className="font-display text-[11px] tracking-[0.22em] text-[#c9a35a]">{title}</span>
            {right}
        </div>
        {children}
    </div>
);

const DEFAULT_SPELL: Spell = { name: 'Ateş Oku', cost: 2, dice: '2d6', kind: 'damage', save: null };

export default function CharacterCard({ ctrl, id }: { ctrl: BattleController; id: string }) {
    const t = ctrl.battle.tokens.find((x) => x.id === id);
    const [amount, setAmount] = useState(5);
    const [edge, setEdge] = useState<Edge>('normal');
    const [saveMode, setSaveMode] = useState(false);
    const [spell, setSpell] = useState<Spell | null>(null);
    const [saved, setSaved] = useState(false);
    const [sanDc, setSanDc] = useState(12);
    const [sanLoss, setSanLoss] = useState('1d4');
    // Telefonda kart alttan açılan sade bir tabaka: ayrıntılar istenince açılır
    const [compact, setCompact] = useState(false);
    const [expanded, setExpanded] = useState(false);
    useEffect(() => {
        const m = window.matchMedia('(max-width: 767px)');
        const f = () => setCompact(m.matches);
        f();
        m.addEventListener('change', f);
        return () => m.removeEventListener('change', f);
    }, []);
    useEffect(() => {
        setSpell(null);
        setSaved(false);
    }, [id]);
    if (!t) return null;
    const { R } = ctrl;
    const s: Sheet = t.sheet ?? defaultSheet(t.kind, t.size);
    const set = (patch: Partial<Sheet>) => ctrl.patchSheet(t.id, (x) => ({ ...x, ...patch }));
    const isActive = ctrl.activeId === t.id;
    const busy = ctrl.busy;
    const dmgOk = !!parseDice(s.attack.damage);
    const detail = !compact || expanded;
    // Ortak masada oyuncu: kendi karakterinin zarlarını atar, gerisini yalnızca görür
    const mode: 'gm' | 'own' | 'view' = ctrl.isPlayer ? (ctrl.session.character === t.id ? 'own' : 'view') : 'gm';
    const gm = mode === 'gm';

    return (
        <div className="vl-leather w-full max-h-[46dvh] overflow-y-auto rounded-xl p-3 text-amber-50 custom-scrollbar md:max-h-[calc(100dvh-200px)] md:w-[320px]">
            {/* Başlık */}
            <div className="flex items-start gap-2.5">
                <Portrait t={t} size={compact ? 40 : 52} dim={s.state === 'dead'} />
                <div className="min-w-0 flex-1">
                    <input
                        value={t.name}
                        onChange={(e) => ctrl.setBattle((st) => ({ ...st, tokens: st.tokens.map((x) => (x.id === t.id ? { ...x, name: e.target.value.slice(0, 24) } : x)) }))}
                        aria-label="Ad"
                        disabled={!gm}
                        className="w-full truncate bg-transparent font-display text-[19px] font-bold tracking-wide text-[#f1dca6] outline-none focus:border-b focus:border-[#c9a35a]/50"
                    />
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-100/55">
                        <span className="h-2 w-2 rounded-full" style={{ background: TOKEN_KINDS[t.kind].color }} />
                        {TOKEN_KINDS[t.kind].label} · Sv. <Num value={s.level} onChange={(v) => set({ level: v })} min={0} max={30} />
                        {isActive && <span className="ml-1 rounded-full bg-[#c9a35a]/25 px-1.5 text-[10px] font-black uppercase tracking-wider text-[#f1dca6]">Sırası</span>}
                        {s.state === 'dead' && <span className="ml-1 font-black text-red-400">☠ Öldü</span>}
                    </div>
                </div>
                <button onClick={() => ctrl.setSelectedId(null)} aria-label="Kartı kapat" className="p-0.5 text-[#c9a35a]/60 hover:text-[#f1dca6]">
                    <X size={16} />
                </button>
            </div>

            <div className="mt-2.5 space-y-2.5">
                <fieldset disabled={!gm} className="m-0 min-w-0 space-y-2.5 border-0 p-0">
                {/* Ölüm kurtarma zarları */}
                {R('deathSaves') && (s.state === 'down' || s.state === 'stable') && (
                    <div className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5">
                        <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-[12px] font-black uppercase tracking-wider text-red-300">{s.state === 'stable' ? 'Dengede (baygın)' : 'Baygın · ölümle pençeleşiyor'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="space-y-1 text-[11px]">
                                <div className="flex items-center gap-1">
                                    <span className="w-16 text-green-300/80">Başarı</span>
                                    {[0, 1, 2].map((i) => <span key={i} className={`h-3.5 w-3.5 rounded-full border ${i < (s.death?.ok ?? 0) ? 'border-green-300 bg-green-500' : 'border-green-300/40'}`} />)}
                                </div>
                                <div className="flex items-center gap-1">
                                    <span className="w-16 text-red-300/80">Başarısız</span>
                                    {[0, 1, 2].map((i) => <span key={i} className={`h-3.5 w-3.5 rounded-full border ${i < (s.death?.fail ?? 0) ? 'border-red-300 bg-red-500' : 'border-red-300/40'}`} />)}
                                </div>
                            </div>
                            {s.state === 'down' && (
                                <button onClick={() => ctrl.deathSave(t.id)} disabled={busy} className="vl-seal rounded-md px-3 py-2 text-[12px] font-bold disabled:opacity-50">
                                    Ölüm zarı at
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* HP */}
                {R('hp') && (
                    <div>
                        <div className="flex items-baseline justify-between">
                            <span className="flex items-center gap-1 font-display text-[11px] tracking-[0.22em] text-[#c9a35a]">
                                <Heart size={11} /> CAN
                            </span>
                            <span className="font-serif text-[17px] font-black text-amber-50">
                                <Num value={s.hp} onChange={(v) => set({ hp: Math.min(v, s.hpMax), state: v > 0 ? undefined : s.state })} min={0} />
                                <span className="text-amber-100/40"> / </span>
                                <Num value={s.hpMax} onChange={(v) => set({ hpMax: v, hp: Math.min(s.hp, v) })} min={1} className="text-amber-100/70" />
                            </span>
                        </div>
                        <Bar value={s.hp} max={s.hpMax} color={hpColor(s.hp, s.hpMax)} h={8} />
                        {gm && (
                        <div className="mt-1.5 flex items-center gap-1">
                            <button onClick={() => ctrl.adjustHp(t.id, -amount)} className="flex-1 rounded-md border border-red-500/40 bg-red-900/25 py-1 text-[12px] font-bold text-red-200 hover:bg-red-900/45">
                                − Hasar
                            </button>
                            <span className="flex items-center rounded-md border border-[#c9a35a]/30 bg-black/50">
                                <button onClick={() => setAmount((a) => Math.max(1, a - 1))} className="px-1.5 text-amber-300">−</button>
                                <Num value={amount} onChange={(v) => setAmount(Math.max(1, v))} min={1} className="w-7 text-center font-bold" />
                                <button onClick={() => setAmount((a) => a + 1)} className="px-1.5 text-amber-300">+</button>
                            </span>
                            <button onClick={() => ctrl.adjustHp(t.id, amount)} className="flex-1 rounded-md border border-green-500/40 bg-green-900/25 py-1 text-[12px] font-bold text-green-200 hover:bg-green-900/45">
                                + İyileş
                            </button>
                        </div>
                        )}
                    </div>
                )}

                {/* MANA (sade kartta MANA'sı olmayanlarda gizli) */}
                {R('mana') && (s.manaMax > 0 || detail) && (
                    <div>
                        <div className="flex items-baseline justify-between">
                            <span className="flex items-center gap-1 font-display text-[11px] tracking-[0.22em] text-sky-300/90">
                                <Sparkles size={11} /> MANA
                            </span>
                            <span className="flex items-center gap-1 font-serif text-[15px] font-black">
                                {gm && <button onClick={() => set({ mana: Math.max(0, s.mana - 1) })} className="px-1 text-sky-300">−</button>}
                                <Num value={s.mana} onChange={(v) => set({ mana: Math.min(v, s.manaMax) })} min={0} />
                                <span className="text-amber-100/40">/</span>
                                <Num value={s.manaMax} onChange={(v) => set({ manaMax: v, mana: Math.min(s.mana, v) })} min={0} className="text-amber-100/70" />
                                {gm && <button onClick={() => set({ mana: Math.min(s.manaMax, s.mana + 1) })} className="px-1 text-sky-300">+</button>}
                            </span>
                        </div>
                        <Bar value={s.mana} max={s.manaMax} color="#60a5fa" h={6} />
                    </div>
                )}

                {/* Akıl sağlığı */}
                {R('sanity') && (
                    <div>
                        <div className="flex items-baseline justify-between">
                            <span className="flex items-center gap-1 font-display text-[11px] tracking-[0.22em] text-violet-300">
                                <Brain size={11} /> AKIL
                            </span>
                            <span className="flex items-center gap-1 font-serif text-[15px] font-black">
                                {gm && <button onClick={() => ctrl.adjustSanity(t.id, -1)} className="px-1 text-violet-300" aria-label="Akıl azalt">−</button>}
                                <Num value={sanityOf(s).cur} onChange={(v) => ctrl.adjustSanity(t.id, v - sanityOf(s).cur)} min={0} />
                                <span className="text-amber-100/40">/</span>
                                <Num value={sanityOf(s).max} onChange={(v) => set({ sanityMax: Math.max(1, v), sanity: Math.min(sanityOf(s).cur, Math.max(1, v)) })} min={1} className="text-amber-100/70" />
                                {gm && <button onClick={() => ctrl.adjustSanity(t.id, 1)} className="px-1 text-violet-300" aria-label="Akıl artır">+</button>}
                            </span>
                        </div>
                        <Bar value={sanityOf(s).cur} max={sanityOf(s).max} color="#a78bfa" h={6} />
                        {gm && (
                        <div className="mt-1.5 flex items-center gap-1 text-[11.5px]">
                            <button
                                onClick={() => ctrl.sanityCheck(t.id, sanDc, parseDice(sanLoss) ? sanLoss : '1d4', edge)}
                                disabled={busy || s.state === 'dead'}
                                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-violet-400/40 bg-violet-900/25 py-1 font-bold text-violet-100 hover:bg-violet-900/45 disabled:opacity-40"
                                title="d20 + Bilgelik, ZD'ye karşı; başarısızlıkta kayıp zarı kadar akıl gider"
                            >
                                <Brain size={12} /> Akıl zarı
                            </button>
                            <span className="flex items-center gap-0.5 rounded border border-violet-400/25 bg-black/40 px-1.5 py-0.5" title="Zorluk derecesi">
                                ZD <Num value={sanDc} onChange={(v) => setSanDc(Math.max(1, v))} min={1} max={30} className="font-bold" />
                            </span>
                            <input
                                value={sanLoss}
                                onChange={(e) => setSanLoss(e.target.value.slice(0, 8))}
                                aria-label="Akıl kaybı zarı"
                                title="Başarısızlıkta kaybedilen akıl (ör. 1d4, 1d6)"
                                className={`w-14 rounded border bg-black/40 px-1 py-0.5 text-center font-mono outline-none ${parseDice(sanLoss) ? 'border-violet-400/25' : 'border-red-500 text-red-300'}`}
                            />
                        </div>
                        )}
                    </div>
                )}

                {/* Temel değerler */}
                {detail && (R('attacks') || R('movement') || R('initiative')) && (
                    <div className="grid grid-cols-3 gap-1.5 text-center">
                        {R('attacks') && (
                            <div className="vl-tray !border-2 py-1">
                                <div className="flex items-center justify-center gap-0.5 text-[9.5px] font-black tracking-[0.15em] text-[#c9a35a]"><Shield size={10} /> ZS</div>
                                <Num value={s.ac} onChange={(v) => set({ ac: v })} min={1} max={40} className="font-display text-xl font-bold text-[#f1dca6]" title="Zırh Sınıfı" />
                            </div>
                        )}
                        {R('movement') && (
                            <div className="vl-tray !border-2 py-1">
                                <div className="text-[9.5px] font-black tracking-[0.15em] text-[#c9a35a]">HIZ</div>
                                <span className="font-display text-xl font-bold text-[#f1dca6]">
                                    <Num value={s.speed} onChange={(v) => set({ speed: v })} min={0} max={40} />
                                </span>
                                <div className="-mt-1 text-[9px] text-amber-100/40">kare</div>
                            </div>
                        )}
                        {R('initiative') && (
                            <div className="vl-tray !border-2 py-1">
                                <div className="text-[9.5px] font-black tracking-[0.15em] text-[#c9a35a]">İNİS.</div>
                                {R('abilities') ? (
                                    <span className="font-display text-xl font-bold text-[#f1dca6]" title="Çeviklik bonusu">{signed(mod(s.abilities.dex))}</span>
                                ) : (
                                    <Num value={s.initBonus} onChange={(v) => set({ initBonus: v })} min={-10} max={20} className="font-display text-xl font-bold text-[#f1dca6]" />
                                )}
                            </div>
                        )}
                    </div>
                )}

                </fieldset>
                <fieldset disabled={mode === 'view'} className="m-0 min-w-0 space-y-2.5 border-0 p-0">
                {/* Yetenekler */}
                {detail && R('abilities') && (
                    <Section
                        title={saveMode ? 'KURTARMA ZARLARI' : 'YETENEK ZARLARI'}
                        right={
                            <button onClick={() => setSaveMode((v) => !v)} className="rounded-full border border-[#c9a35a]/30 px-2 py-px text-[10px] font-bold text-amber-100/70 hover:text-amber-100">
                                {saveMode ? 'Yetenek' : 'Kurtarma'}
                            </button>
                        }
                    >
                        <div className="grid grid-cols-6 gap-1">
                            {ABILITIES.map((a) => (
                                <div key={a.key} className="flex flex-col items-center rounded-md border border-[#c9a35a]/25 bg-black/35 pb-1 pt-0.5">
                                    <span className="text-[9px] font-black tracking-wider text-[#c9a35a]" title={a.name}>{a.short}</span>
                                    <button
                                        onClick={() => ctrl.abilityRoll(t.id, a.key as Ability, saveMode, edge)}
                                        disabled={busy}
                                        title={`${a.name} ${saveMode ? 'kurtarması' : 'zarı'} at`}
                                        className="font-display text-[17px] font-bold leading-tight text-[#f1dca6] hover:text-yellow-200 disabled:opacity-50"
                                    >
                                        {signed(mod(s.abilities[a.key]))}
                                    </button>
                                    <Num
                                        value={s.abilities[a.key]}
                                        onChange={(v) => set({ abilities: { ...s.abilities, [a.key]: v } })}
                                        min={1}
                                        max={30}
                                        className="text-[10px] text-amber-100/45"
                                        title="Puan"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="mt-1.5">
                            <EdgePick edge={edge} onChange={setEdge} />
                        </div>
                    </Section>
                )}

                </fieldset>
                <fieldset disabled={!gm} className="m-0 min-w-0 space-y-2.5 border-0 p-0">
                {/* Durumlar */}
                {detail && R('conditions') && (
                    <Section title="DURUMLAR">
                        <div className="flex flex-wrap gap-1">
                            {CONDITIONS.map((c) => {
                                const on = s.conditions.includes(c.key);
                                return (
                                    <button
                                        key={c.key}
                                        title={c.desc}
                                        onClick={() => set({ conditions: on ? s.conditions.filter((k) => k !== c.key) : [...s.conditions, c.key] })}
                                        className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${on ? 'border-amber-300 bg-amber-500/25 font-bold text-amber-100' : 'border-[#c9a35a]/20 text-amber-100/45 hover:border-[#c9a35a]/50'}`}
                                    >
                                        {c.icon} {c.label}
                                    </button>
                                );
                            })}
                        </div>
                    </Section>
                )}

                {/* Saldırı ve büyü (yalnızca GM yönetir) */}
                {R('attacks') && gm && (
                    <Section title="SALDIRI">
                        {detail && (
                        <div className="mb-1.5 grid grid-cols-[1fr_auto_auto] items-center gap-1.5 text-[12px]">
                            <input
                                value={s.attack.name}
                                onChange={(e) => set({ attack: { ...s.attack, name: e.target.value.slice(0, 20) } })}
                                aria-label="Silah"
                                className="min-w-0 rounded border border-[#c9a35a]/25 bg-black/40 px-2 py-1 text-amber-50 outline-none focus:border-[#c9a35a]"
                            />
                            <span className="flex items-center rounded border border-[#c9a35a]/25 bg-black/40 px-1.5 py-1" title="Saldırı bonusu">
                                <span className="text-amber-100/40">d20</span>
                                <Num value={s.attack.bonus} onChange={(v) => set({ attack: { ...s.attack, bonus: v } })} min={-10} max={30} className="font-bold" />
                            </span>
                            <input
                                value={s.attack.damage}
                                onChange={(e) => set({ attack: { ...s.attack, damage: e.target.value.slice(0, 12) } })}
                                aria-label="Hasar zarı"
                                title="Hasar zarı (ör. 1d8+3)"
                                className={`w-[74px] rounded border bg-black/40 px-1.5 py-1 text-center font-mono outline-none ${dmgOk ? 'border-[#c9a35a]/25 text-amber-50' : 'border-red-500 text-red-300'}`}
                            />
                        </div>
                        )}
                        <div className="grid grid-cols-2 gap-1.5">
                            <button
                                onClick={() => ctrl.setTargeting({ mode: 'attack', actorId: t.id })}
                                disabled={busy || s.state === 'dead' || s.state === 'down' || !dmgOk}
                                className="vl-seal flex items-center justify-center gap-1.5 rounded-md py-2 font-display text-[14px] font-bold tracking-wider disabled:opacity-40"
                            >
                                <Swords size={15} /> Saldır
                            </button>
                            <button
                                onClick={() => setSpell((v) => (v ? null : DEFAULT_SPELL))}
                                disabled={busy || s.state === 'dead' || s.state === 'down'}
                                className={`flex items-center justify-center gap-1.5 rounded-md border py-2 font-display text-[14px] font-bold tracking-wider transition-colors disabled:opacity-40 ${spell ? 'border-sky-300 bg-sky-500/20 text-sky-100' : 'border-sky-400/40 bg-sky-900/20 text-sky-200 hover:bg-sky-900/40'}`}
                            >
                                <Zap size={15} /> Büyü
                            </button>
                        </div>
                        {spell && (
                            <div className="mt-2 space-y-1.5 rounded-lg border border-sky-400/30 bg-sky-950/30 p-2 text-[12px]">
                                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                                    <input value={spell.name} onChange={(e) => setSpell({ ...spell, name: e.target.value.slice(0, 22) })} aria-label="Büyü adı" className="min-w-0 rounded border border-sky-400/30 bg-black/40 px-2 py-1 outline-none" />
                                    <input
                                        value={spell.dice}
                                        onChange={(e) => setSpell({ ...spell, dice: e.target.value.slice(0, 12) })}
                                        aria-label="Büyü zarı"
                                        className={`w-[74px] rounded border bg-black/40 px-1.5 py-1 text-center font-mono outline-none ${parseDice(spell.dice) ? 'border-sky-400/30' : 'border-red-500 text-red-300'}`}
                                    />
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <div className="grid grid-cols-2 gap-0.5 rounded-md border border-sky-400/25 bg-black/40 p-0.5 text-[10.5px] font-bold">
                                        {(['damage', 'heal'] as const).map((k) => (
                                            <button key={k} onClick={() => setSpell({ ...spell, kind: k, save: k === 'heal' ? null : spell.save })} className={`rounded px-2 py-0.5 ${spell.kind === k ? 'bg-sky-600/60 text-white' : 'text-sky-100/60'}`}>
                                                {k === 'damage' ? 'Hasar' : 'İyileştir'}
                                            </button>
                                        ))}
                                    </div>
                                    {R('mana') && (
                                        <span className="flex items-center gap-0.5 rounded border border-sky-400/25 bg-black/40 px-1.5 py-0.5" title="MANA bedeli">
                                            <Sparkles size={10} className="text-sky-300" />
                                            <Num value={spell.cost} onChange={(v) => setSpell({ ...spell, cost: Math.max(0, v) })} min={0} max={50} className="font-bold" />
                                        </span>
                                    )}
                                    {spell.kind === 'damage' && (
                                        <select
                                            value={spell.save ? spell.save.ability : ''}
                                            onChange={(e) => setSpell({ ...spell, save: e.target.value ? { ability: e.target.value as Ability, dc: spell.save?.dc ?? 13 } : null })}
                                            className="rounded border border-sky-400/25 bg-black/60 px-1 py-0.5 text-[11px] outline-none"
                                            aria-label="Kurtarma zarı"
                                        >
                                            <option value="">Kurtarma yok</option>
                                            {ABILITIES.map((a) => (
                                                <option key={a.key} value={a.key}>
                                                    {a.short} kurtarması
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {spell.save && (
                                        <span className="flex items-center gap-0.5 text-[11px]" title="Zorluk derecesi">
                                            ZD <Num value={spell.save.dc} onChange={(v) => setSpell({ ...spell, save: { ...spell.save!, dc: v } })} min={1} max={30} className="font-bold" />
                                        </span>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                        onClick={() => {
                                            ctrl.setTargeting({ mode: 'spell', actorId: t.id, spell });
                                            setSpell(null);
                                        }}
                                        disabled={!parseDice(spell.dice) || (R('mana') && s.mana < spell.cost)}
                                        className="rounded-md bg-sky-600/70 py-1.5 font-bold text-white hover:bg-sky-500/80 disabled:opacity-40"
                                    >
                                        Hedef seç
                                    </button>
                                    <button
                                        onClick={() => {
                                            ctrl.castSpell(t.id, null, spell);
                                            setSpell(null);
                                        }}
                                        disabled={!parseDice(spell.dice) || (R('mana') && s.mana < spell.cost)}
                                        className="rounded-md border border-sky-400/40 py-1.5 font-bold text-sky-100 hover:bg-sky-900/40 disabled:opacity-40"
                                    >
                                        Kendine
                                    </button>
                                </div>
                                {R('mana') && s.mana < spell.cost && <div className="text-[11px] text-red-300">MANA yetmiyor ({s.mana}/{spell.cost})</div>}
                            </div>
                        )}
                    </Section>
                )}

                </fieldset>
                {compact && (
                    <button onClick={() => setExpanded((v) => !v)} className="w-full rounded-md border border-[#c9a35a]/25 py-1 text-[11.5px] font-bold text-[#c9a35a] hover:text-[#f1dca6]">
                        {expanded ? 'Ayrıntıları gizle ▴' : 'Ayrıntılar: değerler, yetenekler, durumlar ▾'}
                    </button>
                )}
                <fieldset disabled={!gm} className="m-0 min-w-0 space-y-2.5 border-0 p-0">
                {detail && gm && (
                <div className="flex items-center gap-1.5 border-t border-[#c9a35a]/15 pt-2.5">
                    <button
                        onClick={() => {
                            saveToLibrary(t);
                            setSaved(true);
                        }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[#c9a35a]/30 py-1.5 text-[11.5px] font-bold text-[#f1dca6] hover:bg-[#c9a35a]/10"
                        title="Bu karakteri her mekânda tek tıkla eklemek için kaydet"
                    >
                        {saved ? <Check size={13} /> : <BookmarkPlus size={13} />} {saved ? 'Kütüphanede' : 'Kütüphaneye kaydet'}
                    </button>
                    <button onClick={() => ctrl.removeToken(t.id)} className="rounded-md border border-red-500/30 p-1.5 text-red-300/80 hover:border-red-400 hover:text-red-300" aria-label="Token'ı kaldır" title="Token'ı kaldır">
                        <Trash2 size={14} />
                    </button>
                </div>
                )}
                </fieldset>
            </div>
        </div>
    );
}
