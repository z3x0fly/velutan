import * as THREE from 'three';
import { MAP_HEIGHT_PIXELS, MAP_WIDTH_PIXELS, KM_PER_PIXEL, SCALE_FACTOR } from './utils/coords';
import { themeStore, type PlanetModel } from './themeStore';

/**
 * Velutan'ın gezegeni (resmî, INTCH): Jüpiter büyüklüğünde (yarıçap 69.911 km). Harita bu gezegenin üstünde bir
 * kıta; batı ucundan doğu ucuna 8000 km (≈ 8,3° boylam), kuzey-güney ≈ 7000 km (≈ 5,7° enlem). Merkezi 38°K
 * (kıtanın iklimine uyan bir orta enlem). Ölçek bozulmaz: kıta gezegenin yüzeyinde küçük bir yamadır.
 *
 * Gökyüzü: eksen eğikliği 23,44°, 365,25 günlük yıl, 24 saatlik gün, 29,53 günlük ay evresi (Dünya'nınkiler;
 * resmî değerleri gelirse burada değişir). Haritanın kuzeyi -z, doğusu +x yönündedir.
 */
export type { PlanetModel };
export const AXIAL_TILT = 23.44;
export const YEAR_DAYS = 365.25;
export const SYNODIC_MONTH = 29.530588;
export const MAP_CENTER_LON = 0;

const deg = THREE.MathUtils.degToRad;
const rad = THREE.MathUtils.radToDeg;

/** Gezegen yarıçapı (km): Jüpiter */
export const PLANET_R_KM = 69911;
const KITA_LAT = 38;
const KM_PER_DEG = (Math.PI * PLANET_R_KM) / 180;

/** Tek resmî kurgu (eski "tam" ayarı da buna düşer) */
export const getPlanetModel = (): PlanetModel => 'kita';

export const planetRadiusKm = () => PLANET_R_KM;
/** Haritanın ortasının enlemi */
export const mapCenterLat = () => KITA_LAT;

/** Harita pikseli -> enlem/boylam (derece) */
export function pixelToLatLon(px: number, py: number) {
    const lat = KITA_LAT + ((MAP_HEIGHT_PIXELS / 2 - py) * KM_PER_PIXEL) / KM_PER_DEG;
    const lon = ((px - MAP_WIDTH_PIXELS / 2) * KM_PER_PIXEL) / (KM_PER_DEG * Math.cos(deg(KITA_LAT)));
    return { lat, lon };
}
/** Enlem/boylam -> harita pikseli */
export function latLonToPixel(lat: number, lon: number) {
    return {
        x: MAP_WIDTH_PIXELS / 2 + (lon * KM_PER_DEG * Math.cos(deg(KITA_LAT))) / KM_PER_PIXEL,
        y: MAP_HEIGHT_PIXELS / 2 - ((lat - KITA_LAT) * KM_PER_DEG) / KM_PER_PIXEL,
    };
}

/** Dünya (sahne) koordinatı -> enlem/boylam */
export function worldToLatLon(x: number, z: number) {
    return pixelToLatLon(x * SCALE_FACTOR + MAP_WIDTH_PIXELS / 2, z * SCALE_FACTOR + MAP_HEIGHT_PIXELS / 2);
}

/** Haritanın enlem/boylam sınırları */
export function mapBounds() {
    const nw = pixelToLatLon(0, 0);
    const se = pixelToLatLon(MAP_WIDTH_PIXELS, MAP_HEIGHT_PIXELS);
    return { latN: nw.lat, latS: se.lat, lonW: nw.lon, lonE: se.lon };
}

/** Güneşin deklinasyonu (derece): yılın gününe göre (21 Haziran ≈ +23,44°) */
export const sunDeclination = (dayOfYear: number) => -AXIAL_TILT * Math.cos((2 * Math.PI * (dayOfYear + 10)) / YEAR_DAYS);

export interface SkyBody {
    /** Ufuktan yükseklik (derece) */
    elevation: number;
    /** Kuzeyden saat yönünde (derece) */
    azimuth: number;
    /** Sahne yönü (birim; kuzey -z, doğu +x, yukarı +y) */
    dir: THREE.Vector3;
}

/** Yükseklik/azimut: enlem φ, deklinasyon δ, saat açısı H (derece) */
function horizontal(latDeg: number, decDeg: number, haDeg: number, out: THREE.Vector3): SkyBody {
    const φ = deg(latDeg), δ = deg(decDeg), H = deg(haDeg);
    const sinE = Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H);
    const e = Math.asin(THREE.MathUtils.clamp(sinE, -1, 1));
    // Azimut (kuzeyden, doğuya doğru)
    const y = -Math.sin(H) * Math.cos(δ);
    const x = Math.sin(δ) * Math.cos(φ) - Math.cos(δ) * Math.sin(φ) * Math.cos(H);
    const az = Math.atan2(y, x);
    out.set(Math.sin(az) * Math.cos(e), Math.sin(e), -Math.cos(az) * Math.cos(e)).normalize();
    return { elevation: rad(e), azimuth: (rad(az) + 360) % 360, dir: out };
}

const _sun = new THREE.Vector3();
const _moon = new THREE.Vector3();

/**
 * Gökyüzü: güneş ve ay, belli bir yerden (enlem/boylam) ve zamandan (yılın günü + yerel saat, harita
 * merkezinin saatine göre) bakılınca. Ay evresi `days` toplam gün sayısından (0 = yeni ay).
 */
export function sky(dayOfYear: number, hour: number, totalDays: number, lat = mapCenterLat(), lon = MAP_CENTER_LON) {
    const dec = sunDeclination(dayOfYear);
    // Boylam farkı yerel saati kaydırır (15° = 1 saat)
    const ha = (hour - 12) * 15 + (lon - MAP_CENTER_LON);
    const sun = horizontal(lat, dec, ha, _sun);
    const phase = (((totalDays / SYNODIC_MONTH) % 1) + 1) % 1; // 0 yeni ay, 0.5 dolunay
    // Ay güneşin gerisinden gelir: evre * 360° saat açısı farkı; dolunayda güneşin karşısında (deklinasyon ters)
    const moonDec = -AXIAL_TILT * Math.cos((2 * Math.PI * (dayOfYear + 10)) / YEAR_DAYS + phase * 2 * Math.PI) + 5.1 * Math.sin(totalDays * 0.23);
    const moon = horizontal(lat, moonDec, ha - phase * 360, _moon);
    const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2; // 0 yeni ay, 1 dolunay
    return { sun, moon, phase, illumination, declination: dec };
}

/** Gün uzunluğu (saat): güneşin ufkun üstünde kaldığı süre */
export function dayLength(lat: number, dayOfYear: number) {
    const x = -Math.tan(deg(lat)) * Math.tan(deg(sunDeclination(dayOfYear)));
    if (x <= -1) return 24;
    if (x >= 1) return 0;
    return (2 * rad(Math.acos(x))) / 15;
}

/** Bugünün (gerçek takvim) yılın günü */
export const todayOfYear = (d = new Date()) => {
    const start = new Date(d.getFullYear(), 0, 0);
    return (d.getTime() - start.getTime()) / 86400000;
};

export const MOON_PHASE_NAME = (p: number) =>
    p < 0.03 || p > 0.97 ? 'Yeni ay' : p < 0.22 ? 'Hilal' : p < 0.28 ? 'İlk dördün' : p < 0.47 ? 'Şişkin ay' : p < 0.53 ? 'Dolunay' : p < 0.72 ? 'Şişkin ay' : p < 0.78 ? 'Son dördün' : 'Hilal';
