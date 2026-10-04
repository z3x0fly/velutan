/**
 * Mevsim (Ayarlar > Tema > ağaçlar: Sonbahar / Kış bütün haritayı değiştirir).
 * Shader'lar bu ortak uniform'ları okur: değişince yeniden derleme olmaz, geçiş yumuşak olur.
 *  uAutumn: 0..1 sonbahar (çayırlar altın-kızıl)
 *  uWinter: 0..1 kış (karla örtülü arazi, buzlu kıyılar)
 */
export const seasonUniforms = {
    uAutumn: { value: 0 },
    uWinter: { value: 0 },
};
