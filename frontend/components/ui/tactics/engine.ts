/**
 * Taktik savaş kural motoru (Ferrodoxin'in taktik savaş prototipinden esinlenildi).
 * Izgarasız, metre cinsinden serbest hareket; her tur bir hareket bütçesi ve bir ana eylem.
 * Saldırı: d20 + isabet bonusu, hedefin savunmasına karşı (doğal 1 ıska, doğal 20 kritik: hasar zarları iki kat).
 * Hasar: zar + özellik bonusu. Yetenekler MANA harcar ve bekleme süresine girer; durumlar tur tur işler.
 * Saf veri: arayüz ve 3D sahne bu fonksiyonları çağırır, sonuç olarak yeni durum + günlük satırları alır.
 */
import type { Token } from '../panorama/battle';

export type Team = 'yoldas' | 'dusman';
export type Stat = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const STAT_LABEL: Record<Stat, string> = { str: 'GÜÇ', dex: 'ÇEV', con: 'DAY', int: 'ZEK', wis: 'BİL', cha: 'KAR' };

export interface Vec {
    x: number;
    z: number;
}

export type StatusKey = 'yaniyor' | 'zehirli' | 'sarsilmis' | 'siper' | 'ofke' | 'meydan' | 'baygin';
export const STATUS_INFO: Record<StatusKey, { label: string; desc: string; tone: string }> = {
    yaniyor: { label: 'Yanıyor', desc: 'Tur başında 1d4 ateş hasarı.', tone: '#f97316' },
    zehirli: { label: 'Zehirli', desc: 'Tur başında 1d4 zehir hasarı.', tone: '#84cc16' },
    sarsilmis: { label: 'Sarsılmış', desc: 'Saldırılarında −2 isabet.', tone: '#a78bfa' },
    siper: { label: 'Siperde', desc: 'Savunma +3.', tone: '#38bdf8' },
    ofke: { label: 'Öfkeli', desc: 'Silah hasarı +3.', tone: '#ef4444' },
    meydan: { label: 'Meydan okundu', desc: 'Yalnızca meydan okuyana saldırabilir.', tone: '#facc15' },
    baygin: { label: 'Baygın', desc: '0 can: yere düştü. Bir yoldaş yanına gidip kaldırabilir.', tone: '#9ca3af' },
};

export interface Status {
    key: StatusKey;
    turns: number;
    /** meydan: meydan okuyanın kimliği */
    by?: string;
}

export type AbilityId =
    | 'kalkan-darbesi'
    | 'siper'
    | 'meydan-okuma'
    | 'yarma'
    | 'ofke'
    | 'sinsi-vurus'
    | 'zehirli-hancer'
    | 'sifa'
    | 'buz-mizragi'
    | 'ates-topu'
    | 'ok-yagmuru';

export interface Ability {
    id: AbilityId;
    name: string;
    desc: string;
    /** hedef: düşman, yoldaş, kendisi ya da alan (bir noktaya) */
    target: 'enemy' | 'ally' | 'self' | 'area';
    range: number;
    /** alan yarıçapı */
    radius?: number;
    mana: number;
    cooldown: number;
    /** Saldırı zarı hangi özellikle (yoksa saldırı zarı yok: otomatik etki) */
    stat?: Stat;
    dice?: string;
    status?: { key: StatusKey; turns: number };
}

export const ABILITIES: Record<AbilityId, Ability> = {
    'kalkan-darbesi': { id: 'kalkan-darbesi', name: 'Kalkan Darbesi', desc: 'Kalkanla vurur, hedefin dengesini bozar.', target: 'enemy', range: 1.8, mana: 0, cooldown: 2, stat: 'str', dice: '1d6', status: { key: 'sarsilmis', turns: 2 } },
    siper: { id: 'siper', name: 'Siper', desc: 'Kalkanını kaldırır: savunma +3 (2 tur).', target: 'self', range: 0, mana: 0, cooldown: 3, status: { key: 'siper', turns: 2 } },
    'meydan-okuma': { id: 'meydan-okuma', name: 'Meydan Okuma', desc: '6 m içindeki düşmanlar 1 tur yalnızca ona saldırabilir.', target: 'self', range: 0, radius: 6, mana: 1, cooldown: 3, status: { key: 'meydan', turns: 1 } },
    yarma: { id: 'yarma', name: 'Yarma', desc: 'Geniş bir savuruş: 2 m içindeki bütün düşmanlara saldırır.', target: 'self', range: 0, radius: 2.2, mana: 0, cooldown: 2, stat: 'str', dice: '1d8' },
    ofke: { id: 'ofke', name: 'Öfke', desc: 'Kana susar: 3 tur silah hasarı +3.', target: 'self', range: 0, mana: 0, cooldown: 4, status: { key: 'ofke', turns: 3 } },
    'sinsi-vurus': { id: 'sinsi-vurus', name: 'Sinsi Vuruş', desc: 'Hedefin yanında bir yoldaş varsa +2d6 hasar.', target: 'enemy', range: 1.8, mana: 0, cooldown: 1, stat: 'dex', dice: '1d6' },
    'zehirli-hancer': { id: 'zehirli-hancer', name: 'Zehirli Hançer', desc: 'Fırlatılan hançer; hedef 3 tur zehirlenir.', target: 'enemy', range: 9, mana: 1, cooldown: 2, stat: 'dex', dice: '1d4', status: { key: 'zehirli', turns: 3 } },
    sifa: { id: 'sifa', name: 'Şifa', desc: 'Bir yoldaşı iyileştirir (baygını ayağa kaldırır).', target: 'ally', range: 9, mana: 2, cooldown: 0, stat: 'wis', dice: '1d8' },
    'buz-mizragi': { id: 'buz-mizragi', name: 'Buz Mızrağı', desc: 'Uzaktan buz mızrağı fırlatır.', target: 'enemy', range: 14, mana: 2, cooldown: 1, stat: 'int', dice: '1d8' },
    'ates-topu': { id: 'ates-topu', name: 'Ateş Topu', desc: 'Bir noktada patlar: 2,5 m içindekiler yanar.', target: 'area', range: 14, radius: 2.5, mana: 3, cooldown: 3, stat: 'int', dice: '2d6', status: { key: 'yaniyor', turns: 2 } },
    'ok-yagmuru': { id: 'ok-yagmuru', name: 'Ok Yağmuru', desc: 'Bir alana ok yağdırır.', target: 'area', range: 18, radius: 2, mana: 0, cooldown: 3, stat: 'dex', dice: '1d6' },
};

export interface Weapon {
    name: string;
    stat: Stat;
    dice: string;
    range: number;
}

export interface Unit {
    id: string;
    name: string;
    role: string;
    team: Team;
    color: string;
    hp: number;
    hpMax: number;
    mana: number;
    manaMax: number;
    /** Savunma (zırh sınıfı) */
    def: number;
    /** Hareket (metre) */
    speed: number;
    prof: number;
    stats: Record<Stat, number>;
    weapon: Weapon;
    abilities: AbilityId[];
    cooldowns: Partial<Record<AbilityId, number>>;
    statuses: Status[];
    pos: Vec;
    facing: number;
    down?: boolean;
    dead?: boolean;
    /** Karakter görseli (varsa) */
    image?: string;
}

export interface Obstacle {
    pos: Vec;
    r: number;
    kind: 'kaya' | 'kutuk' | 'tas';
}

export interface Turn {
    moveLeft: number;
    actionUsed: boolean;
    dashed: boolean;
}

export type LogTone = 'info' | 'hit' | 'miss' | 'crit' | 'heal' | 'status' | 'turn' | 'down' | 'win' | 'lose';
export interface RollDetail {
    title: string;
    lines: [string, string][];
    verdict?: { text: string; tone: LogTone };
}
export interface LogLine {
    id: number;
    text: string;
    tone: LogTone;
    detail?: RollDetail;
}

export interface TacState {
    units: Unit[];
    obstacles: Obstacle[];
    order: string[];
    turnIdx: number;
    round: number;
    turn: Turn;
    log: LogLine[];
    over?: 'zafer' | 'yenilgi';
}

/** Sahnede bir an süren görsel olay (vuruş, ıska, iyileşme, mermi…) */
export interface Fx {
    id: number;
    kind: 'hit' | 'miss' | 'crit' | 'heal' | 'status' | 'projectile' | 'blast' | 'swing';
    from?: Vec;
    to: Vec;
    text?: string;
    color?: string;
    radius?: number;
}

// --- yardımcılar
export const mod = (v: number) => Math.floor((v - 10) / 2);
export const sgn = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);
const rnd = (s: number) => 1 + Math.floor(Math.random() * s);
let logId = 1;
let fxId = 1;
const line = (text: string, tone: LogTone, detail?: RollDetail): LogLine => ({ id: logId++, text, tone, detail });

export function parseDice(expr: string) {
    const m = expr.replace(/\s/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/);
    if (!m) return { count: 0, sides: 0, bonus: Number(expr) || 0 };
    return { count: Number(m[1] || 1), sides: Number(m[2]), bonus: Number(m[3] || 0) };
}
function rollDice(expr: string, crit = false) {
    const d = parseDice(expr);
    const n = d.count * (crit ? 2 : 1);
    const rolls = Array.from({ length: n }, () => rnd(d.sides));
    return { rolls, sum: rolls.reduce((a, b) => a + b, 0) + d.bonus, expr: n ? `${n}d${d.sides}${d.bonus ? sgn(d.bonus) : ''}` : String(d.bonus) };
}

export const UNIT_R = 0.45;
export const MELEE = 1.8;
export const has = (u: Unit, k: StatusKey) => u.statuses.some((s) => s.key === k);
export const alive = (u: Unit) => !u.dead && !u.down;
export const defOf = (u: Unit) => u.def + (has(u, 'siper') ? 3 : 0);
export const hitBonus = (u: Unit, stat: Stat) => mod(u.stats[stat]) + u.prof - (has(u, 'sarsilmis') ? 2 : 0);
export const current = (s: TacState) => s.units.find((u) => u.id === s.order[s.turnIdx]);

/** Bir noktaya yürünebilir mi (engel ve başka birimle çakışma) */
export function blocked(s: TacState, p: Vec, selfId: string, arena: number) {
    if (Math.hypot(p.x, p.z) > arena - 0.6) return true;
    if (s.obstacles.some((o) => dist(o.pos, p) < o.r + UNIT_R)) return true;
    return s.units.some((u) => u.id !== selfId && !u.dead && dist(u.pos, p) < UNIT_R * 2);
}

/** Düz çizgide bir engelden geçiyor mu (görüş ve yürüyüş için) */
export function lineHits(s: TacState, a: Vec, b: Vec, pad = 0) {
    for (const o of s.obstacles) {
        const dx = b.x - a.x, dz = b.z - a.z;
        const L2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((o.pos.x - a.x) * dx + (o.pos.z - a.z) * dz) / L2));
        if (Math.hypot(a.x + dx * t - o.pos.x, a.z + dz * t - o.pos.z) < o.r + pad) return true;
    }
    return false;
}

/**
 * Engellerden kaçan yol: düz gidilebiliyorsa düz; değilse engellerin çevresindeki noktalardan geçen en kısa yol
 * (görünürlük grafı üzerinde Dijkstra). Uzunluk metre.
 */
export function findPath(s: TacState, from: Vec, to: Vec): { pts: Vec[]; len: number } | null {
    const pad = UNIT_R + 0.05;
    if (!lineHits(s, from, to, pad)) return { pts: [from, to], len: dist(from, to) };
    const nodes: Vec[] = [from, to];
    for (const o of s.obstacles)
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            nodes.push({ x: o.pos.x + Math.cos(a) * (o.r + pad + 0.15), z: o.pos.z + Math.sin(a) * (o.r + pad + 0.15) });
        }
    const n = nodes.length;
    const d = new Array(n).fill(Infinity);
    const prev = new Array(n).fill(-1);
    const done = new Array(n).fill(false);
    d[0] = 0;
    for (;;) {
        let i = -1;
        for (let k = 0; k < n; k++) if (!done[k] && d[k] < Infinity && (i < 0 || d[k] < d[i])) i = k;
        if (i < 0 || i === 1) break;
        done[i] = true;
        for (let j = 0; j < n; j++) {
            if (done[j] || lineHits(s, nodes[i], nodes[j], pad)) continue;
            const nd = d[i] + dist(nodes[i], nodes[j]);
            if (nd < d[j]) (d[j] = nd), (prev[j] = i);
        }
    }
    if (d[1] === Infinity) return null;
    const pts: Vec[] = [];
    for (let k = 1; k >= 0; k = prev[k]) pts.unshift(nodes[k]);
    return { pts, len: d[1] };
}

/** Yolu bütçe kadar kısalt */
export function clipPath(pts: Vec[], budget: number): { pts: Vec[]; len: number } {
    const out: Vec[] = [pts[0]];
    let used = 0;
    for (let i = 1; i < pts.length; i++) {
        const seg = dist(pts[i - 1], pts[i]);
        if (used + seg <= budget) {
            out.push(pts[i]);
            used += seg;
        } else {
            const t = (budget - used) / seg;
            out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * t });
            used = budget;
            break;
        }
    }
    return { pts: out, len: used };
}

// --- kadro
const st = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({ str, dex, con, int, wis, cha });

interface Template {
    role: string;
    hp: number;
    mana: number;
    def: number;
    speed: number;
    stats: Record<Stat, number>;
    weapon: Weapon;
    abilities: AbilityId[];
    color: string;
}
export const ROLES: Record<string, Template> = {
    savunucu: { role: 'Savunucu', hp: 31, mana: 4, def: 16, speed: 9, stats: st(16, 10, 15, 9, 12, 12), weapon: { name: 'Kılıç', stat: 'str', dice: '1d8', range: MELEE }, abilities: ['kalkan-darbesi', 'siper', 'meydan-okuma'], color: '#3b6fd8' },
    ofkeli: { role: 'Öfkeli', hp: 35, mana: 0, def: 13, speed: 10, stats: st(17, 12, 16, 8, 10, 9), weapon: { name: 'Balta', stat: 'str', dice: '1d10', range: MELEE }, abilities: ['yarma', 'ofke'], color: '#b9452c' },
    golge: { role: 'Gölge', hp: 21, mana: 3, def: 14, speed: 11, stats: st(10, 17, 12, 12, 12, 13), weapon: { name: 'Hançer', stat: 'dex', dice: '1d6', range: MELEE }, abilities: ['sinsi-vurus', 'zehirli-hancer'], color: '#3f8a5a' },
    sifaci: { role: 'Şifacı', hp: 24, mana: 14, def: 12, speed: 9, stats: st(9, 12, 12, 14, 16, 12), weapon: { name: 'Asa', stat: 'str', dice: '1d6', range: MELEE }, abilities: ['sifa', 'buz-mizragi'], color: '#d9c27a' },
    yagmaci: { role: 'Haydut Yağmacı', hp: 15, mana: 0, def: 12, speed: 9, stats: st(14, 12, 12, 8, 9, 8), weapon: { name: 'Pala', stat: 'str', dice: '1d8', range: MELEE }, abilities: [], color: '#7a2a20' },
    okcu: { role: 'Haydut Okçu', hp: 15, mana: 0, def: 12, speed: 9, stats: st(10, 15, 11, 9, 11, 8), weapon: { name: 'Yay', stat: 'dex', dice: '1d6', range: 16 }, abilities: ['ok-yagmuru'], color: '#6b4a24' },
    okultist: { role: 'Okültist', hp: 15, mana: 9, def: 11, speed: 8, stats: st(8, 12, 11, 16, 12, 12), weapon: { name: 'Lanet', stat: 'int', dice: '1d8', range: 12 }, abilities: ['ates-topu'], color: '#4b2a6b' },
    canavar: { role: 'Canavar', hp: 40, mana: 0, def: 13, speed: 10, stats: st(18, 10, 17, 4, 10, 6), weapon: { name: 'Pençe', stat: 'str', dice: '2d6', range: 2.2 }, abilities: [], color: '#4a1f5e' },
};

function make(id: string, name: string, tpl: Template, team: Team, pos: Vec): Unit {
    return {
        id,
        name,
        role: tpl.role,
        team,
        color: tpl.color,
        hp: tpl.hp,
        hpMax: tpl.hp,
        mana: tpl.mana,
        manaMax: tpl.mana,
        def: tpl.def,
        speed: tpl.speed,
        prof: 2,
        stats: { ...tpl.stats },
        weapon: { ...tpl.weapon },
        abilities: [...tpl.abilities],
        cooldowns: {},
        statuses: [],
        pos,
        facing: team === 'yoldas' ? 0 : Math.PI,
    };
}

/** Hazır senaryo: dört yoldaş, haydut pususu */
export function defaultUnits(): Unit[] {
    return [
        make('y1', 'Doran', ROLES.savunucu, 'yoldas', { x: -2, z: 7 }),
        make('y2', 'Kara Ulf', ROLES.ofkeli, 'yoldas', { x: 0.5, z: 7.5 }),
        make('y3', 'Selis', ROLES.golge, 'yoldas', { x: 3, z: 7 }),
        make('y4', 'Mirra', ROLES.sifaci, 'yoldas', { x: 0.5, z: 9.5 }),
        make('d1', 'Yağmacı', ROLES.yagmaci, 'dusman', { x: -2.5, z: -5 }),
        make('d2', 'Yağmacı', ROLES.yagmaci, 'dusman', { x: 1.5, z: -5.5 }),
        make('d3', 'Okçu', ROLES.okcu, 'dusman', { x: 4.5, z: -8.5 }),
        make('d4', 'Okültist', ROLES.okultist, 'dusman', { x: -1, z: -9.5 }),
    ];
}

/** 360 savaş masasındaki token'lardan kadro (karakter kartı varsa değerleri oradan) */
export function unitsFromTokens(tokens: Token[]): Unit[] | null {
    const allies = tokens.filter((t) => t.kind === 'oyuncu' || t.kind === 'npc');
    const foes = tokens.filter((t) => t.kind === 'dusman' || t.kind === 'canavar');
    if (!allies.length || !foes.length) return null;
    const roles = ['savunucu', 'ofkeli', 'golge', 'sifaci'];
    const out: Unit[] = [];
    const place = (i: number, n: number, z: number) => ({ x: (i - (n - 1) / 2) * 2.6, z });
    allies.slice(0, 6).forEach((t, i) => {
        const u = make(`y${i}`, t.name, ROLES[roles[i % roles.length]], 'yoldas', place(i, Math.min(6, allies.length), 7.5));
        if (t.sheet) Object.assign(u, fromSheet(t.sheet));
        u.image = t.image;
        out.push(u);
    });
    foes.slice(0, 8).forEach((t, i) => {
        const tpl = t.kind === 'canavar' ? ROLES.canavar : [ROLES.yagmaci, ROLES.okcu, ROLES.okultist][i % 3];
        const u = make(`d${i}`, t.name, tpl, 'dusman', place(i, Math.min(8, foes.length), -7));
        if (t.sheet) Object.assign(u, fromSheet(t.sheet));
        u.image = t.image;
        out.push(u);
    });
    return out;
}

function fromSheet(s: NonNullable<Token['sheet']>): Partial<Unit> {
    const ranged = s.attack.reach > 1;
    return {
        hp: Math.max(1, s.hp),
        hpMax: s.hpMax,
        mana: s.mana,
        manaMax: s.manaMax,
        def: s.ac,
        speed: Math.round(s.speed * 1.5 * 10) / 10,
        stats: { ...s.abilities },
        weapon: { name: s.attack.name, stat: ranged ? 'dex' : 'str', dice: s.attack.damage.replace(/[+-]\d+$/, '') || '1d6', range: ranged ? s.attack.reach * 1.5 : MELEE },
    };
}

export function randomObstacles(units: Unit[], arena: number): Obstacle[] {
    const out: Obstacle[] = [];
    const kinds: Obstacle['kind'][] = ['kaya', 'kaya', 'kutuk', 'tas'];
    let tries = 0;
    while (out.length < 7 && tries++ < 200) {
        const a = Math.random() * Math.PI * 2;
        const rr = 2 + Math.random() * (arena - 4);
        const p = { x: Math.cos(a) * rr, z: Math.sin(a) * rr * 0.75 };
        const r = 0.6 + Math.random() * 0.9;
        if (units.some((u) => dist(u.pos, p) < r + 1.6)) continue;
        if (out.some((o) => dist(o.pos, p) < o.r + r + 1.4)) continue;
        out.push({ pos: p, r, kind: kinds[out.length % kinds.length] });
    }
    return out;
}

/** İnisiyatif: d20 + Çeviklik bonusu; sonuçlar günlüğe */
export function startBattle(units: Unit[], obstacles: Obstacle[]): TacState {
    const rolls = units.map((u) => ({ id: u.id, r: rnd(20) + mod(u.stats.dex), dex: u.stats.dex }));
    rolls.sort((a, b) => b.r - a.r || b.dex - a.dex);
    const s: TacState = {
        units,
        obstacles,
        order: rolls.map((r) => r.id),
        turnIdx: 0,
        round: 1,
        turn: { moveLeft: 0, actionUsed: false, dashed: false },
        log: [
            line('Savaş başladı. İnisiyatif atıldı (d20 + Çeviklik).', 'turn', {
                title: 'İNİSİYATİF',
                lines: rolls.map((r) => [units.find((u) => u.id === r.id)!.name, String(r.r)] as [string, string]),
            }),
        ],
    };
    return beginTurn(s);
}

const patch = (s: TacState, id: string, fn: (u: Unit) => Unit): TacState => ({ ...s, units: s.units.map((u) => (u.id === id ? fn(u) : u)) });

/** Sıradaki birimin turu başlar: bekleme süreleri azalır, durum hasarları işler */
function beginTurn(s0: TacState): TacState {
    let s = s0;
    const u = current(s);
    if (!u) return s;
    if (u.dead || u.down) return nextTurn(s, true);
    const logs: LogLine[] = [line(`${u.name} turuna başladı.`, 'turn')];
    let hp = u.hp;
    for (const st of u.statuses) {
        if (st.key === 'yaniyor' || st.key === 'zehirli') {
            const d = rnd(4);
            hp -= d;
            logs.push(line(`${u.name} ${st.key === 'yaniyor' ? 'yanıyor' : 'zehirden kıvranıyor'}: ${d} hasar.`, 'status'));
        }
    }
    const cooldowns = Object.fromEntries(Object.entries(u.cooldowns).map(([k, v]) => [k, Math.max(0, (v ?? 0) - 1)]));
    const statuses = u.statuses.map((x) => ({ ...x, turns: x.turns - 1 })).filter((x) => x.turns > 0 || x.key === 'baygin');
    s = patch(s, u.id, (x) => ({ ...x, cooldowns, statuses }));
    s = { ...s, turn: { moveLeft: u.speed, actionUsed: false, dashed: false }, log: [...s.log, ...logs] };
    if (hp < u.hp) s = damage(s, u.id, u.hp - hp, true);
    const after = s.units.find((x) => x.id === u.id)!;
    if (after.dead || after.down) return nextTurn(s, true);
    return s;
}

export function nextTurn(s0: TacState, skipLog = false): TacState {
    let s = s0;
    if (s.over) return s;
    if (!skipLog) {
        const u = current(s);
        if (u) s = { ...s, log: [...s.log, line(`${u.name} turunu tamamladı.`, 'info')] };
    }
    for (let k = 0; k < s.order.length; k++) {
        let idx = s.turnIdx + 1;
        let round = s.round;
        if (idx >= s.order.length) {
            idx = 0;
            round++;
            s = { ...s, log: [...s.log, line(`Tur ${round}`, 'turn')] };
        }
        s = { ...s, turnIdx: idx, round };
        const u = current(s);
        if (u && !u.dead && !u.down) return beginTurn(s);
    }
    return s;
}

function checkOver(s: TacState): TacState {
    if (s.over) return s;
    if (!s.units.some((u) => u.team === 'dusman' && alive(u))) return { ...s, over: 'zafer', log: [...s.log, line('Zafer! Bütün düşmanlar yere serildi.', 'win')] };
    if (!s.units.some((u) => u.team === 'yoldas' && alive(u))) return { ...s, over: 'yenilgi', log: [...s.log, line('Yenilgi. Yoldaşların hepsi düştü.', 'lose')] };
    return s;
}

function damage(s: TacState, id: string, amount: number, silent = false): TacState {
    const t = s.units.find((u) => u.id === id)!;
    const hp = Math.max(0, t.hp - amount);
    let out = patch(s, id, (u) => ({ ...u, hp }));
    if (hp === 0 && !t.down && !t.dead) {
        if (t.team === 'yoldas') {
            out = patch(out, id, (u) => ({ ...u, down: true, statuses: [...u.statuses.filter((x) => x.key !== 'meydan'), { key: 'baygin', turns: 99 }] }));
            out = { ...out, log: [...out.log, line(`${t.name} yere düştü (baygın).`, 'down')] };
        } else {
            out = patch(out, id, (u) => ({ ...u, dead: true, statuses: [] }));
            out = { ...out, log: [...out.log, line(`${t.name} öldü.`, 'down')] };
        }
    } else if (!silent) {
        /* günlük çağıranda */
    }
    return checkOver(out);
}

function addStatus(s: TacState, id: string, st: Status): TacState {
    return patch(s, id, (u) => (u.dead ? u : { ...u, statuses: [...u.statuses.filter((x) => x.key !== st.key), st] }));
}

export interface ActResult {
    state: TacState;
    fx: Fx[];
    /** Son atışın ayrıntısı (sağdaki kartta büyük gösterilir) */
    detail?: RollDetail;
    error?: string;
}

/** Hareket: yol bütçeden düşülür */
export function moveTo(s: TacState, path: { pts: Vec[]; len: number }): TacState {
    const u = current(s)!;
    const end = path.pts[path.pts.length - 1];
    const last = path.pts[path.pts.length - 2] ?? u.pos;
    const facing = Math.atan2(end.x - last.x, end.z - last.z);
    return { ...patch(s, u.id, (x) => ({ ...x, pos: end, facing })), turn: { ...s.turn, moveLeft: Math.max(0, s.turn.moveLeft - path.len) } };
}

/** İlerle: ana eylemi harcayıp hareketi ikiye katlar */
export function dash(s: TacState): ActResult {
    const u = current(s)!;
    if (s.turn.actionUsed) return { state: s, fx: [], error: 'Ana eylem harcandı' };
    return { state: { ...s, turn: { moveLeft: s.turn.moveLeft + u.speed, actionUsed: true, dashed: true }, log: [...s.log, line(`${u.name} ilerliyor (+${u.speed} m).`, 'info')] }, fx: [] };
}

/** Bir saldırı zarı + hasar: ayrıntı kartı ve günlük satırı üretir */
function strike(s0: TacState, a: Unit, t: Unit, opts: { name: string; stat: Stat; dice: string; extra?: number; extraDice?: string; status?: Status; projectile?: boolean; color?: string }): ActResult {
    let s = s0;
    const nat = rnd(20);
    const bonus = hitBonus(a, opts.stat);
    const total = nat + bonus;
    const def = defOf(t);
    const crit = nat === 20;
    const hit = crit || (nat !== 1 && total >= def);
    const lines: [string, string][] = [
        ['d20', String(nat)],
        [`İsabet bonusu (${STAT_LABEL[opts.stat]} ${sgn(mod(a.stats[opts.stat]))}, ustalık +${a.prof}${has(a, 'sarsilmis') ? ', sarsılmış −2' : ''})`, sgn(bonus)],
        ['Toplam', String(total)],
        [`${t.name} savunması${has(t, 'siper') ? ' (siper +3)' : ''}`, String(def)],
    ];
    const fx: Fx[] = [];
    if (opts.projectile) fx.push({ id: fxId++, kind: 'projectile', from: a.pos, to: t.pos, color: opts.color });
    else fx.push({ id: fxId++, kind: 'swing', from: a.pos, to: t.pos });
    if (!hit) {
        const why = nat === 1 ? 'Doğal 1: ıska' : 'ISKA';
        fx.push({ id: fxId++, kind: 'miss', to: t.pos, text: 'Iska' });
        const detail: RollDetail = { title: `${a.name} → ${t.name} · ${opts.name}`, lines, verdict: { text: why, tone: 'miss' } };
        return { state: { ...s, log: [...s.log, line(`${a.name} → ${t.name} (${opts.name}): ${total} vs ${def}, ıska.`, 'miss', detail)] }, fx, detail };
    }
    const dmg = rollDice(opts.dice, crit);
    const extra = opts.extraDice ? rollDice(opts.extraDice, crit) : null;
    const statBonus = mod(a.stats[opts.stat]);
    const rage = has(a, 'ofke') && !opts.projectile ? 3 : 0;
    const sum = Math.max(1, dmg.sum + (extra?.sum ?? 0) + statBonus + rage + (opts.extra ?? 0));
    lines.push([`Hasar ${dmg.expr}${crit ? ' (kritik: iki kat zar)' : ''}`, `[${dmg.rolls.join(', ')}]`]);
    if (extra) lines.push([`Ek ${extra.expr}`, `[${extra.rolls.join(', ')}]`]);
    lines.push([`${STAT_LABEL[opts.stat]} bonusu`, sgn(statBonus)]);
    if (rage) lines.push(['Öfke', '+3']);
    lines.push(['Toplam hasar', String(sum)]);
    s = damage(s, t.id, sum);
    if (opts.status && !s.units.find((x) => x.id === t.id)!.dead) {
        s = addStatus(s, t.id, opts.status);
        lines.push(['Etki', `${STATUS_INFO[opts.status.key].label} · ${opts.status.turns} tur`]);
    }
    fx.push({ id: fxId++, kind: crit ? 'crit' : 'hit', to: t.pos, text: `−${sum}` });
    const detail: RollDetail = { title: `${a.name} → ${t.name} · ${opts.name}`, lines, verdict: { text: crit ? 'KRİTİK!' : 'İSABET', tone: crit ? 'crit' : 'hit' } };
    s = { ...s, log: [...s.log, line(`${a.name} → ${t.name} (${opts.name}): ${total} vs ${def}, ${crit ? 'kritik' : 'isabet'}, ${sum} hasar.`, crit ? 'crit' : 'hit', detail)] };
    return { state: s, fx, detail };
}

/** Meydan okunmuş bir birim yalnızca meydan okuyana saldırabilir */
export function canTarget(a: Unit, t: Unit) {
    const taunt = a.statuses.find((x) => x.key === 'meydan');
    if (!taunt?.by || taunt.by === t.id) return true;
    // Meydan okuyan düştüyse serbest (çağıran kontrol eder)
    return false;
}

export function attack(s: TacState, targetId: string): ActResult {
    const a = current(s)!;
    const t = s.units.find((u) => u.id === targetId);
    if (!t || t.dead || t.team === a.team) return { state: s, fx: [], error: 'Geçersiz hedef' };
    if (s.turn.actionUsed) return { state: s, fx: [], error: 'Ana eylem harcandı' };
    const d = dist(a.pos, t.pos);
    if (d > a.weapon.range + 0.05) return { state: s, fx: [], error: `Menzil dışında (${d.toFixed(1)} m > ${a.weapon.range} m)` };
    if (a.weapon.range > MELEE && lineHits(s, a.pos, t.pos, 0.1)) return { state: s, fx: [], error: 'Görüş engelli' };
    if (!tauntOk(s, a, t)) return { state: s, fx: [], error: 'Meydan okundu: yalnızca meydan okuyana saldırabilir' };
    const r = strike(s, a, t, { name: a.weapon.name, stat: a.weapon.stat, dice: a.weapon.dice, projectile: a.weapon.range > MELEE, color: '#e5d3a1' });
    return { ...r, state: face({ ...r.state, turn: { ...r.state.turn, actionUsed: true } }, a.id, t.pos) };
}

function tauntOk(s: TacState, a: Unit, t: Unit) {
    const taunt = a.statuses.find((x) => x.key === 'meydan');
    if (!taunt?.by) return true;
    const by = s.units.find((u) => u.id === taunt.by);
    return !by || !alive(by) || by.id === t.id;
}

const face = (s: TacState, id: string, to: Vec) => patch(s, id, (u) => ({ ...u, facing: Math.atan2(to.x - u.pos.x, to.z - u.pos.z) }));

export function abilityBlock(s: TacState, u: Unit, ab: Ability): string | null {
    if (s.turn.actionUsed) return 'Ana eylem harcandı';
    if ((u.cooldowns[ab.id] ?? 0) > 0) return `Bekleme: ${u.cooldowns[ab.id]} tur`;
    if (u.mana < ab.mana) return `MANA yetmiyor (${ab.mana})`;
    return null;
}

/** Yetenek kullan: hedef birim kimliği ya da alan için nokta */
export function castAbility(s0: TacState, id: AbilityId, target?: string | Vec): ActResult {
    let s = s0;
    const a = current(s)!;
    const ab = ABILITIES[id];
    const why = abilityBlock(s, a, ab);
    if (why) return { state: s, fx: [], error: why };
    const fx: Fx[] = [];
    let detail: RollDetail | undefined;
    const spend = (st: TacState) =>
        patch({ ...st, turn: { ...st.turn, actionUsed: true } }, a.id, (u) => ({ ...u, mana: u.mana - ab.mana, cooldowns: { ...u.cooldowns, [id]: ab.cooldown + 1 } }));

    if (ab.target === 'enemy') {
        const t = s.units.find((u) => u.id === target);
        if (!t || t.dead || t.team === a.team) return { state: s, fx, error: 'Bir düşman seç' };
        const d = dist(a.pos, t.pos);
        if (d > ab.range + 0.05) return { state: s, fx, error: `Menzil dışında (${d.toFixed(1)} m > ${ab.range} m)` };
        if (ab.range > MELEE && lineHits(s, a.pos, t.pos, 0.1)) return { state: s, fx, error: 'Görüş engelli' };
        if (!tauntOk(s, a, t)) return { state: s, fx, error: 'Meydan okundu: yalnızca meydan okuyana saldırabilir' };
        const flank = id === 'sinsi-vurus' && s.units.some((u) => u.team === a.team && u.id !== a.id && alive(u) && dist(u.pos, t.pos) <= MELEE);
        const r = strike(s, a, t, {
            name: ab.name,
            stat: ab.stat!,
            dice: ab.dice!,
            extraDice: flank ? '2d6' : undefined,
            status: ab.status ? { ...ab.status } : undefined,
            projectile: ab.range > MELEE,
            color: id === 'buz-mizragi' ? '#9fd8ff' : id === 'zehirli-hancer' ? '#a3e635' : undefined,
        });
        return { ...r, state: face(spend(r.state), a.id, t.pos) };
    }

    if (ab.target === 'ally') {
        const t = s.units.find((u) => u.id === target);
        if (!t || t.dead || t.team !== a.team) return { state: s, fx, error: 'Bir yoldaş seç' };
        const d = dist(a.pos, t.pos);
        if (d > ab.range + 0.05) return { state: s, fx, error: `Menzil dışında (${d.toFixed(1)} m > ${ab.range} m)` };
        const h = rollDice(ab.dice!);
        const b = mod(a.stats[ab.stat!]);
        const sum = Math.max(1, h.sum + b);
        s = patch(s, t.id, (u) => ({ ...u, hp: Math.min(u.hpMax, u.hp + sum), down: false, statuses: u.statuses.filter((x) => x.key !== 'baygin') }));
        detail = { title: `${a.name} → ${t.name} · ${ab.name}`, lines: [[`İyileşme ${h.expr}`, `[${h.rolls.join(', ')}]`], [`${STAT_LABEL[ab.stat!]} bonusu`, sgn(b)], ['Toplam', `+${sum} can`]], verdict: { text: t.down ? 'AYAĞA KALKTI' : 'İYİLEŞTİ', tone: 'heal' } };
        fx.push({ id: fxId++, kind: 'heal', to: t.pos, text: `+${sum}` });
        s = { ...s, log: [...s.log, line(`${a.name} → ${t.name} (${ab.name}): +${sum} can.${t.down ? ' Ayağa kalktı.' : ''}`, 'heal', detail)] };
        return { state: face(spend(s), a.id, t.pos), fx, detail };
    }

    if (ab.target === 'self') {
        if (ab.id === 'yarma') {
            const foes = s.units.filter((u) => u.team !== a.team && !u.dead && dist(u.pos, a.pos) <= (ab.radius ?? 2) + UNIT_R);
            if (!foes.length) return { state: s, fx, error: 'Yakında düşman yok' };
            fx.push({ id: fxId++, kind: 'blast', to: a.pos, radius: ab.radius, color: '#ef4444' });
            for (const t of foes) {
                const r = strike(s, a, t, { name: ab.name, stat: ab.stat!, dice: ab.dice! });
                s = r.state;
                fx.push(...r.fx);
                detail = r.detail;
            }
            return { state: spend(s), fx, detail };
        }
        if (ab.id === 'meydan-okuma') {
            const foes = s.units.filter((u) => u.team !== a.team && alive(u) && dist(u.pos, a.pos) <= (ab.radius ?? 6));
            for (const t of foes) s = addStatus(s, t.id, { key: 'meydan', turns: 2, by: a.id });
            fx.push({ id: fxId++, kind: 'blast', to: a.pos, radius: ab.radius, color: '#facc15' });
            s = { ...s, log: [...s.log, line(`${a.name} meydan okudu: ${foes.length ? foes.map((f) => f.name).join(', ') : 'kimse duymadı'}.`, 'status')] };
            return { state: spend(s), fx };
        }
        s = addStatus(s, a.id, { ...ab.status! });
        fx.push({ id: fxId++, kind: 'status', to: a.pos, text: STATUS_INFO[ab.status!.key].label, color: STATUS_INFO[ab.status!.key].tone });
        s = { ...s, log: [...s.log, line(`${a.name}: ${ab.name}. ${STATUS_INFO[ab.status!.key].desc}`, 'status')] };
        return { state: spend(s), fx };
    }

    // Alan
    const p = target as Vec | undefined;
    if (!p || typeof p !== 'object') return { state: s, fx, error: 'Bir nokta seç' };
    if (dist(a.pos, p) > ab.range + 0.05) return { state: s, fx, error: `Menzil dışında (${dist(a.pos, p).toFixed(1)} m > ${ab.range} m)` };
    fx.push({ id: fxId++, kind: 'projectile', from: a.pos, to: p, color: id === 'ates-topu' ? '#ff8a3d' : '#e5d3a1' });
    fx.push({ id: fxId++, kind: 'blast', to: p, radius: ab.radius, color: id === 'ates-topu' ? '#ff7a2d' : '#d6c08a' });
    const caught = s.units.filter((u) => !u.dead && dist(u.pos, p) <= (ab.radius ?? 2) + UNIT_R * 0.5);
    for (const t of caught) {
        // Alan saldırısı: yoldaş da etkilenir (dikkat!)
        const r = strike(s, a, t, { name: ab.name, stat: ab.stat!, dice: ab.dice!, status: ab.status ? { ...ab.status } : undefined });
        s = r.state;
        fx.push(...r.fx.filter((f) => f.kind !== 'swing'));
        detail = r.detail;
    }
    if (!caught.length) s = { ...s, log: [...s.log, line(`${a.name}: ${ab.name} boşa düştü.`, 'miss')] };
    return { state: face(spend(s), a.id, p), fx, detail };
}

/** Baygın bir yoldaşı kaldır (yanında olmalı, ana eylem) */
export function revive(s0: TacState, targetId: string): ActResult {
    const a = current(s0)!;
    const t = s0.units.find((u) => u.id === targetId);
    if (!t || !t.down) return { state: s0, fx: [], error: 'Baygın bir yoldaş seç' };
    if (s0.turn.actionUsed) return { state: s0, fx: [], error: 'Ana eylem harcandı' };
    if (dist(a.pos, t.pos) > MELEE + 0.05) return { state: s0, fx: [], error: 'Yanına git (1,8 m)' };
    let s = patch(s0, t.id, (u) => ({ ...u, hp: 1, down: false, statuses: u.statuses.filter((x) => x.key !== 'baygin') }));
    s = { ...s, turn: { ...s.turn, actionUsed: true }, log: [...s.log, line(`${a.name}, ${t.name} adlı yoldaşını ayağa kaldırdı (1 can).`, 'heal')] };
    return { state: s, fx: [{ id: fxId++, kind: 'heal', to: t.pos, text: '+1' }] };
}

// --- Yapay zekâ: düşmanın turu adım adım (arayüz her adımı canlandırır)
export type AiStep = { kind: 'move'; path: { pts: Vec[]; len: number } } | { kind: 'attack'; target: string } | { kind: 'ability'; id: AbilityId; target: string | Vec } | { kind: 'end' };

export function aiPlan(s: TacState): AiStep[] {
    const u = current(s)!;
    const foes = s.units.filter((x) => x.team !== u.team && alive(x));
    if (!foes.length) return [{ kind: 'end' }];
    const taunt = u.statuses.find((x) => x.key === 'meydan');
    const by = taunt?.by && s.units.find((x) => x.id === taunt.by && alive(x));
    // Hedef: meydan okuyan; yoksa canı en az olan yakındaki, ya da en yakın
    const score = (t: Unit) => dist(u.pos, t.pos) + (t.hp / t.hpMax) * 6 + (t.role === 'Şifacı' ? -2 : 0);
    const target = by || foes.sort((a, b) => score(a) - score(b))[0];
    const steps: AiStep[] = [];
    const range = u.weapon.range;
    const ranged = range > MELEE;

    // Alan yeteneği: iki ya da daha çok düşmanı yakalıyorsa
    const area = u.abilities.map((id) => ABILITIES[id]).find((ab) => ab.target === 'area' && !abilityBlock(s, u, ab));
    if (area) {
        let best: { p: Vec; n: number } | null = null;
        for (const f of foes) {
            const n = foes.filter((g) => dist(g.pos, f.pos) <= (area.radius ?? 2)).length;
            const own = s.units.filter((g) => g.team === u.team && !g.dead && dist(g.pos, f.pos) <= (area.radius ?? 2) + 0.3).length;
            if (own === 0 && dist(u.pos, f.pos) <= area.range && (!best || n > best.n)) best = { p: f.pos, n };
        }
        if (best && (best.n >= 2 || Math.random() < 0.45)) return [{ kind: 'ability', id: area.id, target: best.p }, { kind: 'end' }];
    }

    let pos = u.pos;
    const d0 = dist(pos, target.pos);
    const inRange = d0 <= range - 0.1 && (!ranged || !lineHits(s, pos, target.pos, 0.1));
    if (!inRange || (ranged && d0 < 4)) {
        // Menzile gir; uzak dövüşçü yakın düşmandan uzaklaşır
        let goal: Vec;
        if (ranged && d0 < 4) {
            const k = 6 / Math.max(0.1, d0);
            goal = { x: target.pos.x + (pos.x - target.pos.x) * k, z: target.pos.z + (pos.z - target.pos.z) * k };
        } else {
            const want = ranged ? Math.min(range - 1, 9) : MELEE - 0.4;
            const k = want / Math.max(0.1, d0);
            goal = { x: target.pos.x + (pos.x - target.pos.x) * k, z: target.pos.z + (pos.z - target.pos.z) * k };
        }
        const path = findPath(s, pos, goal) ?? findPath(s, pos, { x: (pos.x + goal.x) / 2, z: (pos.z + goal.z) / 2 });
        if (path) {
            let clipped = clipPath(path.pts, s.turn.moveLeft);
            // Varış noktası doluysa biraz geri çek
            for (let k = 0; k < 6 && blocked(s, clipped.pts[clipped.pts.length - 1], u.id, 99); k++) clipped = clipPath(path.pts, Math.max(0, clipped.len - 0.6));
            if (clipped.len > 0.1) {
                steps.push({ kind: 'move', path: clipped });
                pos = clipped.pts[clipped.pts.length - 1];
            }
        }
    }
    const d1 = dist(pos, target.pos);
    const melee = u.abilities.map((id) => ABILITIES[id]).find((ab) => ab.target === 'enemy' && !abilityBlock(s, u, ab) && d1 <= ab.range);
    if (melee) steps.push({ kind: 'ability', id: melee.id, target: target.id });
    else if (d1 <= range + 0.05) steps.push({ kind: 'attack', target: target.id });
    steps.push({ kind: 'end' });
    return steps;
}
