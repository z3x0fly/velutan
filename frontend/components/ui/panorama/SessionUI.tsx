'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, Eye, LogOut, Radio, UserPlus, Users, X } from 'lucide-react';
import { sessionStore, type SessionState } from './session';
import type { BattleState } from './battle';
import { Portrait } from './InitiativeBar';

const Dot = ({ on }: { on: boolean }) => <span className={`inline-block h-2 w-2 rounded-full ${on ? 'animate-pulse bg-green-400 shadow-[0_0_8px_#4ade80]' : 'bg-amber-500/60'}`} />;

/** GM: davet düğmesi / canlı masa göstergesi ve davet penceresi */
export function GmSession({ sess, battle, regionSlug, panoSlug }: { sess: SessionState; battle: BattleState; regionSlug: string; panoSlug: string }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [confirmClose, setConfirmClose] = useState(false);
    const live = sess.role === 'gm' && !!sess.code;
    const players = sess.seats.filter((s) => !s.gm);
    const url = sessionStore.inviteUrl();

    if (!live)
        return (
            <button
                onClick={async () => {
                    await sessionStore.create(regionSlug, panoSlug);
                    setOpen(true);
                }}
                disabled={sess.status === 'connecting' || !regionSlug}
                title="Oyuncular bağlantıyla aynı masaya katılır"
                className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-black/60 px-3 py-2 text-[12px] font-black uppercase tracking-[0.15em] text-amber-400 hover:text-white disabled:opacity-50"
            >
                <UserPlus size={16} /> <span className="hidden sm:inline">{sess.status === 'connecting' ? 'Açılıyor…' : 'Oyuncuları davet et'}</span>
            </button>
        );

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-green-400/50 bg-green-950/40 px-3 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-green-200 hover:bg-green-900/50"
            >
                <Dot on={sess.status === 'live'} />
                <span className="hidden sm:inline">Canlı masa</span>
                <span className="flex items-center gap-1">
                    <Users size={13} /> {players.length}
                </span>
            </button>
            {open && (
                <div className="vl-leather absolute right-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-24px))] rounded-xl p-3.5 text-amber-50">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="font-display text-[12px] tracking-[0.22em] text-[#c9a35a]">CANLI MASA</span>
                        <button onClick={() => setOpen(false)} aria-label="Kapat" className="text-[#c9a35a]/60 hover:text-[#f1dca6]">
                            <X size={15} />
                        </button>
                    </div>
                    <div className="text-center">
                        <div className="text-[10.5px] uppercase tracking-[0.25em] text-amber-100/50">Masa kodu</div>
                        <div className="font-display text-3xl font-bold tracking-[0.25em] text-[#f6e3b4]">{sess.code}</div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Davet bağlantısı" className="min-w-0 flex-1 rounded-md border border-[#c9a35a]/30 bg-black/50 px-2 py-1.5 font-mono text-[11px] text-amber-100/80 outline-none" />
                        <button
                            onClick={async () => {
                                try {
                                    await navigator.clipboard.writeText(url);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 1800);
                                } catch {
                                    /* yoksay */
                                }
                            }}
                            className="vl-seal flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12px] font-bold"
                        >
                            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Kopyalandı' : 'Kopyala'}
                        </button>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-snug text-amber-100/50">Bağlantıyı oyunculara gönder: açınca adlarını yazıp bu mekâna, bu savaşa girerler. Masayı sen yönetirsin; oyuncular kendi karakterlerini yürütür ve zar atar.</p>

                    <div className="mt-3 border-t border-[#c9a35a]/15 pt-2">
                        <div className="mb-1 text-[10.5px] font-black uppercase tracking-[0.2em] text-[#c9a35a]/80">Masadakiler ({players.length})</div>
                        {players.length === 0 && <div className="py-1 text-[12px] italic text-amber-100/40">Henüz kimse katılmadı.</div>}
                        <ul className="space-y-1">
                            {players.map((p) => {
                                const t = battle.tokens.find((x) => x.id === p.character);
                                return (
                                    <li key={p.id} className="flex items-center gap-2 text-[12.5px]">
                                        <Dot on />
                                        <span className="font-bold">{p.name}</span>
                                        <span className="text-amber-100/45">{t ? `→ ${t.name}` : 'izliyor'}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                    {sess.error && <div className="mt-2 text-[11px] text-red-300">{sess.error}</div>}
                    <button
                        onClick={() => (confirmClose ? (void sessionStore.leave(), setOpen(false), setConfirmClose(false)) : setConfirmClose(true))}
                        onBlur={() => setConfirmClose(false)}
                        className="mt-3 w-full rounded-md border border-red-500/30 py-1.5 text-[12px] font-bold text-red-300 hover:border-red-400"
                    >
                        {confirmClose ? 'Emin misin? Herkes masadan düşer' : 'Masayı kapat'}
                    </button>
                </div>
            )}
        </div>
    );
}

/** Oyuncu: canlı masa göstergesi, karakter ve ayrılma */
export function PlayerSession({ sess, battle, onPick }: { sess: SessionState; battle: BattleState; onPick: () => void }) {
    const gmOnline = sess.seats.some((s) => s.gm);
    const me = battle.tokens.find((t) => t.id === sess.character);
    return (
        <div className="flex items-center gap-1.5">
            <button onClick={onPick} className="flex items-center gap-2 rounded-full border border-green-400/50 bg-green-950/40 px-3 py-2 text-[12px] font-bold text-green-100" title="Karakterini değiştir">
                <Dot on={sess.status === 'live'} />
                <span className="hidden sm:inline">{sess.status === 'live' ? (gmOnline ? 'Canlı masa' : 'GM çevrimdışı') : sess.status === 'closed' ? 'Masa kapandı' : 'Bağlanıyor…'}</span>
                <span className="text-amber-100/70">{me ? me.name : 'İzleyici'}</span>
            </button>
            <button onClick={() => void sessionStore.leave()} aria-label="Masadan ayrıl" title="Masadan ayrıl" className="rounded-full border border-amber-500/30 bg-black/60 p-2 text-amber-400 hover:text-white">
                <LogOut size={16} />
            </button>
        </div>
    );
}

/** Oyuncu katılımı: önce ad, sonra karakter */
export function JoinDialog({ sess, battle, picking, onDone }: { sess: SessionState; battle: BattleState; picking: boolean; onDone: () => void }) {
    const [name, setName] = useState(sess.name);
    useEffect(() => {
        setName(sess.name);
    }, [sess.name]);
    const taken = new Set(sess.seats.filter((s) => s.id !== sess.clientId && s.character).map((s) => s.character));
    const heroes = battle.tokens.filter((t) => t.kind === 'oyuncu');
    if (!sess.needsName && !picking) return null;

    return createPortal(
        <div className="fixed inset-0 z-[13000] flex items-center justify-center bg-black/75 p-3 backdrop-blur-[2px]">
            <section role="dialog" aria-label="Masaya katıl" className="vl-leather w-full max-w-md rounded-xl p-5 text-amber-50">
                <div className="text-center">
                    <Radio className="mx-auto text-green-300" size={22} />
                    <div className="mt-1 text-[11px] font-black uppercase tracking-[0.35em] text-[#c9a35a]/70">Canlı masa · {sess.code}</div>
                    <h2 className="font-display text-2xl font-bold tracking-[0.1em] text-[#f1dca6]">{sess.needsName ? 'Masaya katıl' : 'Hangi karakter sensin?'}</h2>
                </div>
                {sess.needsName ? (
                    <form
                        className="mt-4 space-y-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void sessionStore.join(name);
                        }}
                    >
                        <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value.slice(0, 24))}
                            placeholder="Adın (ör. Çağan)"
                            aria-label="Adın"
                            className="w-full rounded-md border border-[#c9a35a]/40 bg-black/50 px-3 py-2.5 text-center font-serif text-lg text-amber-50 outline-none focus:border-[#e2c178]"
                        />
                        <button type="submit" disabled={!name.trim()} className="vl-seal w-full rounded-md py-2.5 font-display text-[16px] font-bold tracking-[0.14em] disabled:opacity-40">
                            Katıl
                        </button>
                        <p className="text-center text-[11px] text-amber-100/45">GM&apos;in masasını canlı görürsün; karakterini yürütür, zarını atarsın.</p>
                    </form>
                ) : (
                    <div className="mt-4 space-y-2">
                        {heroes.length === 0 && <p className="text-center text-[12px] italic text-amber-100/50">GM henüz oyuncu karakteri koymadı. Şimdilik izle; sonra şeritten seçebilirsin.</p>}
                        <div className="grid grid-cols-2 gap-1.5">
                            {heroes.map((t) => {
                                const busy = taken.has(t.id);
                                const mine = sess.character === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        disabled={busy}
                                        onClick={() => {
                                            void sessionStore.chooseCharacter(t.id);
                                            onDone();
                                        }}
                                        className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors disabled:opacity-35 ${mine ? 'border-[#e2c178] bg-[#c9a35a]/20' : 'border-[#c9a35a]/25 bg-black/30 hover:border-[#c9a35a]/60'}`}
                                    >
                                        <Portrait t={t} size={36} />
                                        <span className="min-w-0">
                                            <span className="block truncate text-[13px] font-bold">{t.name}</span>
                                            <span className="block text-[10.5px] text-amber-100/45">{busy ? 'başka oyuncuda' : mine ? 'seçili' : 'seç'}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => {
                                void sessionStore.chooseCharacter(null);
                                onDone();
                            }}
                            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-[#c9a35a]/30 py-2 text-[12.5px] font-bold text-amber-100/70 hover:text-amber-100"
                        >
                            <Eye size={14} /> Sadece izle
                        </button>
                    </div>
                )}
            </section>
        </div>,
        document.body,
    );
}
