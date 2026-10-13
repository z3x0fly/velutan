import { mapAsset } from './media';
import type { MapPoint } from './types';

/**
 * Yol ağı: boyalı haritadaki noktalı yollardan çıkarılmış graf (tools/build_roads.py -> roads.json).
 * Düğümler harita pikselinde. Seyahatte iki durak arası, ikisi de yola yakınsa yol üzerinden gidilir.
 */
export interface RoadGraph {
    x: Int32Array;
    y: Int32Array;
    adj: number[][];
    /** Bağlı parça kimliği: farklı kıtalardaki yollar birbirine bağlanmaz */
    comp: Int32Array;
}

/** Durak yola en fazla bu kadar uzaksa (harita pikseli, ≈ 185 km) yola çıkılır; yol dışı yürüme yine pahalı sayılır */
const SNAP_PX = 280;
/** Yol, düz gidişin bu katından uzunsa (körfezi dolanmak gibi) düz gidilir */
const MAX_DETOUR = 3;

let cached: Promise<RoadGraph> | null = null;

export function loadRoads(): Promise<RoadGraph> {
    if (!cached) {
        cached = fetch(mapAsset('roads.json'))
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Yol verisi yüklenemedi (${r.status})`))))
            .then((d: { nodes: number[]; edges: number[] }) => {
                const n = d.nodes.length / 2;
                const x = new Int32Array(n);
                const y = new Int32Array(n);
                for (let i = 0; i < n; i++) {
                    x[i] = d.nodes[i * 2];
                    y[i] = d.nodes[i * 2 + 1];
                }
                const adj: number[][] = Array.from({ length: n }, () => []);
                for (let k = 0; k < d.edges.length; k += 2) {
                    adj[d.edges[k]].push(d.edges[k + 1]);
                    adj[d.edges[k + 1]].push(d.edges[k]);
                }
                const comp = new Int32Array(n).fill(-1);
                for (let s = 0, c = 0; s < n; s++) {
                    if (comp[s] >= 0) continue;
                    const stack = [s];
                    comp[s] = c;
                    while (stack.length) for (const v of adj[stack.pop()!]) if (comp[v] < 0) (comp[v] = c), stack.push(v);
                    c++;
                }
                return { x, y, adj, comp };
            });
        cached.catch(() => (cached = null));
    }
    return cached;
}

/** Durağa en yakın k düğüm (yola giriş adayları) */
function nearestK(g: RoadGraph, p: MapPoint, k: number) {
    const best: { i: number; d: number }[] = [];
    for (let i = 0; i < g.x.length; i++) {
        const d = Math.hypot(g.x[i] - p.x, g.y[i] - p.y);
        if (d > SNAP_PX) continue;
        if (best.length < k || d < best[best.length - 1].d) {
            best.push({ i, d });
            best.sort((a, b) => a.d - b.d);
            if (best.length > k) best.pop();
        }
    }
    return best;
}

/** Noktanın bir düğümün komşu kenarları üzerindeki en yakın izdüşümü (düğüm yerine kenarın ortasından girilsin) */
function projectOnRoad(g: RoadGraph, i: number, p: MapPoint) {
    let best = { x: g.x[i], y: g.y[i], d: Math.hypot(g.x[i] - p.x, g.y[i] - p.y) };
    for (const j of g.adj[i]) {
        const ax = g.x[i], ay = g.y[i], bx = g.x[j], by = g.y[j];
        const vx = bx - ax, vy = by - ay;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / (vx * vx + vy * vy || 1)));
        const x = ax + vx * t, y = ay + vy * t;
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < best.d) best = { x, y, d };
    }
    return best;
}

/** Chaikin yumuşatma: köşeli yol kıvrımları yumuşak eğriye döner (uçlar sabit) */
function smooth(pts: MapPoint[], iterations = 2): MapPoint[] {
    let out = pts;
    for (let it = 0; it < iterations; it++) {
        if (out.length < 3) break;
        const next: MapPoint[] = [out[0]];
        for (let k = 0; k < out.length - 1; k++) {
            const a = out[k], b = out[k + 1];
            next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
        }
        next.push(out[out.length - 1]);
        out = next;
    }
    return out;
}

const dist = (g: RoadGraph, a: number, b: number) => Math.hypot(g.x[a] - g.x[b], g.y[a] - g.y[b]);

/** A*: a'dan b'ye düğüm dizisi (yoksa null) */
function shortest(g: RoadGraph, a: number, b: number): number[] | null {
    const n = g.x.length;
    const gs = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const done = new Uint8Array(n);
    // Küçük ikili yığın: [f, düğüm]
    const heap: [number, number][] = [];
    const push = (f: number, v: number) => {
        heap.push([f, v]);
        let i = heap.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (heap[p][0] <= heap[i][0]) break;
            [heap[p], heap[i]] = [heap[i], heap[p]];
            i = p;
        }
    };
    const pop = () => {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length) {
            heap[0] = last;
            let i = 0;
            for (;;) {
                const l = i * 2 + 1;
                const r = l + 1;
                let m = i;
                if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                if (m === i) break;
                [heap[m], heap[i]] = [heap[i], heap[m]];
                i = m;
            }
        }
        return top;
    };
    gs[a] = 0;
    push(dist(g, a, b), a);
    while (heap.length) {
        const [, u] = pop();
        if (done[u]) continue;
        if (u === b) break;
        done[u] = 1;
        for (const v of g.adj[u]) {
            const c = gs[u] + dist(g, u, v);
            if (c < gs[v]) {
                gs[v] = c;
                prev[v] = u;
                push(c + dist(g, v, b), v);
            }
        }
    }
    if (a !== b && prev[b] < 0) return null;
    const out = [b];
    while (out[out.length - 1] !== a) out.push(prev[out[out.length - 1]]);
    return out.reverse();
}

/**
 * İki durak arası yol güzergâhı: durak -> yolun en yakın noktası -> yol boyunca -> durağa en yakın nokta -> durak.
 * Giriş ve çıkış için birkaç aday denenir; toplam en kısa olan seçilir (rota geri dönüp yola girmez).
 * Yol yoksa, duraklardan biri yoldan çok uzaksa ya da yol çok dolambaçlıysa null (düz gidilir).
 * Dönen noktaların `road` işareti o noktaya yol üzerinden varıldığını söyler.
 */
export function roadLeg(g: RoadGraph, a: MapPoint, b: MapPoint): (MapPoint & { road: boolean })[] | null {
    const ca = nearestK(g, a, 6);
    const cb = nearestK(g, b, 6);
    if (!ca.length || !cb.length) return null;
    let best: { nodes: number[]; cost: number } | null = null;
    for (const s of ca) {
        for (const e of cb) {
            if (g.comp[s.i] !== g.comp[e.i] || s.i === e.i) continue;
            const nodes = shortest(g, s.i, e.i);
            if (!nodes) continue;
            let len = 0;
            for (let k = 1; k < nodes.length; k++) len += dist(g, nodes[k - 1], nodes[k]);
            // Yol dışı kısım daha pahalı (arazide yürümek): en yakın girişe değil, en iyi toplam yola gidilir
            const cost = len + (s.d + e.d) * 1.6;
            if (!best || cost < best.cost) best = { nodes, cost };
        }
    }
    if (!best) return null;
    const nodes = best.nodes;
    let len = 0;
    for (let k = 1; k < nodes.length; k++) len += dist(g, nodes[k - 1], nodes[k]);
    const direct = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > direct * MAX_DETOUR + 60) return null;
    // Uçlar: yolun durağa en yakın noktası (kenar üstünden)
    const enter = projectOnRoad(g, nodes[0], a);
    const exit = projectOnRoad(g, nodes[nodes.length - 1], b);
    const raw: MapPoint[] = [{ x: enter.x, y: enter.y }, ...nodes.slice(1, -1).map((v) => ({ x: g.x[v], y: g.y[v] })), { x: exit.x, y: exit.y }];
    const pts = smooth(raw);
    return pts.map((p, k) => ({ x: p.x, y: p.y, road: k > 0 }));
}
