'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Github, Heart, Sparkles, User, X } from 'lucide-react';

const REPO_URL = 'https://github.com/z3x0fly/velutan';
import { INFO_PAGES, InfoPage } from '../../content/hakkinda';
import GraphicsSettings from './GraphicsSettings';

const ICONS: Record<InfoPage['id'], React.ElementType> = {
    tesekkurler: Heart,
    'kim-yapti': User,
    meraklisina: Sparkles,
};

/** Sol alttaki "Teşekkürler · Kim Yaptı? · Meraklısına" bağlantıları ve pencereleri */
export default function InfoLinks() {
    const [open, setOpen] = useState<InfoPage | null>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    return (
        <>
            <nav className="flex flex-wrap gap-2" aria-label="Hakkında">
                <GraphicsSettings />
                {INFO_PAGES.map((page) => {
                    const Icon = ICONS[page.id];
                    return (
                        <button
                            key={page.id}
                            onClick={() => setOpen(page)}
                            aria-label={page.title}
                            className="flex items-center gap-1.5 rounded-full border border-amber-600/30 bg-black/70 p-2 md:px-3 md:py-1.5 text-[12px] font-black uppercase tracking-[0.15em] text-amber-500/80 transition-colors hover:border-amber-500 hover:text-amber-400"
                        >
                            <Icon size={12} /> <span className="hidden md:inline">{page.title}</span>
                        </button>
                    );
                })}
                <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="GitHub"
                    title="GitHub"
                    className="flex items-center justify-center rounded-full border border-amber-600/30 bg-black/70 p-1.5 text-amber-500/80 transition-colors hover:border-amber-500 hover:text-amber-400"
                >
                    <Github size={14} />
                </a>
            </nav>

            {open &&
                createPortal(
                    <div
                        className="fixed inset-0 z-[15000] flex items-center justify-center bg-black/70 p-3 md:p-10"
                        onClick={() => setOpen(null)}
                    >
                        <article
                            className="relative max-h-[88vh] w-full max-w-2xl overflow-y-auto custom-scrollbar rounded-2xl border-2 border-amber-600/30 bg-[#120c06] p-6 shadow-[0_0_100px_rgba(0,0,0,1)] md:p-10"
                            onClick={(e) => e.stopPropagation()}
                            role="dialog"
                            aria-label={open.title}
                        >
                            <button onClick={() => setOpen(null)} aria-label="Kapat" className="absolute right-4 top-4 text-amber-500 hover:text-white">
                                <X size={22} />
                            </button>
                            <div className="mb-1 text-[12px] font-black uppercase tracking-[0.35em] text-amber-500/60">{open.kicker}</div>
                            <h2 className="mb-6 border-b border-amber-600/20 pb-4 pr-8 font-serif text-2xl md:text-3xl font-black text-amber-400">{open.title}</h2>

                            <div className="space-y-8">
                                {open.sections.map((s, i) => (
                                    <section key={i} className="space-y-3">
                                        {s.heading && <h3 className="font-serif text-xl font-bold text-amber-200">{s.heading}</h3>}
                                        {s.paragraphs.map((p, j) => (
                                            <p key={j} className="font-serif leading-relaxed text-amber-100/80">
                                                {p}
                                            </p>
                                        ))}
                                        {s.list && (
                                            <ul className="list-disc space-y-2 pl-5 font-serif leading-relaxed text-amber-100/75 marker:text-amber-600">
                                                {s.list.map((item, j) => (
                                                    <li key={j}>{item}</li>
                                                ))}
                                            </ul>
                                        )}
                                        {s.links && (
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {s.links.map((l) => (
                                                    <a
                                                        key={l.href}
                                                        href={l.href}
                                                        {...(l.href.startsWith('mailto:') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                                                        className="rounded-full border border-amber-600/40 px-3 py-1 text-sm font-bold text-amber-400 hover:bg-amber-600/10"
                                                    >
                                                        {l.label}{l.href.startsWith('mailto:') ? '' : ' ↗'}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </section>
                                ))}
                            </div>
                        </article>
                    </div>,
                    document.body,
                )}
        </>
    );
}
