'use client';

import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api, errorMessage, Role } from '@/lib/api';

interface User {
    id: number;
    username: string;
    role: Role;
}

const field = 'w-full bg-[#050505] border border-[#a89361]/20 rounded p-4 text-sm text-[#e0d8c3] outline-none focus:border-[#a89361]/60';
const ROLE_LABEL: Record<Role, string> = { admin: 'Yönetici', editor: 'Editör' };

/** Yalnızca yöneticiler görür: editör/yönetici ekle, rol değiştir, sil */
export default function UsersTab({ currentUser }: { currentUser: string }) {
    const [users, setUsers] = useState<User[]>([]);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<Role>('editor');

    const load = async () => {
        try {
            setUsers((await api.get<User[]>('/auth/users')).data);
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };
    useEffect(() => {
        load();
    }, []);

    const add = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/auth/users', { username, password, role });
            setUsername('');
            setPassword('');
            toast.success(`${ROLE_LABEL[role]} eklendi`);
            load();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const changeRole = async (u: User, r: Role) => {
        try {
            await api.put(`/auth/users/${u.id}/role`, { role: r });
            toast.success('Rol güncellendi');
            load();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    const remove = async (u: User) => {
        if (!confirm(`${u.username} silinsin mi?`)) return;
        try {
            await api.delete(`/auth/users/${u.id}`);
            toast.success('Silindi');
            load();
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-12">
            <div>
                <h2 className="text-4xl font-serif font-bold text-[#e0d8c3] uppercase tracking-[0.2em] mb-4">Yetki Kontrolü</h2>
                <p className="text-[#a89361]/50 text-sm italic font-serif">
                    <b>Editörler</b> bölge, lore, görsel ve 360° içerik ekleyip düzenleyebilir. <b>Yöneticiler</b> ayrıca kullanıcıları yönetir.
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-10">
                <div className="bg-[#0a0a0a]/40 p-8 rounded-lg border border-[#a89361]/5">
                    <h3 className="text-xs font-bold text-[#a89361] uppercase tracking-[0.2em] mb-6 border-b border-[#a89361]/10 pb-4">Yeni Yetkili</h3>
                    <form onSubmit={add} className="space-y-4">
                        <input className={field} placeholder="Kullanıcı adı" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
                        <input className={field} type="password" placeholder="Parola (en az 10 karakter)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                        <select className={field} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                            <option value="editor">Editör — yalnızca içerik</option>
                            <option value="admin">Yönetici — içerik + kullanıcılar</option>
                        </select>
                        <button type="submit" className="w-full bg-[#a89361]/10 hover:bg-[#a89361]/20 text-[#a89361] border border-[#a89361]/40 py-3 rounded text-xs font-bold uppercase tracking-widest">
                            Ekle
                        </button>
                    </form>
                </div>

                <div className="bg-[#0a0a0a]/40 p-8 rounded-lg border border-[#a89361]/5">
                    <h3 className="text-xs font-bold text-[#a89361] uppercase tracking-[0.2em] mb-6 border-b border-[#a89361]/10 pb-4">Mevcut Yetkililer</h3>
                    <div className="space-y-3">
                        {users.map((u) => (
                            <div key={u.id} className="flex items-center gap-3 bg-[#050505] p-3 rounded border border-[#a89361]/10">
                                <span className="flex-1 font-mono text-sm text-[#e0d8c3] truncate">
                                    {u.username}
                                    {u.username === currentUser && <span className="ml-2 text-[9px] text-[#a89361]/50">(sen)</span>}
                                </span>
                                <select
                                    className="bg-[#0a0a0a] border border-[#a89361]/20 rounded px-2 py-1 text-[11px] text-[#a89361]"
                                    value={u.role}
                                    disabled={u.username === currentUser}
                                    onChange={(e) => changeRole(u, e.target.value as Role)}
                                >
                                    <option value="editor">Editör</option>
                                    <option value="admin">Yönetici</option>
                                </select>
                                <button onClick={() => remove(u)} disabled={u.username === currentUser} className="text-red-900 hover:text-red-500 disabled:opacity-20" aria-label="Sil">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
