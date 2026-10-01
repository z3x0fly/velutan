import { MAP_SOURCE_SIZE } from '../generated/mapMeta';

// Bölge koordinatları kaynak harita pikselindedir (8192 x 7192, "Yeni Harita Kare").
export const MAP_WIDTH_PIXELS = MAP_SOURCE_SIZE[0];
export const MAP_HEIGHT_PIXELS = MAP_SOURCE_SIZE[1];

// 3D sahnede harita 38.4 birim genişliğinde; yükseklik en-boy oranından gelir.
export const WORLD_WIDTH = 38.4;
export const WORLD_HEIGHT = WORLD_WIDTH * (MAP_HEIGHT_PIXELS / MAP_WIDTH_PIXELS);
export const SCALE_FACTOR = MAP_WIDTH_PIXELS / WORLD_WIDTH;

// velutanmap.com resmi ölçeği: harita genişliği 5431 km
export const MAP_WIDTH_KM = 5431;
export const KM_PER_PIXEL = MAP_WIDTH_KM / MAP_WIDTH_PIXELS;

export const to3D = (x: number, y: number): [number, number, number] => [
    (x - MAP_WIDTH_PIXELS / 2) / SCALE_FACTOR,
    0,
    (y - MAP_HEIGHT_PIXELS / 2) / SCALE_FACTOR,
];

export const from3D = (x: number, z: number): [number, number] => [
    x * SCALE_FACTOR + MAP_WIDTH_PIXELS / 2,
    z * SCALE_FACTOR + MAP_HEIGHT_PIXELS / 2,
];

export const pathLengthKm = (path: { x: number; y: number }[]) => {
    let px = 0;
    for (let i = 1; i < path.length; i++) px += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return px * KM_PER_PIXEL;
};
