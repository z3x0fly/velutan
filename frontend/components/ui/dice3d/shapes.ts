import * as THREE from 'three';

/**
 * Zar şekilleri: görünen geometri, fizik için dışbükey çokyüzlü (köşeler + yüzler) ve yüz numaraları.
 * Sonuç, zar durduğunda yukarı bakan yüzden (d4'te yukarı bakan köşeden) okunur.
 */
export type DieKind = 4 | 6 | 8 | 10 | 12 | 20;

export interface DieLabel {
    /** Gövde yerel uzayında konum, yüz normali ve yazının "yukarı" yönü */
    pos: THREE.Vector3;
    normal: THREE.Vector3;
    up: THREE.Vector3;
    text: string;
}

export interface DieShape {
    kind: DieKind;
    geometry: THREE.BufferGeometry;
    edges: THREE.BufferGeometry;
    /** Fizik: köşeler ve dışa bakan (saat yönünün tersine sıralı) yüz çokgenleri */
    vertices: THREE.Vector3[];
    faces: number[][];
    /** Okuma: yüz normalleri (d4'te köşe yönleri) ve karşılık gelen değerler */
    readDirs: THREE.Vector3[];
    readValues: number[];
    labels: DieLabel[];
    /** Yazı boyu (birim) */
    labelSize: number;
}

const key = (v: THREE.Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;

/** three.js çokyüzlüsünden: üçgenleri düzlemlerine göre birleştirip yüz çokgenlerini çıkarır */
function polyFromGeometry(geo: THREE.BufferGeometry): { vertices: THREE.Vector3[]; faces: number[][] } {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.getAttribute('position');
    const vertices: THREE.Vector3[] = [];
    const vIndex = new Map<string, number>();
    const idx = (v: THREE.Vector3) => {
        const k = key(v);
        let i = vIndex.get(k);
        if (i === undefined) {
            i = vertices.length;
            vertices.push(v.clone());
            vIndex.set(k, i);
        }
        return i;
    };
    const groups = new Map<string, { normal: THREE.Vector3; verts: Set<number> }>();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 3) {
        a.fromBufferAttribute(pos, i);
        b.fromBufferAttribute(pos, i + 1);
        c.fromBufferAttribute(pos, i + 2);
        const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
        // Aynı düzlemdeki üçgenler (normal farkı < ~2,5°) tek yüz; yuvarlamalı anahtar sınırda bölünebiliyordu
        let grp = Array.from(groups.values()).find((g) => g.normal.dot(n) > 0.999);
        if (!grp) groups.set(String(groups.size), (grp = { normal: n, verts: new Set() }));
        grp.verts.add(idx(a));
        grp.verts.add(idx(b));
        grp.verts.add(idx(c));
    }
    const faces = Array.from(groups.values()).map(({ normal, verts }) => orderFace(Array.from(verts), vertices, normal));
    return { vertices, faces };
}

/** Yüz köşelerini dışarıdan bakınca saat yönünün tersine sıralar */
function orderFace(ids: number[], vertices: THREE.Vector3[], normal: THREE.Vector3) {
    const center = ids.reduce((s, i) => s.add(vertices[i]), new THREE.Vector3()).divideScalar(ids.length);
    const u = new THREE.Vector3().subVectors(vertices[ids[0]], center).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u);
    return ids
        .map((i) => {
            const d = new THREE.Vector3().subVectors(vertices[i], center);
            return { i, a: Math.atan2(d.dot(v), d.dot(u)) };
        })
        .sort((p, q) => p.a - q.a)
        .map((p) => p.i);
}

const faceCenter = (f: number[], vs: THREE.Vector3[]) => f.reduce((s, i) => s.add(vs[i]), new THREE.Vector3()).divideScalar(f.length);
const faceNormal = (f: number[], vs: THREE.Vector3[]) =>
    new THREE.Vector3().subVectors(vs[f[1]], vs[f[0]]).cross(new THREE.Vector3().subVectors(vs[f[2]], vs[f[0]])).normalize();

/** Yüz çokgenlerinden düz gölgeli gövde ve kenar çizgileri */
function buildMesh(vertices: THREE.Vector3[], faces: number[][]) {
    const pos: number[] = [];
    for (const f of faces) for (let k = 1; k < f.length - 1; k++) for (const i of [f[0], f[k], f[k + 1]]) pos.push(vertices[i].x, vertices[i].y, vertices[i].z);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geometry.computeVertexNormals();
    const line: number[] = [];
    const seen = new Set<string>();
    for (const f of faces)
        for (let k = 0; k < f.length; k++) {
            const i = f[k], j = f[(k + 1) % f.length];
            const e = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (seen.has(e)) continue;
            seen.add(e);
            line.push(vertices[i].x, vertices[i].y, vertices[i].z, vertices[j].x, vertices[j].y, vertices[j].z);
        }
    const edges = new THREE.BufferGeometry();
    edges.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
    return { geometry, edges };
}

/** Beşgen yamuk yüzlü (d10): 10 uçurtma yüz */
function d10Poly() {
    const e = 0.1056; // uçurtmaların düzlemsel kalması için tepe yüksekliği 1 iken halka yüksekliği
    const vertices = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0)];
    for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5;
        vertices.push(new THREE.Vector3(Math.cos(a), i % 2 ? -e : e, Math.sin(a)));
    }
    const ring = (i: number) => 2 + (((i % 10) + 10) % 10);
    const faces: number[][] = [];
    for (let k = 0; k < 5; k++) {
        faces.push([0, ring(2 * k), ring(2 * k + 1), ring(2 * k + 2)]);
        faces.push([1, ring(2 * k + 1), ring(2 * k + 2), ring(2 * k + 3)]);
    }
    // Dışa bakacak şekilde sırala
    return {
        vertices,
        faces: faces.map((f) => {
            const n = faceNormal(f, vertices);
            return n.dot(faceCenter(f, vertices)) < 0 ? f.slice().reverse() : f;
        }),
    };
}

const cache = new Map<string, DieShape>();

/** d100'ün onlar zarı: değerler 00, 10 … 90 */
export function getShape(kind: DieKind, tens = false): DieShape {
    const ck = `${kind}${tens ? 't' : ''}`;
    const hit = cache.get(ck);
    if (hit) return hit;
    let poly: { vertices: THREE.Vector3[]; faces: number[][] };
    switch (kind) {
        case 4:
            poly = polyFromGeometry(new THREE.TetrahedronGeometry(1.15));
            break;
        case 6:
            poly = polyFromGeometry(new THREE.BoxGeometry(1.3, 1.3, 1.3));
            break;
        case 8:
            poly = polyFromGeometry(new THREE.OctahedronGeometry(1));
            break;
        case 10:
            poly = d10Poly();
            poly.vertices.forEach((v) => v.multiplyScalar(0.95));
            break;
        case 12:
            poly = polyFromGeometry(new THREE.DodecahedronGeometry(0.95));
            break;
        default:
            poly = polyFromGeometry(new THREE.IcosahedronGeometry(1.0));
    }
    const { vertices, faces } = poly;
    const { geometry, edges } = buildMesh(vertices, faces);
    const labels: DieLabel[] = [];
    const readDirs: THREE.Vector3[] = [];
    const readValues: number[] = [];

    if (kind === 4) {
        // d4: her köşenin bir değeri var; yüzlerde köşeye yakın yazılır, yukarı bakan köşe okunur
        vertices.forEach((v, i) => {
            readDirs.push(v.clone().normalize());
            readValues.push(i + 1);
        });
        for (const f of faces) {
            const c = faceCenter(f, vertices);
            const n = faceNormal(f, vertices);
            for (const i of f) {
                const toV = new THREE.Vector3().subVectors(vertices[i], c);
                labels.push({ pos: c.clone().addScaledVector(toV, 0.55).addScaledVector(n, 0.01), normal: n, up: toV.normalize(), text: String(i + 1) });
            }
        }
    } else {
        faces.forEach((f, fi) => {
            const c = faceCenter(f, vertices);
            const n = faceNormal(f, vertices);
            // Yazının yukarısı: d10'da uçurtmanın sivri ucuna (tepe köşesine), diğerlerinde ilk köşeye doğru
            const tip = kind === 10 ? vertices[f.includes(0) ? 0 : 1] : vertices[f[0]];
            const up = new THREE.Vector3().subVectors(tip, c).projectOnPlane(n).normalize();
            let value: number;
            let text: string;
            if (kind === 10) {
                value = fi; // 0..9
                text = tens ? `${fi}0` : String(fi);
            } else {
                value = fi + 1;
                text = String(value);
            }
            readDirs.push(n.clone());
            readValues.push(value);
            // d10 yazısı uçurtmanın geniş kısmına (merkezden biraz aşağı) kayar
            const p = kind === 10 ? c.clone().addScaledVector(up, -0.12) : c.clone();
            labels.push({ pos: p.addScaledVector(n, 0.01), normal: n, up, text });
        });
    }
    const labelSize = { 4: 0.52, 6: 0.85, 8: 0.62, 10: 0.5, 12: 0.55, 20: 0.42 }[kind];
    const shape: DieShape = { kind, geometry, edges, vertices, faces, readDirs, readValues, labels, labelSize };
    cache.set(ck, shape);
    return shape;
}

/** Durmuş zarın değeri ve ne kadar düz durduğu (1 = tam düz; düşükse zar bir şeye yaslanmış) */
export function readDie(shape: DieShape, quaternion: THREE.Quaternion): { value: number; flatness: number } {
    const up = new THREE.Vector3(0, 1, 0);
    let best = -2, value = shape.readValues[0];
    const d = new THREE.Vector3();
    shape.readDirs.forEach((dir, i) => {
        const dot = d.copy(dir).applyQuaternion(quaternion).dot(up);
        if (dot > best) {
            best = dot;
            value = shape.readValues[i];
        }
    });
    // Kusursuz duruşta yukarı bakan yüz normali ~1; d4'te köşe yönü ~1 (tetrahedronda köşe tam yukarı bakar)
    return { value, flatness: best };
}
