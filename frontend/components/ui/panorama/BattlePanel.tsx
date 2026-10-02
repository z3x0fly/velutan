'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown, HelpCircle, ImagePlus, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { BattleState, DEFAULT_GRID, GridSettings, shrinkImage, Token, TOKEN_KINDS, TokenKind } from './battle';

export interface PendingToken {
    name: string;
    kind: TokenKind;
    size: number;
    image?: string;
}

interface Props {
    state: BattleState;
    selectedId: string | null;
    placing: PendingToken | null;
    onSelect: (id: string | null) => void;
    onStartPlacing: (t: PendingToken) => void;
    onCancelPlacing: () => void;
    onRemove: (id: string) => void;
    onClear: () => void;
    onGrid: (patch: Partial<GridSettings>) => void;
    onClose: () => void;
    onHelp: () => void;
}

const Slider = ({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) => (
    <label className="block">
        <span className="flex justify-between text-[11px] text-amber-100/70">
            <span>{label}</span>
            <span className="font-mono text-amber-300">
                {value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
                {unit}
            </span>
        </span>
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-amber-500" />
    </label>
);

/** 360° görünümde savaş ızgarası ve token yönetimi */
export default function BattlePanel({ state, selectedId, placing, onSelect, onStartPlacing, onCancelPlacing, onRemove, onClear, onGrid, onClose, onHelp }: Props) {
    const [kind, setKind] = useState<TokenKind>('oyuncu');
    const [name, setName] = useState('');
    const [size, setSize] = useState(1);
    const [image, setImage] = useState<string | undefined>();
    const [imageError, setImageError] = useState<string | null>(null);
    const [showGrid, setShowGrid] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const count = (k: TokenKind) => state.tokens.filter((t) => t.kind === k).length;
    const start = () => {
        const fallback = `${TOKEN_KINDS[kind].label} ${count(kind) + 1}`;
        onStartPlacing({ name: name.trim() || fallback, kind, size, image });
        setName('');
        setImage(undefined);
    };

    return (
        <div className="w-[min(300px,calc(100vw-24px))] max-h-[calc(100dvh-170px)] overflow-y-auto custom-scrollbar rounded-2xl border-2 border-amber-600/30 bg-[#0d0905]/95 p-3 text-amber-50 shadow-[0_0_40px_rgba(0,0,0,0.8)]">
            <div className="mb-2 flex items-center justify-between">
                <span className="whitespace-nowrap text-[11px] font-black uppercase tracking-[0.2em] text-amber-500">Savaş Izgarası</span>
                <span className="flex items-center gap-1">
                    <button onClick={onHelp} className="flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-600/30 px-2 py-0.5 text-[10px] font-bold text-amber-400 hover:border-amber-400">
                        <HelpCircle size={12} /> Nasıl çalışır?
                    </button>
                    <button onClick={onClose} aria-label="Paneli kapat" className="rounded-full p-1 text-amber-500/70 hover:text-white">
                        <X size={16} />
                    </button>
                </span>
            </div>

            {placing ? (
                <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-center">
                    <div className="text-[13px] font-bold">
                        <span style={{ color: TOKEN_KINDS[placing.kind].color }}>●</span> {placing.name}
                    </div>
                    <div className="mt-1 text-[12px] text-amber-100/70">Zeminde bir kareye tıkla</div>
                    <button onClick={onCancelPlacing} className="mt-2 rounded-full border border-amber-600/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-400 hover:border-amber-400">
                        Vazgeç
                    </button>
                </div>
            ) : (
                <div className="space-y-2 rounded-xl border border-amber-600/20 bg-black/30 p-2.5">
                    <div className="grid grid-cols-4 gap-1">
                        {(Object.keys(TOKEN_KINDS) as TokenKind[]).map((k) => (
                            <button
                                key={k}
                                onClick={() => setKind(k)}
                                className={`rounded-md border px-1 py-1 text-[10px] font-black uppercase tracking-wide transition-colors ${kind === k ? 'border-amber-400 bg-amber-500/15' : 'border-amber-600/20 text-amber-100/60 hover:border-amber-500/50'}`}
                            >
                                <span className="mx-auto mb-0.5 block h-2 w-2 rounded-full" style={{ background: TOKEN_KINDS[k].color }} />
                                {TOKEN_KINDS[k].label}
                            </button>
                        ))}
                    </div>
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && start()}
                        maxLength={24}
                        placeholder={`${TOKEN_KINDS[kind].label} ${count(kind) + 1}`}
                        aria-label="Token adı"
                        className="w-full rounded-md border border-amber-600/30 bg-black/50 px-2 py-1.5 text-[13px] text-amber-50 placeholder:text-amber-100/30 focus:border-amber-400 focus:outline-none"
                    />
                    <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-amber-100/60">Boyut</span>
                        {[1, 2, 3].map((n) => (
                            <button
                                key={n}
                                onClick={() => setSize(n)}
                                className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${size === n ? 'border-amber-400 bg-amber-500/15' : 'border-amber-600/20 text-amber-100/60'}`}
                            >
                                {n}×{n}
                            </button>
                        ))}
                    </div>
                    {/* 2D karakter: arkası şeffaf görsel yüklenirse token ızgarada ayakta durur */}
                    <button
                        onClick={() => fileRef.current?.click()}
                        aria-label="Karakter görseli yükle"
                        className={`flex w-full items-center gap-2 rounded-md border border-dashed px-2 py-1.5 text-left text-[11px] transition-colors ${image ? 'border-amber-400 bg-amber-500/10 text-amber-200' : 'border-amber-600/30 text-amber-100/60 hover:border-amber-500/60'}`}
                    >
                        {image ? (
                            <img src={image} alt="" className="h-9 w-9 shrink-0 object-contain" style={{ background: 'repeating-conic-gradient(#2a2116 0 25%, #1a140c 0 50%) 0 0/10px 10px' }} />
                        ) : (
                            <ImagePlus size={18} className="shrink-0" />
                        )}
                        <span className="min-w-0">
                            <span className="block font-bold">{image ? 'Karakter görseli hazır' : 'Karakter görseli yükle'}</span>
                            <span className="block text-amber-100/40">{imageError ?? 'Arkası şeffaf PNG/WebP · isteğe bağlı'}</span>
                        </span>
                        {image && (
                            <span
                                role="button"
                                aria-label="Görseli kaldır"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setImage(undefined);
                                }}
                                className="ml-auto p-1 text-amber-100/50 hover:text-red-400"
                            >
                                <X size={12} />
                            </span>
                        )}
                    </button>
                    <div className="hidden">
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (!f) return;
                                setImageError(null);
                                try {
                                    setImage(await shrinkImage(f));
                                } catch {
                                    setImageError('Görsel okunamadı');
                                }
                            }}
                        />
                    </div>
                    <button onClick={start} className="flex w-full items-center justify-center gap-1.5 rounded-full bg-amber-600 py-1.5 text-[12px] font-black uppercase tracking-wider text-black hover:bg-amber-500">
                        <Plus size={14} /> Token yerleştir
                    </button>
                </div>
            )}

            {state.tokens.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                    {state.tokens.map((t: Token) => (
                        <li key={t.id} className={`flex items-center gap-2 rounded-md px-2 py-1 ${t.id === selectedId ? 'bg-amber-500/15' : 'hover:bg-white/5'}`}>
                            <button onClick={() => onSelect(t.id === selectedId ? null : t.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TOKEN_KINDS[t.kind].color }} />
                                <span className="truncate text-[12px]">{t.name}</span>
                                {t.size > 1 && <span className="text-[10px] text-amber-100/40">{t.size}×{t.size}</span>}
                            </button>
                            <button onClick={() => onRemove(t.id)} aria-label={`${t.name} kaldır`} className="p-0.5 text-amber-100/40 hover:text-red-400">
                                <Trash2 size={13} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="mt-2 text-[11px] leading-snug text-amber-100/40">Token&apos;ı tutup sürükle; kareye oturur, gidilen mesafe görünür. Seçiliyken Delete ile kaldırılır.</p>

            <button onClick={() => setShowGrid((v) => !v)} className="mt-2 flex w-full items-center gap-1.5 border-t border-amber-600/15 pt-2 text-[11px] font-black uppercase tracking-[0.2em] text-amber-500/80">
                <SlidersHorizontal size={12} /> Izgarayı mekâna oturt
                <ChevronDown size={12} className={`ml-auto transition-transform ${showGrid ? 'rotate-180' : ''}`} />
            </button>
            {showGrid && (
                <div className="mt-2 space-y-2">
                    <Slider label="Kare boyu" value={state.grid.cell} min={0.5} max={3} step={0.1} unit=" m" onChange={(v) => onGrid({ cell: v })} />
                    <Slider label="Zemin derinliği" value={state.grid.height} min={0.5} max={5} step={0.05} unit=" m" onChange={(v) => onGrid({ height: v })} />
                    <Slider label="Açı" value={state.grid.rotation} min={0} max={90} step={1} unit="°" onChange={(v) => onGrid({ rotation: v })} />
                    <Slider label="Görünürlük" value={Math.round(state.grid.opacity * 100)} min={10} max={100} step={5} unit="%" onChange={(v) => onGrid({ opacity: v / 100 })} />
                    <div className="flex gap-2 pt-1">
                        <button onClick={() => onGrid(DEFAULT_GRID)} className="flex-1 rounded-full border border-amber-600/30 py-1 text-[11px] font-bold text-amber-400 hover:border-amber-400">
                            Izgarayı sıfırla
                        </button>
                        {state.tokens.length > 0 && (
                            <button
                                onClick={() => (confirmClear ? (onClear(), setConfirmClear(false)) : setConfirmClear(true))}
                                onBlur={() => setConfirmClear(false)}
                                className="flex-1 rounded-full border border-red-500/30 py-1 text-[11px] font-bold text-red-400 hover:border-red-400"
                            >
                                {confirmClear ? 'Emin misin?' : "Token'ları sil"}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
