import type { HeightField } from './terrain/heightField';
import { KM_PER_PIXEL, to3D, SCALE_FACTOR } from './utils/coords';
import type { MapPoint } from './types';

/**
 * Rota analizi: rota ~5 km'lik adımlarla yükselti haritası üzerinden örneklenir; her adımın zemini
 * (düz / sarp / dağ / deniz) yükseklik ve eğimden çıkarılır. Mesafe, süre, çizgi ve simülasyon
 * hep aynı örneklerden beslenir: ekranda görünen ile hesaplanan aynı şeydir.
 */
export type Ground = 'plain' | 'rough' | 'mountain' | 'water';

export const GROUND_LABEL: Record<Ground, string> = { plain: 'Düz', rough: 'Sarp', mountain: 'Dağ', water: 'Deniz' };
export const GROUND_COLOR: Record<Ground, string> = { plain: '#c9a24d', rough: '#a8743a', mountain: '#8a8f99', water: '#4a7fa8' };
// Kara yolculuğunda tempo çarpanı (velutanmap.com temposuyla uyumlu: dağ 0.4, sarp 0.7)
export const GROUND_MULT: Record<Exclude<Ground, 'water'>, number> = { plain: 1, rough: 0.7, mountain: 0.4 };
// Denizde gemiyle; yürüme temposundan bağımsız
export const SHIP_KM_PER_DAY = 110;
export const PACE_KM_PER_DAY: Record<string, number> = { slow: 30, normal: 45, fast: 60 };

const STEP_WORLD = 0.04; // ≈ 5.6 km
const SLOPE_EPS = 0.05;
// Dünya birimi cinsinden eşikler (yükselti haritasından ölçüldü: ova ~0.1–0.26, dağlar 0.55+).
// Eğim yalnızca ova seviyesinin üstünde sayılır; yoksa kıyı uçurumları dağ sanılır.
const MOUNTAIN_H = 0.55;
const ROUGH_H = 0.36;
const MOUNTAIN_SLOPE = 1.1;
const ROUGH_SLOPE = 0.6;

export interface RouteSample {
    x: number;
    z: number;
    /** zemin yüksekliği (deniz 0'a kırpılmış) */
    y: number;
    ground: Ground;
    /** Rotanın başından bu örneğe kadar gün */
    day: number;
    km: number;
}

export interface RouteAnalysis {
    samples: RouteSample[];
    km: number;
    totalDays: number;
    byGround: Record<Ground, number>; // km
    /** Kullanıcı duraklarının samples içindeki sırası */
    stopIndex: number[];
}

export function classify(field: HeightField, x: number, z: number): { y: number; ground: Ground } {
    const h = field.sample(x, z);
    if (h < 0.015) return { y: 0, ground: 'water' };
    const gx = (field.sample(x + SLOPE_EPS, z) - field.sample(x - SLOPE_EPS, z)) / (2 * SLOPE_EPS);
    const gz = (field.sample(x, z + SLOPE_EPS) - field.sample(x, z - SLOPE_EPS)) / (2 * SLOPE_EPS);
    const slope = Math.hypot(gx, gz);
    const ground: Ground =
        h > MOUNTAIN_H || (slope > MOUNTAIN_SLOPE && h > 0.3) ? 'mountain' : h > ROUGH_H || (slope > ROUGH_SLOPE && h > 0.22) ? 'rough' : 'plain';
    return { y: h, ground };
}

export function analyzeRoute(path: MapPoint[], field: HeightField, pace: string): RouteAnalysis {
    const kmPerWorld = SCALE_FACTOR * KM_PER_PIXEL;
    const landSpeed = PACE_KM_PER_DAY[pace] ?? 45;
    const byGround: Record<Ground, number> = { plain: 0, rough: 0, mountain: 0, water: 0 };
    const samples: RouteSample[] = [];
    const stopIndex: number[] = [];
    let day = 0;
    let km = 0;

    const push = (x: number, z: number) => {
        const { y, ground } = classify(field, x, z);
        const prev = samples[samples.length - 1];
        if (prev) {
            const d = Math.hypot(x - prev.x, z - prev.z) * kmPerWorld;
            // Adımın zemini iki ucun zorlusu: dağa giren adım dağ sayılır
            const g = harder(prev.ground, ground);
            byGround[g] += d;
            km += d;
            day += d / (g === 'water' ? SHIP_KM_PER_DAY : landSpeed * GROUND_MULT[g]);
        }
        samples.push({ x, z, y, ground, day, km });
    };

    path.forEach((p, i) => {
        const [x, , z] = to3D(p.x, p.y);
        if (i > 0) {
            const [px, , pz] = to3D(path[i - 1].x, path[i - 1].y);
            const n = Math.max(1, Math.ceil(Math.hypot(x - px, z - pz) / STEP_WORLD));
            for (let k = 1; k < n; k++) push(px + ((x - px) * k) / n, pz + ((z - pz) * k) / n);
        }
        push(x, z);
        stopIndex.push(samples.length - 1);
    });
    return { samples, km, totalDays: day, byGround, stopIndex };
}

const RANK: Record<Ground, number> = { plain: 0, rough: 1, mountain: 2, water: 3 };
const harder = (a: Ground, b: Ground): Ground => {
    // Kıyıda kara-deniz geçişi: denize girilmedikçe kara sayılır
    if (a === 'water' !== (b === 'water')) return a === 'water' ? b : a;
    return RANK[a] >= RANK[b] ? a : b;
};

/** Simülasyon: rota başından `day` güne kadar gidilen konum (zamana göre; dağda yavaşlar) */
export function positionAtDay(a: RouteAnalysis, day: number, lo = 0): { x: number; y: number; z: number; ground: Ground; i: number } {
    const s = a.samples;
    let i = Math.max(0, Math.min(lo, s.length - 2));
    while (i < s.length - 2 && s[i + 1].day < day) i++;
    const p = s[i];
    const q = s[Math.min(i + 1, s.length - 1)];
    const span = q.day - p.day;
    const t = span > 0 ? Math.min(Math.max((day - p.day) / span, 0), 1) : 1;
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, z: p.z + (q.z - p.z) * t, ground: harder(p.ground, q.ground), i };
}

export const formatDuration = (totalDays: number) => {
    const days = Math.floor(totalDays);
    const hours = Math.round((totalDays - days) * 24);
    return hours === 24 ? { days: days + 1, hours: 0 } : { days, hours };
};
