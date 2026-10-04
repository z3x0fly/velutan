'use client';

import { useEffect, useMemo, useState } from 'react';
import { HeightField, loadHeightField } from './terrain/heightField';
import { analyzeRoute, RouteAnalysis } from './travelAnalysis';
import type { MapPoint } from './types';
import { loadRoads, RoadGraph } from './roads';

/**
 * Rota analizi (mesafe, zemin, süre). Yükselti haritası yalnızca rota çizilmeye başlanınca yüklenir;
 * three.js gerektirmez, ana sayfa paketinde kalabilir.
 */
export function useRouteAnalysis(path: MapPoint[], pace: string, followRoads = true): RouteAnalysis | null {
    const [field, setField] = useState<HeightField | null>(null);
    const [roads, setRoads] = useState<RoadGraph | null>(null);
    const need = path.length > 0;
    // Yol ağı yalnızca iki durak olunca ve yollar açıkken yüklenir
    useEffect(() => {
        if (!followRoads || path.length < 2 || roads) return;
        let alive = true;
        loadRoads()
            .then((g) => alive && setRoads(g))
            .catch((err) => console.error('[Velutan]', err));
        return () => {
            alive = false;
        };
    }, [followRoads, path.length, roads]);
    useEffect(() => {
        if (!need || field) return;
        let alive = true;
        loadHeightField()
            .then((f) => alive && setField(f))
            .catch((err) => console.error('[Velutan]', err));
        return () => {
            alive = false;
        };
    }, [need, field]);
    return useMemo(() => (field && path.length > 0 ? analyzeRoute(path, field, pace, followRoads ? roads : null) : null), [field, path, pace, followRoads, roads]);
}
