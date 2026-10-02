'use client';

import { useEffect, useMemo, useState } from 'react';
import { HeightField, loadHeightField } from './terrain/heightField';
import { analyzeRoute, RouteAnalysis } from './travelAnalysis';
import type { MapPoint } from './types';

/**
 * Rota analizi (mesafe, zemin, süre). Yükselti haritası yalnızca rota çizilmeye başlanınca yüklenir;
 * three.js gerektirmez, ana sayfa paketinde kalabilir.
 */
export function useRouteAnalysis(path: MapPoint[], pace: string): RouteAnalysis | null {
    const [field, setField] = useState<HeightField | null>(null);
    const need = path.length > 0;
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
    return useMemo(() => (field && path.length > 0 ? analyzeRoute(path, field, pace) : null), [field, path, pace]);
}
