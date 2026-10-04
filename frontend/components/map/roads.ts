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

/** Durak yola en fazla bu kadar uzaksa (harita pikseli, ≈ 100 km) yola çıkılır */
const SNAP_PX = 150;
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

function nearest(g: RoadGraph, p: MapPoint) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < g.x.length; i++) {
        const d = (g.x[i] - p.x) ** 2 + (g.y[i] - p.y) ** 2;
        if (d < bd) (bd = d), (best = i);
    }
    return { i: best, d: Math.sqrt(bd) };
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
 * İki durak arası yol güzergâhı: durak -> en yakın yol -> yol boyunca -> durağa en yakın yol -> durak.
 * Yol yoksa, duraklardan biri yoldan çok uzaksa ya da yol çok dolambaçlıysa null (düz gidilir).
 * Dönen noktaların `road` işareti o noktaya yol üzerinden varıldığını söyler.
 */
export function roadLeg(g: RoadGraph, a: MapPoint, b: MapPoint): (MapPoint & { road: boolean })[] | null {
    const na = nearest(g, a);
    const nb = nearest(g, b);
    if (na.d > SNAP_PX || nb.d > SNAP_PX || g.comp[na.i] !== g.comp[nb.i] || na.i === nb.i) return null;
    const nodes = shortest(g, na.i, nb.i);
    if (!nodes) return null;
    let len = na.d + nb.d;
    for (let k = 1; k < nodes.length; k++) len += dist(g, nodes[k - 1], nodes[k]);
    const direct = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > direct * MAX_DETOUR + 60) return null;
    // Benekler ~12 px aralıklı; her ikinci yeter (çizgi yine yolu izler)
    const pts: (MapPoint & { road: boolean })[] = [];
    nodes.forEach((v, k) => {
        if (k % 2 === 0 || k === nodes.length - 1) pts.push({ x: g.x[v], y: g.y[v], road: k > 0 });
    });
    return pts;
}
