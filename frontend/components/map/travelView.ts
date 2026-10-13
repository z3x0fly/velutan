import { useSyncExternalStore } from 'react';

/**
 * Seyahat simülasyonunda kamera: kuşbakışı (harita takip eder) ya da "Yolcu gözü" (yolcunun hemen arkasında,
 * yere yakın; yolculuk göz hizasından izlenir). Harita 5.431 km genişliğinde: 1 birim ≈ 141 km, gerçek boyda bir
 * insan görünmez; bu yüzden yolcu figürü görünür boyda, kamera ise ona göre yere iner.
 */
let eye = false;
const listeners = new Set<() => void>();

export const travelView = {
    get eye() {
        return eye;
    },
    setEye(v: boolean) {
        eye = v;
        listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
};

export const useTravelEye = () =>
    useSyncExternalStore(
        travelView.subscribe,
        () => eye,
        () => false,
    );
