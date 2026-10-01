'use client';

import { useEffect, useState } from 'react';
import { HeightField, loadHeightField } from './terrain/heightField';

/** Yükselti alanı yüklenene kadar null döner (o sırada nesneler deniz seviyesinde çizilir). */
export function useHeightField(): HeightField | null {
    const [field, setField] = useState<HeightField | null>(null);
    useEffect(() => {
        let alive = true;
        loadHeightField()
            .then((f) => alive && setField(f))
            .catch((err) => console.error('[Velutan]', err));
        return () => {
            alive = false;
        };
    }, []);
    return field;
}
