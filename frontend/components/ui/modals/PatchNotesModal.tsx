'use client';

import React, { useState, useEffect } from 'react';
import { X, ChevronRight, Zap, Sparkles } from 'lucide-react';

const PatchNotesModal = () => {
    const [isOpen, setIsOpen] = useState(false);
    const PATCH_VERSION = '1.3.0';

    useEffect(() => {
        // Gizli modda localStorage hata fırlatabilir; o durumda notları göster
        let hasSeen = false;
        try {
            hasSeen = !!localStorage.getItem(`seen_patch_${PATCH_VERSION}`);
        } catch {}
        if (hasSeen) return;
        // Harita yüklenip yerleştikten sonra aç (ilk görüntüyü kapatmasın)
        const t = setTimeout(() => setIsOpen(true), 4500);
        return () => clearTimeout(t);
    }, []);

    const handleClose = () => {
        setIsOpen(false);
        try {
            localStorage.setItem(`seen_patch_${PATCH_VERSION}`, 'true');
        } catch {}
    };

    if (!isOpen) return null;

    const notes = [
        { title: "Yaşayan 3D Arazi", desc: "Dağlar gerçek yükseltiyle yükseliyor; 25 binden fazla 3D ağaç rüzgârda salınıyor. İsimler artık dağlara yapışmadan düz duruyor." },
        { title: "360° Mekânlar", desc: "Demir Yemin, Atrapolis, Qasaar ve daha fazlası: 65 panoramayla mekânların içinde gezin (kaynak: velutanmap.com)." },
        { title: "Kronikler & Karakterler", desc: "Velutan Wiki'den derlenen bölgeler, karakter portreleriyle birlikte lore panelinde." },
        { title: "Daha Akıcı", desc: "Doku boyutları 160 MB'tan ~7 MB'a indi; zoom imlecin olduğu yere yapılıyor, pusula doğru yönü gösteriyor." },
    ];


    return (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-500">
            <div className="relative w-full max-w-2xl bg-[#120c06] border-2 border-[#a89361]/40 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]">
                
                {/* Header Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#a89361] to-transparent" />
                
                <div className="p-8">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="w-4 h-4 text-[#a89361]" />
                                <span className="text-[#a89361]/60 text-[12px] uppercase font-black tracking-[0.3em]">Yeni Güncelleme Mevcut</span>
                            </div>
                            <h2 className="text-3xl font-serif italic font-black text-white tracking-tight">
                                Velutan <span className="text-[#a89361]">V{PATCH_VERSION}</span>
                            </h2>
                        </div>
                        <button 
                            onClick={handleClose}
                            className="p-2 hover:bg-white/5 rounded-full transition-colors text-[#a89361]"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                        {notes.map((note, i) => (
                            <div key={i} className="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-2xl p-4 transition-all duration-300">
                                <div className="flex items-start gap-4">
                                    <div className="p-2 rounded-lg bg-[#a89361]/10 text-[#a89361]">
                                        <Zap className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-[#a89361] font-bold text-sm mb-1 group-hover:translate-x-1 transition-transform">{note.title}</h3>
                                        <p className="text-zinc-400 text-sm leading-relaxed font-serif italic">{note.desc}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/5 flex justify-between items-center">
                        <div className="text-[12px] text-zinc-500 font-mono tracking-widest uppercase">
                            © 2026 VELUTAN EKİBİ
                        </div>
                        <button 
                            onClick={handleClose}
                            className="flex items-center gap-2 px-8 py-3 bg-[#a89361] hover:bg-[#c49b4d] text-black font-black uppercase tracking-widest text-[12px] rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(168,147,97,0.3)]"
                        >
                            Keşfetmeye Başla
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(168, 147, 97, 0.2);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(168, 147, 97, 0.4);
                }
            `}</style>
        </div>
    );
};

export default PatchNotesModal;
