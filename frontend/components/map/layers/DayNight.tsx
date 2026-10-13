'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { dayClock, dayLight, dayStore, DEFAULT_SUN_DIR } from '../dayStore';
import { dayLength, sky, todayOfYear, worldToLatLon } from '../astro';
import { useTheme } from '../themeStore';

const DAY = {
    hemiSky: new THREE.Color('#fff4dc'),
    hemiGround: new THREE.Color('#3a3020'),
    sun: new THREE.Color('#fff1d6'),
    fill: new THREE.Color('#9fb4d0'),
    sky: new THREE.Color('#b9c9d6'),
    fog: new THREE.Color('#0d1218'),
};
const DUSK = { sun: new THREE.Color('#ff8a3d'), sky: new THREE.Color('#e3a77c'), hemiSky: new THREE.Color('#f2c49a') };
const NIGHT = {
    hemiSky: new THREE.Color('#4d6290'),
    hemiGround: new THREE.Color('#0d1018'),
    moon: new THREE.Color('#a9c1f0'),
    fill: new THREE.Color('#33476e'),
    sky: new THREE.Color('#2a3a5c'),
    fog: new THREE.Color('#05070c'),
};
/** Döngü kipinde bir gün kaç saniye */
const CYCLE_SECONDS = 240;
/** Bilinen bir yeni ay: 6 Ocak 2000 18:14 UTC (ay evresi bundan sayılır) */
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14) / 86400000;
const SUN_DISTANCE = 30;

const smooth = (a: number, b: number, x: number) => {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};

const _dir = new THREE.Vector3();
const _view = new THREE.Vector3();

/**
 * Gece-gündüz, gerçek gökyüzü mekaniğiyle (astro.ts): güneş, bakılan yerin enlem ve boylamında mevsime göre doğar,
 * yükselir, batar; ışık yönü ve rengi güneşin konumundan gelir. Gece ay ışığıdır: ayın konumu ve evresi
 * (dolunayda aydınlık, yeni ayda karanlık) gerçek takvimden. Seyahat simülasyonunda saat yolculuğun
 * gününden (sabah 6'da yola çıkılır), değilse ayardaki kipten (döngü / gerçek saat). Kapalıyken öğleden sonra.
 */
export default function DayNight() {
    const { scene, gl, invalidate, camera } = useThree();
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
                resetDefault();
                applied.current = false;
                dayStore.publish({ active: false, hour: 13, night: 0, day: null, sunElevation: 50, moonPhase: 0, dayLength: 12 });
            }
            return;
        }
        const now = new Date();
        const nowDays = now.getTime() / 86400000;
        let hour: number;
        let doy = todayOfYear(now);
        let days = nowDays - NEW_MOON_EPOCH;
        let amp = 1;
        if (sim !== null) {
            hour = (6 + sim * 24) % 24;
            doy += Math.floor(sim);
            days += sim;
            // Gün çok hızlı geçiyorsa gece yanıp sönmesin: karanlık yumuşar
            amp = THREE.MathUtils.clamp((dayClock.secPerDay - 1.2) / 2, 0.25, 1);
        } else if (mode === 'saat') {
            hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
        } else {
            const elapsed = (performance.now() - start.current) / 1000 / CYCLE_SECONDS; // gün
            hour = (13 + elapsed * 24) % 24;
            doy += Math.floor((13 / 24 + elapsed));
            days += elapsed;
        }
        // Bakılan yer: ekranın ortasının altındaki zemin noktası -> enlem/boylam (gezegen haritanın tamamı)
        camera.getWorldDirection(_view);
        const t = _view.y < -0.05 ? -camera.position.y / _view.y : 20;
        const gx = camera.position.x + _view.x * t, gz = camera.position.z + _view.z * t;
        const { lat, lon } = worldToLatLon(gx, gz);
        const s = sky(doy % 365.25, hour, days, lat, lon);
        const night = apply(s, amp);
        applied.current = true;
        // Yerel saat: boylamın 15°'si bir saat
        const local = (((hour + lon / 15) % 24) + 24) % 24;
        dayStore.publish({
            active: true,
            hour: local,
            night,
            day: sim !== null ? Math.floor(sim) + 1 : null,
            sunElevation: s.sun.elevation,
            moonPhase: s.phase,
            dayLength: dayLength(lat, doy % 365.25),
        });
    });

    function resetDefault() {
        const { hemi, sun, fill } = lights.current;
        if (hemi) {
            hemi.intensity = 0.9;
            hemi.color.copy(DAY.hemiSky);
            hemi.groundColor.copy(DAY.hemiGround);
        }
        if (sun) {
            sun.intensity = 2.1;
            sun.color.copy(DAY.sun);
        }
        if (fill) {
            fill.intensity = 0.35;
            fill.color.copy(DAY.fill);
        }
        dayLight.sunDir.copy(DEFAULT_SUN_DIR);
        placeLight();
        dayLight.sun.copy(DAY.sun);
        dayLight.sky.copy(DAY.sky);
        dayLight.night = 0;
        if (scene.fog) scene.fog.color.copy(DAY.fog);
        gl.setClearColor(DAY.fog);
    }

    /** Işığı yöne yerleştir (ejderha açıksa onun gölge kutusu konumu kendisi ayarlar) */
    function placeLight() {
        const sun = lights.current.sun;
        if (!sun || sun.castShadow) return;
        sun.position.copy(sun.target.position).addScaledVector(dayLight.sunDir, SUN_DISTANCE);
    }

    /** Işıkları gökyüzüne göre ayarlar, gece oranını döner */
    function apply(s: ReturnType<typeof sky>, amp: number) {
        const sunE = s.sun.elevation;
        const moonE = s.moon.elevation;
        // Sivil alacakaranlık: güneş ufkun 0..-8° altındayken gece yavaşça çöker
        const night = (1 - smooth(-8, 1, sunE)) * amp;
        const dusk = Math.exp(-(((sunE - 3) / 6) ** 2)) * (1 - night * 0.6);
        const moonLight = s.illumination * smooth(-2, 12, moonE); // 0..1
        const { hemi, sun, fill } = lights.current;

        // Ana ışık: güneş ufkun üstündeyse güneş, değilse (ve ay yukarıdaysa) ay
        const useSun = sunE > -3 || moonE < -2;
        _dir.copy(useSun ? s.sun.dir : s.moon.dir);
        // Ufkun altından ya da yere paralel ışık olmasın (zemin gölgeleri tuhaflaşır)
        if (_dir.y < 0.12) {
            _dir.y = 0.12;
            _dir.normalize();
        }
        dayLight.sunDir.lerp(_dir, 0.2).normalize();
        placeLight();

        const sunStrength = smooth(-3, 8, sunE);
        if (sun) {
            sun.intensity = useSun ? THREE.MathUtils.lerp(0.25, 2.1, sunStrength) * (1 - dusk * 0.12) : 0.2 + 0.75 * moonLight;
            if (useSun) sun.color.copy(DAY.sun).lerp(DUSK.sun, dusk);
            else sun.color.copy(NIGHT.moon);
        }
        if (hemi) {
            hemi.intensity = THREE.MathUtils.lerp(0.9, 0.42 + 0.18 * moonLight, night);
            hemi.color.copy(DAY.hemiSky).lerp(DUSK.hemiSky, dusk * 0.6).lerp(NIGHT.hemiSky, night);
            hemi.groundColor.copy(DAY.hemiGround).lerp(NIGHT.hemiGround, night);
        }
        if (fill) {
            fill.intensity = THREE.MathUtils.lerp(0.35, 0.25, night);
            fill.color.copy(DAY.fill).lerp(NIGHT.fill, night);
        }
        dayLight.sun.copy(useSun ? DAY.sun : NIGHT.moon).lerp(DUSK.sun, useSun ? dusk : 0);
        dayLight.sky.copy(DAY.sky).lerp(DUSK.sky, dusk).lerp(NIGHT.sky, night);
        // Dolunay geceyi biraz açar
        const dark = night * (1 - moonLight * 0.35);
        dayLight.night = dark;
        c.current.copy(DAY.fog).lerp(NIGHT.fog, night);
        if (scene.fog) scene.fog.color.copy(c.current);
        gl.setClearColor(c.current);
        return dark;
    }

    return null;
}
