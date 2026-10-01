'use client';

import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { to3D } from './utils/coords';
import { useHeightField } from './useHeightField';
import type { MapPoint } from './types';

interface MapTravelProps {
    path: MapPoint[];
    isTravelMode: boolean;
}

const LIFT = 0.04;
const STEP = 0.15; // dünya birimi; rota zemini bu aralıkla takip eder

/** Rota çizgisi araziye "serilir": dağlardan geçerken yükselir, denizde su seviyesinde kalır. */
const MapTravel: React.FC<MapTravelProps> = ({ path, isTravelMode }) => {
    const field = useHeightField();
    const groundAt = (x: number, z: number) => Math.max(field?.sample(x, z) ?? 0, 0) + LIFT;

    const { line, nodes } = useMemo(() => {
        const pts = path.map((p) => to3D(p.x, p.y));
        const line: THREE.Vector3[] = [];
        for (let i = 0; i < pts.length; i++) {
            const [x, , z] = pts[i];
            if (i > 0) {
                const [px, , pz] = pts[i - 1];
                const n = Math.max(1, Math.ceil(Math.hypot(x - px, z - pz) / STEP));
                for (let k = 1; k < n; k++) {
                    const t = k / n;
                    const ix = px + (x - px) * t;
                    const iz = pz + (z - pz) * t;
                    line.push(new THREE.Vector3(ix, groundAt(ix, iz), iz));
                }
            }
            line.push(new THREE.Vector3(x, groundAt(x, z), z));
        }
        const nodes = pts.map(([x, , z]) => new THREE.Vector3(x, groundAt(x, z), z));
        return { line, nodes };
    }, [path, field]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isTravelMode || nodes.length === 0) return null;

    return (
        <group>
            {line.length > 1 && (
                <>
                    <Line points={line} color="#1a0f05" lineWidth={6} transparent opacity={0.5} />
                    <Line points={line} color="#ffb347" lineWidth={3} dashed dashSize={0.18} gapSize={0.1} />
                </>
            )}
            {nodes.map((pos, i) => (
                <group key={i} position={pos}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]}>
                        <circleGeometry args={[0.1, 20]} />
                        <meshBasicMaterial color={i === 0 ? '#22c55e' : i === nodes.length - 1 ? '#ef4444' : '#fff7e6'} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
                        <ringGeometry args={[0.1, 0.14, 20]} />
                        <meshBasicMaterial color="#ffa500" />
                    </mesh>
                </group>
            ))}
        </group>
    );
};

export default React.memo(MapTravel);
