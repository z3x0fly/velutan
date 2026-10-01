'use client';

import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { api, errorMessage, Session } from '@/lib/api';

const field = 'w-full bg-[#050505] border border-[#a89361]/20 rounded p-4 text-sm text-[#e0d8c3] outline-none focus:border-[#a89361]/60';

export default function AccountTab({ session }: { session: Session }) {
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [repeat, setRepeat] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (next !== repeat) return toast.error('Yeni parolalar eşleşmiyor');
        try {
            await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
            setCurrent('');
            setNext('');
            setRepeat('');
            toast.success('Parola değiştirildi');
        } catch (err) {
            toast.error(errorMessage(err));
        }
    };

    return (
        <div className="max-w-md mx-auto space-y-8">
            <div>
                <h2 className="text-3xl font-serif font-bold text-[#e0d8c3] uppercase tracking-[0.2em]">Hesabım</h2>
                <p className="text-[#a89361]/50 text-sm mt-2">
                    {session.username} · {session.role === 'admin' ? 'Yönetici' : 'Editör'}
                </p>
            </div>
            <form onSubmit={submit} className="space-y-4 bg-[#0a0a0a]/40 p-8 rounded-lg border border-[#a89361]/5">
                <input className={field} type="password" placeholder="Mevcut parola" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
                <input className={field} type="password" placeholder="Yeni parola (en az 10 karakter)" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
                <input className={field} type="password" placeholder="Yeni parola (tekrar)" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
                <button type="submit" className="w-full bg-[#a89361] hover:bg-[#c2aa72] text-[#050505] py-3 rounded text-xs font-black uppercase tracking-widest">
                    Parolayı Değiştir
                </button>
            </form>
        </div>
    );
}
