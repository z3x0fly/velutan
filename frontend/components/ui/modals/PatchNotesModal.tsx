'use client';

import React, { useState, useEffect } from 'react';
import { X, ChevronRight, Sparkles, Plus, Wrench } from 'lucide-react';

const PatchNotesModal = () => {
    const [isOpen, setIsOpen] = useState(false);
    const PATCH_VERSION = '1.5.2';

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

    const sections = [
        {
            title: 'Eklenenler',
            icon: Plus,
            items: [
                { title: 'Haritayı tavaf eden ejderha', desc: "Olgrud'dan kalkan kızıl ejderha bütün kıtaların üstünden tur atıyor; dağlara yaklaşınca yükseliyor, dönüşlerde yatıyor, gölgesi araziyi izliyor." },
                { title: 'Seyyah Defteri', desc: 'Haritaya kendi işaretini bırak: kamp, görev, hazine, tehlike, buluşma, not. Not düş, en yakın işarete mesafeyi gör, bağlantıyla arkadaşınla paylaş.' },
                { title: 'Sınırlar', desc: 'Krallık ve bölge sınırları araziyle birlikte bükülerek haritada; lejanttan aç/kapa, üzerine gel, tıkla ve oraya uç.' },
                { title: 'Araziye göre seyahat', desc: 'Rotanın geçtiği zemin (düz, sarp, dağ, deniz) otomatik okunuyor; süre buna göre hesaplanıyor, yolcu dağ geçidinde yavaşlıyor, denizi gemiyle geçiyor.' },
                { title: 'Daha canlı ormanlar', desc: 'Yeni ağaç modelleri, orman tabanında çalılar, ağaçtan ağaca renk farkı ve haritayı geçen esinti.' },
                { title: 'Zar Tepsisi ve bölge sayfaları', desc: 'd4–d100, avantaj/dezavantaj ve kritikler; her bölgenin kendi sayfası (/bolge/...).' },
            ],
        },
        {
            title: 'Düzeltilenler',
            icon: Wrench,
            items: [
                { title: 'Havada kalan ağaçlar', desc: 'Tepelerde ve yamaçlarda bazı ağaçlar zeminin biraz üstünde asılı duruyordu; artık hepsi çizilen zemine tam oturuyor, düşük kalitede de.' },
                { title: 'Telefon uyumu', desc: 'Telefonda arayüz üst üste biniyordu. Logo, pusula, lejant ve alt düğmeler küçük ekrana göre yeniden yerleşti; lejant kapalı başlıyor, işaretler ve bilgi düğmeleri sadeleşti.' },
                { title: 'Tıklanan yere durak', desc: 'Seyahat durağı ve yer işareti, yakınlaşınca ya da harita eğikken kayıyordu; artık tam tıkladığın noktaya konuyor. Bölge ismine denk gelen tıklar kaybolmuyor.' },
                { title: 'Seyahat çizgisi', desc: 'Rota dağların içine gömülmüyor; süre artık tek bir arazi seçimine göre değil, yol boyunca gerçek zemine göre.' },
                { title: 'Dağ yükseklikleri', desc: 'Dağlar fazla yüksekti; alçaltıldı, haritanın doğu yarısında daha da. Gri dağlar ve Kalazad diğerlerinden yüksek.' },
                { title: 'Daha hızlı açılış', desc: 'İlk yüklenen kod 258 KB → 28 KB; açılış ekranı beklemesi kalktı, dokular hafifledi. Zayıf cihazlarda takılmalar azaldı.' },
                { title: 'Küçük düzeltmeler', desc: 'Lejant kapatma düğmesi Defter sekmesiyle çakışmıyor; bölge sayfaları kayıyor; karanlık mod eklentileri siteyi bozmuyor.' },
            ],
        },
    ];


    return (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-500">
            <div className="relative w-full max-w-2xl bg-[#120c06] border-2 border-[#a89361]/40 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,1)]">
                
                {/* Header Decoration */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#a89361] to-transparent" />
                
                <div className="p-5 md:p-8">
                    <div className="flex justify-between items-start mb-5 md:mb-8 gap-3">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="w-4 h-4 text-[#a89361]" />
                                <span className="text-[#a89361]/60 text-[11px] md:text-[12px] uppercase font-black tracking-[0.2em] md:tracking-[0.3em]">Yeni Güncelleme</span>
                            </div>
                            <h2 className="text-2xl md:text-3xl font-serif italic font-black text-white tracking-tight">
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

                    <div className="space-y-6 max-h-[58dvh] md:max-h-[55vh] overflow-y-auto pr-2 custom-scrollbar">
                        {sections.map((sec) => {
                            const Icon = sec.icon;
                            return (
                                <section key={sec.title}>
                                    <h3 className="flex items-center gap-2 mb-3 text-[12px] uppercase font-black tracking-[0.3em] text-[#a89361]/70">
                                        <Icon className="w-3.5 h-3.5" /> {sec.title}
                                    </h3>
                                    <div className="space-y-2.5">
                                        {sec.items.map((note) => (
                                            <div key={note.title} className="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-2xl px-4 py-3 transition-colors">
                                                <h4 className="text-[#a89361] font-bold text-sm mb-0.5">{note.title}</h4>
                                                <p className="text-zinc-400 text-[13px] md:text-sm leading-relaxed font-serif italic">{note.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>

                    <div className="mt-5 md:mt-8 pt-4 md:pt-6 border-t border-white/5 flex justify-between items-center gap-3">
                        <div className="text-[12px] text-zinc-500 font-mono tracking-widest">
                            © 2026 <span className="text-[#a89361]/80">w0fly</span>
                        </div>
                        <button 
                            onClick={handleClose}
                            className="flex items-center gap-2 px-5 md:px-8 py-3 whitespace-nowrap bg-[#a89361] hover:bg-[#c49b4d] text-black font-black uppercase tracking-widest text-[12px] rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(168,147,97,0.3)]"
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
