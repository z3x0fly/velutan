'use client';

import { useSyncExternalStore } from 'react';

/**
 * Kamera durumu (azimut, zoom) için küçük dış depo. Pusula, ölçek çubuğu ve logo buna abone olur;
 * böylece kamera her değiştiğinde bütün sayfa (lejant, paneller, harita bileşeni) yeniden render olmaz.
 * Eskiden bu değerler sayfa state'indeydi ve zoom sırasında saniyede ~10 kez tüm ağaç render oluyordu.
 */
interface CameraState {
    rotation: number; // radyan
    zoom: number; // 1 = açılış görünümü
}

let state: CameraState = { rotation: 0, zoom: 1 };
const listeners = new Set<() => void>();

export const cameraStore = {
    get: () => state,
    set(patch: Partial<CameraState>) {
        const next = { ...state, ...patch };
        if (next.rotation === state.rotation && next.zoom === state.zoom) return;
        state = next;
        listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },
};

const SERVER_STATE: CameraState = { rotation: 0, zoom: 1 };

export function useCameraState<T>(select: (s: CameraState) => T): T {
    return useSyncExternalStore(
        cameraStore.subscribe,
        () => select(state),
        () => select(SERVER_STATE),
    );
}
