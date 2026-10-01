'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TREE_STRIDE } from '../generated/mapMeta';
import { DISPLACEMENT_BIAS, DISPLACEMENT_SCALE } from '../terrain/heightField';
import { to3D } from '../utils/coords';
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
    [TreeKind.Pine]: new THREE.Color('#3d6633'),
    [TreeKind.Broadleaf]: new THREE.Color('#6f8f3e'),
    [TreeKind.SnowPine]: new THREE.Color('#cfdcd6'),
    [TreeKind.Autumn]: new THREE.Color('#c27a2c'),
};
const PAINT_MIX = 0.3;

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

const TRUNK = new THREE.Color('#4a3524');
const FOLIAGE = new THREE.Color('#ffffff'); // instanceColor ile boyanır
const SNOW = new THREE.Color('#ffffff');

function buildPine(snowy: boolean) {
    const trunk = new THREE.CylinderGeometry(0.05, 0.08, 0.35, 5).translate(0, 0.17, 0);
    const c1 = new THREE.ConeGeometry(0.36, 0.5, 7).translate(0, 0.48, 0);
    const c2 = new THREE.ConeGeometry(0.28, 0.42, 7).translate(0, 0.74, 0);
    const c3 = new THREE.ConeGeometry(0.18, 0.34, 7).translate(0, 0.98, 0);
    const lower = snowy ? new THREE.Color('#8fa79a') : FOLIAGE;
    return mergeGeometries([
        colorize(trunk, TRUNK, 0.35, 0.2),
        colorize(c1, lower, 1.15),
        colorize(c2, lower, 1.15),
        colorize(c3, snowy ? SNOW : FOLIAGE, 1.15, 0.15),
    ])!;
}

function buildBroadleaf() {
    const trunk = new THREE.CylinderGeometry(0.045, 0.075, 0.45, 5).translate(0, 0.22, 0);
    const blobs = [
        new THREE.IcosahedronGeometry(0.3, 0).translate(0, 0.62, 0),
        new THREE.IcosahedronGeometry(0.22, 0).translate(0.17, 0.52, 0.06),
        new THREE.IcosahedronGeometry(0.2, 0).translate(-0.15, 0.55, -0.08),
        new THREE.IcosahedronGeometry(0.18, 0).translate(0.02, 0.82, 0.04),
    ];
    return mergeGeometries([colorize(trunk, TRUNK, 0.45, 0.2), ...blobs.map((b) => colorize(b, FOLIAGE, 1.0))])!;
}

interface TreeRecord {
    kind: TreeKind;
    matrix: THREE.Matrix4;
    color: THREE.Color;
}

async function loadTrees(): Promise<TreeRecord[]> {
    const res = await fetch(TREE_URL);
    if (!res.ok) throw new Error(`Ağaç verisi yüklenemedi (${res.status})`);
    const view = new DataView(await res.arrayBuffer());
    const out: TreeRecord[] = [];
    const obj = new THREE.Object3D();
    const paint = new THREE.Color();
    for (let o = 0; o + TREE_STRIDE <= view.byteLength; o += TREE_STRIDE) {
        const px = view.getUint16(o, true);
        const py = view.getUint16(o + 2, true);
        const kind = view.getUint8(o + 4) as TreeKind;
        const scale = view.getUint8(o + 5) / 255;
        const h = view.getUint8(o + 6) / 255;
        const seed = view.getUint8(o + 10) / 255;
        const [x, , z] = to3D(px, py);
        obj.position.set(x, h * DISPLACEMENT_SCALE + DISPLACEMENT_BIAS - 0.01, z);
        obj.rotation.set((seed - 0.5) * 0.12, seed * Math.PI * 2, 0);
        const s = BASE_SCALE * (0.7 + scale * 0.55);
        obj.scale.set(s, s * (0.9 + seed * 0.25), s);
        obj.updateMatrix();

        paint.setRGB(view.getUint8(o + 7) / 255, view.getUint8(o + 8) / 255, view.getUint8(o + 9) / 255, THREE.SRGBColorSpace);
        const color = KIND_COLOR[kind].clone().lerp(paint, PAINT_MIX).multiplyScalar(0.9 + seed * 0.2);
        out.push({ kind, matrix: obj.matrix.clone(), color });
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
                    float velWind = sin(uTime * 1.4 + velRoot.x * 2.1 + velRoot.z * 1.3) * 0.045 * velK * velK;
                    transformed.x += velWind;
                    transformed.z += velWind * 0.55;
                #endif`,
            );
    };
    return m;
}

const Forest = () => {
    const [trees, setTrees] = useState<TreeRecord[] | null>(null);
    const uniforms = useMemo(() => ({ uTime: { value: 0 }, uGrow: { value: 0 } }), []);
    const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);

    useEffect(() => {
        let alive = true;
        loadTrees()
            .then((t) => alive && setTrees(t))
            .catch((err) => console.error('[Velutan] Orman yüklenemedi:', err));
        return () => {
            alive = false;
        };
    }, []);

    const geometries = useMemo(
        () => ({
            [TreeKind.Pine]: buildPine(false),
            [TreeKind.Broadleaf]: buildBroadleaf(),
            [TreeKind.SnowPine]: buildPine(true),
            [TreeKind.Autumn]: buildBroadleaf(),
        }),
        [],
    );
    const material = useMemo(() => makeTreeMaterial(uniforms), [uniforms]);

    const groups = useMemo(() => {
        if (!trees) return null;
        const byKind: Record<number, TreeRecord[]> = { 0: [], 1: [], 2: [], 3: [] };
        for (const t of trees) (byKind[t.kind] ?? byKind[TreeKind.Broadleaf]).push(t);
        return byKind;
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
    }, [groups]);

    useEffect(
        () => () => {
            Object.values(geometries).forEach((g) => g.dispose());
            material.dispose();
        },
        [geometries, material],
    );

    useFrame((_, delta) => {
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
                        args={[geometries[Number(kind) as TreeKind], material, list.length]}
                        castShadow={false}
                        frustumCulled
                    />
                ),
            )}
        </group>
    );
};

export default Forest;
