'use client';

import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api, errorMessage } from '@/lib/api';

interface Summary {
    entries: number;
    newEntries: string[];
    newRegions: string[];
    movedRegions: string[];
    newPanoramas: string[];
    updatedPanoramas: string[];
    errors: string[];
    transformError: number | null;
    ms: number;
}
interface State {
    running: boolean;
    counts: { kayit: number; bolge: number; panorama: number };
    log: { id: number; at: string; ok: number; summary: Summary }[];
}

const SITE = 'https://velutan.com.tr';
const fmt = (iso: string) => new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });

const List = ({ title, items, href }: { title: string; items: string[]; href: (s: string) => string }) =>
    items.length ? (
        <div className="mt-2">
            <span className="text-[10px] uppercase tracking-widest text-[#a89361]/60">{title}</span>
            <div className="mt-1 flex flex-wrap gap-1">
                {items.map((s) => (
                    <a key={s} href={href(s)} target="_blank" rel="noopener noreferrer" className="rounded border border-[#a89361]/30 px-2 py-0.5 text-xs text-[#e0d8c3] hover:border-[#a89361]">
                        {s}
                    </a>
                ))}
            </div>
        </div>
    ) : null;

/** velutanmap.com senkronu: durum, geçmiş, elle başlat */
export default function SyncTab({ isAdmin }: { isAdmin: boolean }) {
    const [state, setState] = useState<State | null>(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try {
            setState((await api.get<State>('/senkron')).data);
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };
    useEffect(() => {
        void load();
    }, []);

    const run = async () => {
        setBusy(true);
        const id = toast.loading('velutanmap.com taranıyor (1-2 dakika)…');
        try {
            const s = (await api.post<Summary>('/senkron', {}, { timeout: 15 * 60_000 })).data;
            toast.success(`${s.entries} kayıt · yeni yer ${s.newRegions.length} · yeni 360 ${s.newPanoramas.length}`, { id });
            await load();
        } catch (err) {
            toast.error(errorMessage(err), { id });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="max-w-3xl space-y-8">
            <header>
                <h2 className="font-serif text-3xl text-[#a89361]">velutanmap.com senkronu</h2>
                <p className="mt-2 text-sm text-[#e0d8c3]/60">
                    INTCH'in izniyle: oradaki yeni yerler, 360° mekânlar ve wiki kayıtları her 6 saatte bir kendiliğinden gelir. Yeni yerler haritaya, kayıtlar
                    kendi sayfalarına (Google'da çıkar) eklenir; orada taşınan yer burada da taşınır. Bizim editörlerin düzenlemeleri ezilmez.
                </p>
            </header>

            {state && (
                <div className="grid grid-cols-3 gap-3">
                    {[
                        ['Wiki kaydı', state.counts.kayit],
                        ['Oradan gelen yer', state.counts.bolge],
                        ['Oradan gelen 360°', state.counts.panorama],
                    ].map(([l, n]) => (
                        <div key={l} className="rounded-lg border border-[#a89361]/20 bg-[#0a0a0a] p-4">
                            <div className="font-serif text-3xl text-[#a89361]">{n}</div>
                            <div className="text-[10px] uppercase tracking-widest text-[#a89361]/50">{l}</div>
                        </div>
                    ))}
                </div>
            )}

            {isAdmin && (
                <button
                    onClick={run}
                    disabled={busy || state?.running}
                    className="flex items-center gap-2 rounded border border-[#a89361] bg-[#a89361]/10 px-5 py-3 text-xs font-bold uppercase tracking-widest text-[#a89361] hover:bg-[#a89361]/20 disabled:opacity-40"
                >
                    <RefreshCw size={14} className={busy || state?.running ? 'animate-spin' : ''} /> {busy || state?.running ? 'Senkronlanıyor…' : 'Şimdi senkronla'}
                </button>
            )}

            <section>
                <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">Geçmiş</h3>
                {!state?.log.length && <p className="text-sm italic text-[#e0d8c3]/40">Henüz senkron yapılmadı (açılıştan 1 dakika sonra ilk tur başlar).</p>}
                <ul className="space-y-3">
                    {state?.log.map((r) => (
                        <li key={r.id} className={`rounded-lg border p-4 ${r.ok ? 'border-[#a89361]/20' : 'border-red-500/40'} bg-[#0a0a0a]`}>
                            <div className="flex items-center justify-between text-sm">
                                <span className="font-bold text-[#e0d8c3]">{fmt(r.at)}</span>
                                <span className="text-xs text-[#a89361]/60">
                                    {r.summary.entries} kayıt · {(r.summary.ms / 1000).toFixed(0)} sn{r.summary.transformError != null ? ` · harita uyumu ±${r.summary.transformError} px` : ''}
                                </span>
                            </div>
                            <List title="Yeni yer" items={r.summary.newRegions} href={(s) => `${SITE}/bolge/${s}`} />
                            <List title="Taşınan yer" items={r.summary.movedRegions} href={(s) => `${SITE}/bolge/${s}`} />
                            <List title="Yeni 360°" items={r.summary.newPanoramas} href={(s) => `${SITE}/kayit/${s}`} />
                            <List title="Yenilenen 360°" items={r.summary.updatedPanoramas} href={(s) => `${SITE}/kayit/${s}`} />
                            <List title="Yeni wiki kaydı" items={r.summary.newEntries} href={(s) => `${SITE}/kayit/${s}`} />
                            {r.summary.errors.length > 0 && (
                                <ul className="mt-2 list-disc pl-5 text-xs text-red-300">
                                    {r.summary.errors.slice(0, 8).map((e, i) => (
                                        <li key={i}>{e}</li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    );
}
