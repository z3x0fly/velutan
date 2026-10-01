'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Image as ImageIcon, MapPin, Plus, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import CoordinatePicker from '@/components/map/CoordinatePicker';
import PanoramaManager from './PanoramaManager';
import { api, errorMessage, MAP_HEIGHT, MAP_WIDTH, mediaUrl, Region, REGION_TYPES, slugify, uploadImage } from '@/lib/api';

interface Props {
    regionId: number | 'new';
    regions: Region[];
    onSaved: (id: number) => void;
    onRefresh: () => void;
}

const input = 'w-full bg-[#050505] border border-[#a89361]/20 rounded-md p-4 text-[#e0d8c3] focus:border-[#a89361]/60 outline-none transition-all placeholder:text-[#a89361]/20 text-sm';
const label = 'text-[10px] font-bold text-[#a89361]/40 uppercase tracking-wider ml-1';
const card = 'space-y-6 bg-[#0a0a0a]/40 p-8 rounded-lg border border-[#a89361]/5 backdrop-blur-sm';

const EMPTY: Partial<Region> = { name: '', slug: '', description: '', lore: '', x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2, image: '', type: 'city' };

export default function RegionEditor({ regionId, regions, onSaved, onRefresh }: Props) {
    const isNew = regionId === 'new';
    const region = isNew ? undefined : regions.find((r) => r.id === regionId);
    const [form, setForm] = useState<Partial<Region>>(EMPTY);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [slugTouched, setSlugTouched] = useState(false);
    const [saving, setSaving] = useState(false);
    const loreRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        setForm(region ? { ...region, type: region.type || 'city' } : EMPTY);
        setCoverFile(null);
        setSlugTouched(!isNew);
    }, [regionId]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (patch: Partial<Region>) => setForm((f) => ({ ...f, ...patch }));

    /** Lore'a, imlecin olduğu yere görsel satırı ekler: ![başlık](adres) */
    const insertLoreImage = async (file: File) => {
        const caption = prompt('Görsel başlığı (örn. karakter adı):', file.name.replace(/\.[^.]+$/, '')) ?? '';
        try {
            const url = await uploadImage(file, 'image');
            const el = loreRef.current;
            const lore = form.lore ?? '';
            const at = el ? el.selectionStart : lore.length;
            const line = `\n![${caption.replace(/[\[\]]/g, '')}](${url})\n`;
            set({ lore: lore.slice(0, at) + line + lore.slice(at) });
            toast.success('Görsel lore metnine eklendi');
        } catch (err) {
            toast.error(errorMessage(err, 'Görsel yüklenemedi'));
        }
    };

    const save = async () => {
        if (!form.name?.trim()) return toast.error('İsim zorunlu');
        setSaving(true);
        try {
            let image = form.image || '';
            if (coverFile) image = await uploadImage(coverFile, 'image');
            const payload = {
                name: form.name,
                slug: form.slug || slugify(form.name),
                description: form.description ?? '',
                lore: form.lore ?? '',
                image,
                type: form.type ?? 'city',
                x: Math.round(Number(form.x) || 0),
                y: Math.round(Number(form.y) || 0),
            };
            if (isNew) {
                const res = await api.post<Region>('/regions/', payload);
                toast.success('Yeni keşif haritaya eklendi', { icon: '🗺️' });
                onSaved(res.data.id);
            } else {
                await api.put(`/regions/${regionId}`, payload);
                toast.success('Kayıt güncellendi', { icon: '📜' });
                onRefresh();
            }
            setCoverFile(null);
        } catch (err) {
            toast.error(errorMessage(err, 'Kayıt başarısız'));
        } finally {
            setSaving(false);
        }
    };

    const coverPreview = coverFile ? URL.createObjectURL(coverFile) : mediaUrl(form.image);

    return (
        <div className="max-w-7xl mx-auto w-full">
            <div className="flex flex-wrap gap-4 justify-between items-start mb-12">
                <div>
                    <div className="text-[10px] font-mono text-[#a89361]/40 mb-2 tracking-widest uppercase">Kayıt: {isNew ? 'YENİ' : regionId}</div>
                    <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#e0d8c3] uppercase tracking-[0.2em]">{isNew ? 'Yeni Keşif' : form.name}</h2>
                </div>
                <button onClick={save} disabled={saving} className="bg-[#a89361] hover:bg-[#c2aa72] text-[#050505] px-10 py-3 rounded-md font-bold uppercase tracking-widest disabled:opacity-50">
                    {saving ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}
                </button>
            </div>

            <div className="grid grid-cols-12 gap-10">
                <div className="col-span-12 lg:col-span-5 space-y-10">
                    <div className={card}>
                        <h3 className="text-[11px] font-bold text-[#a89361]/60 uppercase tracking-[0.3em] mb-4">Temel Bilgiler</h3>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className={label}>İsim</label>
                                <input
                                    className={input}
                                    placeholder="Bölge ismi"
                                    value={form.name || ''}
                                    onChange={(e) => set({ name: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className={label}>Kısa Kod (Slug)</label>
                                <input
                                    className={`${input} font-mono`}
                                    placeholder="bolge-kodu"
                                    value={form.slug || ''}
                                    onChange={(e) => {
                                        setSlugTouched(true);
                                        set({ slug: e.target.value });
                                    }}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className={label}>Bölge Tipi</label>
                            <select className={`${input} appearance-none`} value={form.type || 'city'} onChange={(e) => set({ type: e.target.value })}>
                                {REGION_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>
                                        {t.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className={label}>Kısa Açıklama</label>
                            <input className={input} placeholder="Tek cümlelik özet…" value={form.description || ''} onChange={(e) => set({ description: e.target.value })} />
                        </div>
                    </div>

                    <div className={card}>
                        <div className="flex justify-between items-center">
                            <h3 className="text-[11px] font-bold text-[#a89361]/60 uppercase tracking-[0.3em]">Hikaye & Detaylar</h3>
                            <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-[#a89361]/20 rounded text-[10px] font-bold uppercase tracking-widest text-[#a89361] cursor-pointer hover:bg-[#a89361]/5">
                                <ImagePlus size={12} /> Görsel ekle
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/gif"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) insertLoreImage(f);
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                        </div>
                        <textarea
                            ref={loreRef}
                            className={`${input} h-72 resize-y custom-scrollbar leading-relaxed`}
                            placeholder="Kronikleri girin…"
                            value={form.lore || ''}
                            onChange={(e) => set({ lore: e.target.value })}
                        />
                        <p className="text-[10px] text-[#a89361]/40 italic">
                            Kendi satırındaki <code>![Başlık](adres)</code> haritada görsel olarak gösterilir; art arda gelenler galeri olur.
                        </p>
                    </div>

                    <div className={card}>
                        <h3 className="text-[11px] font-bold text-[#a89361]/60 uppercase tracking-[0.3em]">Kapak Görseli</h3>
                        <div className="flex items-center gap-8">
                            <div className="relative w-28 h-28 bg-[#050505] rounded-lg border border-[#a89361]/10 flex items-center justify-center overflow-hidden group">
                                {coverPreview ? (
                                    <img src={coverPreview} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-[#a89361]/20">
                                        <ImageIcon size={24} />
                                        <span className="text-[8px] font-bold uppercase tracking-widest">Resim yok</span>
                                    </div>
                                )}
                                {coverPreview && (
                                    <button
                                        onClick={() => {
                                            setCoverFile(null);
                                            set({ image: '' });
                                        }}
                                        className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-500 transition-all"
                                        aria-label="Kapağı kaldır"
                                    >
                                        <X size={28} />
                                    </button>
                                )}
                            </div>
                            <label className="inline-flex items-center gap-3 px-6 py-2.5 hover:bg-[#a89361]/5 text-[#a89361] text-[10px] font-bold uppercase rounded border border-[#a89361]/20 cursor-pointer tracking-widest">
                                <Plus size={14} /> Görsel seç
                                <input type="file" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" />
                            </label>
                        </div>
                    </div>
                </div>

                <div className="col-span-12 lg:col-span-7 flex flex-col gap-10">
                    <div className="bg-[#0a0a0a]/40 p-8 rounded-lg border border-[#a89361]/5 flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-[11px] font-bold text-[#a89361]/60 uppercase tracking-[0.3em] flex items-center gap-2">
                                <MapPin size={14} /> Konum
                            </h3>
                            <div className="flex gap-6 text-xs font-mono text-[#a89361] bg-[#050505] px-4 py-1.5 rounded-full border border-[#a89361]/10">
                                <span className="text-[#a89361]/30">X:</span> {Math.round(Number(form.x) || 0)}
                                <span className="text-[#a89361]/30">Y:</span> {Math.round(Number(form.y) || 0)}
                            </div>
                        </div>
                        <div className="h-[520px] w-full rounded-lg overflow-hidden border border-[#a89361]/10 bg-[#050505] relative">
                            <CoordinatePicker
                                x={Number(form.x) || MAP_WIDTH / 2}
                                y={Number(form.y) || MAP_HEIGHT / 2}
                                onPick={(x, y) => set({ x, y })}
                                regions={regions}
                            />
                        </div>
                    </div>

                    {region ? (
                        <PanoramaManager regionId={region.id} regionSlug={region.slug} panoramas={region.panoramas ?? []} onChange={onRefresh} />
                    ) : (
                        <p className="text-[11px] text-[#a89361]/40 italic">360° görüntü eklemek için önce bölgeyi kaydedin.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
