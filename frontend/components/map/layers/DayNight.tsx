'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { dayClock, dayLight, dayStore, sunElevation } from '../dayStore';
import { useTheme } from '../themeStore';

const DAY = {
    hemiSky: new THREE.Color('#fff4dc'),
    hemiGround: new THREE.Color('#3a3020'),
    sun: new THREE.Color('#fff1d6'),
    fill: new THREE.Color('#9fb4d0'),
    sky: new THREE.Color('#b9c9d6'),
    fog: new THREE.Color('#0d1218'),
};
const DUSK = { sun: new THREE.Color('#ff9a52'), sky: new THREE.Color('#e3a77c'), hemiSky: new THREE.Color('#f2c49a') };
const NIGHT = {
    hemiSky: new THREE.Color('#4d6290'),
    hemiGround: new THREE.Color('#0d1018'),
    sun: new THREE.Color('#9db4e6'), // ay ışığı
    fill: new THREE.Color('#33476e'),
    sky: new THREE.Color('#2a3a5c'),
    fog: new THREE.Color('#05070c'),
};
/** Döngü kipinde bir gün kaç saniye */
const CYCLE_SECONDS = 240;

const smooth = (a: number, b: number, x: number) => {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};

/**
 * Gece-gündüz: güneş/ay ışığı, gökyüzü yansıması ve sis rengi saate göre değişir. Seyahat simülasyonunda
 * saat yolculuğun gününden gelir (her gün sabah 6'da yola çıkılır); değilse ayardaki kip (döngü / gerçek saat).
 * Kapalıyken ve simülasyon yokken hiçbir şeye dokunmaz.
 */
export default function DayNight() {
    const { scene, gl, invalidate } = useThree();
    const mode = useTheme().day;
    const start = useRef(performance.now());
    const lights = useRef<{ hemi?: THREE.HemisphereLight; sun?: THREE.DirectionalLight; fill?: THREE.DirectionalLight }>({});
    const applied = useRef(false);
    const c = useRef(new THREE.Color());

    useEffect(() => {
        lights.current = {
            hemi: scene.getObjectByName('hemi') as THREE.HemisphereLight | undefined,
            sun: scene.getObjectByName('sun') as THREE.DirectionalLight | undefined,
            fill: scene.getObjectByName('fill') as THREE.DirectionalLight | undefined,
        };
    }, [scene]);

    // Yalnızca değişince çizilen kademede de saat ilerlesin
    useEffect(() => {
        if (mode === 'kapali') return;
        const id = setInterval(() => invalidate(), 500);
        return () => clearInterval(id);
    }, [mode, invalidate]);

    useFrame(() => {
        const sim = dayClock.simDay;
        const active = sim !== null || mode !== 'kapali';
        if (!active) {
            if (applied.current) {
                apply(13, 1);
                applied.current = false;
                dayStore.publish({ active: false, hour: 13, night: 0, day: null });
            }
            return;
        }
        let hour: number;
        let amp = 1;
        if (sim !== null) {
            hour = (6 + sim * 24) % 24;
            // Gün çok hızlı geçiyorsa gece yanıp sönmesin: karanlık yumuşar
            amp = THREE.MathUtils.clamp((dayClock.secPerDay - 1.2) / 2, 0.25, 1);
        } else if (mode === 'saat') {
            const d = new Date();
            hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
        } else {
            hour = (13 + ((performance.now() - start.current) / 1000 / CYCLE_SECONDS) * 24) % 24;
        }
        const night = apply(hour, amp);
        applied.current = true;
        dayStore.publish({ active: true, hour, night, day: sim !== null ? Math.floor(sim) + 1 : null });
    });

    /** Işıkları saate göre ayarlar, gece oranını döner */
    function apply(hour: number, amp: number) {
        const elev = sunElevation(hour);
        const night = (1 - smooth(-0.32, -0.02, elev)) * amp;
        const dusk = Math.exp(-(((elev - 0.04) / 0.16) ** 2)) * (1 - night * 0.7);
        const { hemi, sun, fill } = lights.current;
        if (hemi) {
            hemi.intensity = THREE.MathUtils.lerp(0.9, 0.5, night);
            hemi.color.copy(DAY.hemiSky).lerp(DUSK.hemiSky, dusk * 0.6).lerp(NIGHT.hemiSky, night);
            hemi.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, night);
        }
        if (sun) {
            sun.intensity = THREE.MathUtils.lerp(2.1, 0.8, night) * (1 - dusk * 0.1);
            sun.color.copy(DAY.sun).lerp(DUSK.sun, dusk).lerp(NIGHT.sun, night);
        }
        if (fill) {
            fill.intensity = THREE.MathUtils.lerp(0.35, 0.25, night);
            fill.color.copy(DAY.fill).lerp(NIGHT.fill, night);
        }
        dayLight.sun.copy(DAY.sun).lerp(DUSK.sun, dusk).lerp(NIGHT.sun, night);
        dayLight.sky.copy(DAY.sky).lerp(DUSK.sky, dusk).lerp(NIGHT.sky, night);
        dayLight.night = night;
        c.current.copy(DAY.fog).lerp(NIGHT.fog, night);
        if (scene.fog) scene.fog.color.copy(c.current);
        gl.setClearColor(c.current);
        return night;
    }

    return null;
}
