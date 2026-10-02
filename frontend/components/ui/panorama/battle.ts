import { useCallback, useEffect, useState } from 'react';
import type { Rules, Sheet } from './rules';

/**
 * 360° mekânlarda savaş ızgarası ve token'lar: veri modeli ve saklama.
 * Her panorama için ayrı tutulur (localStorage). Token konumları hücre cinsindendir; ızgaranın boyu
 * ya da açısı değişse de token'lar kendi karelerinde kalır.
 */
export type TokenKind = 'oyuncu' | 'dusman' | 'npc' | 'canavar';

export const TOKEN_KINDS: Record<TokenKind, { label: string; color: string }> = {
    oyuncu: { label: 'Oyuncu', color: '#3b82f6' },
    dusman: { label: 'Düşman', color: '#dc2626' },
    npc: { label: 'NPC', color: '#d97706' },
    canavar: { label: 'Canavar', color: '#7c3aed' },
};

export interface Token {
    id: string;
    name: string;
    kind: TokenKind;
    /** Kapladığı kare (1, 2, 3) */
    size: number;
    /** Sol üst hücre (ızgara yerel koordinatı) */
    cx: number;
    cz: number;
    /** İsteğe bağlı 2D karakter görseli (arkası şeffaf; küçültülmüş data URL). Varsa token ayakta durur. */
    image?: string;
    /** Sistemli oyunda karakter kartı (HP, MANA, ZS, yetenekler…) */
    sheet?: Sheet;
}

/** İnisiyatif sırası ve tur durumu */
export interface Combat {
    round: number;
    order: { id: string; init: number }[];
    turn: number;
    /** Sırası gelen token'ın tur başındaki karesi (hareket hakkı buradan sayılır) */
    start: { id: string; cx: number; cz: number } | null;
    moved: number;
    dashed: boolean;
}

export type LogTone = 'info' | 'hit' | 'miss' | 'crit' | 'fumble' | 'heal' | 'death' | 'roll' | 'turn';
export interface LogEntry {
    id: number;
    text: string;
    tone: LogTone;
}

export interface GridSettings {
    /** Bir karenin kenarı (metre); D&D'de 1,5 m = 5 ft */
    cell: number;
    /** Kameranın zeminden yüksekliği (metre): ızgaranın panoramadaki zemine oturması için */
    height: number;
    /** Izgara açısı (derece) */
    rotation: number;
    opacity: number;
}

export interface BattleState {
    on: boolean;
    grid: GridSettings;
    tokens: Token[];
    /** Kurulumda seçilen kurallar; yoksa oyun kurulmamış (kurulum ekranı açılır) */
    rules?: Rules;
    combat?: Combat | null;
    log?: LogEntry[];
}

export const DEFAULT_GRID: GridSettings = { cell: 1.5, height: 1.6, rotation: 0, opacity: 0.55 };
const EMPTY: BattleState = { on: false, grid: DEFAULT_GRID, tokens: [] };

const keyFor = (panoId: string | number) => `velutan_savas_${panoId}`;

function read(panoId: string | number): BattleState {
    try {
        const raw = localStorage.getItem(keyFor(panoId));
        if (raw) {
            const v = JSON.parse(raw);
            return {
                on: !!v.on,
                grid: { ...DEFAULT_GRID, ...(v.grid ?? {}) },
                tokens: Array.isArray(v.tokens) ? v.tokens : [],
                rules: v.rules,
                combat: v.combat ?? null,
                log: Array.isArray(v.log) ? v.log.slice(-60) : [],
            };
        }
    } catch {
        /* özel sekme vb. */
    }
    return EMPTY;
}

/** Panoramaya özel savaş durumu; her değişiklik saklanır */
export function useBattle(panoId: string | number) {
    const [state, setState] = useState<BattleState>(EMPTY);
    useEffect(() => setState(read(panoId)), [panoId]);

    const update = useCallback(
        (fn: (s: BattleState) => BattleState) =>
            setState((cur) => {
                const next = fn(cur);
                try {
                    localStorage.setItem(keyFor(panoId), JSON.stringify(next));
                } catch {
                    /* kota dolu: yalnızca bu oturumda kalır */
                }
                return next;
            }),
        [panoId],
    );
    return [state, update] as const;
}

/** Hücre koordinatı -> dünya (x, z). Token merkezi, kapladığı alanın ortası. */
export function cellToWorld(cx: number, cz: number, size: number, grid: GridSettings): [number, number] {
    const lx = (cx + size / 2) * grid.cell;
    const lz = (cz + size / 2) * grid.cell;
    const a = (grid.rotation * Math.PI) / 180;
    return [lx * Math.cos(a) - lz * Math.sin(a), lx * Math.sin(a) + lz * Math.cos(a)];
}

/** Dünya (x, z) -> token'ın oturacağı sol üst hücre */
export function worldToCell(x: number, z: number, size: number, grid: GridSettings): [number, number] {
    const a = (-grid.rotation * Math.PI) / 180;
    const lx = (x * Math.cos(a) - z * Math.sin(a)) / grid.cell;
    const lz = (x * Math.sin(a) + z * Math.cos(a)) / grid.cell;
    return [Math.round(lx - size / 2), Math.round(lz - size / 2)];
}

/**
 * Karakter görselini küçültür; şeffaflık korunur (WebP, desteklemeyen tarayıcıda PNG).
 * Görselin etrafındaki boş (şeffaf) alan kırpılır ki karakter ayakları zemine otursun.
 */
export function shrinkImage(file: File, maxSide = 320): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            // Şeffaf kenarları bul (küçük bir kopyada tara)
            const probe = document.createElement('canvas');
            const ps = Math.min(1, 256 / Math.max(img.width, img.height));
            probe.width = Math.max(1, Math.round(img.width * ps));
            probe.height = Math.max(1, Math.round(img.height * ps));
            const pctx = probe.getContext('2d', { willReadFrequently: true })!;
            pctx.drawImage(img, 0, 0, probe.width, probe.height);
            const data = pctx.getImageData(0, 0, probe.width, probe.height).data;
            let x0 = probe.width, y0 = probe.height, x1 = -1, y1 = -1;
            for (let y = 0; y < probe.height; y++)
                for (let x = 0; x < probe.width; x++)
                    if (data[(y * probe.width + x) * 4 + 3] > 16) {
                        if (x < x0) x0 = x;
                        if (x > x1) x1 = x;
                        if (y < y0) y0 = y;
                        if (y > y1) y1 = y;
                    }
            if (x1 < 0) return reject(new Error('Görsel tamamen şeffaf'));
            const sx = x0 / ps, sy = y0 / ps;
            const sw = Math.min(img.width - sx, (x1 - x0 + 1) / ps), sh = Math.min(img.height - sy, (y1 - y0 + 1) / ps);
            const k = Math.min(1, maxSide / Math.max(sw, sh));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(sw * k));
            c.height = Math.max(1, Math.round(sh * k));
            c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
            const webp = c.toDataURL('image/webp', 0.9);
            resolve(webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Görsel okunamadı'));
        img.src = URL.createObjectURL(file);
    });
}

export const initials = (name: string) =>
    name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toLocaleUpperCase('tr') ?? '')
        .join('') || '?';

// --- Karakter kütüphanesi: bir kez kaydedilen karakter her mekâna tek tıkla eklenir
export interface SavedCharacter {
    id: string;
    name: string;
    kind: TokenKind;
    size: number;
    image?: string;
    sheet?: Sheet;
}
const LIB_KEY = 'velutan_karakterler';

export function readLibrary(): SavedCharacter[] {
    try {
        const v = JSON.parse(localStorage.getItem(LIB_KEY) || '[]');
        return Array.isArray(v) ? v : [];
    } catch {
        return [];
    }
}

export function saveToLibrary(t: Token): SavedCharacter[] {
    const lib = readLibrary().filter((c) => c.name.toLocaleLowerCase('tr') !== t.name.toLocaleLowerCase('tr'));
    // Kayıtta kart "tam sağlıklı" saklanır
    const sheet = t.sheet ? { ...t.sheet, hp: t.sheet.hpMax, mana: t.sheet.manaMax, conditions: [], death: undefined, state: undefined } : undefined;
    const next = [{ id: t.id, name: t.name, kind: t.kind, size: t.size, image: t.image, sheet }, ...lib].slice(0, 40);
    try {
        localStorage.setItem(LIB_KEY, JSON.stringify(next));
    } catch {
        /* kota dolu */
    }
    window.dispatchEvent(new Event('velutan:kutuphane'));
    return next;
}

export function removeFromLibrary(id: string): SavedCharacter[] {
    const next = readLibrary().filter((c) => c.id !== id);
    try {
        localStorage.setItem(LIB_KEY, JSON.stringify(next));
    } catch {
        /* yoksay */
    }
    window.dispatchEvent(new Event('velutan:kutuphane'));
    return next;
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** İki token arası mesafe (kare; 5e: çapraz da tek kare) */
export const cellDistance = (a: Token, b: Token) => {
    // Kapladıkları alanların en yakın kareleri arası
    const dx = Math.max(0, Math.max(a.cx, b.cx) - Math.min(a.cx + a.size - 1, b.cx + b.size - 1));
    const dz = Math.max(0, Math.max(a.cz, b.cz) - Math.min(a.cz + a.size - 1, b.cz + b.size - 1));
    return Math.max(dx, dz);
};
