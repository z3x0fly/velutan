'use client';

import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { GROUND_COLOR, RouteAnalysis } from './travelAnalysis';

interface MapTravelProps {
    route: RouteAnalysis | null;
    isTravelMode: boolean;
}

// Zeminden yükseklik: mesh üçgenleri ile örnek noktaları arasındaki farkı kapatacak kadar
const LIFT = 0.045;

/**
 * Rota çizgisi araziye serilir. Alttaki kalın çizgi geçilen zemini renkle gösterir (düz/sarp/dağ/deniz);
 * bir sırtın arkasında kalan kısım soluk olarak yine görünür, rota hiçbir yerde kaybolmaz.
 */
const MapTravel: React.FC<MapTravelProps> = ({ route, isTravelMode }) => {
    const data = useMemo(() => {
        if (!route || route.samples.length === 0) return null;
        const pts = route.samples.map((s) => new THREE.Vector3(s.x, s.y + LIFT, s.z));
        const c = new THREE.Color();
        const colors = route.samples.map((s) => c.set(GROUND_COLOR[s.ground]).toArray() as [number, number, number]);
        // Duraklar tam zemin noktasında (derinlik testi kapalı, gömülmez): tıklanan yerle birebir örtüşür
        const nodes = route.stopIndex.map((i) => new THREE.Vector3(route.samples[i].x, route.samples[i].y + 0.004, route.samples[i].z));
        return { pts, colors, nodes };
    }, [route]);

    if (!isTravelMode || !data) return null;
    const { pts, colors, nodes } = data;

    return (
        <group>
            {pts.length > 1 && (
                <>
                    {/* Sırt arkasında kalan kısım: derinlik testi yok, soluk */}
                    <Line points={pts} color="#ffb347" lineWidth={2} transparent opacity={0.28} depthTest={false} renderOrder={30} />
                    <Line points={pts} color="#1a0f05" lineWidth={8} transparent opacity={0.45} />
                    <Line points={pts} vertexColors={colors} lineWidth={5} />
                    <Line points={pts} color="#fff3d6" lineWidth={1.6} dashed dashSize={0.12} gapSize={0.09} />
                </>
            )}
            {nodes.map((pos, i) => (
                <group key={i} position={pos}>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={31}>
                        <circleGeometry args={[0.1, 20]} />
                        <meshBasicMaterial color={i === 0 ? '#22c55e' : i === nodes.length - 1 ? '#ef4444' : '#fff7e6'} depthTest={false} />
                    </mesh>
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} renderOrder={32}>
                        <ringGeometry args={[0.1, 0.14, 20]} />
                        <meshBasicMaterial color="#ffa500" depthTest={false} />
                    </mesh>
                </group>
            ))}
        </group>
    );
};

export default React.memo(MapTravel);
