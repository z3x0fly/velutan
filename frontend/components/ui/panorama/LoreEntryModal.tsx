'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ExternalLink, Loader2, X } from 'lucide-react';
import { fetchLoreEntry, LoreEntry } from './hotspots';

/**
 * velutanmap.com wiki kaydı: kapak, başlık, özet ve metin. Metindeki [[bağlantı]]lar ve ilgili kayıtlar aynı
 * pencerede açılır (geri düğmesiyle dönülür); 360° mekân kayıtları bu bölgede varsa oraya geçilir.
 */
export default function LoreEntryModal({ slug, onClose, onPanorama }: { slug: string; onClose: () => void; onPanorama?: (slug: string) => boolean }) {
    const [stack, setStack] = useState<string[]>([slug]);
    const current = stack[stack.length - 1];
    const [entry, setEntry] = useState<LoreEntry | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setStack([slug]);
    }, [slug]);

    useEffect(() => {
        let alive = true;
        setEntry(null);
        setError(null);
        fetchLoreEntry(current)
            .then((e) => alive && setEntry(e))
            .catch((e: Error) => alive && setError(e.message));
        return () => {
            alive = false;
        };
    }, [current]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            // Panorama görüntüleyicisi de Esc dinler: önce yalnızca bu pencere kapansın
            e.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    const open = (s: string, kind?: string) => {
        if (kind === 'panorama' && onPanorama?.(s)) return onClose();
        setStack((st) => [...st, s]);
    };

    return createPortal(
        <div className="fixed inset-0 z-[13500] flex items-center justify-center bg-black/70 p-3 md:p-8" onClick={onClose}>
            <article
                role="dialog"
                aria-label={entry?.title ?? 'Kayıt'}
                onClick={(e) => e.stopPropagation()}
                className="vl-leather relative flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl text-amber-50"
            >
                <div className="flex items-center gap-2 border-b border-[#c9a35a]/20 px-3 py-2">
                    {stack.length > 1 && (
                        <button onClick={() => setStack((st) => st.slice(0, -1))} aria-label="Geri" className="rounded-full p-1.5 text-[#c9a35a] hover:bg-amber-500/10 hover:text-[#f1dca6]">
                            <ArrowLeft size={18} />
                        </button>
                    )}
                    <span className="flex-1 truncate text-[11px] font-black uppercase tracking-[0.3em] text-[#c9a35a]/80">{entry?.label ?? 'Velutan Wiki'}</span>
                    <button onClick={onClose} aria-label="Kapat" className="rounded-full p-1.5 text-[#c9a35a] hover:bg-amber-500/10 hover:text-[#f1dca6]">
                        <X size={18} />
                    </button>
                </div>

                <div className="min-h-[160px] flex-1 overflow-y-auto custom-scrollbar">
                    {!entry && !error && (
                        <div className="flex h-40 items-center justify-center text-amber-100/60">
                            <Loader2 className="animate-spin" size={22} />
                        </div>
                    )}
                    {error && <div className="p-6 text-center text-red-300">{error}</div>}
                    {entry && (
                        <>
                            {entry.cover && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={entry.cover} alt="" className="max-h-72 w-full object-cover object-top" />
                            )}
                            <div className="space-y-4 p-5 md:p-7">
                                <h2 className="font-display text-2xl font-bold tracking-wide text-[#f6e3b4] md:text-3xl">{entry.title}</h2>
                                {entry.summary && <p className="border-l-2 border-[#c9a35a]/50 pl-3 font-serif text-[17px] italic text-amber-100/85">{entry.summary}</p>}
                                {entry.body && <Body md={entry.body} refs={entry.refs} onLink={(s) => open(s)} />}
                                {!entry.body && !entry.summary && !(entry.related ?? []).some((g) => g.items.length) && <p className="font-serif italic text-amber-100/50">Bu kayıt için henüz yazı yok.</p>}

                                {(entry.related ?? [])
                                    .filter((g) => g.items.length)
                                    .map((g) => (
                                        <section key={g.title} className="pt-1">
                                            <h3 className="mb-2 text-[11px] font-black uppercase tracking-[0.25em] text-[#c9a35a]/80">{g.title}</h3>
                                            <div className="flex flex-wrap gap-1.5">
                                                {g.items.map((i) => (
                                                    <button
                                                        key={i.slug}
                                                        onClick={() => open(i.slug, i.kind)}
                                                        className="rounded-full border border-[#c9a35a]/35 bg-black/30 px-3 py-1 text-[13px] font-bold text-amber-100/85 hover:border-[#e2c178] hover:text-[#f6e3b4]"
                                                    >
                                                        {i.title}
                                                    </button>
                                                ))}
                                            </div>
                                        </section>
                                    ))}
                            </div>
                        </>
                    )}
                </div>

                {entry && (
                    <div className="flex items-center justify-between gap-2 border-t border-[#c9a35a]/20 px-4 py-2 text-[11.5px] text-amber-100/50">
                        <span>Kaynak: velutanmap.com</span>
                        <a href={entry.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold text-[#c9a35a] hover:text-[#f1dca6]">
                            velutanmap.com&apos;da aç <ExternalLink size={12} />
                        </a>
                    </div>
                )}
            </article>
        </div>,
        document.body,
    );
}

/** Wiki metni: paragraflar, başlıklar, listeler, **kalın**, *eğik* ve [[bağlantı]] / [[bağlantı|yazı]] (HTML yok) */
function Body({ md, refs, onLink }: { md: string; refs?: Record<string, string>; onLink: (slug: string) => void }) {
    const inline = (text: string, key: string): React.ReactNode[] => {
        const out: React.ReactNode[] = [];
        const re = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
        let last = 0;
        let m: RegExpExecArray | null;
        let n = 0;
        while ((m = re.exec(text))) {
            if (m.index > last) out.push(text.slice(last, m.index));
            const k = `${key}-${n++}`;
            if (m[1]) {
                const s = m[1];
                out.push(
                    <button key={k} onClick={() => onLink(s)} className="font-bold text-[#e2c178] underline decoration-[#c9a35a]/40 underline-offset-2 hover:text-[#f6e3b4]">
                        {m[2] ?? refs?.[s] ?? s}
                    </button>,
                );
            } else if (m[3]) out.push(<strong key={k}>{m[3]}</strong>);
            else if (m[4]) out.push(<em key={k}>{m[4]}</em>);
            last = re.lastIndex;
        }
        if (last < text.length) out.push(text.slice(last));
        return out;
    };

    const blocks = md.replace(/\r\n/g, '\n').split(/\n{2,}/);
    return (
        <div className="space-y-3 font-serif text-[16px] leading-relaxed text-amber-100/85">
            {blocks.map((b, i) => {
                const lines = b.split('\n').filter((l) => l.trim());
                if (!lines.length) return null;
                const h = /^(#{1,4})\s+(.*)$/.exec(lines[0]);
                if (h && lines.length === 1) return <h3 key={i} className="pt-2 font-display text-xl font-bold text-[#f1dca6]">{inline(h[2], `h${i}`)}</h3>;
                if (lines.every((l) => /^\s*([-*+]|\d+\.)\s+/.test(l)))
                    return (
                        <ul key={i} className="list-disc space-y-1 pl-5 marker:text-[#c9a35a]">
                            {lines.map((l, j) => (
                                <li key={j}>{inline(l.replace(/^\s*([-*+]|\d+\.)\s+/, ''), `l${i}-${j}`)}</li>
                            ))}
                        </ul>
                    );
                if (lines.every((l) => l.startsWith('>')))
                    return (
                        <blockquote key={i} className="border-l-2 border-[#c9a35a]/50 pl-3 italic text-amber-100/70">
                            {inline(lines.map((l) => l.replace(/^>\s?/, '')).join(' '), `q${i}`)}
                        </blockquote>
                    );
                return <p key={i}>{inline(lines.join(' '), `p${i}`)}</p>;
            })}
        </div>
    );
}
