'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, Terminal, Bug, Ban, Radar } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api, errorMessage } from '@/lib/api';

interface SshEvent {
    at: string;
    ip: string;
    user: string;
    kind: string;
    method?: string;
}
interface Stats {
    bans: { ip: string; until: string; reason: string; at: string }[];
    events: { at: string; ip: string; ua: string; path: string; reason: string }[];
    counts: Record<string, number>;
    attacks: {
        ssh: {
            available: boolean;
            total: number;
            uniqueIps: number;
            topIps: { ip: string; count: number; users: [string, number][]; first: string; last: string }[];
            topUsers: [string, number][];
            hours: { hour: string; count: number }[];
            recent: SshEvent[];
            success: SshEvent[];
        };
        web: { total: number; byPath: [string, number][]; recent: { at: string; ip: string; ua: string; path: string; host: string }[] };
    };
}

const time = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const REASON: Record<string, string> = { 'bal-kupu': 'Bal küpü', 'bot-istemci': 'Bot (zehirli veri)', yasakli: 'Yasaklı', hiz: 'Hız sınırı' };

const Card = ({ icon: Icon, label, value, tone = '' }: { icon: React.ElementType; label: string; value: React.ReactNode; tone?: string }) => (
    <div className={`rounded-lg border border-[#a89361]/20 bg-[#0a0a0a] p-4 ${tone}`}>
        <Icon size={16} className="mb-2 text-[#a89361]/60" />
        <div className="font-serif text-3xl text-[#a89361]">{value}</div>
        <div className="text-[10px] uppercase tracking-widest text-[#a89361]/50">{label}</div>
    </div>
);

/** Bekçi: SSH saldırıları (auth.log), web tuzakları, bal küpü ve bot kayıtları, yasaklar. 15 sn'de bir yenilenir. */
export default function GuardTab() {
    const [s, setS] = useState<Stats | null>(null);
    const [view, setView] = useState<'ssh' | 'web' | 'site'>('ssh');

    const load = async () => {
        try {
            setS((await api.get<Stats>('/bekci')).data);
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };
    useEffect(() => {
        void load();
        const id = setInterval(load, 15_000);
        return () => clearInterval(id);
    }, []);

    const act = async (path: 'yasakla' | 'kaldir', ip: string) => {
        try {
            await api.post(`/bekci/${path}`, { ip });
            toast.success(path === 'yasakla' ? `${ip} yasaklandı` : 'Yasak kaldırıldı');
            void load();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    if (!s) return <p className="text-sm italic text-[#e0d8c3]/40">Yükleniyor…</p>;
    const ssh = s.attacks.ssh;
    const max = Math.max(1, ...ssh.hours.map((h) => h.count));
    const lastHour = ssh.hours.at(-1)?.count ?? 0;
    const tab = (v: typeof view, label: string) => (
        <button
            onClick={() => setView(v)}
            className={`rounded px-4 py-2 text-xs font-bold uppercase tracking-widest ${view === v ? 'bg-[#a89361]/20 text-[#a89361]' : 'text-[#a89361]/40 hover:text-[#a89361]'}`}
        >
            {label}
        </button>
    );

    return (
        <div className="max-w-6xl space-y-8">
            <header className="flex items-end justify-between gap-4">
                <div>
                    <h2 className="flex items-center gap-3 font-serif text-3xl text-[#a89361]">
                        <Radar size={26} /> Bekçi
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-[#e0d8c3]/60">
                        Sunucuya gelen saldırılar canlı: SSH şifre denemeleri, web tarayıcılarının yokladığı adresler, haritayı kazımaya çalışan botlar ve bal küpüne
                        düşenler. 15 saniyede bir yenilenir.
                    </p>
                </div>
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-green-400">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" /> canlı
                </span>
            </header>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Card icon={Terminal} label="SSH denemesi" value={ssh.total.toLocaleString('tr-TR')} />
                <Card icon={ShieldAlert} label="Saldıran IP" value={ssh.uniqueIps} />
                <Card icon={Terminal} label="Son 1 saat" value={lastHour} tone={lastHour > 200 ? 'border-red-500/40' : ''} />
                <Card icon={Bug} label="Web tuzağı" value={s.attacks.web.total} />
                <Card icon={Ban} label="Yasaklı istemci" value={s.bans.length} />
            </div>

            <div className="flex gap-2 border-b border-[#a89361]/10 pb-2">
                {tab('ssh', 'SSH saldırıları')}
                {tab('web', 'Web tuzakları')}
                {tab('site', 'Harita botları ve yasaklar')}
            </div>

            {view === 'ssh' && (
                <div className="space-y-8">
                    {!ssh.available && <p className="text-sm text-amber-300">auth.log okunamadı (yerel geliştirmede normal).</p>}
                    <section>
                        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">Son 48 saat (saatlik deneme)</h3>
                        <div className="flex h-32 items-end gap-[2px] rounded-lg border border-[#a89361]/10 bg-[#0a0a0a] p-3">
                            {ssh.hours.map((h) => (
                                <div key={h.hour} title={`${h.hour.replace('T', ' ')}:00 · ${h.count}`} className="flex-1 rounded-t bg-red-500/70 hover:bg-red-400" style={{ height: `${(h.count / max) * 100}%`, minHeight: h.count ? 2 : 0 }} />
                            ))}
                        </div>
                    </section>

                    <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
                        <section>
                            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">En çok saldıran IP'ler</h3>
                            <table className="w-full text-left text-xs">
                                <thead className="text-[10px] uppercase tracking-widest text-[#a89361]/50">
                                    <tr>
                                        <th className="py-1">IP</th>
                                        <th>Deneme</th>
                                        <th>Denedikleri kullanıcılar</th>
                                        <th>Son</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ssh.topIps.slice(0, 25).map((r) => (
                                        <tr key={r.ip} className="border-t border-[#a89361]/10">
                                            <td className="py-1.5 font-mono text-[#e0d8c3]">
                                                <a href={`https://ipinfo.io/${r.ip}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#a89361]">
                                                    {r.ip}
                                                </a>
                                            </td>
                                            <td className="font-bold text-red-300">{r.count}</td>
                                            <td className="text-[#e0d8c3]/60">{r.users.map(([u, n]) => `${u}(${n})`).join(', ')}</td>
                                            <td className="text-[#e0d8c3]/40">{time(r.last)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                        <section>
                            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">Denenen kullanıcı adları</h3>
                            <ul className="space-y-1 text-xs">
                                {ssh.topUsers.map(([u, n]) => (
                                    <li key={u} className="flex items-center gap-2">
                                        <span className="w-28 truncate font-mono text-[#e0d8c3]">{u}</span>
                                        <span className="h-2 rounded bg-[#a89361]/50" style={{ width: `${(n / (ssh.topUsers[0]?.[1] || 1)) * 100}%` }} />
                                        <span className="text-[#a89361]/60">{n}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>

                    <div className="grid gap-8 lg:grid-cols-2">
                        <section>
                            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">Canlı akış</h3>
                            <div className="h-80 overflow-y-auto rounded-lg border border-[#a89361]/10 bg-black p-3 font-mono text-[11px] leading-relaxed">
                                {ssh.recent.map((e, i) => (
                                    <div key={i} className="text-red-300/80">
                                        <span className="text-[#e0d8c3]/40">{time(e.at)}</span> {e.ip} → <span className="text-[#e0d8c3]">{e.user}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                        <section>
                            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">Başarılı girişler</h3>
                            <p className="mb-2 text-[11px] text-[#e0d8c3]/40">Tanımadığın bir IP ya da "password" görürsen hemen haber ver.</p>
                            <ul className="space-y-1 font-mono text-[11px]">
                                {ssh.success.map((e, i) => (
                                    <li key={i} className={e.method === 'password' ? 'text-amber-300' : 'text-green-300/80'}>
                                        {time(e.at)} {e.user}@{e.ip} ({e.method})
                                    </li>
                                ))}
                            </ul>
                        </section>
                    </div>
                </div>
            )}

            {view === 'web' && (
                <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
                    <section>
                        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">Yoklanan adresler</h3>
                        <ul className="space-y-1 font-mono text-xs">
                            {s.attacks.web.byPath.map(([p, n]) => (
                                <li key={p} className="flex justify-between gap-2">
                                    <span className="truncate text-[#e0d8c3]">{p}</span>
                                    <span className="text-red-300">{n}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                    <section>
                        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">Son istekler</h3>
                        <div className="h-96 overflow-y-auto rounded-lg border border-[#a89361]/10 bg-black p-3 font-mono text-[11px] leading-relaxed">
                            {s.attacks.web.recent.map((e, i) => (
                                <div key={i}>
                                    <span className="text-[#e0d8c3]/40">{time(e.at)}</span> <span className="text-red-300">{e.ip}</span> {e.host}
                                    <span className="text-[#e0d8c3]">{e.path}</span> <span className="text-[#e0d8c3]/30">{e.ua.slice(0, 60)}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {view === 'site' && (
                <div className="space-y-8">
                    <p className="text-sm text-[#e0d8c3]/60">
                        Tarayıcı olmayan istemciler (curl, python, kazıyıcılar) haritanın gerçek verisi yerine koordinatları kaydırılmış, içinde haritada olmayan tuzak
                        yerler olan veri alır (adları sunucuda gizli). Bu yerler başka bir haritada görülürse veri buradan kazınmıştır. Yasaklar 24 saat sürer ve
                        IP + tarayıcı imzasına konur (aynı VPN'deki başka kişi etkilenmez); elle yasakta bütün IP.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        {Object.entries(s.counts).map(([k, n]) => (
                            <span key={k} className="rounded border border-[#a89361]/20 px-3 py-1 text-xs text-[#e0d8c3]">
                                {REASON[k] ?? k}: <b className="text-[#a89361]">{n}</b>
                            </span>
                        ))}
                    </div>
                    <section>
                        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">Yasaklar</h3>
                        {!s.bans.length && <p className="text-sm italic text-[#e0d8c3]/40">Yasaklı istemci yok.</p>}
                        <ul className="space-y-1 text-xs">
                            {s.bans.map((b) => (
                                <li key={b.ip} className="flex items-center gap-3">
                                    <span className="font-mono text-[#e0d8c3]">{b.ip}</span>
                                    <span className="flex-1 truncate text-[#e0d8c3]/50">{b.reason}</span>
                                    <span className="text-[#e0d8c3]/40">{time(b.until)}'e kadar</span>
                                    <button onClick={() => act('kaldir', b.ip)} className="rounded border border-[#a89361]/30 px-2 py-0.5 text-[#a89361] hover:border-[#a89361]">
                                        Kaldır
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </section>
                    <section>
                        <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-[#a89361]/70">Son bot olayları</h3>
                        <div className="h-96 overflow-y-auto rounded-lg border border-[#a89361]/10 bg-black p-3 font-mono text-[11px] leading-relaxed">
                            {s.events.map((e, i) => (
                                <div key={i} className="flex gap-2">
                                    <span className="text-[#e0d8c3]/40">{time(e.at)}</span>
                                    <span className={e.reason === 'bal-kupu' ? 'text-amber-300' : 'text-red-300'}>{REASON[e.reason] ?? e.reason}</span>
                                    <span className="text-[#e0d8c3]">{e.ip}</span>
                                    <span className="text-[#e0d8c3]/70">{e.path}</span>
                                    <span className="truncate text-[#e0d8c3]/30">{e.ua}</span>
                                    <button onClick={() => act('yasakla', e.ip)} title="Bu IP'yi 24 saat yasakla" className="ml-auto shrink-0 text-red-400/60 hover:text-red-400">
                                        yasakla
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}
