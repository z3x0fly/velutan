'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DISPLACEMENT_BIAS, DISPLACEMENT_SCALE, HeightField } from './terrain/heightField';
import { from3D, WORLD_HEIGHT, WORLD_WIDTH } from './utils/coords';
import { useHeightField } from './useHeightField';

const _p = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _ray = new THREE.Raycaster();

/**
 * Işını yükseltili araziyle kesiştirir. Zemin GPU'da bükülür (mesh düz bir plane), bu yüzden düz bir
 * yüzeye ışın atmak eğik bakışta tıklanan noktadan kayar. Burada ışın yükselti haritası üzerinde
 * adım adım ilerletilir, ilk kesişim ikiye bölme ile hassaslaştırılır. Deniz seviyesi 0'ın altına inmez.
 */
export function pickGround(ray: THREE.Ray, field: HeightField | null): THREE.Vector3 | null {
    const ground = (x: number, z: number) => Math.max(field ? field.sample(x, z) : 0, 0);
    const top = DISPLACEMENT_SCALE + DISPLACEMENT_BIAS;
    const { origin: o, direction: d } = ray;
    if (d.y >= 0 && o.y > top) return null;
    // Arazinin en yüksek noktasının üstünden başla, deniz seviyesinin altında bitir
    const t0 = d.y < 0 ? Math.max(0, (top - o.y) / d.y) : 0;
    const t1 = d.y < 0 ? (0 - o.y) / d.y : t0 + 100;
    const horiz = Math.hypot(d.x, d.z) || 1e-6;
    const step = Math.max(0.006, 0.02 / horiz); // ≈ yükselti dokusunun yarım pikseli
    let prevT = t0;
    for (let t = t0; t <= t1 + step; t += step) {
        ray.at(t, _p);
        if (_p.y <= ground(_p.x, _p.z)) {
            let lo = prevT;
            let hi = t;
            for (let i = 0; i < 14; i++) {
                const mid = (lo + hi) / 2;
                ray.at(mid, _p);
                if (_p.y <= ground(_p.x, _p.z)) hi = mid;
                else lo = mid;
            }
            ray.at(hi, _p);
            break;
        }
        prevT = t;
    }
    if (Math.abs(_p.x) > WORLD_WIDTH / 2 || Math.abs(_p.z) > WORLD_HEIGHT / 2) return null;
    return _p.clone();
}

/**
 * Haritaya tıklayınca tam tıklanan noktayı (harita pikseli) verir. Sürükleme, iki parmak ve
 * işaretçi/panel tıklamaları sayılmaz. Etkinken imleç artı işaretidir.
 */
export default function GroundPicker({ onPick }: { onPick: (x: number, y: number) => void }) {
    const { gl, camera } = useThree();
    const field = useHeightField();
    const latest = useRef({ onPick, field });
    latest.current = { onPick, field };

    useEffect(() => {
        const el = gl.domElement;
        const pointers = new Set<number>();
        let down: { x: number; y: number; multi: boolean } | null = null;
        const onDown = (e: PointerEvent) => {
            pointers.add(e.pointerId);
            if (pointers.size > 1) {
                if (down) down.multi = true;
                return;
            }
            down = e.button === 0 ? { x: e.clientX, y: e.clientY, multi: false } : null;
        };
        const onUp = (e: PointerEvent) => {
            pointers.delete(e.pointerId);
            const d = down;
            if (!d || pointers.size > 0) return;
            down = null;
            // 6 px'ten fazla kaydıysa kaydırma/döndürmedir, tıklama değil
            if (d.multi || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
            const r = el.getBoundingClientRect();
            _ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
            _ray.setFromCamera(_ndc, camera);
            const p = pickGround(_ray.ray, latest.current.field);
            if (!p) return;
            const [mx, my] = from3D(p.x, p.z);
            latest.current.onPick(Math.round(mx), Math.round(my));
        };
        const onCancel = (e: PointerEvent) => {
            pointers.delete(e.pointerId);
            down = null;
        };
        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onCancel);
        const prevCursor = el.style.cursor;
        el.style.cursor = 'crosshair';
        return () => {
            el.removeEventListener('pointerdown', onDown);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onCancel);
            el.style.cursor = prevCursor;
        };
    }, [gl, camera]);

    return null;
}
