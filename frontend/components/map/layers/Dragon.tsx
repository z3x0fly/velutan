'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { to3D } from '../utils/coords';
import { useHeightField } from '../useHeightField';

/**
 * Olgrud üzerinde süzülen ejderha. Tamamen kodla kurulmuş düşük poligonlu model (dış dosya yok):
 * gövde, boyun, boynuzlu baş, iki eklemli kanatlar ve dalgalanan kuyruk. Kanat çırpışı, süzülme ve
 * dönüşte yatış useFrame'de; yerde gölgesi gezer. Yalnızca sürekli çizim yapılan kademelerde açılır.
 */

const ORBIT_CENTER = to3D(5400, 5580); // Olgrud'un doğu ucu
const ORBIT_RADIUS = 0.85;
const ALTITUDE = 1.55;
const SPEED = 0.32; // rad/sn
const SCALE = 0.42;

const BODY = '#7d1f18';
const BELLY = '#c98a4a';
const MEMBRANE = '#4e1410';
const HORN = '#e8dcc0';

/** Kanat zarı: omuzdan parmak uçlarına uzanan, kenarı kavisli ince yüzey (iki parça: iç ve dış) */
function wingShape(outer: boolean) {
    const s = new THREE.Shape();
    if (!outer) {
        s.moveTo(0, 0);
        s.lineTo(0.55, 0.06);
        s.lineTo(0.62, -0.05);
        s.quadraticCurveTo(0.35, -0.22, 0.05, -0.32);
        s.lineTo(0, -0.12);
    } else {
        s.moveTo(0, 0.06);
        s.lineTo(0.62, 0.2);
        s.quadraticCurveTo(0.5, 0.0, 0.66, -0.12);
        s.quadraticCurveTo(0.42, -0.08, 0.38, -0.3);
        s.quadraticCurveTo(0.2, -0.16, 0.07, -0.05);
        s.lineTo(0, -0.05);
    }
    const g = new THREE.ShapeGeometry(s, 6);
    g.rotateX(-Math.PI / 2); // XZ düzlemine yatır: +X kanat ucu, -Z arka
    return g;
}

function useDragonParts() {
    return useMemo(() => {
        const mat = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
            new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...extra });
        const m = {
            body: mat(BODY),
            belly: mat(BELLY),
            membrane: mat(MEMBRANE, { side: THREE.DoubleSide, roughness: 0.9 }),
            horn: mat(HORN),
            eye: new THREE.MeshBasicMaterial({ color: '#ffcf4a' }),
        };
        const g = {
            torso: new THREE.CapsuleGeometry(0.12, 0.42, 4, 8).rotateX(Math.PI / 2),
            belly: new THREE.CapsuleGeometry(0.095, 0.34, 3, 6).rotateX(Math.PI / 2),
            neck: new THREE.CylinderGeometry(0.06, 0.1, 0.32, 7).rotateX(Math.PI / 2 - 0.5),
            head: new THREE.ConeGeometry(0.075, 0.24, 6).rotateX(Math.PI / 2),
            jaw: new THREE.BoxGeometry(0.09, 0.035, 0.16),
            horn: new THREE.ConeGeometry(0.018, 0.13, 5).rotateX(-Math.PI / 2 - 0.5),
            eye: new THREE.SphereGeometry(0.014, 6, 4),
            tail: new THREE.CylinderGeometry(0.02, 0.07, 0.22, 6).rotateX(Math.PI / 2),
            spike: new THREE.ConeGeometry(0.035, 0.09, 4).rotateX(-Math.PI / 2),
            arm: new THREE.CylinderGeometry(0.018, 0.028, 0.6, 5).rotateZ(Math.PI / 2).translate(0.3, 0, 0),
            forearm: new THREE.CylinderGeometry(0.012, 0.018, 0.62, 5).rotateZ(Math.PI / 2).translate(0.31, 0, 0),
            wingIn: wingShape(false),
            wingOut: wingShape(true),
            leg: new THREE.CylinderGeometry(0.025, 0.04, 0.16, 5),
        };
        return { m, g };
    }, []);
}

const TAIL_SEGMENTS = 6;

const Dragon = () => {
    const { m, g } = useDragonParts();
    const field = useHeightField();
    const root = useRef<THREE.Group>(null);
    const shadow = useRef<THREE.Mesh>(null);
    const wings = useRef<{ inner: THREE.Group | null; outer: THREE.Group | null }[]>([{ inner: null, outer: null }, { inner: null, outer: null }]);
    const tail = useRef<(THREE.Group | null)[]>([]);
    const neck = useRef<THREE.Group>(null);
    const angle = useRef(Math.random() * Math.PI * 2);
    const tmp = useMemo(() => new THREE.Vector3(), []);

    useEffect(
        () => () => {
            Object.values(g).forEach((x) => x.dispose());
            Object.values(m).forEach((x) => x.dispose());
        },
        [g, m],
    );

    useFrame(({ clock }, delta) => {
        const r = root.current;
        if (!r) return;
        const t = clock.elapsedTime;
        angle.current += Math.min(delta, 0.1) * SPEED;
        const a = angle.current;
        // Hafif yamuk yörünge: tam daire mekanik görünür
        const rad = ORBIT_RADIUS * (1 + 0.12 * Math.sin(a * 2.0));
        const x = ORBIT_CENTER[0] + Math.cos(a) * rad;
        const z = ORBIT_CENTER[2] + Math.sin(a) * rad;
        // Kanat çırpışında yükselir, süzülürken alçalır
        const flapPhase = t * 3.1;
        const glide = 0.5 + 0.5 * Math.sin(t * 0.45); // 0: süzülme, 1: çırpma
        const y = ALTITUDE + Math.sin(a * 3) * 0.08 + Math.sin(flapPhase) * 0.015 * glide;
        r.position.set(x, y, z);
        // Gidiş yönüne bak + dönüşe doğru yat
        tmp.set(-Math.sin(a), 0, Math.cos(a));
        r.rotation.set(0, Math.atan2(tmp.x, tmp.z), 0);
        r.rotateZ(0.32);
        r.rotateX(-Math.cos(a * 3) * 0.08);

        // Kanatlar: iç kısım omuzdan, dış kısım dirsekten (gecikmeli) çırpar
        const flap = Math.sin(flapPhase) * (0.25 + 0.55 * glide);
        const fold = Math.sin(flapPhase - 0.9) * (0.2 + 0.45 * glide);
        wings.current.forEach((w) => {
            // Ayna kanat (scale x = -1) aynı açıyla döner; iki kanat birlikte çırpar
            if (w.inner) w.inner.rotation.z = 0.12 + flap;
            if (w.outer) w.outer.rotation.z = fold * 0.8 - 0.05;
        });
        // Kuyruk ve boyun dalgası
        tail.current.forEach((seg, i) => {
            if (seg) seg.rotation.y = Math.sin(t * 1.6 - i * 0.6) * 0.16;
        });
        if (neck.current) neck.current.rotation.y = Math.sin(t * 0.8) * 0.12;

        // Yerdeki gölge: araziyi izler, yüksekliğe göre soluklaşır
        const sh = shadow.current;
        if (sh) {
            const gy = Math.max(field?.sample(x, z) ?? 0, 0);
            sh.position.set(x, gy + 0.02, z);
            sh.rotation.z = -Math.atan2(tmp.x, tmp.z);
            (sh.material as THREE.MeshBasicMaterial).opacity = 0.32 - Math.min((y - gy) * 0.1, 0.18);
        }
    });

    const wing = (side: 0 | 1) => {
        const s = side === 0 ? 1 : -1;
        return (
            <group position={[s * 0.07, 0.07, 0.08]} scale={[s, 1, 1]}>
                <group
                    ref={(el) => {
                        wings.current[side].inner = el;
                    }}
                    rotation={[0, 0, 0]}
                >
                    <mesh geometry={g.arm} material={m.body} />
                    <mesh geometry={g.wingIn} material={m.membrane} />
                    <group
                        position={[0.58, 0, 0.02]}
                        ref={(el) => {
                            wings.current[side].outer = el;
                        }}
                    >
                        <mesh geometry={g.forearm} material={m.body} rotation={[0, 0.25, 0]} />
                        <mesh geometry={g.wingOut} material={m.membrane} />
                    </group>
                </group>
            </group>
        );
    };

    return (
        <group>
            <group ref={root} scale={SCALE}>
                <mesh geometry={g.torso} material={m.body} />
                <mesh geometry={g.belly} material={m.belly} position={[0, -0.04, 0.02]} />
                {/* Sırt dikenleri */}
                {[-0.18, -0.06, 0.06, 0.18].map((zz) => (
                    <mesh key={zz} geometry={g.spike} material={m.horn} position={[0, 0.12, zz]} rotation={[-0.6, 0, 0]} scale={0.7} />
                ))}
                {/* Boyun + baş */}
                <group ref={neck} position={[0, 0.04, 0.27]}>
                    <mesh geometry={g.neck} material={m.body} position={[0, 0.07, 0.12]} />
                    <group position={[0, 0.16, 0.3]}>
                        <mesh geometry={g.head} material={m.body} />
                        <mesh geometry={g.jaw} material={m.belly} position={[0, -0.045, 0.02]} />
                        <mesh geometry={g.horn} material={m.horn} position={[0.04, 0.05, -0.08]} />
                        <mesh geometry={g.horn} material={m.horn} position={[-0.04, 0.05, -0.08]} />
                        <mesh geometry={g.eye} material={m.eye} position={[0.045, 0.02, 0.0]} />
                        <mesh geometry={g.eye} material={m.eye} position={[-0.045, 0.02, 0.0]} />
                    </group>
                </group>
                {/* Kuyruk: zincir halinde, her parça bir öncekine bağlı */}
                <group position={[0, 0, -0.3]}>
                    {Array.from({ length: TAIL_SEGMENTS }).reduceRight<React.ReactNode>(
                        (child, _, i) => (
                            <group
                                ref={(el) => {
                                    tail.current[i] = el;
                                }}
                                position={[0, 0, i === 0 ? 0 : -0.19]}
                                scale={i === 0 ? 1 : 0.88}
                            >
                                <mesh geometry={g.tail} material={m.body} position={[0, 0, -0.09]} />
                                {i === TAIL_SEGMENTS - 1 && <mesh geometry={g.spike} material={m.horn} position={[0, 0, -0.24]} rotation={[Math.PI, 0, 0]} scale={1.4} />}
                                {child}
                            </group>
                        ),
                        null,
                    )}
                </group>
                {/* Toplanmış bacaklar */}
                {[0.08, -0.08].map((xx) => (
                    <React.Fragment key={xx}>
                        <mesh geometry={g.leg} material={m.body} position={[xx, -0.1, 0.14]} rotation={[1.1, 0, 0]} />
                        <mesh geometry={g.leg} material={m.body} position={[xx, -0.1, -0.16]} rotation={[1.3, 0, 0]} />
                    </React.Fragment>
                ))}
                {wing(0)}
                {wing(1)}
            </group>
            <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} scale={[1.6, 0.7, 1]} renderOrder={3}>
                <circleGeometry args={[0.32, 24]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.25} depthWrite={false} />
            </mesh>
        </group>
    );
};

export default React.memo(Dragon);
