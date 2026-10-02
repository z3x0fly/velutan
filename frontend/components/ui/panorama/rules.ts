import type { TokenKind } from './battle';

/**
 * Velutan oyun kuralları. Velutan oturumları D&D 5e tabanlıdır (karakter kartlarında seviye, HP, MANA ve
 * Str/Dex/Con/Int/Wis/Cha); ama çoğu masa sistemsiz oynar. Bu yüzden her mekanik ayrı ayrı açılıp kapanır:
 * "Sistemsiz" yalnızca ızgara, token ve serbest zardır; "Velutan 5e" hepsini açar.
 */
export interface Rules {
    initiative: boolean;
    hp: boolean;
    mana: boolean;
    attacks: boolean;
    movement: boolean;
    conditions: boolean;
    deathSaves: boolean;
    abilities: boolean;
    crits: boolean;
    log: boolean;
    /** Akıl sağlığı (Sanity): isteğe bağlı, Velutan hazır ayarında kapalı */
    sanity: boolean;
}

export type RuleKey = keyof Rules;
export type RulesPreset = 'sistemsiz' | 'velutan' | 'ozel';

export const RULES_OFF: Rules = { initiative: false, hp: false, mana: false, attacks: false, movement: false, conditions: false, deathSaves: false, abilities: false, crits: false, log: false, sanity: false };
export const RULES_VELUTAN: Rules = { initiative: true, hp: true, mana: true, attacks: true, movement: true, conditions: true, deathSaves: true, abilities: true, crits: true, log: true, sanity: false };

/** Kurulum ekranındaki açıklamalar ve bağımlılıklar */
export const RULE_INFO: { key: RuleKey; title: string; desc: string; needs?: RuleKey[] }[] = [
    { key: 'initiative', title: 'İnisiyatif ve turlar', desc: 'Savaş başında herkes d20 + Dex atar; sıra şeridi, tur sayacı ve "Sıradaki".' },
    { key: 'hp', title: 'Can (HP)', desc: 'Her token\'ın canı; hasar ve iyileşme çubukta görünür, 0\'da düşer.' },
    { key: 'mana', title: 'MANA', desc: 'Velutan büyü kaynağı: büyü yapmak MANA harcar.' },
    { key: 'attacks', title: 'Saldırı ve Zırh Sınıfı', desc: 'd20 + saldırı bonusu hedefin ZS\'sine karşı; isabette hasar zarı otomatik düşer.', needs: ['hp'] },
    { key: 'movement', title: 'Hareket hakkı', desc: 'Sırası gelen token\'ın hızı kadar kare; sürüklerken sayılır, "Atıl" iki katına çıkarır.', needs: ['initiative'] },
    { key: 'abilities', title: 'Yetenek puanları', desc: 'Str, Dex, Con, Int, Wis, Cha; tek tıkla yetenek ve kurtarma zarı.' },
    { key: 'conditions', title: 'Durumlar', desc: 'Zehirli, sersem, yere düşmüş, kör…; saldırıda avantaj/dezavantajı kendisi önerir.' },
    { key: 'crits', title: 'Kritikler', desc: 'Doğal 20 her zaman isabet ve hasar zarları iki kat; doğal 1 her zaman ıska.' },
    { key: 'deathSaves', title: 'Ölüm kurtarma zarları', desc: '0 HP\'deki oyuncu bayılır; sırası geldikçe d20: 3 başarı dengede, 3 başarısızlık ölüm.', needs: ['hp'] },
    { key: 'log', title: 'Savaş günlüğü', desc: 'Her atış, isabet, hasar ve tur kaydedilir.' },
    { key: 'sanity', title: 'Akıl sağlığı (Sanity)', desc: 'Dehşet karşısında akıl zarı: d20 + Bilgelik; başarısızlıkta akıl puanı düşer, 0\'da karakter aklını yitirir.' },
];

/** Bağımlılıkları uygula: HP kapanırsa saldırı ve ölüm zarları da kapanır */
export function normalizeRules(r: Rules): Rules {
    const out = { ...r };
    for (const info of RULE_INFO) if (info.needs?.some((n) => !out[n])) out[info.key] = false;
    return out;
}

export function presetOf(r: Rules): RulesPreset {
    const keys = Object.keys(RULES_OFF) as RuleKey[];
    if (keys.every((k) => !r[k])) return 'sistemsiz';
    if (keys.every((k) => !!r[k] === RULES_VELUTAN[k])) return 'velutan';
    return 'ozel';
}

// --- Karakter kartı
export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: { key: Ability; short: string; name: string }[] = [
    { key: 'str', short: 'GÜÇ', name: 'Güç (Str)' },
    { key: 'dex', short: 'ÇEV', name: 'Çeviklik (Dex)' },
    { key: 'con', short: 'DAY', name: 'Dayanıklılık (Con)' },
    { key: 'int', short: 'ZEK', name: 'Zekâ (Int)' },
    { key: 'wis', short: 'BİL', name: 'Bilgelik (Wis)' },
    { key: 'cha', short: 'KAR', name: 'Karizma (Cha)' },
];

export const CONDITIONS: { key: string; label: string; icon: string; desc: string }[] = [
    { key: 'zehirli', label: 'Zehirli', icon: '☠', desc: 'Saldırı ve yetenek zarlarında dezavantaj.' },
    { key: 'sersem', label: 'Sersem', icon: '✶', desc: 'Hamle yapamaz; ona yapılan saldırılar avantajlı.' },
    { key: 'yerde', label: 'Yere düşmüş', icon: '⤓', desc: 'Saldırılarında dezavantaj; yakındaki saldırgana avantaj.' },
    { key: 'kor', label: 'Kör', icon: '◌', desc: 'Saldırılarında dezavantaj; ona yapılanlar avantajlı.' },
    { key: 'korkmus', label: 'Korkmuş', icon: '!', desc: 'Saldırı ve yetenek zarlarında dezavantaj.' },
    { key: 'tutsak', label: 'Tutsak', icon: '⛓', desc: 'Hızı 0; ona yapılan saldırılar avantajlı.' },
    { key: 'gorunmez', label: 'Görünmez', icon: '◐', desc: 'Saldırılarında avantaj; ona yapılanlar dezavantajlı.' },
    { key: 'felcli', label: 'Felçli', icon: '≋', desc: 'Hamle yapamaz; ona yapılan saldırılar avantajlı, yakından kritik.' },
    { key: 'konsantre', label: 'Konsantre', icon: '◎', desc: 'Bir büyüyü sürdürüyor; hasar alınca Con kurtarması.' },
    { key: 'delirmis', label: 'Aklını yitirmiş', icon: '✺', desc: 'Akıl puanı 0: ne yapacağı masaya kalmış; saldırılarında dezavantaj.' },
];

export interface Sheet {
    level: number;
    hp: number;
    hpMax: number;
    mana: number;
    manaMax: number;
    ac: number;
    /** Hız (kare) */
    speed: number;
    /** Yetenek puanları kapalıyken kullanılan inisiyatif bonusu */
    initBonus: number;
    abilities: Record<Ability, number>;
    attack: { name: string; bonus: number; damage: string; reach: number };
    conditions: string[];
    /** Akıl sağlığı (eski kayıtlarda yok: 10 sayılır) */
    sanity?: number;
    sanityMax?: number;
    /** 0 HP: ölüm kurtarma zarları */
    death?: { ok: number; fail: number };
    state?: 'down' | 'stable' | 'dead';
}

const ab = (str: number, dex: number, con: number, int: number, wis: number, cha: number) => ({ str, dex, con, int, wis, cha });

/** Tarafa göre makul başlangıç kartı (hepsi düzenlenebilir) */
export function defaultSheet(kind: TokenKind, size: number): Sheet {
    switch (kind) {
        case 'oyuncu':
            return { level: 1, hp: 12, hpMax: 12, mana: 6, manaMax: 6, ac: 14, speed: 6, initBonus: 2, abilities: ab(14, 14, 13, 10, 12, 10), attack: { name: 'Kılıç', bonus: 4, damage: '1d8+2', reach: 1 }, conditions: [] };
        case 'dusman':
            return { level: 1, hp: 9, hpMax: 9, mana: 0, manaMax: 0, ac: 12, speed: 6, initBonus: 1, abilities: ab(12, 12, 12, 9, 10, 8), attack: { name: 'Pala', bonus: 3, damage: '1d6+1', reach: 1 }, conditions: [] };
        case 'npc':
            return { level: 1, hp: 8, hpMax: 8, mana: 2, manaMax: 2, ac: 11, speed: 6, initBonus: 0, abilities: ab(10, 10, 10, 10, 10, 10), attack: { name: 'Hançer', bonus: 2, damage: '1d4', reach: 1 }, conditions: [] };
        default: {
            const big = Math.max(1, size);
            return {
                level: 2 * big,
                hp: 22 * big,
                hpMax: 22 * big,
                mana: 0,
                manaMax: 0,
                ac: 12 + big,
                speed: 6 + 2 * (big - 1),
                initBonus: 1,
                abilities: ab(14 + 2 * big, 12, 14 + big, 6, 10, 8),
                attack: { name: 'Pençe', bonus: 3 + big, damage: `${big + 1}d6+${1 + big}`, reach: big },
                conditions: [],
            };
        }
    }
}

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const signed = (v: number) => (v >= 0 ? `+${v}` : `${v}`);

/** "2d6+3", "d20-1", "1d8 + 2", "5" */
export interface DiceExpr {
    count: number;
    sides: number;
    bonus: number;
}
export function parseDice(expr: string): DiceExpr | null {
    const s = expr.replace(/\s+/g, '').toLowerCase();
    const m = s.match(/^(\d*)d(4|6|8|10|12|20|100)([+-]\d+)?$/);
    if (m) return { count: Math.min(20, Math.max(1, Number(m[1] || 1))), sides: Number(m[2]), bonus: Number(m[3] || 0) };
    const n = s.match(/^[+-]?\d+$/);
    if (n) return { count: 0, sides: 0, bonus: Number(s) };
    return null;
}
export const formatDice = (d: DiceExpr) => (d.count ? `${d.count}d${d.sides}${d.bonus ? signed(d.bonus) : ''}` : String(d.bonus));

export type Edge = 'normal' | 'advantage' | 'disadvantage';

/** Durumlardan saldırı için avantaj/dezavantaj önerisi (5e: ikisi birden varsa birbirini götürür) */
export function suggestEdge(attacker: Sheet | undefined, target: Sheet | undefined, distance: number): { edge: Edge; why: string[] } {
    const adv: string[] = [], dis: string[] = [];
    const a = attacker?.conditions ?? [], t = target?.conditions ?? [];
    if (a.includes('zehirli')) dis.push('saldıran zehirli');
    if (a.includes('kor')) dis.push('saldıran kör');
    if (a.includes('korkmus')) dis.push('saldıran korkmuş');
    if (a.includes('yerde')) dis.push('saldıran yerde');
    if (a.includes('delirmis')) dis.push('saldıran aklını yitirmiş');
    if (a.includes('gorunmez')) adv.push('saldıran görünmez');
    if (t.includes('kor')) adv.push('hedef kör');
    if (t.includes('sersem')) adv.push('hedef sersem');
    if (t.includes('tutsak')) adv.push('hedef tutsak');
    if (t.includes('felcli')) adv.push('hedef felçli');
    if (t.includes('gorunmez')) dis.push('hedef görünmez');
    if (t.includes('yerde')) (distance <= 1 ? adv : dis).push(distance <= 1 ? 'hedef yerde (yakın)' : 'hedef yerde (uzak)');
    if (adv.length && dis.length) return { edge: 'normal', why: [...adv, ...dis] };
    if (adv.length) return { edge: 'advantage', why: adv };
    if (dis.length) return { edge: 'disadvantage', why: dis };
    return { edge: 'normal', why: [] };
}

/** Hasarı uygula: 0'a inen oyuncu bayılır (ölüm zarları açıksa), diğerleri ölür */
export function applyDamage(sheet: Sheet, amount: number, isPlayer: boolean, deathSaves: boolean): Sheet {
    if (amount <= 0) return sheet;
    const s = { ...sheet };
    if (s.state === 'down' || s.state === 'stable') {
        // Baygınken hasar: bir başarısızlık (kritik bunu iki yapar; çağıran ekler)
        const death = { ok: s.death?.ok ?? 0, fail: Math.min(3, (s.death?.fail ?? 0) + 1) };
        return { ...s, death, state: death.fail >= 3 ? 'dead' : 'down' };
    }
    s.hp = Math.max(0, s.hp - amount);
    if (s.hp === 0) {
        // Büyük darbe: kalan hasar azami canı geçerse anında ölüm (5e)
        const overflow = amount - sheet.hp;
        if (isPlayer && deathSaves && overflow < s.hpMax) {
            s.state = 'down';
            s.death = { ok: 0, fail: 0 };
            if (!s.conditions.includes('yerde')) s.conditions = [...s.conditions, 'yerde'];
        } else s.state = 'dead';
    }
    return s;
}

export function applyHeal(sheet: Sheet, amount: number): Sheet {
    if (amount <= 0 || sheet.state === 'dead') return sheet;
    return { ...sheet, hp: Math.min(sheet.hpMax, sheet.hp + amount), state: undefined, death: undefined };
}

export const sanityOf = (s: Sheet) => ({ cur: s.sanity ?? s.sanityMax ?? 10, max: s.sanityMax ?? 10 });
