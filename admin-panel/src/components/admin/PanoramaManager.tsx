'use client';

import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Compass, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api, errorMessage, mediaUrl, Panorama, slugify, uploadImage } from '@/lib/api';

interface Props {
    regionId: number;
    regionSlug: string;
    panoramas: Panorama[];
    onChange: () => void;
}

const field = 'w-full bg-[#050505] border border-[#a89361]/20 rounded-md p-2.5 text-[#e0d8c3] focus:border-[#a89361]/60 outline-none text-xs';

/** Bölgenin 360° panoramaları: yükle, başlık/açı düzenle, sırala, sil */
export default function PanoramaManager({ regionId, regionSlug, panoramas, onChange }: Props) {
    const [title, setTitle] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [drafts, setDrafts] = useState<Record<number, Partial<Panorama>>>({});

    const add = async () => {
        if (!file || !title.trim()) return toast.error('Başlık ve eşdikdörtgen (2:1) görsel seçin');
        setBusy(true);
        try {
            const image = await uploadImage(file, 'panorama');
            await api.post('/panoramas', {
                region_id: regionId,
                title: title.trim(),
                slug: `${regionSlug}-${slugify(title)}-${Date.now().toString(36)}`,
                image,
            });
            setTitle('');
            setFile(null);
            toast.success('360° görüntü eklendi');
            onChange();
        } catch (err) {
            toast.error(errorMessage(err, 'Panorama eklenemedi'));
        } finally {
            setBusy(false);
        }
    };

    const save = async (p: Panorama) => {
        const d = drafts[p.id];
        if (!d) return;
        try {
            await api.put(`/panoramas/${p.id}`, d);
            setDrafts(({ [p.id]: _, ...rest }) => rest);
            toast.success('Kaydedildi');
            onChange();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const move = async (i: number, dir: -1 | 1) => {
        if (!panoramas[i + dir]) return;
        // Yer değiştir ve 0..n olarak yeniden numarala (eşit sort değerlerinde de doğru çalışır)
        const order = [...panoramas];
        [order[i], order[i + dir]] = [order[i + dir], order[i]];
        try {
            await Promise.all(order.map((p, idx) => (p.sort === idx ? null : api.put(`/panoramas/${p.id}`, { sort: idx }))));
            onChange();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const remove = async (p: Panorama) => {
        if (!confirm(`"${p.title}" 360° görüntüsü silinsin mi?`)) return;
        try {
            await api.delete(`/panoramas/${p.id}`);
            toast.success('Silindi');
            onChange();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    return (
        <div className="space-y-5 bg-[#0a0a0a]/40 p-8 rounded-lg border border-[#a89361]/5">
            <h3 className="text-[11px] font-bold text-[#a89361]/60 uppercase tracking-[0.3em] flex items-center gap-2">
                <Compass size={14} /> 360° Görüntüler ({panoramas.length})
            </h3>

            <div className="space-y-2">
                {panoramas.map((p, i) => {
                    const d = { ...p, ...drafts[p.id] };
                    const dirty = !!drafts[p.id];
                    const set = (patch: Partial<Panorama>) => setDrafts((all) => ({ ...all, [p.id]: { ...all[p.id], ...patch } }));
                    return (
                        <div key={p.id} className="flex items-center gap-3 bg-[#050505] border border-[#a89361]/10 rounded-md p-2">
                            <img src={mediaUrl(p.thumb) ?? mediaUrl(p.image)} alt="" className="w-24 h-12 object-cover rounded shrink-0" loading="lazy" />
                            <input className={field} value={d.title} onChange={(e) => set({ title: e.target.value })} />
                            <label className="flex items-center gap-1 text-[9px] text-[#a89361]/50 shrink-0" title="Açılış yönü (derece)">
                                Yön
                                <input type="number" className={`${field} w-16`} value={d.initial_yaw} onChange={(e) => set({ initial_yaw: Number(e.target.value) })} />
                            </label>
                            {dirty && (
                                <button onClick={() => save(p)} className="text-[10px] font-bold uppercase text-emerald-400 px-2">
                                    Kaydet
                                </button>
                            )}
                            <div className="flex flex-col shrink-0">
                                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-[#a89361]/50 hover:text-[#a89361] disabled:opacity-20" aria-label="Yukarı">
                                    <ArrowUp size={12} />
                                </button>
                                <button onClick={() => move(i, 1)} disabled={i === panoramas.length - 1} className="text-[#a89361]/50 hover:text-[#a89361] disabled:opacity-20" aria-label="Aşağı">
                                    <ArrowDown size={12} />
                                </button>
                            </div>
                            <button onClick={() => remove(p)} className="text-red-900 hover:text-red-500 shrink-0" aria-label="Sil">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-[#a89361]/10 pt-4">
                <input className={`${field} flex-1 min-w-[160px]`} placeholder="Başlık (örn. Avlu)" value={title} onChange={(e) => setTitle(e.target.value)} />
                <label className="inline-flex items-center gap-2 px-4 py-2.5 border border-[#a89361]/20 rounded text-[10px] font-bold uppercase tracking-widest text-[#a89361] cursor-pointer hover:bg-[#a89361]/5">
                    <Upload size={12} /> {file ? file.name.slice(0, 18) : 'Görsel'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </label>
                <button onClick={add} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#a89361] text-[#050505] rounded text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                    <Plus size={12} /> {busy ? 'Yükleniyor…' : 'Ekle'}
                </button>
                <p className="w-full text-[10px] text-[#a89361]/40 italic">
                    Eşdikdörtgen (equirectangular, 2:1) görsel, en fazla 30 MB. Önerilen 4096×2048 WebP/JPG.
                </p>
            </div>
        </div>
    );
}
