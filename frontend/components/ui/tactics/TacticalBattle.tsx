'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Canvas } from '@react-three/fiber';
import { Footprints, HandHelping, Hourglass, RotateCcw, ScrollText, Swords, X } from 'lucide-react';
import type { Token } from '../panorama/battle';
import * as E from './engine';
import ArenaScene, { ARENA, Anim, LiveFx, PathLine, RangeRing } from './Arena';

type Mode = { kind: 'move' } | { kind: 'attack' } | { kind: 'ability'; id: E.AbilityId } | { kind: 'revive' };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hitChance = (a: E.Unit, t: E.Unit, stat: E.Stat) => Math.round(Math.min(0.95, Math.max(0.05, (21 - (E.defOf(t) - E.hitBonus(a, stat))) / 20)) * 100);
const fmtM = (m: number) => `${m.toFixed(1).replace('.', ',')} m`;

const TONE: Record<E.LogTone, string> = {
    info: 'text-amber-100/60',
    hit: 'text-red-300',
    miss: 'text-zinc-400',
    crit: 'text-amber-300',
    heal: 'text-green-300',
    status: 'text-violet-300',
    turn: 'text-amber-200',
    down: 'text-red-400',
    win: 'text-green-300',
    lose: 'text-red-400',
};

/**
 * Taktik savaş: sıra tabanlı, serbest hareketli (metre), ana eylem + hareket bütçesi, d20 saldırıları,
 * bekleme süreli yetenekler, durumlar ve düşman yapay zekâsı. Ferrodoxin'in taktik savaş prototipinden
 * esinlenildi (sıra şeridi, yoldaş paneli, ayrıntılı zar günlüğü, eylem çubuğu ve kısayollar).
 */
export default function TacticalBattle({ panoUrl, title, tokens, onClose }: { panoUrl?: string; title: string; tokens: Token[]; onClose: () => void }) {
    const fromTable = useMemo(() => E.unitsFromTokens(tokens), [tokens]);
    const [s, setS] = useState<E.TacState | null>(null);
    const sRef = useRef<E.TacState | null>(null);
    const commit = useCallback((st: E.TacState) => {
        sRef.current = st;
        setS(st);
    }, []);
    const [mode, setMode] = useState<Mode>({ kind: 'move' });
    const [busy, setBusy] = useState(false);
    const [fx, setFx] = useState<LiveFx[]>([]);
    const [detail, setDetail] = useState<E.RollDetail | null>(null);
    const [hover, setHover] = useState<E.Vec | null>(null);
    const [hoverUnit, setHoverUnit] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [logOpen, setLogOpen] = useState(true);
    const anims = useRef(new Map<string, Anim>());
    const lunges = useRef(new Map<string, { at: number; to: E.Vec }>());
    const logEnd = useRef<HTMLDivElement>(null);

    const start = (units: E.Unit[]) => {
        const fresh = units.map((u) => ({ ...u, statuses: [], cooldowns: {}, hp: u.hpMax, mana: u.manaMax, down: false, dead: false }));
        commit(E.startBattle(fresh, E.randomObstacles(fresh, ARENA)));
        setDetail(null);
        setMode({ kind: 'move' });
    };

    const cur = s ? E.current(s) : undefined;
    const myTurn = !!s && !s.over && cur?.team === 'yoldas';

    // Günlük sona kaysın
    useEffect(() => {
        logEnd.current?.scrollIntoView({ block: 'end' });
    }, [s?.log.length]);
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 2200);
        return () => clearTimeout(t);
    }, [toast]);
    // Etkiler 1,6 sn sonra silinir
    useEffect(() => {
        if (!fx.length) return;
        const t = setTimeout(() => setFx((f) => f.filter((x) => performance.now() - x.t < 1600)), 1700);
        return () => clearTimeout(t);
    }, [fx]);

    const animate = (id: string, pts: E.Vec[]) =>
        new Promise<void>((res) => {
            const len = pts.slice(1).reduce((a, p, i) => a + E.dist(pts[i], p), 0);
            const dur = Math.max(250, (len / 5.5) * 1000);
            anims.current.set(id, { pts, start: performance.now(), dur });
            setTimeout(() => {
                anims.current.delete(id);
                res();
            }, dur);
        });

    /** Bir eylemin sonucunu uygula (etki, hamle, ayrıntı kartı) */
    const apply = (r: E.ActResult, actorId: string) => {
        if (r.error) {
            setToast(r.error);
            return false;
        }
        const t = performance.now();
        const strike = r.fx.find((f) => f.kind === 'swing' || f.kind === 'projectile');
        if (strike) lunges.current.set(actorId, { at: t, to: strike.to });
        setFx((f) => [...f, ...r.fx.map((x) => ({ ...x, t }))]);
        if (r.detail) setDetail(r.detail);
        commit(r.state);
        return true;
    };

    /** Yürü: engellerin çevresinden, bütçe kadar */
    const walk = async (st: E.TacState, to: E.Vec) => {
        const u = E.current(st)!;
        const path = E.findPath(st, u.pos, to);
        if (!path) return setToast('Oraya yol yok'), st;
        let clipped = E.clipPath(path.pts, st.turn.moveLeft);
        for (let k = 0; k < 8 && E.blocked(st, clipped.pts[clipped.pts.length - 1], u.id, ARENA); k++) clipped = E.clipPath(path.pts, Math.max(0, clipped.len - 0.5));
        if (clipped.len < 0.1) return setToast(st.turn.moveLeft < 0.1 ? 'Hareket hakkın bitti (İlerle ile ikiye katla)' : 'Oraya duramazsın'), st;
        const next = E.moveTo(st, clipped);
        commit(next);
        await animate(u.id, clipped.pts);
        return next;
    };

    // --- Oyuncu girdileri
    const onGround = async (p: E.Vec) => {
        if (!s || !myTurn || busy) return;
        if (mode.kind === 'ability' && E.ABILITIES[mode.id].target === 'area') {
            if (apply(E.castAbility(s, mode.id, p), cur!.id)) setMode({ kind: 'move' });
            return;
        }
        if (mode.kind !== 'move') return setMode({ kind: 'move' });
        setBusy(true);
        await walk(s, p);
        setBusy(false);
    };

    const onUnit = async (id: string) => {
        if (!s || !myTurn || busy) return;
        const t = s.units.find((u) => u.id === id)!;
        const a = cur!;
        if (mode.kind === 'attack' || (mode.kind === 'move' && t.team !== a.team && !t.dead)) {
            if (apply(E.attack(s, id), a.id)) setMode({ kind: 'move' });
            return;
        }
        if (mode.kind === 'ability') {
            const ab = E.ABILITIES[mode.id];
            if (ab.target === 'area') return apply(E.castAbility(s, mode.id, t.pos), a.id) && setMode({ kind: 'move' });
            if (apply(E.castAbility(s, mode.id, id), a.id)) setMode({ kind: 'move' });
            return;
        }
        if (mode.kind === 'revive' || (t.down && t.team === a.team)) {
            if (apply(E.revive(s, id), a.id)) setMode({ kind: 'move' });
        }
    };

    const endTurn = () => {
        if (!s || !myTurn || busy) return;
        commit(E.nextTurn(s));
        setMode({ kind: 'move' });
    };
    const dash = () => {
        if (!s || !myTurn || busy) return;
        apply(E.dash(s), cur!.id);
    };
    const pickAbility = (id: E.AbilityId) => {
        if (!s || !myTurn || busy) return;
        const ab = E.ABILITIES[id];
        const why = E.abilityBlock(s, cur!, ab);
        if (why) return setToast(why);
        if (ab.target === 'self') return void apply(E.castAbility(s, id), cur!.id);
        setMode((m) => (m.kind === 'ability' && m.id === id ? { kind: 'move' } : { kind: 'ability', id }));
    };

    // Kısayollar: Q saldır, E ilerle, Boşluk turu bitir, 1-4 yetenek, R kaldır, Esc iptal
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
            if (e.key === 'Escape') {
                if (mode.kind !== 'move') setMode({ kind: 'move' });
                else onClose();
                return;
            }
            if (!myTurn) return;
            const k = e.key.toLowerCase();
            if (k === 'q') setMode((m) => (m.kind === 'attack' ? { kind: 'move' } : { kind: 'attack' }));
            else if (k === 'e') dash();
            else if (k === 'r') setMode({ kind: 'revive' });
            else if (e.code === 'Space') {
                e.preventDefault();
                endTurn();
            } else if (/^[1-4]$/.test(k)) {
                const id = cur?.abilities[Number(k) - 1];
                if (id) pickAbility(id);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }); // her render'da güncel durumla

    // --- Düşman yapay zekâsı: adım adım, canlandırarak
    const aiTurn = useRef('');
    useEffect(() => {
        if (!s || s.over || !cur || cur.team !== 'dusman') return;
        const key = `${s.round}:${s.turnIdx}`;
        if (aiTurn.current === key) return;
        aiTurn.current = key;
        (async () => {
            setBusy(true);
            await wait(650);
            let st = sRef.current!;
            for (const step of E.aiPlan(st)) {
                if (st.over) break;
                if (step.kind === 'move') {
                    st = E.moveTo(st, step.path);
                    commit(st);
                    await animate(E.current(st)!.id, step.path.pts);
                } else if (step.kind === 'attack' || step.kind === 'ability') {
                    await wait(250);
                    const r = step.kind === 'attack' ? E.attack(st, step.target) : E.castAbility(st, step.id, step.target);
                    if (!r.error) {
                        apply(r, E.current(st)!.id);
                        st = r.state;
                    }
                    await wait(900);
                } else {
                    await wait(350);
                    st = E.nextTurn(st);
                    commit(st);
                }
            }
            setBusy(false);
        })();
    }, [s?.round, s?.turnIdx, s?.over]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Ön izleme: yürüyüş yolu, menziller, isabet şansı
    const preview = useMemo(() => {
        if (!s || !myTurn || busy || !cur) return null;
        const items: React.ReactNode[] = [];
        if (mode.kind === 'move') {
            items.push(<RangeRing key="mv" at={cur.pos} r={s.turn.moveLeft} color="#f5d36b" dashed />);
            if (hover && !hoverUnit) {
                const path = E.findPath(s, cur.pos, hover);
                if (path) {
                    const clipped = E.clipPath(path.pts, s.turn.moveLeft);
                    const over = path.len > s.turn.moveLeft + 0.05;
                    items.push(<PathLine key="p" pts={clipped.pts} color={over ? '#f59e0b' : '#9be37b'} label={over ? `${fmtM(path.len)} · ${fmtM(s.turn.moveLeft)} gidebilir` : fmtM(path.len)} />);
                }
            }
        }
        if (mode.kind === 'attack') items.push(<RangeRing key="at" at={cur.pos} r={cur.weapon.range} color="#ef4444" />);
        if (mode.kind === 'revive') items.push(<RangeRing key="rv" at={cur.pos} r={E.MELEE} color="#4ade80" />);
        if (mode.kind === 'ability') {
            const ab = E.ABILITIES[mode.id];
            items.push(<RangeRing key="ab" at={cur.pos} r={ab.range || ab.radius || 0} color={ab.target === 'ally' ? '#4ade80' : '#c084fc'} />);
            if (ab.target === 'area' && hover) items.push(<RangeRing key="area" at={hover} r={ab.radius ?? 2} color="#fb923c" />);
        }
        return items;
    }, [s, myTurn, busy, cur, mode, hover, hoverUnit]);

    const labels = useMemo(() => {
        const out: Record<string, string> = {};
        if (!s || !myTurn || !cur || !hoverUnit) return out;
        const t = s.units.find((u) => u.id === hoverUnit);
        if (!t || t.dead) return out;
        const d = E.dist(cur.pos, t.pos);
        if (t.team !== cur.team && (mode.kind === 'attack' || mode.kind === 'move')) {
            out[t.id] = d <= cur.weapon.range + 0.05 ? `${cur.weapon.name} · isabet %${hitChance(cur, t, cur.weapon.stat)}` : `menzil dışı (${fmtM(d)})`;
        } else if (mode.kind === 'ability') {
            const ab = E.ABILITIES[mode.id];
            if (ab.target === 'enemy' && t.team !== cur.team) out[t.id] = d <= ab.range + 0.05 ? `${ab.name} · isabet %${hitChance(cur, t, ab.stat!)}` : `menzil dışı (${fmtM(d)})`;
            if (ab.target === 'ally' && t.team === cur.team) out[t.id] = d <= ab.range + 0.05 ? `${ab.name}` : `menzil dışı (${fmtM(d)})`;
        } else if (t.down && t.team === cur.team) out[t.id] = d <= E.MELEE + 0.05 ? 'Kaldır [R]' : 'yanına git';
        return out;
    }, [s, myTurn, cur, hoverUnit, mode]);

    // --- Başlangıç ekranı
    if (!s)
        return createPortal(
            <div className="fixed inset-0 z-[14000] flex items-center justify-center bg-black/85 p-3">
                <section className="vl-leather relative w-full max-w-xl rounded-2xl p-6 text-amber-50">
                    <button onClick={onClose} aria-label="Kapat" className="absolute right-4 top-4 text-[#c9a35a]/70 hover:text-[#f1dca6]">
                        <X size={20} />
                    </button>
                    <div className="text-[11px] font-black uppercase tracking-[0.35em] text-[#c9a35a]/80">{title}</div>
                    <h2 className="font-display text-3xl font-bold text-[#f1dca6]">Taktik Savaş</h2>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-amber-100/70">
                        Sıra tabanlı, ızgarasız savaş. Her tur bir <b>hareket</b> hakkın (metre) ve bir <b>ana eylemin</b> var: saldır, yetenek kullan, ilerle ya da bir yoldaşı kaldır. Saldırı d20 + isabet bonusu, hedefin savunmasına karşı; hasar zar + özellik bonusu. Zemin, bu mekânın kendi
                        zemininden.
                    </p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        <button onClick={() => start(E.defaultUnits())} className="rounded-lg border border-[#c9a35a]/40 bg-black/30 p-3 text-left hover:border-[#e2c178]">
                            <div className="font-display text-lg font-bold text-[#f1dca6]">Haydut pususu</div>
                            <div className="text-[12px] text-amber-100/55">Dört yoldaş (Savunucu, Öfkeli, Gölge, Şifacı) dört haydutla karşı karşıya.</div>
                        </button>
                        <button
                            disabled={!fromTable}
                            onClick={() => fromTable && start(fromTable)}
                            className="rounded-lg border border-[#c9a35a]/40 bg-black/30 p-3 text-left hover:border-[#e2c178] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <div className="font-display text-lg font-bold text-[#f1dca6]">Masadaki token&apos;larla</div>
                            <div className="text-[12px] text-amber-100/55">{fromTable ? `${fromTable.filter((u) => u.team === 'yoldas').length} yoldaş, ${fromTable.filter((u) => u.team === 'dusman').length} düşman; karakter kartları kullanılır.` : 'Savaş ızgarasına önce oyuncu ve düşman token\'ı koy.'}</div>
                        </button>
                    </div>
                    <p className="mt-4 border-t border-[#c9a35a]/20 pt-3 text-[11.5px] italic text-amber-100/45">
                        Bu mod, Ferrodoxin&apos;in taktik savaş prototipinden esinlenmiştir: sıra şeridi, yoldaş paneli, ayrıntılı zar günlüğü ve kısayollu eylem çubuğu fikri ondan.
                    </p>
                </section>
            </div>,
            document.body,
        );

    const allies = s.units.filter((u) => u.team === 'yoldas');
    const ab = (id: E.AbilityId) => E.ABILITIES[id];
    const lastLines = s.log.slice(-60);

    return createPortal(
        <div className="fixed inset-0 z-[14000] select-none bg-black text-amber-50">
            <Canvas camera={{ position: [0, 15, 17], fov: 42 }} dpr={[1, 2]}>
                <ArenaScene
                    state={s}
                    panoUrl={panoUrl}
                    anims={anims}
                    lunges={lunges}
                    fx={fx}
                    focus={cur?.pos ?? null}
                    overlay={preview}
                    labels={labels}
                    onGround={onGround}
                    onHoverGround={setHover}
                    onUnit={onUnit}
                    onHoverUnit={setHoverUnit}
                />
            </Canvas>

            {/* Üst: sıra şeridi */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[60] flex flex-col items-center gap-1 p-2">
                <div className="pointer-events-auto flex max-w-[94vw] items-stretch gap-1 overflow-x-auto rounded-lg border border-[#c9a35a]/30 bg-black/75 p-1.5 custom-scrollbar">
                    <div className="flex shrink-0 flex-col justify-center px-2 text-[10px] font-black uppercase tracking-widest text-[#c9a35a]">
                        Savaş sırası
                        <span className="text-[12px] text-amber-100">Tur {s.round}</span>
                    </div>
                    {s.order.map((id) => {
                        const u = s.units.find((x) => x.id === id)!;
                        const on = id === cur?.id && !s.over;
                        return (
                            <div
                                key={id}
                                className={`min-w-[74px] shrink-0 rounded-md border px-2 py-1 text-center text-[11.5px] ${on ? 'border-[#f5d36b] bg-[#f5d36b]/15' : 'border-white/10'} ${u.dead ? 'opacity-30' : u.down ? 'opacity-50' : ''}`}
                            >
                                <div className={`font-bold ${u.team === 'yoldas' ? 'text-sky-200' : 'text-red-200'}`}>{u.name}</div>
                                {u.statuses
                                    .filter((x) => x.key !== 'baygin')
                                    .map((x) => (
                                        <div key={x.key} className="text-[10px] leading-tight" style={{ color: E.STATUS_INFO[x.key].tone }}>
                                            {E.STATUS_INFO[x.key].label} · {x.turns} tur
                                        </div>
                                    ))}
                                {u.dead && <div className="text-[10px] text-zinc-400">Öldü</div>}
                                {u.down && <div className="text-[10px] text-zinc-400">Baygın</div>}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Sağ üst: kapat, yeniden */}
            <div className="absolute right-2 top-2 z-[61] flex gap-1.5">
                <button onClick={() => {
                        sRef.current = null;
                        setS(null);
                    }} title="Yeni savaş" className="rounded-full border border-[#c9a35a]/40 bg-black/70 p-2 text-[#c9a35a] hover:text-[#f1dca6]">
                    <RotateCcw size={16} />
                </button>
                <button onClick={onClose} aria-label="Kapat" className="rounded-full border border-[#c9a35a]/40 bg-black/70 p-2 text-[#c9a35a] hover:text-[#f1dca6]">
                    <X size={16} />
                </button>
            </div>

            {/* Sol: yoldaşlar */}
            <aside className="absolute left-2 top-24 z-[60] hidden w-52 rounded-lg border border-[#c9a35a]/25 bg-black/75 p-2 md:block">
                <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-[#c9a35a]">Yoldaşlar</div>
                {allies.map((u) => (
                    <div key={u.id} className={`mb-1.5 rounded-md border p-1.5 ${u.id === cur?.id ? 'border-[#f5d36b]/70 bg-[#f5d36b]/10' : 'border-white/5'}`}>
                        <div className="flex items-baseline justify-between text-[12.5px]">
                            <span className="font-bold text-sky-100">{u.name}</span>
                            <span className="text-[10.5px] text-amber-100/50">{u.role}</span>
                        </div>
                        <Bar v={u.hp} max={u.hpMax} color="#b4232f" />
                        {u.manaMax > 0 && <Bar v={u.mana} max={u.manaMax} color="#2f6fd6" />}
                        {u.down && <div className="text-[10.5px] text-zinc-400">Baygın: yanına gidip kaldır [R]</div>}
                    </div>
                ))}
            </aside>

            {/* Sağ: son atış ve savaş günlüğü */}
            <aside className={`absolute right-2 top-24 z-[60] w-[min(320px,46vw)] rounded-lg border border-[#c9a35a]/25 bg-[#0c1a12]/85 p-2 ${logOpen ? '' : 'h-9 overflow-hidden'}`}>
                <button onClick={() => setLogOpen((v) => !v)} className="mb-1 flex w-full items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#c9a35a]">
                    <ScrollText size={12} /> Savaş günlüğü
                </button>
                {detail && (
                    <div className="mb-2 rounded-md border border-white/10 bg-black/40 p-2 text-[12px]">
                        <div className="font-bold text-amber-100">{detail.title}</div>
                        {detail.lines.map(([k, v], i) => (
                            <div key={i} className="flex justify-between gap-2 text-amber-100/75">
                                <span>{k}</span>
                                <span className="font-mono font-bold">{v}</span>
                            </div>
                        ))}
                        {detail.verdict && <div className={`mt-1 text-[13px] font-black tracking-wider ${TONE[detail.verdict.tone]}`}>{detail.verdict.text}</div>}
                    </div>
                )}
                <div className="max-h-[34vh] space-y-0.5 overflow-y-auto pr-1 text-[11.5px] leading-snug custom-scrollbar">
                    {lastLines.map((l) => (
                        <div key={l.id} className={`${TONE[l.tone]} ${l.detail ? 'cursor-pointer hover:underline' : ''}`} onClick={() => l.detail && setDetail(l.detail)}>
                            {l.tone === 'turn' ? <b>{l.text}</b> : `– ${l.text}`}
                        </div>
                    ))}
                    <div ref={logEnd} />
                </div>
            </aside>

            {/* Alt: eylem çubuğu */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-1 p-2">
                {toast && <div className="rounded-md bg-red-950/90 px-3 py-1 text-[12.5px] font-bold text-red-100">{toast}</div>}
                <div className="pointer-events-auto w-full max-w-3xl rounded-lg border border-[#c9a35a]/30 bg-black/80 p-2">
                    {myTurn && cur ? (
                        <>
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="mr-1 font-display text-[15px] font-bold text-sky-100">{cur.name}</span>
                                <ActBtn on={mode.kind === 'attack'} disabled={s.turn.actionUsed} onClick={() => setMode((m) => (m.kind === 'attack' ? { kind: 'move' } : { kind: 'attack' }))} icon={Swords} label={`Saldır (${cur.weapon.name})`} hot="Q" />
                                <ActBtn disabled={s.turn.actionUsed} onClick={dash} icon={Footprints} label="İlerle" hot="E" tip={`Ana eylemi harcar, hareket +${fmtM(cur.speed)}`} />
                                <ActBtn on={mode.kind === 'revive'} disabled={s.turn.actionUsed || !allies.some((u) => u.down)} onClick={() => setMode({ kind: 'revive' })} icon={HandHelping} label="Kaldır" hot="R" tip="Yanındaki baygın yoldaşı 1 canla ayağa kaldırır" />
                                <ActBtn onClick={endTurn} icon={Hourglass} label="Turu tamamla" hot="Boşluk" />
                            </div>
                            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                {cur.abilities.map((id, i) => {
                                    const a = ab(id);
                                    const cd = cur.cooldowns[id] ?? 0;
                                    const block = E.abilityBlock(s, cur, a);
                                    const on = mode.kind === 'ability' && mode.id === id;
                                    return (
                                        <button
                                            key={id}
                                            onClick={() => pickAbility(id)}
                                            className={`group relative rounded-md border px-2 py-1.5 text-left text-[12px] ${on ? 'border-violet-300 bg-violet-500/20' : 'border-[#c9a35a]/30 bg-black/40 hover:border-[#e2c178]'} ${block ? 'opacity-45' : ''}`}
                                        >
                                            <div className="flex justify-between font-bold">
                                                <span>
                                                    {a.name} <span className="text-amber-100/40">[{i + 1}]</span>
                                                </span>
                                                {cd > 0 && <span className="text-amber-300">{cd}</span>}
                                            </div>
                                            <div className="text-[10.5px] text-amber-100/50">
                                                {a.mana ? `${a.mana} MANA · ` : ''}
                                                {a.range ? fmtM(a.range) : a.radius ? `${fmtM(a.radius)} çevre` : 'kendine'}
                                            </div>
                                            {/* Ayrıntı (videodaki gibi: formül, menzil, bedel, bekleme, etki) */}
                                            <div className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-64 rounded-md border border-[#c9a35a]/40 bg-black/95 p-2 text-[11.5px] leading-snug text-amber-100/80 group-hover:block">
                                                <div className="font-bold text-amber-100">
                                                    [{i + 1}] {a.name}
                                                </div>
                                                <div>{a.desc}</div>
                                                {a.stat && (
                                                    <div className="mt-1">
                                                        {a.target === 'ally' ? 'İyileşme' : 'Saldırı'}: {a.target === 'ally' ? '' : `d20 + isabet (${E.STAT_LABEL[a.stat]} ${E.sgn(E.mod(cur.stats[a.stat]))} + ustalık ${cur.prof}) hedefin savunmasına karşı; `}
                                                        {a.dice} {E.sgn(E.mod(cur.stats[a.stat]))}
                                                    </div>
                                                )}
                                                <div>
                                                    Menzil {a.range ? fmtM(a.range) : '—'}
                                                    {a.radius ? ` · alan ${fmtM(a.radius)}` : ''} · MANA {a.mana} · bekleme {a.cooldown} tur
                                                </div>
                                                {a.status && (
                                                    <div style={{ color: E.STATUS_INFO[a.status.key].tone }}>
                                                        Etki: {E.STATUS_INFO[a.status.key].label} · {a.status.turns} tur ({E.STATUS_INFO[a.status.key].desc})
                                                    </div>
                                                )}
                                                {block && <div className="text-red-300">{block}</div>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-1.5 text-[11.5px] text-amber-100/60">
                                Sıra sende · Hareket {fmtM(s.turn.moveLeft)} · Ana eylem {s.turn.actionUsed ? 'harcandı' : 'hazır'}
                                {' · '}
                                {mode.kind === 'move' && 'Yere tıkla: yürü. Düşmana tıkla: saldır.'}
                                {mode.kind === 'attack' && 'Bir düşman seç (Esc: vazgeç).'}
                                {mode.kind === 'revive' && 'Yanındaki baygın yoldaşı seç.'}
                                {mode.kind === 'ability' && (ab(mode.id).target === 'area' ? 'Bir nokta seç: alan yeteneği yoldaşları da vurur!' : ab(mode.id).target === 'ally' ? 'Bir yoldaş seç.' : 'Bir düşman seç.')}
                            </div>
                        </>
                    ) : (
                        <div className="py-1 text-center text-[13px] text-amber-100/70">{s.over ? '' : `${cur?.name ?? ''} düşünüyor…`}</div>
                    )}
                </div>
                <div className="text-[10.5px] italic text-amber-100/35">Ferrodoxin&apos;in taktik savaş prototipinden esinlenildi · sürükle: döndür, sağ tık sürükle: kaydır, tekerlek: yakınlaş</div>
            </div>

            {/* Sonuç */}
            {s.over && (
                <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55">
                    <div className="vl-leather rounded-2xl p-6 text-center">
                        <div className={`font-display text-4xl font-bold ${s.over === 'zafer' ? 'text-[#f1dca6]' : 'text-red-300'}`}>{s.over === 'zafer' ? 'Zafer' : 'Yenilgi'}</div>
                        <div className="mt-1 text-[13px] text-amber-100/60">{s.round} turda</div>
                        <div className="mt-4 flex justify-center gap-2">
                            <button onClick={() => start(s.units)} className="vl-seal rounded-md px-5 py-2 font-display font-bold">
                                Yeniden
                            </button>
                            <button onClick={onClose} className="rounded-md border border-[#c9a35a]/40 px-5 py-2 font-bold text-[#c9a35a]">
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body,
    );
}

function Bar({ v, max, color }: { v: number; max: number; color: string }) {
    return (
        <div className="relative mt-0.5 h-3.5 overflow-hidden rounded-sm bg-black/70">
            <div className="h-full" style={{ width: `${Math.max(0, (v / max) * 100)}%`, background: color }} />
            <span className="absolute inset-0 text-center text-[10px] font-bold leading-[14px] text-white/90">
                {v} / {max}
            </span>
        </div>
    );
}

function ActBtn({ on, disabled, onClick, icon: Icon, label, hot, tip }: { on?: boolean; disabled?: boolean; onClick: () => void; icon: React.ElementType; label: string; hot: string; tip?: string }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={tip}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-bold ${on ? 'border-red-300 bg-red-500/20' : 'border-[#c9a35a]/35 bg-black/40 hover:border-[#e2c178]'} disabled:opacity-35`}
        >
            <Icon size={14} /> {label} <span className="text-amber-100/40">[{hot}]</span>
        </button>
    );
}
