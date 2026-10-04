import * as THREE from 'three';

/**
 * Gün döngüsü saati. Sahne (DayNight) her karede buradan okur; ışık ve su renkleri `dayLight` üzerinden
 * paylaşılır (React render'ı tetiklemeden). Arayüz için gece oranı ve saat seyrek yayımlanır.
 */
export const dayClock = {
    /** Seyahat simülasyonunda geçen gün (yoksa null): saat bundan hesaplanır */
    simDay: null as number | null,
    /** Simülasyonda bir günün kaç saniyede geçtiği (çok hızlıysa gece yumuşatılır) */
    secPerDay: 3.5,
};

/** O anki ışık renkleri (Water gibi katmanlar okur) */
export const dayLight = {
    sun: new THREE.Color('#fff1d6'),
    sky: new THREE.Color('#b9c9d6'),
    night: 0,
};

export interface DayInfo {
    active: boolean;
    hour: number;
    night: number;
    /** Simülasyonda kaçıncı gün (1'den) */
    day: number | null;
}

let info: DayInfo = { active: false, hour: 13, night: 0, day: null };
const listeners = new Set<() => void>();

export const dayStore = {
    get: () => info,
    subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
    /** Yalnızca gözle görülür değişimde yayımlanır (dakikada birkaç kez) */
    publish: (next: DayInfo) => {
        if (
            next.active === info.active &&
            next.day === info.day &&
            Math.abs(next.night - info.night) < 0.02 &&
            Math.floor(next.hour * 4) === Math.floor(info.hour * 4)
        )
            return;
        info = next;
        listeners.forEach((l) => l());
    },
};

/** Saat (0..24) -> güneşin yüksekliği (-1 gece yarısı .. 1 öğle) */
export const sunElevation = (hour: number) => Math.sin(((hour - 6) / 12) * Math.PI);

export const fmtHour = (hour: number) => {
    const h = Math.floor(hour) % 24;
    const m = Math.floor((hour % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m - (m % 15)).padStart(2, '0')}`;
};
