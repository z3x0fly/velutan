import { themeStore } from './themeStore';

/**
 * Ortak gökyüzü saati (düz harita ve küre aynı zamanı yaşar). Gerçek zamana bir kayma (saat) eklenir;
 * "zaman atlatma" (meditasyon) bu kaymayı birkaç saniyede hızla ilerletir: güneş, ay ve ışık gözün önünde döner.
 */
let offsetHours = 0;
let anim: { from: number; to: number; start: number; dur: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function current() {
    if (anim) {
        const t = Math.min(1, (performance.now() - anim.start) / anim.dur);
        offsetHours = anim.from + (anim.to - anim.from) * ease(t);
        if (t >= 1) {
            anim = null;
            emit();
        }
    }
    return offsetHours;
}

export const skyClock = {
    /** Gökyüzünün şu anki zamanı (gerçek zaman + kayma) */
    now: () => new Date(Date.now() + current() * 3600000),
    /** Kayma (saat) */
    offset: () => current(),
    skipping: () => !!anim,
    /** Saatleri ilerlet: süre uzunluğa göre (bir gün ≈ 4 sn, uzun atlayışlar en fazla 9 sn) */
    advance: (hours: number) => {
        if (hours <= 0) return;
        // Gün döngüsü kapalıysa gerçek saate geçilir (atlatılan zaman görünsün)
        if (themeStore.get().day === 'kapali') themeStore.set({ day: 'saat' });
        const from = current();
        anim = { from, to: from + hours, start: performance.now(), dur: Math.min(9000, 1800 + Math.sqrt(hours) * 900) };
        emit();
    },
    /** Gerçek zamana dön */
    reset: () => {
        anim = null;
        offsetHours = 0;
        emit();
    },
    subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
};

/** Bilinen bir yeni ay: 6 Ocak 2000 18:14 UTC (ay evresi bundan sayılır) */
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
/** Döngü kipinde bir gün kaç saniye */
const CYCLE_SECONDS = 240;
const cycleStart = typeof performance !== 'undefined' ? performance.now() : 0;

const dayOfYear = (d: Date) => (d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000;

/**
 * Gökyüzü zamanı (haritanın ortasındaki saate göre): yılın günü, saat ve yeni aydan bu yana gün.
 * Gerçek saat kipinde gerçek zaman + kayma; döngü kipinde 4 dakikada bir gün (+ kayma).
 */
export function skyTime() {
    const off = skyClock.offset();
    if (themeStore.get().day === 'dongu') {
        const elapsed = (performance.now() - cycleStart) / 1000 / CYCLE_SECONDS + off / 24; // gün
        const base = new Date();
        const total = 13 / 24 + elapsed;
        return { doy: (dayOfYear(base) + Math.floor(total)) % 365.25, hour: (total % 1) * 24, days: base.getTime() / 86400000 - NEW_MOON_EPOCH + elapsed };
    }
    const now = skyClock.now();
    return { doy: dayOfYear(now) % 365.25, hour: now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600, days: now.getTime() / 86400000 - NEW_MOON_EPOCH };
}
