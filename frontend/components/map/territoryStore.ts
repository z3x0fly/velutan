'use client';

import { useSyncExternalStore } from 'react';
import { API_URL } from './media';

/** Editörlerin panelden çizdiği krallık/bölge sınırları (API: /territories). */
export interface Territory {
    id: number;
    name: string;
    kind: string;
    color: string;
    points: [number, number][];
    region_id: number | null;
    note: string | null;
}

export const TERRITORY_KIND_LABEL: Record<string, string> = {
    kingdom: 'Krallık',
    province: 'Eyalet',
    wild: 'Yaban Topraklar',
    danger: 'Tehlikeli Bölge',
    sacred: 'Kutsal Topraklar',
};

interface State {
    list: Territory[];
    visible: boolean;
    /** Lejantta üzerine gelinen / seçilen sınır (haritada vurgulanır) */
    focusId: number | null;
}

let state: State = { list: [], visible: true, focusId: null };
const listeners = new Set<() => void>();
let requested = false;

const set = (patch: Partial<State>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
};

function ensureLoaded() {
    if (requested || typeof window === 'undefined') return;
    requested = true;
    try {
        if (localStorage.getItem('velutan_borders') === '0') state = { ...state, visible: false };
    } catch {
        /* yok say */
    }
    fetch(`${API_URL}/territories`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => set({ list: Array.isArray(data) ? data : [] }))
        .catch(() => {
            requested = false; // bir sonraki abonelikte tekrar dene
        });
}

export const territoryStore = {
    get: () => state,
    subscribe(l: () => void) {
        ensureLoaded();
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
    setVisible(visible: boolean) {
        try {
            localStorage.setItem('velutan_borders', visible ? '1' : '0');
        } catch {
            /* yok say */
        }
        set({ visible });
    },
    focus: (focusId: number | null) => set({ focusId }),
};

const SERVER: State = { list: [], visible: true, focusId: null };
export const useTerritories = () => useSyncExternalStore(territoryStore.subscribe, territoryStore.get, () => SERVER);

/** Çokgenin alan ağırlık merkezi (uçuş hedefi için) */
export function centroid(points: [number, number][]): [number, number] {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        const f = x0 * y1 - x1 * y0;
        a += f;
        cx += (x0 + x1) * f;
        cy += (y0 + y1) * f;
    }
    if (Math.abs(a) < 1e-6) {
        const n = points.length || 1;
        return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
    }
    return [cx / (3 * a), cy / (3 * a)];
}
