'use client';

import React, { useEffect, useState } from 'react';
import { Bug, Lightbulb, MessageSquare, Sparkles, Trash2, Vote } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api, errorMessage } from '@/lib/api';

interface Item {
    id: number;
    at: string;
    kind: string;
    text: string | null;
    name: string | null;
    contact: string | null;
    poll: string | null;
    vote: string | null;
    page: string | null;
    status: string;
    note: string | null;
}
interface PollResult {
    title: string;
    total: number;
    options: Record<string, { label: string; count: number }>;
}

const KIND: Record<string, { label: string; icon: React.ElementType; tone: string }> = {
    oneri: { label: 'Öneri', icon: Lightbulb, tone: 'text-amber-300' },
    hata: { label: 'Hata', icon: Bug, tone: 'text-red-300' },
    istek: { label: 'İstek', icon: Sparkles, tone: 'text-sky-300' },
    diger: { label: 'Diğer', icon: MessageSquare, tone: 'text-[#e0d8c3]' },
    oy: { label: 'Oy', icon: Vote, tone: 'text-green-300' },
};
const STATUS: Record<string, string> = { yeni: 'Yeni', okundu: 'Okundu', yapildi: 'Yapıldı', reddedildi: 'Reddedildi' };
const fmt = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

/** Geri bildirimler: topluluğun önerileri, hata bildirimleri, istekleri ve oylama sonuçları */
export default function FeedbackTab({ isAdmin }: { isAdmin: boolean }) {
    const [items, setItems] = useState<Item[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [polls, setPolls] = useState<Record<string, PollResult>>({});
    const [filter, setFilter] = useState<string>('yeni');
    const [kind, setKind] = useState<string>('hepsi');

    const load = async () => {
        try {
            const r = await api.get<{ items: Item[]; counts: { status: string; n: number }[] }>('/geri-bildirim', { params: filter === 'hepsi' ? {} : { durum: filter } });
            setItems(r.data.items);
            setCounts(Object.fromEntries(r.data.counts.map((c) => [c.status, c.n])));
            setPolls((await api.get<Record<string, PollResult>>('/geri-bildirim/oylar')).data);
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };
    useEffect(() => {
        void load();
    }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

    const setStatus = async (id: number, status: string) => {
        try {
            await api.put(`/geri-bildirim/${id}`, { status });
            void load();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };
    const saveNote = async (id: number, note: string) => {
        try {
            await api.put(`/geri-bildirim/${id}`, { note });
            toast.success('Not kaydedildi');
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };
    const remove = async (id: number) => {
        try {
            await api.delete(`/geri-bildirim/${id}`);
            void load();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const shown = items.filter((i) => kind === 'hepsi' || i.kind === kind);

    return (
        <div className="max-w-4xl space-y-8">
            <header>
                <h2 className="font-serif text-3xl text-[#a89361]">Geri bildirim</h2>
                <p className="mt-2 text-sm text-[#e0d8c3]/60">Ziyaretçilerin önerileri, hata bildirimleri, istekleri ve topluluk oylamaları. Botlar kaydedilmez (Bekçi + tuzak alanı).</p>
            </header>

            {Object.entries(polls).map(([key, p]) => (
                <section key={key} className="rounded-xl border border-[#a89361]/25 bg-[#0a0a0a] p-5">
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="flex items-center gap-2 font-serif text-xl text-[#a89361]">
                            <Vote size={18} /> {p.title}
                        </h3>
                        <span className="text-xs text-[#e0d8c3]/50">{p.total} oy</span>
                    </div>
                    {Object.entries(p.options).map(([k, o]) => {
                        const pct = p.total ? Math.round((o.count / p.total) * 100) : 0;
                        return (
                            <div key={k} className="mb-2">
                                <div className="flex justify-between text-sm">
                                    <span>{o.label}</span>
                                    <span className="font-bold text-[#a89361]">
                                        %{pct} · {o.count}
                                    </span>
                                </div>
                                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black">
                                    <div className="h-full rounded-full bg-[#a89361]" style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </section>
            ))}

            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
                {['yeni', 'okundu', 'yapildi', 'reddedildi', 'hepsi'].map((s) => (
                    <button key={s} onClick={() => setFilter(s)} className={`rounded px-3 py-1.5 ${filter === s ? 'bg-[#a89361]/20 text-[#a89361]' : 'text-[#a89361]/40 hover:text-[#a89361]'}`}>
                        {STATUS[s] ?? 'Hepsi'} {s !== 'hepsi' && counts[s] ? `(${counts[s]})` : ''}
                    </button>
                ))}
                <span className="mx-2 h-4 w-px bg-[#a89361]/20" />
                {['hepsi', 'oneri', 'hata', 'istek', 'diger', 'oy'].map((k) => (
                    <button key={k} onClick={() => setKind(k)} className={`rounded px-2.5 py-1.5 ${kind === k ? 'bg-[#a89361]/20 text-[#a89361]' : 'text-[#a89361]/40 hover:text-[#a89361]'}`}>
                        {KIND[k]?.label ?? 'Tümü'}
                    </button>
                ))}
            </div>

            {!shown.length && <p className="text-sm italic text-[#e0d8c3]/40">Burada bir şey yok.</p>}
            <ul className="space-y-3">
                {shown.map((i) => {
                    const K = KIND[i.kind] ?? KIND.diger;
                    return (
                        <li key={i.id} className="rounded-lg border border-[#a89361]/15 bg-[#0a0a0a] p-4">
                            <div className="flex items-center gap-2 text-xs">
                                <K.icon size={14} className={K.tone} />
                                <span className={`font-bold ${K.tone}`}>{K.label}</span>
                                {i.vote && <span className="rounded bg-green-900/40 px-2 py-0.5 text-green-200">{i.poll}: {i.vote}</span>}
                                <span className="text-[#e0d8c3]/40">{fmt(i.at)}</span>
                                {i.name && <span className="text-[#e0d8c3]/70">· {i.name}</span>}
                                {i.contact && <span className="text-[#a89361]">· {i.contact}</span>}
                                <span className="ml-auto text-[#e0d8c3]/30">{i.page}</span>
                            </div>
                            {i.text && <p className="mt-2 whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-[#e0d8c3]">{i.text}</p>}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                {Object.entries(STATUS).map(([s, l]) => (
                                    <button
                                        key={s}
                                        onClick={() => setStatus(i.id, s)}
                                        className={`rounded border px-2 py-0.5 text-[11px] ${i.status === s ? 'border-[#a89361] bg-[#a89361]/20 text-[#a89361]' : 'border-[#a89361]/15 text-[#a89361]/50 hover:border-[#a89361]/50'}`}
                                    >
                                        {l}
                                    </button>
                                ))}
                                <input
                                    defaultValue={i.note ?? ''}
                                    onBlur={(e) => e.target.value !== (i.note ?? '') && saveNote(i.id, e.target.value)}
                                    placeholder="Not (ekip için)"
                                    className="min-w-[160px] flex-1 rounded border border-[#a89361]/15 bg-black px-2 py-1 text-xs outline-none focus:border-[#a89361]/50"
                                />
                                {isAdmin && (
                                    <button onClick={() => remove(i.id)} title="Sil" className="text-red-400/50 hover:text-red-400">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
