'use client';

import React from 'react';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { QualityTier } from '../terrain/quality';
import Terrain from './Terrain';
import Water from './Water';
import Forest from './Forest';
import Clouds from './Clouds';
import Labels from './Labels';

// memo: sayfa her zoom/rotasyon güncellemesinde yeniden render olur; harita katmanları olmamalı
const MapLayers = React.memo(({ quality }: { quality: QualityTier }) => (
    <group>
        {/* Harita çerçevesinin dışındaki karanlık deniz */}
        <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[WORLD_WIDTH * 4, WORLD_HEIGHT * 4]} />
            <meshBasicMaterial color="#0d1218" />
        </mesh>
        <Terrain quality={quality} />
        <Water />
        <Forest />
        <Labels />
        <Clouds />
    </group>
));
MapLayers.displayName = 'MapLayers';

export default MapLayers;
