'use client';

import React from 'react';
import { WORLD_HEIGHT, WORLD_WIDTH } from '../utils/coords';
import { QualitySettings } from '../terrain/quality';
import Terrain from './Terrain';
import Water from './Water';
import Forest from './Forest';
import Clouds from './Clouds';
import Labels from './Labels';
import Dragon from './Dragon';

// memo: sayfa her zoom/rotasyon güncellemesinde yeniden render olur; harita katmanları olmamalı
const MapLayers = React.memo(({ settings }: { settings: QualitySettings }) => (
    <group>
        {/* Harita çerçevesinin dışındaki karanlık deniz */}
        <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[WORLD_WIDTH * 4, WORLD_HEIGHT * 4]} />
            <meshBasicMaterial color="#0d1218" />
        </mesh>
        <Terrain textureSize={settings.textureSize} segments={settings.terrainSegments} normalMap={settings.tier === 'high' || settings.tier === 'medium'} />
        <Water animate={settings.waterAnimation} />
        {settings.treeFraction > 0 && <Forest fraction={settings.treeFraction} wind={settings.wind} />}
        <Labels />
        {settings.clouds && <Clouds />}
        {/* Sürekli animasyon ister: yalnızca her kareyi çizen kademelerde */}
        {settings.frameloop === 'always' && <Dragon />}
    </group>
));
MapLayers.displayName = 'MapLayers';

export default MapLayers;
