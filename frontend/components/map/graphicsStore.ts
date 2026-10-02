import { QualitySettings, QualityTier, settingsFor } from './terrain/quality';

/**
 * Kullanıcının grafik tercihi. Varsayılan 'auto': kademe cihaza göre seçilir ve FPS düşerse hafifler.
 * Kullanıcı bir kademe seçerse ya da tek tek ayarlarla oynarsa otomatik hafifletme devre dışı kalır.
 * Tercih tarayıcıda saklanır (localStorage); yoksa her şey varsayılana döner.
 */
export type GraphicsPreset = 'auto' | QualityTier;

/** Çözünürlük: 'low' = 1x, 'normal' = kademenin varsayılanı, 'sharp' = ekranın tam çözünürlüğü */
export type ResolutionPref = 'low' | 'normal' | 'sharp';

export interface GraphicsOverrides {
    treeFraction?: number;
    wind?: boolean;
    clouds?: boolean;
    waterAnimation?: boolean;
    dragon?: boolean;
    resolution?: ResolutionPref;
}

export interface GraphicsState {
    preset: GraphicsPreset;
    overrides: GraphicsOverrides;
    /** Cihaza göre bulunan kademe (otomatik modda kullanılır) */
    detected: QualityTier | null;
    /** Otomatik modda FPS yüzünden düşülen kademe */
    autoTier: QualityTier | null;
}

const KEY = 'velutan_grafik';

function readSaved(): Pick<GraphicsState, 'preset' | 'overrides'> {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const v = JSON.parse(raw);
            if (v && typeof v.preset === 'string') return { preset: v.preset, overrides: v.overrides ?? {} };
        }
    } catch {
        /* özel sekme vb.: varsayılan */
    }
    return { preset: 'auto', overrides: {} };
}

let state: GraphicsState = { preset: 'auto', overrides: {}, detected: null, autoTier: null };
let loaded = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
const save = () => {
    try {
        localStorage.setItem(KEY, JSON.stringify({ preset: state.preset, overrides: state.overrides }));
    } catch {
        /* yoksay */
    }
};

export const graphicsStore = {
    get: (): GraphicsState => {
        if (!loaded && typeof window !== 'undefined') {
            loaded = true;
            state = { ...state, ...readSaved() };
        }
        return state;
    },
    subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
    setDetected: (tier: QualityTier) => {
        state = { ...graphicsStore.get(), detected: tier, autoTier: tier };
        emit();
    },
    setAutoTier: (tier: QualityTier) => {
        state = { ...state, autoTier: tier };
        emit();
    },
    /** Kademe seçmek tek tek ayarları sıfırlar */
    setPreset: (preset: GraphicsPreset) => {
        state = { ...graphicsStore.get(), preset, overrides: {}, autoTier: state.detected };
        save();
        emit();
    },
    setOverride: <K extends keyof GraphicsOverrides>(key: K, value: GraphicsOverrides[K]) => {
        const cur = graphicsStore.get();
        // Otomatikteyken ayarla oynamak, o anki kademeyi elle seçilmiş sayar (FPS onu artık değiştirmez)
        const preset = cur.preset === 'auto' ? cur.autoTier ?? cur.detected ?? 'medium' : cur.preset;
        state = { ...cur, preset, overrides: { ...cur.overrides, [key]: value } };
        save();
        emit();
    },
    reset: () => graphicsStore.setPreset('auto'),
};

/** Tercih + cihaz bilgisinden çizim ayarlarını üretir */
export function resolveSettings(s: GraphicsState): QualitySettings | null {
    const tier = s.preset === 'auto' ? s.autoTier ?? s.detected : s.preset;
    if (!tier) return null;
    const base = settingsFor(tier);
    const o = s.overrides;
    const out: QualitySettings = { ...base };
    // Otomatik hafifletmede doku, zemin ve kenar yumuşatma ilk kademede kalır: yeniden yükleme/kurulum olmasın
    if (s.preset === 'auto' && s.detected && tier !== s.detected) {
        const first = settingsFor(s.detected);
        out.textureSize = first.textureSize;
        out.terrainSegments = first.terrainSegments;
        out.antialias = first.antialias;
    }
    if (o.treeFraction !== undefined) out.treeFraction = o.treeFraction;
    if (o.wind !== undefined) out.wind = o.wind;
    if (o.clouds !== undefined) out.clouds = o.clouds;
    if (o.waterAnimation !== undefined) out.waterAnimation = o.waterAnimation;
    if (o.dragon !== undefined) out.dragon = o.dragon;
    if (o.resolution === 'low') out.maxDpr = 1;
    if (o.resolution === 'sharp') out.maxDpr = 3;
    // Rüzgâr, su ve ejderha her kareyi çizmeyi gerektirir; hepsi kapalıysa yalnızca değişince çizilir
    out.frameloop = out.wind || out.waterAnimation || out.dragon ? 'always' : 'demand';
    return out;
}
