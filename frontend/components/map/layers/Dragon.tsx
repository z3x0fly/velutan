'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { to3D } from '../utils/coords';
import { useHeightField } from '../useHeightField';

/**
 * Haritayı tavaf eden ejderha: Olgrud'dan başlayıp bütün kıtaların üstünden geçen kapalı bir rotada uçar.
 * Model: "Dragon flying" — spacewatermelon (https://sketchfab.com/3d-models/dragon-flying-5c8c586da7ad450a8e58b56289a26739),
 * CC BY 4.0. Dokular 512px WebP'ye, mesh meshopt ile sıkıştırıldı (17.5 MB → 0.76 MB); kendi uçuş animasyonuyla.
 * Rota, dağların üstünde yükselme, dönüşte yatış ve yerdeki gölge burada. Yalnızca sürekli çizim
 * yapılan kademelerde açılır.
 */

const MODEL_URL = '/models/dragon.glb';
// Harita pikselinde uğrak noktaları (saat yönünde tur): Olgrud → güney kıyıları → batı → kuzey → doğu
const TOUR: [number, number][] = [
    [5400, 5580], // Olgrud
    [6600, 6400], // Nal'gun / Locus Capitum
    [5200, 6500], // Rolgo / Golloth
    [3900, 6150], // Halver, Atrapolis'in güneyi
    [2900, 5400], // Dabresh
    [2000, 4000], // Kalazad
    [1200, 3500], // Golgalen
    [900, 1900], // Khrag
    [1500, 900], // Antheraghas
    [2900, 1300], // Grim / Eliar
    [4200, 1600], // Dulhalen
    [3300, 2700], // Pran
    [4900, 2400], // Aurean
    [5700, 1500], // Rhalgalen
    [6900, 2700], // Rungarath
    [7500, 3500], // Galmar
    [6300, 3600], // Eranstrum
    [4900, 3500], // Qasaar
];
const SPEED = 0.55; // dünya birimi / sn (tam tur ≈ 3 dk)
const CRUISE = 1.3; // denizden yükseklik
const CLEARANCE = 0.75; // dağların üstünden en az bu kadar
const WINGSPAN = 1.15; // dünya birimi (dağların yanında okunur boyut)

const tourCurve = () =>
    new THREE.CatmullRomCurve3(
        TOUR.map(([px, py]) => {
            const [x, , z] = to3D(px, py);
            return new THREE.Vector3(x, 0, z);
        }),
        true,
        'centripetal',
    );

const Dragon = () => {
    const { scene, animations } = useGLTF(MODEL_URL);
    const field = useHeightField();
    const root = useRef<THREE.Group>(null);
    const model = useRef<THREE.Group>(null);
    const shadow = useRef<THREE.Mesh>(null);
    const { actions } = useAnimations(animations, model);
    const curve = useMemo(tourCurve, []);
    const length = useMemo(() => curve.getLength(), [curve]);
    const u = useRef(0);
    const lift = useRef(CRUISE);
    const roll = useRef(0);
    const tmp = useMemo(() => ({ p: new THREE.Vector3(), dir: new THREE.Vector3(), ahead: new THREE.Vector3() }), []);

    // Modeli ortala ve kanat açıklığına göre ölçekle (dosyanın kendi ölçeğinden bağımsız)
    const fit = useMemo(() => {
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const s = WINGSPAN / Math.max(size.x, size.z, 1e-6);
        scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh) {
                mesh.frustumCulled = false; // iskelet animasyonunda sınır kutusu güncellenmez
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach((m) => {
                    const sm = m as THREE.MeshStandardMaterial;
                    if (sm.isMeshStandardMaterial) {
                        sm.side = THREE.DoubleSide; // kanat zarı iki yüzden görünsün
                        // Kahverengi dokuyu kızıla çek; uzaktan da seçilsin diye dokudan hafif öz ışık
                        sm.color.set('#ff8a80');
                        sm.emissive.set('#7a2228');
                        sm.emissiveMap = sm.map;
                        sm.emissiveIntensity = 0.9;
                    }
                });
            }
        });
        return { s, offset: center.multiplyScalar(-1) };
    }, [scene]);

    useEffect(() => {
        const fly = actions.flying ?? Object.values(actions)[0];
        fly?.reset().fadeIn(0.3).play();
        return () => {
            fly?.fadeOut(0.2);
        };
    }, [actions]);

    useFrame(({ clock }, delta) => {
        const r = root.current;
        if (!r) return;
        const t = clock.elapsedTime;
        const dt = Math.min(delta, 0.1);
        u.current = (u.current + (dt * SPEED) / length) % 1;
        const { p, dir, ahead } = tmp;
        curve.getPointAt(u.current, p);
        curve.getTangentAt(u.current, dir);
        // Önündeki araziye göre yüksel: dağlara yaklaşırken erkenden tırmanır, yumuşakça alçalır
        let ground = 0;
        if (field) {
            for (const k of [0, 0.006, 0.012]) {
                curve.getPointAt((u.current + k) % 1, ahead);
                ground = Math.max(ground, field.sample(ahead.x, ahead.z));
            }
        }
        const want = Math.max(CRUISE, ground + CLEARANCE);
        lift.current += (want - lift.current) * Math.min(dt * (want > lift.current ? 1.6 : 0.5), 1);
        const y = lift.current + Math.sin(t * 0.9) * 0.04;
        r.position.set(p.x, y, p.z);

        // Dönüşün içine yat: yön değişiminden (eğrilik) hesaplanır
        curve.getTangentAt((u.current + 0.004) % 1, ahead);
        const turn = dir.x * ahead.z - dir.z * ahead.x;
        roll.current += (THREE.MathUtils.clamp(-turn * 18, -0.6, 0.6) - roll.current) * Math.min(dt * 2, 1);
        r.rotation.set(0, Math.atan2(dir.x, dir.z), 0);
        r.rotateZ(roll.current);
        r.rotateX(-(want - lift.current) * 0.4);

        const sh = shadow.current;
        if (sh) {
            const gy = Math.max(field?.sample(p.x, p.z) ?? 0, 0);
            sh.position.set(p.x, gy + 0.02, p.z);
            sh.rotation.z = -Math.atan2(dir.x, dir.z);
            (sh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.3 - (y - gy) * 0.1);
        }
    });

    return (
        <group>
            <group ref={root}>
                <group scale={fit.s}>
                    <group ref={model} position={fit.offset}>
                        <primitive object={scene} />
                    </group>
                </group>
            </group>
            <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 0.75, 1]} renderOrder={3}>
                <circleGeometry args={[0.3, 24]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.25} depthWrite={false} />
            </mesh>
        </group>
    );
};

export default React.memo(Dragon);
