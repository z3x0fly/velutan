'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { diceStore, type DieRequest } from '../dice3d/diceStore';
import { BattleState, cellDistance, DEFAULT_GRID, LogTone, newId, Token, TOKEN_KINDS, useBattle, worldToCell } from './battle';
import { sessionStore } from './session';
import type { PendingToken } from './BattlePanel';
import { Ability, ABILITIES, applyDamage, applyHeal, defaultSheet, Edge, mod, normalizeRules, parseDice, Rules, sanityOf, Sheet, signed } from './rules';

export interface Toast {
    id: number;
    title: string;
    sub?: string;
    tone: LogTone;
}

export interface Spell {
    name: string;
    cost: number;
    dice: string;
    kind: 'damage' | 'heal';
    /** Hedef kurtarma zarı: başarıda yarım hasar */
    save?: { ability: Ability; dc: number } | null;
}

export type Targeting = { mode: 'attack' | 'spell'; actorId: string; spell?: Spell } | null;

const edgeLabel = (e: Edge) => (e === 'advantage' ? ' (avantajlı)' : e === 'disadvantage' ? ' (dezavantajlı)' : '');

const EMPTY_REMOTE: BattleState = { on: false, grid: DEFAULT_GRID, tokens: [] };

/**
 * Savaş: durum, kurallar ve bütün hamleler. Zarlar fizik masasından (diceStore) gelir.
 * Ortak masada GM'in durumu masaya gider; oyuncuda durum GM'den gelir ve salt okunurdur.
 */
export function useBattleController(panoSlug: string, regionSlug = '') {
    const sess = useSyncExternalStore(sessionStore.subscribe, sessionStore.get, sessionStore.get);
    const isPlayer = sess.role === 'player' && !!sess.code;
    const isGm = sess.role === 'gm' && !!sess.code;
    const [localBattle, setLocalBattle] = useBattle(panoSlug);
    // Oyuncunun kendi token'ını taşıması anında görünsün; GM'den yeni durum gelince silinir
    const [moves, setMoves] = useState<Record<string, { cx: number; cz: number }>>({});
    useEffect(() => {
        setMoves({});
    }, [sess.remote?.version]);
    const remoteState = (sess.remote?.state as BattleState | undefined) ?? EMPTY_REMOTE;
    const battle: BattleState = isPlayer
        ? { ...remoteState, tokens: remoteState.tokens.map((t) => (moves[t.id] ? { ...t, ...moves[t.id] } : t)) }
        : localBattle;
    // Oyuncu durumu değiştirmez (yalnızca GM)
    const setBattle: typeof setLocalBattle = isPlayer ? () => undefined : setLocalBattle;
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [placing, setPlacing] = useState<PendingToken | null>(null);
    const [dragInfo, setDragInfo] = useState<{ text: string; over: boolean } | null>(null);
    const [targeting, setTargeting] = useState<Targeting>(null);
    const [toast, setToast] = useState<Toast | null>(null);
    const [busy, setBusy] = useState(false);
    const latest = useRef(battle);
    latest.current = battle;
    const logId = useRef(0);

    useEffect(() => {
        setSelectedId(null);
        setPlacing(null);
        setTargeting(null);
    }, [panoSlug]);

    const rules: Rules | undefined = battle.rules;
    const R = (k: keyof Rules) => !!latest.current.rules?.[k];

    const show = useCallback((title: string, sub: string | undefined, tone: LogTone) => {
        const t = { id: Date.now(), title, sub, tone };
        setToast(t);
        setTimeout(() => setToast((cur) => (cur?.id === t.id ? null : cur)), 3800);
    }, []);

    // Son günlük satırından beri atılan zarlar: satırla birlikte saklanır (günlükte zar şekilleriyle görünür)
    const rolled = useRef<{ s: number; v: number }[]>([]);
    const log = (text: string, tone: LogTone = 'info', extraDice?: { s: number; v: number }[]) => {
        const dice = extraDice ?? rolled.current.splice(0);
        // Oyuncunun atışları masaya gider: GM günlüğe yazar, herkes görür
        if (isPlayer) return void sessionStore.act({ type: 'zar', label: text, tone, dice });
        if (!latest.current.rules?.log) return;
        const entry = { id: Date.now() * 100 + (logId.current++ % 100), text, tone, ...(dice.length ? { dice } : {}) };
        setBattle((s) => ({ ...s, log: [...(s.log ?? []), entry].slice(-150) }));
    };

    const token = (id: string) => latest.current.tokens.find((t) => t.id === id);
    const sheetOf = (t: Token) => t.sheet ?? defaultSheet(t.kind, t.size);
    const color = (t: Token) => TOKEN_KINDS[t.kind].color;

    const patchSheet = (id: string, fn: (s: Sheet) => Sheet) =>
        setBattle((s) => ({ ...s, tokens: s.tokens.map((t) => (t.id === id ? { ...t, sheet: fn(t.sheet ?? defaultSheet(t.kind, t.size)) } : t)) }));

    // --- Kurulum
    const startGame = (r: Rules) => {
        const rules = normalizeRules(r);
        setBattle((s) => ({
            ...s,
            rules,
            // Sistemli oyunda kartı olmayan token'lara tarafına göre kart verilir
            tokens: s.tokens.map((t) => (t.sheet ? t : { ...t, sheet: defaultSheet(t.kind, t.size) })),
            combat: rules.initiative ? s.combat ?? null : null,
        }));
    };

    // --- Token'lar
    const placeToken = (x: number, z: number) => {
        if (!placing) return;
        const id = newId();
        setBattle((s) => {
            const [cx, cz] = worldToCell(x, z, placing.size, s.grid);
            const tok: Token = { id, ...placing, cx, cz, sheet: placing.sheet ?? defaultSheet(placing.kind, placing.size) };
            // Savaş sürerken eklenen token sıranın sonuna girer
            const combat = s.combat ? { ...s.combat, order: [...s.combat.order, { id, init: -99 }] } : s.combat;
            return { ...s, tokens: [...s.tokens, tok], combat };
        });
        // Yerleştirince kart açılmaz (telefonda paneli kapatmasın); dokununca açılır
        setPlacing(null);
    };

    const removeToken = (id: string) => {
        setBattle((s) => {
            let combat = s.combat;
            if (combat) {
                const idx = combat.order.findIndex((o) => o.id === id);
                const order = combat.order.filter((o) => o.id !== id);
                const turn = idx >= 0 && idx < combat.turn ? combat.turn - 1 : combat.turn;
                combat = order.length ? { ...combat, order, turn: Math.min(turn, order.length - 1) } : null;
            }
            return { ...s, tokens: s.tokens.filter((t) => t.id !== id), combat };
        });
        setSelectedId((cur) => (cur === id ? null : cur));
    };

    const activeId = battle.combat ? battle.combat.order[battle.combat.turn]?.id ?? null : null;

    const moveToken = (id: string, cx: number, cz: number) => {
        if (isPlayer) {
            setMoves((m) => ({ ...m, [id]: { cx, cz } }));
            void sessionStore.act({ type: 'tasi', tokenId: id, cx, cz });
            return;
        }
        applyMove(id, cx, cz);
    };
    const applyMove = (id: string, cx: number, cz: number) =>
        setBattle((s) => {
            let combat = s.combat;
            if (combat && combat.start?.id === id) {
                combat = { ...combat, moved: Math.max(Math.abs(cx - combat.start.cx), Math.abs(cz - combat.start.cz)) };
            }
            return { ...s, tokens: s.tokens.map((t) => (t.id === id ? { ...t, cx, cz } : t)), combat };
        });

    /** Sürüklerken üstte görünen yazı: savaşta sıradaki token için hareket hakkı */
    const dragText = (t: Token, cx: number, cz: number, startCx: number, startCz: number, cell: number) => {
        const s = latest.current;
        const c = s.combat;
        if (s.rules?.movement && c && c.start?.id === t.id) {
            const used = Math.max(Math.abs(cx - c.start.cx), Math.abs(cz - c.start.cz));
            const speed = (t.sheet?.conditions.includes('tutsak') ? 0 : sheetOf(t).speed) * (c.dashed ? 2 : 1);
            return { text: `${t.name}: ${used} / ${speed} kare`, over: used > speed };
        }
        const n = Math.max(Math.abs(cx - startCx), Math.abs(cz - startCz));
        return { text: `${t.name}: ${n} kare · ${(n * cell).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} m`, over: false };
    };

    // --- Zar yardımcıları
    const d20 = async (edge: Edge, label: string, c?: string) => {
        const req: DieRequest[] = edge === 'normal' ? [{ sides: 20, color: c }] : [{ sides: 20, color: c }, { sides: 20, color: c }];
        const v = await diceStore.roll(req, label + edgeLabel(edge));
        rolled.current.push(...v.map((x) => ({ s: 20, v: x })));
        const nat = edge === 'advantage' ? Math.max(...v) : edge === 'disadvantage' ? Math.min(...v) : v[0];
        return { nat, rolls: v };
    };
    const rollExpr = async (expr: string, label: string, c?: string, crit = false) => {
        const d = parseDice(expr);
        if (!d) return { total: 0, detail: 'geçersiz zar' };
        if (!d.count) return { total: d.bonus, detail: String(d.bonus) };
        const count = crit ? d.count * 2 : d.count;
        const v = await diceStore.roll(Array.from({ length: count }, () => ({ sides: d.sides as DieRequest['sides'], color: c })), label);
        rolled.current.push(...v.map((x) => ({ s: d.sides, v: x })));
        const sum = v.reduce((a, b) => a + b, 0);
        return { total: Math.max(0, sum + d.bonus), detail: `[${v.join('+')}]${d.bonus ? signed(d.bonus) : ''}` };
    };

    // Aynı anda tek zar akışı (saldırı sürerken ikinci saldırı başlamasın)
    const busyRef = useRef(false);
    const run = async (fn: () => Promise<void>) => {
        if (busyRef.current) return;
        busyRef.current = true;
        rolled.current = [];
        setBusy(true);
        try {
            await fn();
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    // --- İnisiyatif ve turlar
    const startCombat = () =>
        run(async () => {
            const s = latest.current;
            const alive = s.tokens.filter((t) => sheetOf(t).state !== 'dead');
            if (!alive.length) return;
            const bonus = (t: Token) => (s.rules?.abilities ? mod(sheetOf(t).abilities.dex) : sheetOf(t).initBonus);
            // Herkesin d20'si tek atışta, taraf renginde (çok kalabalıkta masa yerine anında)
            const req = alive.map((t) => ({ sides: 20 as const, color: color(t) }));
            const v = alive.length <= 10 ? await diceStore.roll(req, 'İnisiyatif') : req.map(() => Math.floor(Math.random() * 20) + 1);
            rolled.current.push(...v.map((x) => ({ s: 20, v: x })));
            const order = alive
                .map((t, i) => ({ id: t.id, init: v[i] + bonus(t), dex: sheetOf(t).abilities.dex }))
                .sort((a, b) => b.init - a.init || b.dex - a.dex)
                .map(({ id, init }) => ({ id, init }));
            const first = alive.find((t) => t.id === order[0].id)!;
            setBattle((st) => ({ ...st, combat: { round: 1, order, turn: 0, start: { id: first.id, cx: first.cx, cz: first.cz }, moved: 0, dashed: false } }));
            log(`⚔ Savaş başladı. Sıra: ${order.map((o) => `${token(o.id)?.name} (${o.init})`).join(', ')}`, 'turn');
            show('Savaş başladı', `İlk sıra: ${first.name}`, 'turn');
            setSelectedId(first.id);
        });

    const nextTurn = () => {
        const s = latest.current;
        const c = s.combat;
        if (!c) return;
        let turn = c.turn;
        let round = c.round;
        // Ölüleri atla
        for (let k = 0; k < c.order.length; k++) {
            turn++;
            if (turn >= c.order.length) {
                turn = 0;
                round++;
            }
            const t = token(c.order[turn].id);
            if (t && sheetOf(t).state !== 'dead') break;
        }
        const t = token(c.order[turn].id);
        if (!t) return;
        setBattle((st) => ({ ...st, combat: { ...c, turn, round, start: { id: t.id, cx: t.cx, cz: t.cz }, moved: 0, dashed: false } }));
        if (round !== c.round) log(`— ${round}. tur —`, 'turn');
        log(`${t.name} sırası`, 'turn');
        setSelectedId(t.id);
        const st = sheetOf(t).state;
        show(`Sıra: ${t.name}`, st === 'down' && R('deathSaves') ? 'Baygın: ölüm kurtarma zarı at' : `${round}. tur`, 'turn');
    };

    const endCombat = () => {
        setBattle((s) => ({ ...s, combat: null }));
        log('Savaş bitti.', 'turn');
    };

    const dash = () => {
        setBattle((s) => (s.combat ? { ...s, combat: { ...s.combat, dashed: true } } : s));
        const t = activeId ? token(activeId) : null;
        if (t) log(`${t.name} atıldı (hareket iki kat).`, 'info');
    };

    // --- Zarlar: yetenek/kurtarma, serbest atış
    const abilityRoll = (id: string, ability: Ability, save: boolean, edge: Edge) =>
        run(async () => {
            const t = token(id);
            if (!t) return;
            const sh = sheetOf(t);
            const m = mod(sh.abilities[ability]);
            const name = ABILITIES.find((a) => a.key === ability)!.name;
            const { nat } = await d20(edge, `${t.name} · ${name} ${save ? 'kurtarması' : 'zarı'}`, color(t));
            const total = nat + m;
            const crit = R('crits') && nat === 20 ? 'crit' : R('crits') && nat === 1 ? 'fumble' : null;
            log(`${t.name} ${name} ${save ? 'kurtarması' : 'zarı'}${edgeLabel(edge)}: ${total} (d20 ${nat} ${signed(m)})`, crit ?? 'roll');
            show(`${total}`, `${t.name} · ${name} ${save ? 'kurtarması' : ''}${crit === 'crit' ? ' · Doğal 20!' : crit === 'fumble' ? ' · Doğal 1' : ''}`, crit ?? 'roll');
        });

    const freeRoll = (expr: string, edge: Edge, label = 'Serbest atış') =>
        run(async () => {
            const d = parseDice(expr);
            if (!d) return;
            if (d.sides === 20 && d.count === 1 && edge !== 'normal') {
                const { nat, rolls } = await d20(edge, label);
                const total = nat + d.bonus;
                log(`${label}${edgeLabel(edge)}: ${total} (d20 [${rolls.join(', ')}] ${d.bonus ? signed(d.bonus) : ''})`, nat === 20 ? 'crit' : nat === 1 ? 'fumble' : 'roll');
                show(`${total}`, `${expr}${edgeLabel(edge)}`, nat === 20 ? 'crit' : nat === 1 ? 'fumble' : 'roll');
                return;
            }
            const r = await rollExpr(expr, `${label} · ${expr}`);
            log(`${label} ${expr}: ${r.total} ${r.detail}`, 'roll');
            show(`${r.total}`, `${expr} · ${r.detail}`, 'roll');
        });

    // --- Saldırı
    const attack = (attackerId: string, targetId: string, edge: Edge) =>
        run(async () => {
            const a = token(attackerId), t = token(targetId);
            if (!a || !t) return;
            const as = sheetOf(a), ts = sheetOf(t);
            const { nat } = await d20(edge, `${a.name} → ${t.name} · ${as.attack.name}`, color(a));
            const total = nat + as.attack.bonus;
            const crit = R('crits') && nat === 20;
            const fumble = R('crits') && nat === 1;
            const hit = crit || (!fumble && total >= ts.ac);
            if (!hit) {
                log(`${a.name} → ${t.name}: ${as.attack.name} ${total} (d20 ${nat} ${signed(as.attack.bonus)}) · ZS ${ts.ac} · ${fumble ? 'DOĞAL 1, ISKA' : 'ıska'}`, fumble ? 'fumble' : 'miss');
                show(fumble ? 'Doğal 1 · Iska!' : 'Iska', `${total} < ZS ${ts.ac}`, fumble ? 'fumble' : 'miss');
                return;
            }
            show(crit ? 'KRİTİK!' : 'İsabet!', `${total} ≥ ZS ${ts.ac} · hasar atılıyor`, crit ? 'crit' : 'hit');
            const dmg = await rollExpr(as.attack.damage, `${a.name} · hasar${crit ? ' (kritik: zarlar iki kat)' : ''}`, color(a), crit);
            let next = applyDamage(ts, dmg.total, t.kind === 'oyuncu', R('deathSaves'));
            // Baygına kritik: iki başarısızlık
            if (crit && (ts.state === 'down' || ts.state === 'stable') && next.death) next = { ...next, death: { ...next.death, fail: Math.min(3, next.death.fail + 1) }, state: next.death.fail + 1 >= 3 ? 'dead' : next.state };
            patchSheet(t.id, () => next);
            log(`${a.name} → ${t.name}: ${as.attack.name} ${total} (d20 ${nat}) · ${crit ? 'KRİTİK' : 'isabet'} · ${dmg.total} hasar ${dmg.detail}`, crit ? 'crit' : 'hit');
            if (next.state === 'dead' && ts.state !== 'dead') log(`☠ ${t.name} öldü.`, 'death');
            else if (next.state === 'down' && ts.state !== 'down') log(`${t.name} bayıldı (0 HP).`, 'death');
            show(`${dmg.total} hasar`, `${t.name}: ${next.hp}/${next.hpMax} HP${next.state === 'dead' ? ' · öldü' : next.state === 'down' ? ' · bayıldı' : ''}`, crit ? 'crit' : 'hit');
        });

    // --- Büyü
    const castSpell = (casterId: string, targetId: string | null, spell: Spell) =>
        run(async () => {
            const c = token(casterId);
            if (!c) return;
            const cs = sheetOf(c);
            if (R('mana') && cs.mana < spell.cost) {
                show('MANA yetmiyor', `${spell.name} ${spell.cost} MANA ister, ${c.name}'de ${cs.mana} var`, 'miss');
                return;
            }
            if (R('mana') && spell.cost) patchSheet(c.id, (s) => ({ ...s, mana: s.mana - spell.cost }));
            const t = targetId ? token(targetId) : c;
            if (!t) return;
            const r = await rollExpr(spell.dice, `${c.name} · ${spell.name}`, color(c));
            let amount = r.total;
            let saveText = '';
            if (spell.kind === 'damage' && spell.save) {
                const ts = sheetOf(t);
                const m = mod(ts.abilities[spell.save.ability]);
                const { nat } = await d20('normal', `${t.name} · ${ABILITIES.find((a) => a.key === spell.save!.ability)!.name} kurtarması (ZD ${spell.save.dc})`, color(t));
                const ok = nat + m >= spell.save.dc;
                if (ok) amount = Math.floor(amount / 2);
                saveText = ` · kurtarma ${nat + m} ${ok ? 'BAŞARILI (yarım)' : 'başarısız'}`;
            }
            if (spell.kind === 'heal') {
                patchSheet(t.id, (s) => applyHeal(s, amount));
                log(`${c.name} → ${t.name}: ${spell.name} · ${amount} iyileşme ${r.detail}${spell.cost ? ` · −${spell.cost} MANA` : ''}`, 'heal');
                show(`+${amount} HP`, `${spell.name} → ${t.name}`, 'heal');
            } else {
                const before = sheetOf(t);
                const next = applyDamage(before, amount, t.kind === 'oyuncu', R('deathSaves'));
                patchSheet(t.id, () => next);
                log(`${c.name} → ${t.name}: ${spell.name} · ${amount} hasar ${r.detail}${saveText}${spell.cost ? ` · −${spell.cost} MANA` : ''}`, 'hit');
                if (next.state === 'dead' && before.state !== 'dead') log(`☠ ${t.name} öldü.`, 'death');
                show(`${amount} hasar`, `${spell.name} → ${t.name}${saveText}`, 'hit');
            }
        });

    // --- Ölüm kurtarma zarı
    const deathSave = (id: string) =>
        run(async () => {
            const t = token(id);
            if (!t) return;
            const { nat } = await d20('normal', `${t.name} · Ölüm kurtarma zarı`, color(t));
            const s = sheetOf(t);
            const d = { ok: s.death?.ok ?? 0, fail: s.death?.fail ?? 0 };
            if (nat === 20) {
                patchSheet(id, (x) => applyHeal(x, 1));
                log(`${t.name} ölüm kurtarması: DOĞAL 20 · 1 HP ile ayağa kalktı!`, 'crit');
                show('Doğal 20!', `${t.name} 1 HP ile kalktı`, 'crit');
                return;
            }
            if (nat === 1) d.fail += 2;
            else if (nat >= 10) d.ok += 1;
            else d.fail += 1;
            const state = d.fail >= 3 ? 'dead' : d.ok >= 3 ? 'stable' : 'down';
            patchSheet(id, (x) => ({ ...x, death: { ok: Math.min(3, d.ok), fail: Math.min(3, d.fail) }, state }));
            const res = state === 'dead' ? '☠ öldü' : state === 'stable' ? 'dengede' : `${Math.min(3, d.ok)} başarı / ${Math.min(3, d.fail)} başarısızlık`;
            log(`${t.name} ölüm kurtarması: ${nat} · ${res}`, state === 'dead' ? 'death' : nat >= 10 ? 'heal' : 'miss');
            show(`${nat}`, `${t.name} · ${res}`, state === 'dead' ? 'death' : nat >= 10 ? 'heal' : 'miss');
        });

    // --- Akıl sağlığı (Sanity)
    const adjustSanity = (id: string, delta: number) => {
        if (!token(id)) return;
        patchSheet(id, (s) => {
            const { cur, max } = sanityOf(s);
            const next = Math.max(0, Math.min(max, cur + delta));
            const conditions = next === 0 ? Array.from(new Set([...s.conditions, 'delirmis'])) : s.conditions.filter((c) => c !== 'delirmis');
            return { ...s, sanity: next, sanityMax: max, conditions };
        });
    };

    /** Akıl zarı: d20 + Bilgelik, ZD'ye karşı; başarısızlıkta kayıp zarı kadar akıl gider */
    const sanityCheck = (id: string, dc: number, loss: string, edge: Edge) =>
        run(async () => {
            const t = token(id);
            if (!t) return;
            const sh = sheetOf(t);
            const m = R('abilities') ? mod(sh.abilities.wis) : 0;
            const { nat } = await d20(edge, `${t.name} · Akıl zarı (ZD ${dc})`, color(t));
            const total = nat + m;
            const ok = (R('crits') && nat === 20) || (!(R('crits') && nat === 1) && total >= dc);
            if (ok) {
                log(`${t.name} akıl zarı: ${total} (d20 ${nat} ${signed(m)}) · ZD ${dc} · aklını korudu`, 'heal');
                show('Aklını korudu', `${t.name} · ${total} ≥ ZD ${dc}`, 'heal');
                return;
            }
            const r = await rollExpr(loss, `${t.name} · akıl kaybı`, '#6d28d9');
            const { cur, max } = sanityOf(sh);
            const next = Math.max(0, cur - r.total);
            patchSheet(id, (s) => ({ ...s, sanity: next, sanityMax: max, conditions: next === 0 ? Array.from(new Set([...s.conditions, 'delirmis'])) : s.conditions }));
            log(`${t.name} akıl zarı: ${total} (d20 ${nat} ${signed(m)}) · ZD ${dc} · başarısız, −${r.total} akıl ${r.detail} → ${next}/${max}`, 'miss');
            if (next === 0) log(`✺ ${t.name} aklını yitirdi.`, 'death');
            show(`−${r.total} akıl`, `${t.name}: ${next}/${max}${next === 0 ? ' · aklını yitirdi' : ''}`, next === 0 ? 'death' : 'miss');
        });

    /** Elle hasar/iyileşme (kart üzerindeki ± düğmeleri) */
    const adjustHp = (id: string, delta: number) => {
        const t = token(id);
        if (!t) return;
        const before = sheetOf(t);
        const next = delta < 0 ? applyDamage(before, -delta, t.kind === 'oyuncu', R('deathSaves')) : applyHeal(before, delta);
        patchSheet(id, () => next);
        log(`${t.name}: ${delta < 0 ? `${-delta} hasar` : `+${delta} HP`} → ${next.hp}/${next.hpMax}`, delta < 0 ? 'hit' : 'heal');
        if (next.state === 'dead' && before.state !== 'dead') log(`☠ ${t.name} öldü.`, 'death');
    };

    // --- Ortak masa: GM durumu gönderir, oyuncu eylemlerini uygular; herkes başkalarının zarlarını görür
    const toastRef = useRef(toast);
    toastRef.current = toast;
    useEffect(() => {
        if (isGm) sessionStore.push({ ...battle, toast: toastRef.current }, { region: regionSlug, slug: panoSlug });
    }, [isGm, battle, toast, panoSlug, regionSlug]);
    // Oyuncu: GM'in anlık bildirimleri (isabet, kritik…) burada da belirir
    const remoteToast = (remoteState as BattleState & { toast?: Toast | null }).toast ?? null;
    useEffect(() => {
        // Kendi atışının yankısını tekrar gösterme (zaten yerelde gösterildi)
        if (isPlayer && remoteToast && remoteToast.title !== `🎲 ${sess.name}`) {
            setToast(remoteToast);
            const id = remoteToast.id;
            const t = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), 3800);
            return () => clearTimeout(t);
        }
    }, [isPlayer, remoteToast?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    const handlers = useRef({ applyMove, log, show });
    handlers.current = { applyMove, log, show };
    useEffect(
        () =>
            sessionStore.onAction((a) => {
                const me = sessionStore.get();
                if (a.type === 'zar') {
                    // GM günlüğe yazar ve bildirir; bildirim durumla bütün oyunculara gider
                    if (me.role === 'gm') {
                        handlers.current.log(`🎲 ${a.from.name}: ${a.label}`, (a.tone as LogTone) || 'roll', a.dice ?? []);
                        handlers.current.show(`🎲 ${a.from.name}`, a.label, (a.tone as LogTone) || 'roll');
                    }
                }
                if (a.type === 'tasi' && me.role === 'gm' && a.tokenId && Number.isInteger(a.cx) && Number.isInteger(a.cz)) {
                    const t = latest.current.tokens.find((x) => x.id === a.tokenId);
                    // Oyuncu yalnızca seçtiği oyuncu token'ını taşıyabilir
                    if (t && t.kind === 'oyuncu' && a.from.character === t.id) handlers.current.applyMove(t.id, a.cx!, a.cz!);
                }
            }),
        [],
    );

    const distance = (aId: string, bId: string) => {
        const a = token(aId), b = token(bId);
        return a && b ? cellDistance(a, b) : 0;
    };

    return {
        battle,
        setBattle,
        rules,
        R,
        selectedId,
        setSelectedId,
        placing,
        setPlacing,
        dragInfo,
        setDragInfo,
        targeting,
        setTargeting,
        toast,
        busy,
        activeId,
        startGame,
        placeToken,
        removeToken,
        moveToken,
        dragText,
        patchSheet,
        startCombat,
        nextTurn,
        endCombat,
        dash,
        abilityRoll,
        freeRoll,
        attack,
        castSpell,
        deathSave,
        adjustHp,
        adjustSanity,
        sanityCheck,
        distance,
        log,
        isPlayer,
        isGm,
        session: sess,
    };
}

export type BattleController = ReturnType<typeof useBattleController>;
export type { BattleState };
