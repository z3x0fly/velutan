import type { DieKind } from './shapes';

/**
 * Zar atma kuyruğu. Savaş mekanikleri (saldırı, hasar, inisiyatif…) zar ister; masadaki 3D zarlar
 * (DiceBox) isteği alır, oyuncu zarları sallayıp fırlatır, fizik durunca sonuçlar geri döner.
 * "Hızlı" kipte fizik atlanır, sonuç anında (adil rastgele) gelir.
 */
export type RollMode = 'hand' | 'auto' | 'quick';

export interface DieRequest {
    /** 100 = iki d10 (onlar + birler) */
    sides: DieKind | 100;
    /** Gövde rengi (taraf rengi); boşsa Velutan kızılı */
    color?: string;
}

export interface RollRequest {
    id: number;
    dice: DieRequest[];
    /** Masada görünen başlık: "Aerondight · Saldırı" */
    label: string;
    resolve: (values: number[]) => void;
}

export interface DiceState {
    mode: RollMode;
    /** Sıradaki istek (masada atılmayı bekleyen) */
    pending: RollRequest | null;
    /** Telefonu sallayınca at */
    shake: boolean;
    sound: boolean;
}

const MODE_KEY = 'velutan_zar_kip';
const SOUND_KEY = 'velutan_zar_ses';

let state: DiceState = { mode: 'hand', pending: null, shake: false, sound: true };
let loaded = false;
const queue: RollRequest[] = [];
const listeners = new Set<() => void>();
let nextId = 1;

const emit = () => listeners.forEach((l) => l());

/** Adil zar: crypto ile, modulo yanlılığı olmadan */
export function fairRoll(sides: number) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / sides) * sides;
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return (buf[0] % sides) + 1;
}

/** 0..1 arası adil rastgele (fırlatma yönü ve dönüşü için) */
export const fairUnit = () => fairRoll(1_000_000) / 1_000_000;

function load() {
    if (loaded || typeof window === 'undefined') return;
    loaded = true;
    try {
        const m = localStorage.getItem(MODE_KEY) as RollMode | null;
        if (m === 'hand' || m === 'auto' || m === 'quick') state = { ...state, mode: m };
        if (localStorage.getItem(SOUND_KEY) === '0') state = { ...state, sound: false };
    } catch {
        /* yoksay */
    }
}

function advance() {
    if (state.pending || queue.length === 0) return;
    state = { ...state, pending: queue.shift()! };
    emit();
}

export const diceStore = {
    get: (): DiceState => {
        load();
        return state;
    },
    subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
    setMode: (mode: RollMode) => {
        state = { ...state, mode };
        try {
            localStorage.setItem(MODE_KEY, mode);
        } catch {
            /* yoksay */
        }
        emit();
    },
    setShake: (shake: boolean) => {
        state = { ...state, shake };
        emit();
    },
    setSound: (sound: boolean) => {
        state = { ...state, sound };
        try {
            localStorage.setItem(SOUND_KEY, sound ? '1' : '0');
        } catch {
            /* yoksay */
        }
        emit();
    },
    /** Zar iste; hızlı kipte ya da masa yoksa anında sonuç döner */
    roll: (dice: DieRequest[], label: string): Promise<number[]> => {
        load();
        if (state.mode === 'quick' || !tableMounted) return Promise.resolve(dice.map((d) => fairRoll(d.sides)));
        return new Promise((resolve) => {
            queue.push({ id: nextId++, dice, label, resolve });
            advance();
        });
    },
    /** Masa sonucu bildirir */
    finish: (id: number, values: number[]) => {
        const p = state.pending;
        if (!p || p.id !== id) return;
        state = { ...state, pending: null };
        emit();
        p.resolve(values);
        // Sıradaki atış (ör. saldırıdan sonra hasar) kısa bir nefesten sonra masaya gelir
        setTimeout(advance, 350);
    },
    /** Bekleyen atışı vazgeçmeden anında sonuçlandır (masa kapanırken) */
    flush: () => {
        const all = [...(state.pending ? [state.pending] : []), ...queue.splice(0)];
        state = { ...state, pending: null };
        emit();
        all.forEach((r) => r.resolve(r.dice.map((d) => fairRoll(d.sides))));
    },
};

/** Masa açık mı (kapalıyken istekler anında sonuçlanır) */
let tableMounted = false;
export const setTableMounted = (v: boolean) => {
    tableMounted = v;
    if (!v) diceStore.flush();
};
