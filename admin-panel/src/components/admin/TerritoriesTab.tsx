'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Hexagon, Plus, Save, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api, errorMessage, Region, Territory, TERRITORY_KINDS } from '@/lib/api';
import type { Pt } from '@/components/map/TerritoryCanvas';

const TerritoryCanvas = dynamic(() => import('@/components/map/TerritoryCanvas'), { ssr: false });

const SWATCHES = ['#c9a24d', '#8b2e2e', '#2e5a8b', '#3d6b3a', '#6b3d7a', '#a0602a', '#4a4a4a', '#b8b0a0'];

interface Draft {
    id: number | null;
    name: string;
    kind: string;
    color: string;
    note: string;
    region_id: number | null;
    points: Pt[];
}

const EMPTY: Draft = { id: null, name: '', kind: 'kingdom', color: SWATCHES[0], note: '', region_id: null, points: [] };

/** Sınırlar: krallık ve bölge alanlarını harita üzerinde çokgen olarak çizme. */
export default function TerritoriesTab({ regions }: { regions: Region[] }) {
    const [list, setList] = useState<Territory[]>([]);
    const [draft, setDraft] = useState<Draft>(EMPTY);
    const [history, setHistory] = useState<Pt[][]>([]);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            setList((await api.get<Territory[]>('/territories')).data);
        } catch (err) {
            toast.error(errorMessage(err, 'Sınırlar alınamadı'));
        }
    }, []);
    useEffect(() => {
        load();
    }, [load]);

    const select = (t: Territory | null) => {
        setHistory([]);
        setDraft(t ? { id: t.id, name: t.name, kind: t.kind, color: t.color, note: t.note ?? '', region_id: t.region_id, points: t.points } : EMPTY);
    };

    const pointsRef = useRef(draft.points);
    pointsRef.current = draft.points;
    const setPoints = useCallback((points: Pt[]) => {
        const prev = pointsRef.current;
        setHistory((h) => [...h.slice(-49), prev]);
        setDraft((d) => ({ ...d, points }));
    }, []);

    const undo = () => {
        const prev = history[history.length - 1];
        if (!prev) return;
        setHistory((h) => h.slice(0, -1));
        setDraft((d) => ({ ...d, points: prev }));
    };

    const save = async () => {
        if (!draft.name.trim()) return toast.error('Sınıra bir ad verin');
        if (draft.points.length < 3) return toast.error('En az 3 köşe çizin');
        setSaving(true);
        try {
            const body = { name: draft.name, kind: draft.kind, color: draft.color, note: draft.note, region_id: draft.region_id, points: draft.points };
            const res = draft.id ? await api.put<Territory>(`/territories/${draft.id}`, body) : await api.post<Territory>('/territories', body);
            toast.success(draft.id ? 'Sınır güncellendi' : 'Sınır haritaya işlendi');
            await load();
            select(res.data);
        } catch (err) {
            toast.error(errorMessage(err, 'Kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!draft.id || !confirm(`"${draft.name}" sınırı silinsin mi?`)) return;
        try {
            await api.delete(`/territories/${draft.id}`);
            toast.success('Sınır silindi');
            select(null);
            load();
        } catch (err) {
            toast.error(errorMessage(err, 'Silinemedi'));
        }
    };

    const field = 'w-full bg-[#050505] border border-[#a89361]/20 rounded p-2.5 text-sm text-[#e0d8c3] focus:border-[#a89361]/60 outline-none';
    const label = 'block text-[10px] uppercase tracking-widest text-[#a89361]/60 mb-1.5';

    return (
        <div className="flex gap-6 h-full min-h-[600px]">
            <div className="w-72 shrink-0 flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1">
                <button
                    onClick={() => select(null)}
                    className={`w-full p-3 rounded-md flex items-center justify-center gap-2 border ${draft.id === null ? 'bg-[#a89361]/10 border-[#a89361] text-[#a89361]' : 'border-dashed border-[#a89361]/20 text-[#a89361]/60 hover:border-[#a89361]/40'}`}
                >
                    <Plus size={14} /> <span className="text-[11px] font-bold uppercase">Yeni Sınır</span>
                </button>
                <div className="space-y-1">
                    {list.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => select(t)}
                            className={`w-full text-left p-2.5 rounded-md flex items-center gap-2.5 border ${draft.id === t.id ? 'bg-[#121212] border-[#a89361]/40' : 'border-transparent hover:bg-[#a89361]/5'}`}
                        >
                            <span className="w-3 h-3 rounded-sm shrink-0 border border-black/40" style={{ background: t.color }} />
                            <span className="text-sm font-serif truncate">{t.name}</span>
                            <span className="ml-auto text-[9px] text-[#a89361]/40">{t.points.length} köşe</span>
                        </button>
                    ))}
                    {list.length === 0 && <p className="text-[11px] text-[#a89361]/40 px-1">Henüz sınır çizilmedi.</p>}
                </div>

                <div className="border-t border-[#a89361]/10 pt-4 space-y-3">
                    <div>
                        <label className={label}>Ad</label>
                        <input className={field} value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="ör. Mirvan Krallığı" />
                    </div>
                    <div>
                        <label className={label}>Tür</label>
                        <select className={field} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                            {TERRITORY_KINDS.map((k) => (
                                <option key={k.value} value={k.value}>
                                    {k.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={label}>Renk</label>
                        <div className="flex flex-wrap gap-1.5 items-center">
                            {SWATCHES.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setDraft({ ...draft, color: c })}
                                    className={`w-6 h-6 rounded-sm border-2 ${draft.color === c ? 'border-white' : 'border-transparent'}`}
                                    style={{ background: c }}
                                    aria-label={c}
                                />
                            ))}
                            <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="w-7 h-7 bg-transparent cursor-pointer" />
                        </div>
                    </div>
                    <div>
                        <label className={label}>Bağlı bölge (isteğe bağlı)</label>
                        <select className={field} value={draft.region_id ?? ''} onChange={(e) => setDraft({ ...draft, region_id: e.target.value ? Number(e.target.value) : null })}>
                            <option value="">—</option>
                            {regions.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={label}>Kısa not</label>
                        <textarea className={`${field} h-20 resize-none`} maxLength={2000} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Haritada sınırın üzerine gelince görünür" />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={save} disabled={saving} className="flex-1 bg-[#a89361] hover:bg-[#c2aa72] disabled:opacity-50 text-[#050505] py-2.5 rounded font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                            <Save size={14} /> Kaydet
                        </button>
                        <button onClick={undo} disabled={!history.length} className="px-3 border border-[#a89361]/30 rounded text-[#a89361] disabled:opacity-30" title="Geri al">
                            <Undo2 size={14} />
                        </button>
                        {draft.id && (
                            <button onClick={remove} className="px-3 border border-red-900/40 rounded text-red-500/70 hover:text-red-500" title="Sil">
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                    <button onClick={() => setPoints([])} disabled={!draft.points.length} className="w-full text-[10px] uppercase tracking-widest text-[#a89361]/50 hover:text-[#a89361] disabled:opacity-30">
                        Köşeleri temizle
                    </button>
                </div>
            </div>

            <div className="flex-1 rounded-lg overflow-hidden border border-[#a89361]/20 relative">
                <TerritoryCanvas territories={list} editingId={draft.id} points={draft.points} color={draft.color} onChange={setPoints} />
                <div className="absolute top-2 left-2 bg-black/75 text-[#a89361] text-[11px] px-2.5 py-1.5 rounded flex items-center gap-2 pointer-events-none">
                    <Hexagon size={12} /> {draft.id ? `Düzenleniyor: ${draft.name}` : 'Yeni sınır'} · {draft.points.length} köşe
                </div>
            </div>
        </div>
    );
}
