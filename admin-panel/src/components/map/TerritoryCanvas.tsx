'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { MAP_HEIGHT, MAP_WIDTH, Territory } from '@/lib/api';

export type Pt = [number, number];

interface Props {
    territories: Territory[];
    /** Düzenlenen sınırın id'si (yeni çizimde null) */
    editingId: number | null;
    points: Pt[];
    color: string;
    onChange: (points: Pt[]) => void;
}

const hex = (c: string) => parseInt(c.replace('#', ''), 16) || 0xc9a24d;

/**
 * Sınır çizim tuvali. Boş yere tık: köşe ekle (en yakın kenarın arasına) · Köşeyi sürükle: taşı ·
 * Köşeye sağ tık: sil · Sürükle: kaydır · Tekerlek: yakınlaş.
 */
const TerritoryCanvas: React.FC<Props> = ({ territories, editingId, points, color, onChange }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<PIXI.Application | null>(null);
    const worldRef = useRef<PIXI.Container | null>(null);
    const othersRef = useRef<PIXI.Graphics | null>(null);
    const shapeRef = useRef<PIXI.Graphics | null>(null);
    // Olay dinleyicileri bir kez kurulur; güncel değerler ref'ten okunur
    const state = useRef({ points, onChange });
    state.current = { points, onChange };
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        let destroyed = false;
        const el = containerRef.current;

        (async () => {
            const app = new PIXI.Application();
            await app.init({ resizeTo: el, backgroundColor: 0x050505, antialias: true, resolution: window.devicePixelRatio || 1 });
            if (destroyed) {
                app.destroy(true, { children: true, texture: true });
                return;
            }
            el.innerHTML = '';
            app.canvas.style.cssText = 'display:block;width:100%;height:100%';
            el.appendChild(app.canvas);
            appRef.current = app;

            const world = new PIXI.Container();
            app.stage.addChild(world);
            worldRef.current = world;
            const texture = await PIXI.Assets.load('/map/velutan_map_4096.jpg');
            if (destroyed) return;
            const sprite = new PIXI.Sprite(texture);
            sprite.width = MAP_WIDTH;
            sprite.height = MAP_HEIGHT;
            world.addChild(sprite);
            const others = new PIXI.Graphics();
            const shape = new PIXI.Graphics();
            world.addChild(others, shape);
            othersRef.current = others;
            shapeRef.current = shape;

            const fit = Math.min(el.clientWidth / MAP_WIDTH, el.clientHeight / MAP_HEIGHT) * 0.95 || 0.1;
            world.scale.set(fit);
            world.position.set((el.clientWidth - MAP_WIDTH * fit) / 2, (el.clientHeight - MAP_HEIGHT * fit) / 2);

            const toMap = (e: { clientX: number; clientY: number }) => {
                const r = app.canvas.getBoundingClientRect();
                const p = world.toLocal({ x: e.clientX - r.left, y: e.clientY - r.top });
                return [Math.round(Math.max(0, Math.min(MAP_WIDTH, p.x))), Math.round(Math.max(0, Math.min(MAP_HEIGHT, p.y)))] as Pt;
            };
            // Ekranda ~9 px içindeki köşe
            const hitVertex = (m: Pt) => {
                const tol = 9 / world.scale.x;
                return state.current.points.findIndex(([x, y]) => Math.hypot(x - m[0], y - m[1]) < tol);
            };

            let mode: 'none' | 'pan' | 'vertex' = 'none';
            let vi = -1;
            let down = { x: 0, y: 0 };
            let last = { x: 0, y: 0 };
            let moved = false;

            app.canvas.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return;
                app.canvas.setPointerCapture(e.pointerId);
                down = last = { x: e.clientX, y: e.clientY };
                moved = false;
                vi = hitVertex(toMap(e));
                mode = vi >= 0 ? 'vertex' : 'pan';
            });
            app.canvas.addEventListener('pointermove', (e) => {
                if (mode === 'none') {
                    app.canvas.style.cursor = hitVertex(toMap(e)) >= 0 ? 'move' : 'crosshair';
                    return;
                }
                if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) moved = true;
                if (mode === 'pan') {
                    world.x += e.clientX - last.x;
                    world.y += e.clientY - last.y;
                } else if (moved) {
                    const next = state.current.points.slice();
                    next[vi] = toMap(e);
                    state.current.onChange(next);
                }
                last = { x: e.clientX, y: e.clientY };
            });
            app.canvas.addEventListener('pointerup', (e) => {
                if (mode === 'pan' && !moved) {
                    // Tık: köşe ekle. Üç köşeden sonra en kısa yolu bozmayacak kenarın arasına girer.
                    const m = toMap(e);
                    const pts = state.current.points;
                    let at = pts.length;
                    if (pts.length >= 3) {
                        let best = Infinity;
                        for (let i = 0; i < pts.length; i++) {
                            const a = pts[i];
                            const b = pts[(i + 1) % pts.length];
                            const cost = Math.hypot(a[0] - m[0], a[1] - m[1]) + Math.hypot(b[0] - m[0], b[1] - m[1]) - Math.hypot(a[0] - b[0], a[1] - b[1]);
                            if (cost < best) {
                                best = cost;
                                at = i + 1;
                            }
                        }
                    }
                    state.current.onChange([...pts.slice(0, at), m, ...pts.slice(at)]);
                }
                mode = 'none';
            });
            app.canvas.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const i = hitVertex(toMap(e));
                if (i >= 0) state.current.onChange(state.current.points.filter((_, k) => k !== i));
            });
            app.canvas.addEventListener(
                'wheel',
                (e) => {
                    e.preventDefault();
                    const r = app.canvas.getBoundingClientRect();
                    const g = { x: e.clientX - r.left, y: e.clientY - r.top };
                    const local = world.toLocal(g);
                    const s = Math.max(0.03, Math.min(world.scale.x * Math.exp(-e.deltaY * 0.0015), 4));
                    world.scale.set(s);
                    world.position.set(g.x - local.x * s, g.y - local.y * s);
                    redrawRef.current(); // çizgi kalınlığı ekran pikseline göre
                },
                { passive: false },
            );
            setReady(true);
        })().catch((err) => console.error(err));

        return () => {
            destroyed = true;
            appRef.current?.destroy(true, { children: true, texture: true });
            appRef.current = null;
        };
    }, []);

    // Çizim: diğer sınırlar soluk, düzenlenen sınır parlak + köşe tutamaçları
    const redrawRef = useRef(() => {});
    redrawRef.current = () => {
        const others = othersRef.current;
        const shape = shapeRef.current;
        const world = worldRef.current;
        if (!others || !shape || !world) return;
        const px = 1 / world.scale.x; // ekran pikseli -> harita pikseli
        others.clear();
        for (const t of territories) {
            if (t.id === editingId || t.points.length < 3) continue;
            others.poly(t.points.flat(), true).fill({ color: hex(t.color), alpha: 0.18 }).stroke({ width: 2 * px, color: hex(t.color), alpha: 0.6 });
        }
        shape.clear();
        if (points.length >= 3) shape.poly(points.flat(), true).fill({ color: hex(color), alpha: 0.3 });
        if (points.length >= 2) shape.poly(points.flat(), points.length >= 3).stroke({ width: 3 * px, color: hex(color) });
        points.forEach(([x, y], i) => {
            shape.circle(x, y, (i === 0 ? 7 : 5.5) * px).fill(i === 0 ? 0xffffff : hex(color)).stroke({ width: 2 * px, color: 0x050505 });
        });
    };
    useEffect(() => redrawRef.current(), [ready, territories, editingId, points, color]);

    return (
        <div className="w-full h-full relative">
            <div ref={containerRef} className="w-full h-full" />
            <div className="absolute bottom-2 left-2 bg-black/75 text-[#a89361] text-[10px] px-2 py-1 rounded pointer-events-none leading-relaxed">
                Tık: köşe ekle · Köşeyi sürükle: taşı · Köşeye sağ tık: sil · Sürükle: kaydır · Tekerlek: yakınlaş
            </div>
        </div>
    );
};

export default TerritoryCanvas;
