/**
 * Zar tıkırtısı: ses dosyası yok, Web Audio ile kısa gürültü patlamaları üretilir.
 * Çarpma hızına göre yüksekliği ve tınısı değişir (tahta masaya vuran reçine zar).
 */
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function ensure() {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.06), ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
}

/** Kullanıcı etkileşimi sırasında çağrılır (tarayıcılar sesi ancak dokunuştan sonra açar) */
export const unlockAudio = () => void ensure();

/** strength: 0..1 */
export function clack(strength: number, kind: 'table' | 'die' = 'table') {
    const ac = ensure();
    if (!ac || !noise || strength < 0.03) return;
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = (kind === 'die' ? 3200 : 1700) + Math.random() * 900;
    band.Q.value = kind === 'die' ? 6 : 3;
    const gain = ac.createGain();
    gain.gain.value = Math.min(0.9, strength) * 0.5;
    src.connect(band).connect(gain).connect(ac.destination);
    src.start();
}
