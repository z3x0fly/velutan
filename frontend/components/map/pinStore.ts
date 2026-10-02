'use client';

import { useSyncExternalStore } from 'react';
import { MAP_HEIGHT_PIXELS, MAP_WIDTH_PIXELS } from './utils/coords';

/**
 * Kişisel yer işaretleri: ziyaretçinin kendi notları. Sunucuya gitmez, yalnızca bu tarayıcıda durur;
 * bağlantı ile paylaşılabilir (?isaretler=...).
 */
export const PIN_KINDS = ['kamp', 'gorev', 'hazine', 'tehlike', 'bulusma', 'not'] as const;
export type PinKind = (typeof PIN_KINDS)[number];

export interface Pin {
    id: string;
    x: number;
    y: number;
    kind: PinKind;
    title: string;
    note: string;
}

interface State {
    pins: Pin[];
    /** Haritaya tıklayınca işaret bırakma modu */
    placing: boolean;
    /** Açık (düzenlenen) işaret */
    activeId: string | null;
}

const KEY = 'velutan_pins_v1';
const MAX_PINS = 200;
export const TITLE_MAX = 60;
export const NOTE_MAX = 500;

let state: State = { pins: [], placing: false, activeId: null };
const listeners = new Set<() => void>();
let loaded = false;

const emit = () => listeners.forEach((l) => l());
const persist = () => {
    try {
        localStorage.setItem(KEY, JSON.stringify(state.pins));
    } catch {
        /* gizli mod / kota: işaretler bu oturumda yine çalışır */
    }
};

/** Dışarıdan gelen (depo, paylaşım bağlantısı) veriyi temizler */
export function sanitizePins(raw: unknown): Pin[] {
    if (!Array.isArray(raw)) return [];
    const out: Pin[] = [];
    for (const p of raw.slice(0, MAX_PINS)) {
        if (!p || typeof p !== 'object') continue;
        const o = p as Record<string, unknown>;
        const x = Number(o.x);
        const y = Number(o.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > MAP_WIDTH_PIXELS || y > MAP_HEIGHT_PIXELS) continue;
        out.push({
            id: typeof o.id === 'string' && o.id.length <= 24 ? o.id : newId(),
            x: Math.round(x),
            y: Math.round(y),
            kind: (PIN_KINDS as readonly unknown[]).includes(o.kind) ? (o.kind as PinKind) : 'not',
            title: String(o.title ?? '').slice(0, TITLE_MAX),
            note: String(o.note ?? '').slice(0, NOTE_MAX),
        });
    }
    return out;
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function ensureLoaded() {
    if (loaded || typeof window === 'undefined') return;
    loaded = true;
    try {
        state = { ...state, pins: sanitizePins(JSON.parse(localStorage.getItem(KEY) || '[]')) };
    } catch {
        /* bozuk kayıt: boş başla */
    }
}

const set = (patch: Partial<State>, save = false) => {
    state = { ...state, ...patch };
    if (save) persist();
    emit();
};

export const pinStore = {
    get: () => state,
    subscribe(l: () => void) {
        ensureLoaded();
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
    setPlacing: (placing: boolean) => set({ placing }),
    open: (activeId: string | null) => set({ activeId }),
    add(x: number, y: number) {
        if (state.pins.length >= MAX_PINS) return;
        const pin: Pin = { id: newId(), x: Math.round(x), y: Math.round(y), kind: 'not', title: '', note: '' };
        // Bir işaret bırakınca mod kapanır; düzenleme penceresi açılır
        set({ pins: [...state.pins, pin], placing: false, activeId: pin.id }, true);
    },
    update(id: string, patch: Partial<Omit<Pin, 'id'>>) {
        set({ pins: state.pins.map((p) => (p.id === id ? sanitizePins([{ ...p, ...patch }])[0] ?? p : p)) }, true);
    },
    remove(id: string) {
        set({ pins: state.pins.filter((p) => p.id !== id), activeId: state.activeId === id ? null : state.activeId }, true);
    },
    clear: () => set({ pins: [], activeId: null }, true),
    /** Paylaşılan işaretleri ekler (aynı konumdakiler tekrar eklenmez) */
    importPins(incoming: Pin[]) {
        const seen = new Set(state.pins.map((p) => `${p.x},${p.y}`));
        const fresh = incoming.filter((p) => !seen.has(`${p.x},${p.y}`)).map((p) => ({ ...p, id: newId() }));
        set({ pins: [...state.pins, ...fresh].slice(0, MAX_PINS) }, true);
        return fresh.length;
    },
};

const SERVER: State = { pins: [], placing: false, activeId: null };
export const usePins = () => useSyncExternalStore(pinStore.subscribe, pinStore.get, () => SERVER);

// --- Paylaşım bağlantısı: kısa JSON -> base64url (Türkçe karakterler için UTF-8) ---
export function encodePins(pins: Pin[]): string {
    const compact = pins.map((p) => [p.x, p.y, PIN_KINDS.indexOf(p.kind), p.title, p.note]);
    const bytes = new TextEncoder().encode(JSON.stringify(compact));
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodePins(code: string): Pin[] {
    try {
        if (code.length > 60000) return [];
        const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
        const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
        const arr = JSON.parse(json) as unknown[];
        if (!Array.isArray(arr)) return [];
        return sanitizePins(
            arr.map((a) => (Array.isArray(a) ? { x: a[0], y: a[1], kind: PIN_KINDS[Number(a[2])] ?? 'not', title: a[3], note: a[4] } : null)),
        );
    } catch {
        return [];
    }
}
