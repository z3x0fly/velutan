'use client';

import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { MAP_HEIGHT_PIXELS, MAP_WIDTH_PIXELS, WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { DISPLACEMENT_BIAS, DISPLACEMENT_SCALE, HEIGHT_URL } from '../terrain/heightField';
import { Territory, useTerritories } from '../territoryStore';

const TEX_W = 2048;
const TEX_H = Math.round((TEX_W * MAP_HEIGHT_PIXELS) / MAP_WIDTH_PIXELS);
const K = TEX_W / MAP_WIDTH_PIXELS;

const rgba = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Sınırları türüne göre mürekkep gibi çizer: krallık kalın, eyalet kesik, yaban seyrek, tehlike taralı, kutsal noktalı. */
function paint(ctx: CanvasRenderingContext2D, list: Territory[], focusId: number | null) {
    ctx.clearRect(0, 0, TEX_W, TEX_H);
    ctx.lineJoin = 'round';
    for (const t of list) {
        if (t.points.length < 3) continue;
        const focus = t.id === focusId;
        const path = new Path2D();
        t.points.forEach(([x, y], i) => (i ? path.lineTo(x * K, y * K) : path.moveTo(x * K, y * K)));
        path.closePath();

        // Dolgu
        const fill = { kingdom: 0.13, province: 0.08, wild: 0.05, danger: 0.1, sacred: 0.09 }[t.kind] ?? 0.1;
        ctx.fillStyle = rgba(t.color, focus ? fill + 0.14 : fill);
        ctx.fill(path);

        // İç ışıma ve tarama yalnızca çokgenin içine
        ctx.save();
        ctx.clip(path);
        if (t.kind === 'danger') {
            ctx.strokeStyle = rgba(t.color, 0.35);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            for (let d = -TEX_H; d < TEX_W; d += 11) {
                ctx.moveTo(d, 0);
                ctx.lineTo(d + TEX_H, TEX_H);
            }
            ctx.stroke();
        }
        if (t.kind === 'kingdom' || t.kind === 'sacred' || focus) {
            ctx.strokeStyle = rgba(t.color, focus ? 0.45 : 0.24);
            ctx.lineWidth = 22;
            ctx.stroke(path);
        }
        ctx.restore();

        // Kenar: koyu hare + renkli çizgi
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(20,12,4,0.55)';
        ctx.lineWidth = t.kind === 'kingdom' ? 7 : 5;
        ctx.stroke(path);
        const dash = { province: [16, 9], wild: [5, 9], sacred: [0.1, 9] }[t.kind] ?? [];
        ctx.setLineDash(dash);
        ctx.strokeStyle = rgba(t.color, 0.95);
        ctx.lineWidth = t.kind === 'kingdom' ? 3.6 : t.kind === 'sacred' ? 4.5 : 2.6;
        ctx.stroke(path);
    }
    ctx.setLineDash([]);
}

/**
 * Sınır katmanı: tek bir 2048px tuval dokusu, zeminle aynı yükselti haritasıyla bükülen ayrı bir yüzeyde.
 * Sınır sayısı ne olursa olsun tek çizim komutu; yalnızca liste/vurgu değişince yeniden boyanır.
 */
const Territories = React.memo(({ segments }: { segments: [number, number] }) => {
    const { list, visible, focusId } = useTerritories();
    const { invalidate } = useThree();
    const height = useTexture(HEIGHT_URL);

    const { canvas, texture } = useMemo(() => {
        const c = document.createElement('canvas');
        c.width = TEX_W;
        c.height = TEX_H;
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        return { canvas: c, texture: t };
    }, []);

    useEffect(() => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        paint(ctx, list, focusId);
        texture.needsUpdate = true;
        invalidate();
    }, [list, focusId, canvas, texture, invalidate]);

    const geometry = useMemo(() => {
        const g = new THREE.PlaneGeometry(WORLD_WIDTH, WORLD_HEIGHT, segments[0], segments[1]);
        g.rotateX(-Math.PI / 2);
        return g;
    }, [segments[0], segments[1]]); // eslint-disable-line react-hooks/exhaustive-deps

    const material = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                map: texture,
                emissive: new THREE.Color('#ffffff'),
                emissiveMap: texture,
                emissiveIntensity: 0.35,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4,
                displacementMap: height,
                displacementScale: DISPLACEMENT_SCALE,
                displacementBias: DISPLACEMENT_BIAS + 0.003,
                roughness: 1,
                metalness: 0,
            }),
        [texture, height],
    );

    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => () => material.dispose(), [material]);
    useEffect(() => () => texture.dispose(), [texture]);
    useEffect(() => invalidate(), [visible, invalidate]);

    if (!list.length) return null;
    return <mesh geometry={geometry} material={material} visible={visible} renderOrder={2} />;
});
Territories.displayName = 'Territories';

export default Territories;
