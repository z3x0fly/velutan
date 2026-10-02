'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TREE_STRIDE } from '../generated/mapMeta';
import { DISPLACEMENT_BIAS, DISPLACEMENT_SCALE, HeightField, loadHeightField } from '../terrain/heightField';
import { to3D, WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { mapAsset } from '../media';

// tools/build_map_assets.py ile aynı sıra
enum TreeKind {
    Pine = 0,
    Broadleaf = 1,
    SnowPine = 2,
    Autumn = 3,
}

const TREE_URL = mapAsset('trees.bin');
const BASE_SCALE = 0.15;

// Tür rengi + boyalı haritadaki sembol rengi karışımı (paleti korur, 3D'de okunur kalır)
const KIND_COLOR: Record<TreeKind, THREE.Color> = {
    [TreeKind.Pine]: new THREE.Color('#2f6b3a'),
    [TreeKind.Broadleaf]: new THREE.Color('#6a9a34'),
    [TreeKind.SnowPine]: new THREE.Color('#d6e2dc'),
    [TreeKind.Autumn]: new THREE.Color('#d0802a'),
};
// Sonbahar ağaçlarının bir kısmı kızıl, bir kısmı altın sarısı
const AUTUMN_ALT = new THREE.Color('#b8452a');
const PAINT_MIX = 0.18;

/** Geometriye yüksekliğe göre koyulaşan sabit renk ekler (sahte ortam gölgesi). */
function colorize(geo: THREE.BufferGeometry, color: THREE.Color, top: number, aoStrength = 0.4) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const shade = 1 - aoStrength + aoStrength * Math.min(Math.max(pos.getY(i) / top, 0), 1);
        colors[i * 3] = color.r * shade;
        colors[i * 3 + 1] = color.g * shade;
        colors[i * 3 + 2] = color.b * shade;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    return g;
}

const TRUNK = new THREE.Color('#7a5638');
const FOLIAGE = new THREE.Color('#ffffff'); // instanceColor ile boyanır
const SNOW = new THREE.Color('#ffffff');

/** Konuma bağlı küçük düzensizlik: aynı köşeyi paylaşan yüzler aynı miktarda kayar (çatlak oluşmaz). */
function jitter(geo: THREE.BufferGeometry, amount: number, seed: number) {
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const h = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719 + seed) * 43758.5453;
        const n = (h - Math.floor(h)) * 2 - 1;
        const r = Math.hypot(x, z) || 1;
        pos.setXYZ(i, x + (x / r) * n * amount, y + n * amount * 0.6, z + (z / r) * n * amount);
    }
    return geo;
}

/** Katmanlı çam: dallar aşağı sarkık, her katman hafif dönük; uçlar güneşte açık */
function buildPine(snowy: boolean, variant: number) {
    const trunk = new THREE.CylinderGeometry(0.04, 0.075, 0.38, 6).translate(0, 0.18, 0);
    const tiers = variant ? [[0.4, 0.42, 0.4], [0.32, 0.38, 0.62], [0.24, 0.34, 0.84], [0.15, 0.3, 1.04]] : [[0.36, 0.5, 0.46], [0.27, 0.44, 0.74], [0.17, 0.36, 1.0]];
    const parts = [colorize(trunk, TRUNK, 0.38, 0.2)];
    tiers.forEach(([r, h, y], i) => {
        const cone = new THREE.ConeGeometry(r, h, 8, 1).rotateY(i * 0.4).translate(0, y, 0);
        const top = i === tiers.length - 1;
        const col = snowy ? (top || i === tiers.length - 2 ? SNOW : new THREE.Color('#9db5a6')) : FOLIAGE;
        parts.push(colorize(jitter(cone.toNonIndexed(), 0.025, i + variant * 7), col, 1.2, top ? 0.15 : 0.45));
    });
    return mergeGeometries(parts)!;
}

/** Yapraklı: topak topak taç; varyant 1 daha uzun ve dağınık */
function buildBroadleaf(variant: number) {
    const trunk = new THREE.CylinderGeometry(0.04, 0.075, variant ? 0.55 : 0.45, 6).translate(0, variant ? 0.27 : 0.22, 0);
    const blobs: [number, number, number, number][] = variant
        ? [[0.24, 0, 0.78, 0], [0.2, 0.15, 0.62, 0.05], [0.19, -0.14, 0.66, -0.06], [0.17, 0.05, 0.98, 0.04], [0.15, -0.06, 0.5, 0.14]]
        : [[0.3, 0, 0.62, 0], [0.22, 0.18, 0.52, 0.06], [0.21, -0.16, 0.55, -0.08], [0.19, 0.02, 0.84, 0.04], [0.17, 0.04, 0.5, -0.18], [0.16, -0.05, 0.6, 0.19]];
    const parts = [colorize(trunk, TRUNK, 0.5, 0.2)];
    blobs.forEach(([r, x, y, z], i) => {
        const g = new THREE.IcosahedronGeometry(r, 0).rotateY(i * 1.3).rotateX(i * 0.7).translate(x, y, z);
        parts.push(colorize(jitter(g, r * 0.12, i + variant * 11), FOLIAGE, 1.05));
    });
    return mergeGeometries(parts)!;
}

/** Orman tabanı çalısı: ağaçların arasını doldurur (ormanı yoğun ve canlı gösterir) */
function buildBush() {
    const blobs: [number, number, number, number][] = [[0.2, 0, 0.12, 0], [0.15, 0.16, 0.08, 0.05], [0.14, -0.14, 0.09, -0.07]];
    return mergeGeometries(
        blobs.map(([r, x, y, z], i) => colorize(jitter(new THREE.IcosahedronGeometry(r, 0).scale(1, 0.75, 1).translate(x, y, z), r * 0.15, i + 3), FOLIAGE, 0.3, 0.35)),
    )!;
}

/**
 * Zemin örgüsünün (Terrain) bir noktadaki gerçek yüksekliği. Örgü, köşelerde yükselti dokusunu GPU gibi
 * örnekler ve aradaki üçgenleri düz geçer; tepelerde bu yüzey dokunun kendisinden alçakta kalır.
 * Ağaçlar dokuya göre konursa havada asılı kalır, bu yüzden aynı üçgen yüzeyi burada hesaplanır.
 */
function makeGroundSampler(field: HeightField, [gx, gy]: [number, number]) {
    const { width: w, height: h, data } = field;
    // GPU doğrusal süzme: doku koordinatı * boyut - 0.5 (texel merkezleri)
    const texel = (u: number, v: number) => {
        const tx = Math.min(Math.max(u * w - 0.5, 0), w - 1);
        const ty = Math.min(Math.max(v * h - 0.5, 0), h - 1);
        const x0 = Math.floor(tx), y0 = Math.floor(ty);
        const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
        const fx = tx - x0, fy = ty - y0;
        const a = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx;
        const b = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx;
        return (a * (1 - fy) + b * fy) * DISPLACEMENT_SCALE + DISPLACEMENT_BIAS;
    };
    const vertex = (ix: number, iy: number) => texel(ix / gx, iy / gy);
    return (x: number, z: number) => {
        const cx = Math.min(Math.max((x / WORLD_WIDTH + 0.5) * gx, 0), gx - 1e-6);
        const cy = Math.min(Math.max((z / WORLD_HEIGHT + 0.5) * gy, 0), gy - 1e-6);
        const ix = Math.floor(cx), iy = Math.floor(cy);
        const fx = cx - ix, fy = cy - iy;
        // PlaneGeometry hücre köşegeni (ix, iy+1) – (ix+1, iy) arasındadır
        const hb = vertex(ix, iy + 1);
        const hd = vertex(ix + 1, iy);
        if (fx + fy <= 1) {
            const ha = vertex(ix, iy);
            return ha + (hd - ha) * fx + (hb - ha) * fy;
        }
        const hc = vertex(ix + 1, iy + 1);
        return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fy);
    };
}

/** Gövde tabanının en alçak noktası: yamaçta ağacın hiçbir kenarı havada kalmasın */
function footHeight(ground: (x: number, z: number) => number, x: number, z: number, r: number) {
    return Math.min(ground(x, z), ground(x + r, z), ground(x - r, z), ground(x, z + r), ground(x, z - r));
}

interface TreeRecord {
    /** Çizim grubu: tür * 2 + varyant; 8 = çalı */
    group: number;
    matrix: THREE.Matrix4;
    color: THREE.Color;
}

/** fraction: çizilecek ağaç oranı; elenenler hiç işlenmez. Ana iş parçacığı her 2000 kayıtta serbest bırakılır. */
async function loadTrees(fraction: number, bushes: boolean, segments: [number, number]): Promise<TreeRecord[]> {
    const [res, field] = await Promise.all([fetch(TREE_URL), loadHeightField().catch(() => null)]);
    const ground = field ? makeGroundSampler(field, segments) : null;
    if (!res.ok) throw new Error(`Ağaç verisi yüklenemedi (${res.status})`);
    const view = new DataView(await res.arrayBuffer());
    const out: TreeRecord[] = [];
    const obj = new THREE.Object3D();
    const paint = new THREE.Color();
    for (let o = 0, i = 0; o + TREE_STRIDE <= view.byteLength; o += TREE_STRIDE, i++) {
        if (!keepTree(i, fraction)) continue;
        if (i % 2000 === 1999) await new Promise((r) => setTimeout(r, 0));
        const px = view.getUint16(o, true);
        const py = view.getUint16(o + 2, true);
        const kind = view.getUint8(o + 4) as TreeKind;
        const scale = view.getUint8(o + 5) / 255;
        const h = view.getUint8(o + 6) / 255;
        const seed = view.getUint8(o + 10) / 255;
        const [x, , z] = to3D(px, py);
        const s = BASE_SCALE * (0.7 + scale * 0.55);
        const y = ground ? footHeight(ground, x, z, s * 0.08) : h * DISPLACEMENT_SCALE + DISPLACEMENT_BIAS;
        obj.position.set(x, y - 0.006, z);
        obj.rotation.set((seed - 0.5) * 0.12, seed * Math.PI * 2, 0);
        obj.scale.set(s, s * (0.9 + seed * 0.25), s);
        obj.updateMatrix();

        paint.setRGB(view.getUint8(o + 7) / 255, view.getUint8(o + 8) / 255, view.getUint8(o + 9) / 255, THREE.SRGBColorSpace);
        const base = kind === TreeKind.Autumn && seed > 0.62 ? AUTUMN_ALT : KIND_COLOR[kind] ?? KIND_COLOR[TreeKind.Broadleaf];
        const color = base.clone().lerp(paint, PAINT_MIX);
        // Ağaçtan ağaca ton ve parlaklık farkı: ormanlar tek renk bir halı gibi durmasın
        color.offsetHSL((seed - 0.5) * 0.05, (scale - 0.5) * 0.12, (seed - 0.5) * 0.1);
        const variant = kind === TreeKind.SnowPine ? 0 : (i * 7 + Math.floor(seed * 10)) % 2;
        out.push({ group: kind * 2 + variant, matrix: obj.matrix.clone(), color });

        // Çalı: yoğun kademelerde her üç ağaçtan birinin dibine
        if (bushes && kind !== TreeKind.SnowPine && i % 3 === 0) {
            const a = seed * Math.PI * 2;
            obj.position.x += Math.cos(a) * s * 0.9;
            obj.position.z += Math.sin(a) * s * 0.9;
            obj.position.y = (ground ? footHeight(ground, obj.position.x, obj.position.z, s * 0.15) : obj.position.y) - 0.016;
            obj.rotation.set(0, a, 0);
            obj.scale.setScalar(s * (0.75 + scale * 0.4));
            obj.updateMatrix();
            const bushColor = color.clone().offsetHSL(0.02, 0.05, -0.06);
            out.push({ group: 8, matrix: obj.matrix.clone(), color: bushColor });
        }
    }
    return out;
}

/** Rüzgâr salınımı + açılışta büyüme animasyonu */
function makeTreeMaterial(uniforms: { uTime: { value: number }; uGrow: { value: number } }) {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
    m.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uniforms.uTime;
        shader.uniforms.uGrow = uniforms.uGrow;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGrow;')
            .replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                #ifdef USE_INSTANCING
                    vec3 velRoot = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
                    float velGrow = clamp(uGrow * 1.6 - fract(velRoot.x * 0.37 + velRoot.z * 0.61) * 0.6, 0.0, 1.0);
                    transformed *= velGrow;
                    float velK = max(transformed.y, 0.0);
                    // Haritayı batıdan doğuya geçen esinti: ağaçlar sırayla eğilir
                    float velGust = 0.55 + 0.45 * sin(velRoot.x * 0.35 + velRoot.z * 0.18 - uTime * 0.8);
                    float velWind = sin(uTime * 1.4 + velRoot.x * 2.1 + velRoot.z * 1.3) * 0.05 * velGust * velK * velK;
                    float velFlutter = sin(uTime * 7.0 + position.y * 23.0 + position.x * 17.0 + velRoot.z * 9.0) * 0.008 * velK;
                    transformed.x += velWind + velFlutter;
                    transformed.z += velWind * 0.55 + velFlutter * 0.7;
                #endif`,
            );
    };
    return m;
}

/** Kademeli seyreltme: aynı ağaçlar her zaman aynı sırayla elenir (düzgün dağılım, titreme yok) */
const keepTree = (i: number, fraction: number) => fraction >= 1 || ((Math.imul(i + 1, 2654435761) >>> 0) / 4294967296) < fraction;

interface ForestProps {
    /** Zemin örgüsünün bölüt sayısı (Terrain ile aynı): ağaçlar bu yüzeye oturtulur */
    segments: [number, number];
    /** Çizilecek ağaç oranı (zayıf cihazlarda < 1) */
    fraction?: number;
    /** Rüzgâr salınımı ve açılış büyüme animasyonu (sürekli kare gerektirir) */
    wind?: boolean;
}

const Forest = ({ segments, fraction = 1, wind = true }: ForestProps) => {
    const [trees, setTrees] = useState<TreeRecord[] | null>(null);
    const { invalidate } = useThree();
    // Rüzgâr yoksa (yalnızca değişince çizilen kademe) ağaçlar doğrudan tam boy başlar
    const uniforms = useMemo(() => ({ uTime: { value: 0 }, uGrow: { value: wind ? 0 : 1 } }), []); // eslint-disable-line react-hooks/exhaustive-deps
    const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);

    useEffect(() => {
        let alive = true;
        loadTrees(fraction, fraction >= 0.6, segments)
            .then((t) => alive && setTrees(t))
            .catch((err) => console.error('[Velutan] Orman yüklenemedi:', err));
        return () => {
            alive = false;
        };
    }, [fraction, segments[0], segments[1]]); // eslint-disable-line react-hooks/exhaustive-deps

    const geometries = useMemo(
        () => ({
            0: buildPine(false, 0),
            1: buildPine(false, 1),
            2: buildBroadleaf(0),
            3: buildBroadleaf(1),
            4: buildPine(true, 0),
            5: buildPine(true, 1),
            6: buildBroadleaf(0),
            7: buildBroadleaf(1),
            8: buildBush(),
        }),
        [],
    );
    const material = useMemo(() => makeTreeMaterial(uniforms), [uniforms]);

    const groups = useMemo(() => {
        if (!trees) return null;
        const byGroup: Record<number, TreeRecord[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
        for (const t of trees) (byGroup[t.group] ?? byGroup[2]).push(t);
        return byGroup;
    }, [trees]);

    useEffect(() => {
        if (!groups) return;
        Object.entries(groups).forEach(([kind, list]) => {
            const mesh = meshes.current[Number(kind)];
            if (!mesh) return;
            list.forEach((t, i) => {
                mesh.setMatrixAt(i, t.matrix);
                mesh.setColorAt(i, t.color);
            });
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
            mesh.computeBoundingSphere();
        });
        invalidate();
    }, [groups, invalidate]);

    useEffect(
        () => () => {
            Object.values(geometries).forEach((g) => g.dispose());
            material.dispose();
        },
        [geometries, material],
    );

    useFrame((_, delta) => {
        if (!wind) return;
        const d = Math.min(delta, 0.1);
        uniforms.uTime.value += d;
        if (trees && uniforms.uGrow.value < 1) uniforms.uGrow.value = Math.min(1, uniforms.uGrow.value + d * 0.6);
    });

    if (!groups) return null;

    return (
        <group>
            {Object.entries(groups).map(([kind, list]) =>
                list.length === 0 ? null : (
                    <instancedMesh
                        key={kind}
                        ref={(m) => {
                            meshes.current[Number(kind)] = m;
                        }}
                        args={[geometries[Number(kind) as keyof typeof geometries], material, list.length]}
                        castShadow={false}
                        receiveShadow
                        frustumCulled
                    />
                ),
            )}
        </group>
    );
};

export default Forest;
