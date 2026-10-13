'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bug, Check, Globe2, Lightbulb, MessageSquarePlus, Sparkles, Vote, X } from 'lucide-react';
import { API_URL } from '../map/media';
import { themeStore, useTheme } from '../map/themeStore';

type Tab = 'yaz' | 'oy';
type Kind = 'oneri' | 'hata' | 'istek' | 'diger';
interface PollResult {
    title: string;
    total: number;
    options: Record<string, { label: string; count: number }>;
}

const KINDS: { id: Kind; label: string; icon: React.ElementType; hint: string }[] = [
    { id: 'oneri', label: 'Öneri', icon: Lightbulb, hint: 'Şu da olsa güzel olurdu…' },
    { id: 'hata', label: 'Hata', icon: Bug, hint: 'Ne yaptın, ne oldu, ne bekliyordun? (cihaz/tarayıcı da yazabilirsin)' },
    { id: 'istek', label: 'İstek', icon: Sparkles, hint: 'Haritaya eklenmesini istediğin yer, karakter, özellik…' },
    { id: 'diger', label: 'Diğer', icon: MessageSquarePlus, hint: 'Aklındaki her şey' },
];

const PLANET_INFO: Record<string, string> = {
    tam: 'Harita bütün gezegeni sarar; doğu ve batı arkada birleşir. Gezegen küçük (≈864 km), haritanın iki ucu arasında 24 saat fark var.',
    kita: 'Dünya büyüklüğünde gezegen; harita kuzeyde bir kıta, etrafı okyanus. Ölçek bozulmaz, saat farkı birkaç saat.',
};

/** Her yerden açılabilir: window.dispatchEvent(new CustomEvent('velutan:feedback', { detail: 'oy' })) */
export const openFeedback = (tab: Tab = 'yaz') => window.dispatchEvent(new CustomEvent('velutan:feedback', { detail: tab }));

/**
 * Geri bildirim: öneri, hata, istek yaz; topluluk oylamalarına katıl (gezegen kurgusu). Gönderilenler
 * yönetim panelinde listelenir. Oy kişi başına bir (değiştirilebilir); sonuçlar oy verince görünür.
 */
export default function Feedback() {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<Tab>('yaz');
    const [kind, setKind] = useState<Kind>('oneri');
    const [text, setText] = useState('');
    const [name, setName] = useState('');
    const [contact, setContact] = useState('');
    const [trap, setTrap] = useState('');
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [polls, setPolls] = useState<Record<string, PollResult> | null>(null);
    const [voted, setVoted] = useState<string | null>(null);
    const [voteNote, setVoteNote] = useState('');
    const theme = useTheme();

    useEffect(() => {
        const onOpen = (e: Event) => {
            setTab('yaz');
            setSent(false);
            setError(null);
            setOpen(true);
        };
        window.addEventListener('velutan:feedback', onOpen);
        try {
            setVoted(localStorage.getItem('velutan_oy_gezegen'));
        } catch {
            /* yoksay */
        }
        return () => window.removeEventListener('velutan:feedback', onOpen);
    }, []);

    const loadPolls = useCallback(() => {
        fetch(`${API_URL}/geri-bildirim/oylar`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d && setPolls(d))
            .catch(() => undefined);
    }, []);
    useEffect(() => {
        if (open && tab === 'oy') loadPolls();
    }, [open, tab, loadPolls]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    const post = async (body: Record<string, unknown>) => {
        setBusy(true);
        setError(null);
        try {
            const r = await fetch(`${API_URL}/geri-bildirim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...body, page: window.location.pathname + window.location.search, website: trap }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'Gönderilemedi');
            return true;
        } catch (e) {
            setError((e as Error).message);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        if (await post({ kind, text, name, contact })) {
            setSent(true);
            setText('');
        }
    };
    const vote = async (option: string) => {
        if (await post({ kind: 'oy', poll: 'gezegen', vote: option, text: voteNote })) {
            setVoted(option);
            try {
                localStorage.setItem('velutan_oy_gezegen', option);
            } catch {
                /* yoksay */
            }
            loadPolls();
        }
    };

    if (!open) return null;
    const gezegen = polls?.gezegen;
    const k = KINDS.find((x) => x.id === kind)!;

    return createPortal(
        <div className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/65 p-3" onClick={() => setOpen(false)}>
            <section onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Geri bildirim" className="vl-leather relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl text-amber-50">
                <header className="flex items-center gap-2 border-b border-[#c9a35a]/20 px-4 py-3">
                    <MessageSquarePlus size={18} className="text-[#c9a35a]" />
                    <h2 className="flex-1 font-display text-xl font-bold text-[#f1dca6]">Geri bildirim</h2>
                    <button onClick={() => setOpen(false)} aria-label="Kapat" className="text-[#c9a35a]/70 hover:text-[#f1dca6]">
                        <X size={18} />
                    </button>
                </header>
                <div className="flex border-b border-[#c9a35a]/15 text-[12px] font-black uppercase tracking-widest">
                    {(
                        [
                            ['yaz', 'Görüşünü yaz', MessageSquarePlus],
                        ] as const
                    ).map(([id, label, Icon]) => (
                        <button key={id} onClick={() => setTab(id)} className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 ${tab === id ? 'bg-[#c9a35a]/15 text-[#f1dca6]' : 'text-amber-100/50 hover:text-amber-100'}`}>
                            <Icon size={14} /> {label}
                        </button>
                    ))}
                </div>

                <div className="overflow-y-auto p-4 custom-scrollbar">
                    {tab === 'yaz' &&
                        (sent ? (
                            <div className="py-8 text-center">
                                <Check className="mx-auto text-green-400" size={34} />
                                <p className="mt-2 font-serif text-lg">Teşekkürler! Okuyacağız.</p>
                                <button onClick={() => setSent(false)} className="mt-4 text-[12px] text-[#c9a35a] underline">
                                    Bir tane daha yaz
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={send} className="space-y-3">
                                <div className="grid grid-cols-4 gap-1.5">
                                    {KINDS.map(({ id, label, icon: Icon }) => (
                                        <button
                                            type="button"
                                            key={id}
                                            onClick={() => setKind(id)}
                                            className={`flex flex-col items-center gap-1 rounded-lg border py-2 text-[11px] font-bold ${kind === id ? 'border-[#e2c178] bg-[#c9a35a]/20 text-[#f6e3b4]' : 'border-[#c9a35a]/25 text-amber-100/60 hover:border-[#c9a35a]/60'}`}
                                        >
                                            <Icon size={16} /> {label}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value.slice(0, 4000))}
                                    placeholder={k.hint}
                                    rows={6}
                                    required
                                    className="w-full resize-y rounded-md border border-[#c9a35a]/30 bg-black/40 p-3 font-serif text-[15px] text-amber-50 outline-none focus:border-[#e2c178]"
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Adın (isteğe bağlı)" className="rounded-md border border-[#c9a35a]/25 bg-black/40 px-3 py-2 text-[13px] outline-none focus:border-[#e2c178]" />
                                    <input value={contact} onChange={(e) => setContact(e.target.value.slice(0, 120))} placeholder="Discord / e-posta (isteğe bağlı)" className="rounded-md border border-[#c9a35a]/25 bg-black/40 px-3 py-2 text-[13px] outline-none focus:border-[#e2c178]" />
                                </div>
                                {/* Bot tuzağı: insanlar görmez */}
                                <input value={trap} onChange={(e) => setTrap(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
                                {error && <p className="text-[12px] text-red-300">{error}</p>}
                                <button type="submit" disabled={busy || text.trim().length < 3} className="vl-seal w-full rounded-md py-2.5 font-display text-[15px] font-bold tracking-[0.12em] disabled:opacity-40">
                                    {busy ? 'Gönderiliyor…' : 'Gönder'}
                                </button>
                            </form>
                        ))}

                    {tab === 'oy' && (
                        <div className="space-y-3">
                            <div>
                                <h3 className="font-display text-lg font-bold text-[#f1dca6]">{gezegen?.title ?? 'Velutan gezegeni nasıl olsun?'}</h3>
                                <p className="text-[12px] text-amber-100/55">İki kurguyu da dene, beğendiğine oy ver. Çoğunluğun seçtiği kalacak; oyunu sonra değiştirebilirsin.</p>
                            </div>
                            {(['tam', 'kita'] as const).map((id) => {
                                const opt = gezegen?.options[id];
                                const pct = gezegen && gezegen.total ? Math.round(((opt?.count ?? 0) / gezegen.total) * 100) : 0;
                                const mine = voted === id;
                                return (
                                    <div key={id} className={`rounded-xl border p-3 ${mine ? 'border-[#e2c178] bg-[#c9a35a]/10' : 'border-[#c9a35a]/25 bg-black/25'}`}>
                                        <div className="flex items-center gap-2">
                                            <Globe2 size={16} className="text-[#c9a35a]" />
                                            <span className="flex-1 font-bold">{opt?.label ?? (id === 'tam' ? 'Harita tüm gezegen' : 'Dünya ölçeğinde kıta')}</span>
                                            {mine && <span className="text-[10px] font-black uppercase tracking-widest text-[#e2c178]">oyun</span>}
                                        </div>
                                        <p className="mt-1 text-[12px] text-amber-100/60">{PLANET_INFO[id]}</p>
                                        {voted && gezegen && (
                                            <div className="mt-2 flex items-center gap-2 text-[11px]">
                                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/50">
                                                    <div className="h-full rounded-full bg-[#c9a35a]" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="w-16 text-right tabular-nums">
                                                    %{pct} · {opt?.count ?? 0}
                                                </span>
                                            </div>
                                        )}
                                        <div className="mt-2 flex gap-2">
                                            <button
                                                onClick={() => {
                                                    themeStore.set({ world: 'kure', planet: id });
                                                    setOpen(false);
                                                }}
                                                className="flex-1 rounded-md border border-[#c9a35a]/35 py-1.5 text-[12px] font-bold hover:border-[#e2c178]"
                                            >
                                                {theme.world === 'kure' && theme.planet === id ? 'Şu an bunu görüyorsun' : 'Dene'}
                                            </button>
                                            <button onClick={() => vote(id)} disabled={busy} className="vl-seal flex-1 rounded-md py-1.5 text-[12px] font-bold disabled:opacity-40">
                                                {mine ? 'Oy verildi ✓' : 'Buna oy ver'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            <textarea
                                value={voteNote}
                                onChange={(e) => setVoteNote(e.target.value.slice(0, 2000))}
                                placeholder="Neden bunu seçtin? (isteğe bağlı)"
                                rows={2}
                                className="w-full rounded-md border border-[#c9a35a]/25 bg-black/40 p-2 text-[13px] outline-none focus:border-[#e2c178]"
                            />
                            {gezegen && voted && <p className="text-center text-[11px] text-amber-100/45">Toplam {gezegen.total} oy</p>}
                            {error && <p className="text-[12px] text-red-300">{error}</p>}
                        </div>
                    )}
                </div>
            </section>
        </div>,
        document.body,
    );
}
