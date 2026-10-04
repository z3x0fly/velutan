import { useSyncExternalStore } from 'react';

/**
 * Harita teması (grafik kalitesinden bağımsız): ağaç renkleri, haritanın genel tonu ve gün döngüsü.
 * Tercih tarayıcıda saklanır.
 */
export type TreeTheme = 'dogal' | 'gri' | 'sonbahar' | 'kis';
export type MapTone = 'renkli' | 'gravur' | 'sepya';
/** Gün döngüsü: kapalı (hep gündüz), döngü (birkaç dakikada bir gün), gerçek saat */
export type DayCycle = 'kapali' | 'dongu' | 'saat';

export interface ThemeState {
    trees: TreeTheme;
    tone: MapTone;
    day: DayCycle;
}

const KEY = 'velutan_tema';
const DEFAULT: ThemeState = { trees: 'dogal', tone: 'renkli', day: 'kapali' };

let state: ThemeState = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

export const themeStore = {
    get: (): ThemeState => {
        if (!loaded && typeof window !== 'undefined') {
            loaded = true;
            try {
                const v = JSON.parse(localStorage.getItem(KEY) || 'null');
                if (v && typeof v === 'object') state = { ...DEFAULT, ...v };
            } catch {
                /* varsayılan */
            }
        }
        return state;
    },
    subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
    set: (patch: Partial<ThemeState>) => {
        state = { ...themeStore.get(), ...patch };
        try {
            localStorage.setItem(KEY, JSON.stringify(state));
        } catch {
            /* yoksay */
        }
        listeners.forEach((l) => l());
    },
};

const serverState = () => DEFAULT;
export const useTheme = () => useSyncExternalStore(themeStore.subscribe, themeStore.get, serverState);

/** Haritanın genel tonu: tuvale CSS süzgeci (ek çizim maliyeti yok) */
export const TONE_FILTER: Record<MapTone, string> = {
    renkli: 'none',
    gravur: 'grayscale(1) contrast(1.12) brightness(1.03)',
    sepya: 'sepia(0.75) saturate(0.85) contrast(1.05)',
};
