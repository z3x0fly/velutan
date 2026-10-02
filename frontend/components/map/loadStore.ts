'use client';

import { useSyncExternalStore } from 'react';

/**
 * Harita yükleme ilerlemesi. 3D parça (MapCanvas3D) drei useProgress'ten okuyup buraya yazar;
 * gösterge buradan okur. Böylece three.js ana sayfa paketine girmez.
 */
let state = { active: true, progress: 0 };
const listeners = new Set<() => void>();

export const loadStore = {
    set(next: { active: boolean; progress: number }) {
        if (next.active === state.active && Math.round(next.progress) === Math.round(state.progress)) return;
        state = next;
        listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
        listeners.add(l);
        return () => listeners.delete(l);
    },
};

const SERVER = { active: true, progress: 0 };
export const useLoadState = () => useSyncExternalStore(loadStore.subscribe, () => state, () => SERVER);
