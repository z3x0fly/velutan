'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, Settings2, X } from 'lucide-react';
import { graphicsStore, GraphicsPreset, ResolutionPref, resolveSettings } from '../map/graphicsStore';
import type { QualityTier } from '../map/terrain/quality';
import { DayCycle, MapTone, themeStore, TreeTheme, useTheme } from '../map/themeStore';

const TREE_THEMES: { id: TreeTheme; label: string; swatch: string }[] = [
    { id: 'dogal', label: 'Doğal', swatch: 'linear-gradient(135deg,#2f6b3a,#6a9a34)' },
    { id: 'gri', label: 'Gri tonlu', swatch: 'linear-gradient(135deg,#111,#888,#eee)' },
    { id: 'sonbahar', label: 'Sonbahar', swatch: 'linear-gradient(135deg,#9c3b22,#d0802a,#e0a33a)' },
    { id: 'kis', label: 'Kış', swatch: 'linear-gradient(135deg,#9fb3b0,#e6eef0)' },
];
const TONES: { id: MapTone; label: string }[] = [
    { id: 'renkli', label: 'Renkli' },
    { id: 'gravur', label: 'Siyah-beyaz' },
    { id: 'sepya', label: 'Sepya' },
];
const DAYS: { id: DayCycle; label: string; desc: string }[] = [
    { id: 'kapali', label: 'Kapalı', desc: 'Hep gündüz. Seyahat simülasyonunda yine de günler geçer.' },
    { id: 'dongu', label: 'Döngü', desc: 'Dört dakikada bir gün: sabah, akşam, gece.' },
    { id: 'saat', label: 'Gerçek saat', desc: 'Senin saatin: gece açarsan Velutan da gecedir.' },
];

const Choice = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
        onClick={onClick}
        aria-pressed={active}
        className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[12px] font-bold transition-colors ${
            active ? 'border-amber-500 bg-amber-600/25 text-amber-200' : 'border-amber-600/20 bg-black/40 text-amber-500/70 hover:border-amber-500/50'
        }`}
    >
        {children}
    </button>
);

const TIER_LABEL: Record<QualityTier, string> = { ultra: 'Ultra', high: 'Yüksek', medium: 'Orta', low: 'Düşük', minimal: 'Asgari' };

const PRESETS: { id: GraphicsPreset; label: string; desc: string }[] = [
    { id: 'auto', label: 'Otomatik', desc: 'Cihazına göre seçilir; takılma olursa kendiliğinden hafifler.' },
    { id: 'minimal', label: 'Asgari', desc: 'Ağaç ve animasyon yok. En zayıf cihazlar için.' },
    { id: 'low', label: 'Düşük', desc: 'Seyrek orman, sabit görüntü; pil ve işlemci dostu.' },
    { id: 'medium', label: 'Orta', desc: 'Ormanın çoğu, rüzgâr, bulutlar ve ejderha.' },
    { id: 'high', label: 'Yüksek', desc: 'Bütün orman ve efektler.' },
    { id: 'ultra', label: 'Ultra', desc: 'İki kat sık zemin, ekranın tam çözünürlüğü. Güçlü ekran kartı ister.' },
];

const RESOLUTIONS: { id: ResolutionPref; label: string }[] = [
    { id: 'low', label: 'Düşük' },
    { id: 'normal', label: 'Normal' },
    { id: 'sharp', label: 'Keskin' },
];

const Toggle = ({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) => (
    <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-amber-500/5"
    >
        <span>
            <span className="block text-[13px] font-bold text-amber-100/90">{label}</span>
            {hint && <span className="block text-[11px] text-amber-100/40">{hint}</span>}
        </span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${on ? 'border-amber-500 bg-amber-600/70' : 'border-amber-600/30 bg-black/60'}`}>
            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${on ? 'left-[18px] bg-amber-100' : 'left-0.5 bg-amber-100/40'}`} />
        </span>
    </button>
);

/** Ayarlar düğmesi + grafik ayarları penceresi */
export default function GraphicsSettings() {
    const [open, setOpen] = useState(false);
    const gfx = useSyncExternalStore(graphicsStore.subscribe, graphicsStore.get, graphicsStore.get);
    const theme = useTheme();
    const current = resolveSettings(gfx);
    const custom = Object.keys(gfx.overrides).length > 0;

    // Ağaç yoğunluğu: sürüklerken yalnızca etiket değişir, bırakınca orman yeniden kurulur
    const [trees, setTrees] = useState<number | null>(null);
    const commitTimer = useRef<ReturnType<typeof setTimeout>>();
    const treeValue = trees ?? Math.round((current?.treeFraction ?? 1) * 100);
    const onTrees = (v: number) => {
        setTrees(v);
        clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => {
            graphicsStore.setOverride('treeFraction', v / 100);
            setTrees(null);
        }, 350);
    };

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const activePreset = PRESETS.find((p) => p.id === gfx.preset) ?? PRESETS[0];
    const autoTier = gfx.autoTier ?? gfx.detected;
    const resolution: ResolutionPref = gfx.overrides.resolution ?? 'normal';

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                aria-label="Ayarlar"
                title="Ayarlar: grafik ve tema"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-600/30 bg-black/70 text-amber-500/80 transition-colors hover:border-amber-500 hover:text-amber-400"
            >
                <Settings2 size={16} />
            </button>

            {open &&
                createPortal(
                    <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/70 p-3 md:p-10" onClick={() => setOpen(false)}>
                        <section
                            className="relative max-h-[88dvh] w-full max-w-md overflow-y-auto custom-scrollbar rounded-2xl border-2 border-amber-600/30 bg-[#120c06] p-5 shadow-[0_0_100px_rgba(0,0,0,1)] md:p-7"
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-label="Grafik ve tema ayarları"
                        >
                            <button onClick={() => setOpen(false)} aria-label="Kapat" className="absolute right-4 top-4 text-amber-500 hover:text-white">
                                <X size={22} />
                            </button>
                            <div className="mb-1 text-[11px] font-black uppercase tracking-[0.35em] text-amber-500/60">Ayarlar</div>
                            <h2 className="mb-5 border-b border-amber-600/20 pb-3 pr-8 font-serif text-2xl font-black text-amber-400">Grafik</h2>

                            <div className="mb-2 flex items-center justify-between">
                                <span className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-500/70">Kalite</span>
                                {custom && (
                                    <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-400">Özel</span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {PRESETS.map((p) => {
                                    const active = gfx.preset === p.id && (!custom || p.id !== 'auto');
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => graphicsStore.setPreset(p.id)}
                                            className={`rounded-lg border px-2 py-2 text-[12px] font-black uppercase tracking-wider transition-colors ${
                                                active ? 'border-amber-500 bg-amber-600/25 text-amber-200' : 'border-amber-600/20 bg-black/40 text-amber-500/70 hover:border-amber-500/50'
                                            }`}
                                        >
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-2 min-h-[34px] text-[12px] italic leading-snug text-amber-100/50">
                                {activePreset.desc}
                                {gfx.preset === 'auto' && autoTier && <> Şu an: <b className="not-italic text-amber-300/80">{TIER_LABEL[autoTier]}</b>.</>}
                            </p>

                            <div className="mt-4 mb-1 text-[11px] font-black uppercase tracking-[0.25em] text-amber-500/70">İnce ayar</div>
                            <div className="-mx-3">
                                <div className="px-3 py-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[13px] font-bold text-amber-100/90">Ağaç yoğunluğu</span>
                                        <span className="font-mono text-[12px] text-amber-300">%{treeValue}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={10}
                                        value={treeValue}
                                        onChange={(e) => onTrees(Number(e.target.value))}
                                        aria-label="Ağaç yoğunluğu"
                                        className="mt-2 w-full accent-amber-500"
                                    />
                                </div>
                                <Toggle label="Rüzgârda salınan ağaçlar" on={!!current?.wind} onChange={(v) => graphicsStore.setOverride('wind', v)} />
                                <Toggle label="Bulutlar" on={!!current?.clouds} onChange={(v) => graphicsStore.setOverride('clouds', v)} />
                                <Toggle label="Su dalgaları" on={!!current?.waterAnimation} onChange={(v) => graphicsStore.setOverride('waterAnimation', v)} />
                                <Toggle label="Ejderha" hint="Haritayı tavaf eden ejderha ve gölgesi" on={!!current?.dragon} onChange={(v) => graphicsStore.setOverride('dragon', v)} />
                                <div className="px-3 py-2.5">
                                    <span className="block text-[13px] font-bold text-amber-100/90">Çözünürlük</span>
                                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                                        {RESOLUTIONS.map((r) => (
                                            <button
                                                key={r.id}
                                                onClick={() => graphicsStore.setOverride('resolution', r.id)}
                                                className={`rounded-lg border px-2 py-1.5 text-[12px] font-bold transition-colors ${
                                                    resolution === r.id ? 'border-amber-500 bg-amber-600/25 text-amber-200' : 'border-amber-600/20 bg-black/40 text-amber-500/70 hover:border-amber-500/50'
                                                }`}
                                            >
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 mb-1 text-[11px] font-black uppercase tracking-[0.25em] text-amber-500/70">Tema</div>
                            <div className="space-y-3">
                                <div>
                                    <span className="block text-[13px] font-bold text-amber-100/90">Ağaç renkleri</span>
                                    <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                        {TREE_THEMES.map((t) => (
                                            <Choice key={t.id} active={theme.trees === t.id} onClick={() => themeStore.set({ trees: t.id })}>
                                                <span className="h-3 w-3 shrink-0 rounded-full border border-white/20" style={{ background: t.swatch }} /> {t.label}
                                            </Choice>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <span className="block text-[13px] font-bold text-amber-100/90">Harita tonu</span>
                                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                                        {TONES.map((t) => (
                                            <Choice key={t.id} active={theme.tone === t.id} onClick={() => themeStore.set({ tone: t.id })}>
                                                {t.label}
                                            </Choice>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <span className="block text-[13px] font-bold text-amber-100/90">Gece ve gündüz</span>
                                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                                        {DAYS.map((t) => (
                                            <Choice key={t.id} active={theme.day === t.id} onClick={() => themeStore.set({ day: t.id })}>
                                                {t.label}
                                            </Choice>
                                        ))}
                                    </div>
                                    <p className="mt-1.5 text-[12px] italic text-amber-100/50">{DAYS.find((x) => x.id === theme.day)?.desc}</p>
                                </div>
                            </div>

                            <div className="mt-5 flex items-center justify-between gap-3 border-t border-amber-600/15 pt-4">
                                <span className="text-[11px] leading-snug text-amber-100/40">Seçimin bu tarayıcıda saklanır. Takılma olursa Otomatik'e dön.</span>
                                <button
                                    onClick={() => graphicsStore.reset()}
                                    disabled={gfx.preset === 'auto' && !custom}
                                    className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-600/30 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-amber-500/80 transition-colors hover:border-amber-500 disabled:opacity-30"
                                >
                                    <RotateCcw size={12} /> Varsayılan
                                </button>
                            </div>
                        </section>
                    </div>,
                    document.body,
                )}
        </>
    );
}
