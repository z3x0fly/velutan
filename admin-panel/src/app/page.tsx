'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Compass, Hexagon, KeyRound, LogOut, MapPin, Plus, Search, Settings, ShieldAlert, Trash2, Users } from 'lucide-react';
import { toast, Toaster } from 'react-hot-toast';
import RegionEditor from '@/components/admin/RegionEditor';
import UsersTab from '@/components/admin/UsersTab';
import AccountTab from '@/components/admin/AccountTab';
import TerritoriesTab from '@/components/admin/TerritoriesTab';
import { api, errorMessage, loadSession, mediaUrl, onUnauthorized, Region, Role, saveSession, Session } from '@/lib/api';

type Tab = 'regions' | 'territories' | 'users' | 'account';

function LoginForm({ onLogin }: { onLogin: (s: Session) => void }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await api.post<{ token: string; username: string; role: Role }>('/auth/login', { username, password });
            onLogin(res.data);
        } catch (err) {
            setError(errorMessage(err, 'Giriş başarısız'));
        }
    };

    const field = 'w-full bg-[#050505] border border-[#a89361]/20 rounded p-4 text-[#e0d8c3] focus:border-[#a89361]/60 outline-none placeholder:text-[#a89361]/20';
    return (
        <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
            <form onSubmit={submit} className="bg-[#0a0a0a] p-10 border-2 border-[#a89361]/20 rounded-xl shadow-[0_0_50px_rgba(168,147,97,0.1)] w-full max-w-sm">
                <div className="flex justify-center mb-6 text-[#a89361]">
                    <ShieldAlert size={48} strokeWidth={1} />
                </div>
                <h2 className="text-2xl font-serif text-[#a89361] font-bold uppercase tracking-[0.2em] mb-8 text-center">Yetkili Girişi</h2>
                <div className="space-y-4">
                    <input className={field} placeholder="Kullanıcı adı" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
                    <input className={field} type="password" placeholder="Parola" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                {error && <p className="text-red-500 font-bold text-xs mt-4 text-center">{error}</p>}
                <button type="submit" className="w-full mt-8 bg-[#a89361] hover:bg-[#c2aa72] text-[#050505] py-4 rounded font-black uppercase tracking-widest">
                    Kapıları Aç
                </button>
            </form>
        </div>
    );
}

export default function AdminPage() {
    const [session, setSession] = useState<Session | null>(null);
    const [ready, setReady] = useState(false);
    const [tab, setTab] = useState<Tab>('regions');
    const [regions, setRegions] = useState<Region[]>([]);
    const [selected, setSelected] = useState<number | 'new' | null>(null);
    const [query, setQuery] = useState('');

    const login = useCallback((s: Session | null) => {
        saveSession(s);
        setSession(s);
        if (!s) setTab('regions');
    }, []);

    useEffect(() => {
        const s = loadSession();
        if (s) login(s);
        setReady(true);
        return onUnauthorized(() => {
            toast.error('Oturum sona erdi, tekrar giriş yapın');
            login(null);
        });
    }, [login]);

    const fetchRegions = useCallback(async () => {
        try {
            setRegions((await api.get<Region[]>('/regions/')).data);
        } catch (err) {
            toast.error(errorMessage(err, 'Bölgeler alınamadı'));
        }
    }, []);

    useEffect(() => {
        if (session) fetchRegions();
    }, [session, fetchRegions]);

    const remove = async (r: Region) => {
        if (!confirm(`"${r.name}" bölgesi ve 360° görüntüleri silinsin mi?`)) return;
        try {
            await api.delete(`/regions/${r.id}`);
            if (selected === r.id) setSelected(null);
            toast.success('Haritadan silindi');
            fetchRegions();
        } catch (err) {
            toast.error(errorMessage(err, 'Silme başarısız'));
        }
    };

    if (!ready) return <div className="min-h-screen bg-[#050505]" />;
    if (!session) return <LoginForm onLogin={login} />;

    const isAdmin = session.role === 'admin';
    const filtered = regions.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
    const tabBtn = (t: Tab) =>
        `flex-1 py-3 px-2 rounded-md transition-all ${tab === t ? 'bg-[#a89361]/20 text-[#a89361] border border-[#a89361]/40' : 'bg-[#0a0a0a] text-[#a89361]/40 border border-[#a89361]/10 hover:border-[#a89361]/30'}`;

    return (
        <div className="flex h-screen bg-[#050505] text-[#e0d8c3] font-sans overflow-hidden selection:bg-[#a89361] selection:text-[#050505]">
            <Toaster
                position="bottom-right"
                toastOptions={{ style: { background: '#0a0a0a', border: '1px solid #a89361', color: '#a89361', borderRadius: '8px', fontSize: '14px', fontFamily: 'serif' } }}
            />

            <aside className="w-80 flex-shrink-0 border-r border-[#a89361]/10 flex flex-col z-10">
                <div className="p-6 pb-2">
                    <h1 className="text-xl font-serif font-bold text-[#a89361] tracking-widest flex items-center justify-between mb-1">
                        <span className="flex items-center gap-2">
                            <Settings size={20} /> YÖNETİM
                        </span>
                        <button onClick={() => login(null)} className="text-[#a89361]/40 hover:text-red-500" title="Çıkış yap">
                            <LogOut size={16} />
                        </button>
                    </h1>
                    <p className="text-[10px] text-[#a89361]/40 mb-6">
                        {session.username} · {isAdmin ? 'Yönetici' : 'Editör'}
                    </p>

                    <div className="flex gap-2 mb-6 text-[10px] uppercase tracking-widest font-bold">
                        <button onClick={() => setTab('regions')} className={tabBtn('regions')}>
                            <MapPin size={14} className="mx-auto mb-1" /> Arşiv
                        </button>
                        <button onClick={() => setTab('territories')} className={tabBtn('territories')}>
                            <Hexagon size={14} className="mx-auto mb-1" /> Sınırlar
                        </button>
                        {isAdmin && (
                            <button onClick={() => setTab('users')} className={tabBtn('users')}>
                                <Users size={14} className="mx-auto mb-1" /> Yetkililer
                            </button>
                        )}
                        <button onClick={() => setTab('account')} className={tabBtn('account')}>
                            <KeyRound size={14} className="mx-auto mb-1" /> Hesap
                        </button>
                    </div>
                </div>

                {tab === 'regions' && (
                    <div className="p-6 pt-0 flex flex-col flex-1 min-h-0">
                        <div className="relative mb-6">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a89361]/40" size={14} />
                            <input
                                placeholder="Arşivlerde ara…"
                                className="w-full bg-[#0a0a0a] border border-[#a89361]/20 rounded-md py-2 pl-9 pr-3 text-xs focus:outline-none focus:border-[#a89361]/60 placeholder:text-[#a89361]/20 text-[#e0d8c3]"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </div>
                        <button
                            onClick={() => setSelected('new')}
                            className={`w-full p-4 rounded-md flex items-center justify-center gap-2 border mb-4 shrink-0 ${selected === 'new' ? 'bg-[#a89361]/10 border-[#a89361] text-[#a89361]' : 'border-dashed border-[#a89361]/20 hover:border-[#a89361]/40 text-[#a89361]/60'}`}
                        >
                            <Plus size={16} /> <span className="text-[11px] font-bold uppercase">Yeni Ekle</span>
                        </button>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                            {filtered.map((r) => (
                                <div
                                    key={r.id}
                                    onClick={() => setSelected(r.id)}
                                    className={`group w-full p-3 rounded-md flex items-center justify-between cursor-pointer border ${selected === r.id ? 'bg-[#121212] border-[#a89361]/40' : 'border-transparent hover:bg-[#a89361]/5'}`}
                                >
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="w-8 h-8 shrink-0 rounded bg-[#0a0a0a] border border-[#a89361]/10 flex items-center justify-center overflow-hidden">
                                            {mediaUrl(r.image) ? <img src={mediaUrl(r.image)} alt="" className="w-full h-full object-cover" /> : <MapPin size={12} className="text-[#a89361]/30" />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className={`font-serif text-sm truncate uppercase tracking-wider ${selected === r.id ? 'text-[#a89361]' : 'text-[#e0d8c3]/80'}`}>{r.name}</div>
                                            {!!r.panoramas?.length && (
                                                <div className="text-[9px] text-[#a89361]/50 flex items-center gap-1">
                                                    <Compass size={9} /> {r.panoramas.length} × 360°
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            remove(r);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-2 text-red-900/60 hover:text-red-500"
                                        aria-label="Sil"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </aside>

            <main className="flex-1 flex flex-col h-full relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#a89361 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-12 z-10">
                    {tab === 'users' && isAdmin && <UsersTab currentUser={session.username} />}
                    {tab === 'account' && <AccountTab session={session} />}
                    {tab === 'territories' && <TerritoriesTab regions={regions} />}
                    {tab === 'regions' && selected !== null && (
                        <RegionEditor
                            regionId={selected}
                            regions={regions}
                            onSaved={(id) => {
                                fetchRegions();
                                setSelected(id);
                            }}
                            onRefresh={fetchRegions}
                        />
                    )}
                    {tab === 'regions' && selected === null && (
                        <div className="h-full flex flex-col items-center justify-center text-[#a89361]/20 gap-4">
                            <Settings size={64} strokeWidth={1} />
                            <p className="text-2xl font-serif tracking-[0.3em] uppercase">Velutan Arşivi</p>
                            <p className="text-[10px] tracking-[0.5em] uppercase">Bölge seçin ya da yeni ekleyin</p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
