'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/** "Nasıl Çalışır?": 360° mekânda savaş ızgarası ve token'ların adım adım anlatımı (ekran görüntüleriyle) */
const STEPS: { title: string; image: number; body: React.ReactNode }[] = [
    {
        title: 'Mekâna gir',
        image: 1,
        body: (
            <>
                Haritada bir bölgeye tıkla, açılan panelde <b>360° Gez</b>&apos;e bas. Mekânın tam ortasında durursun: sürükleyerek etrafına bakar,
                tekerlekle yakınlaşırsın. Alttaki şeritten bölgenin diğer mekânlarına geçebilirsin.
            </>
        ),
    },
    {
        title: 'Oyunu kur',
        image: 2,
        body: (
            <>
                <b>Savaş</b>&apos;a ilk bastığında masa kurulur. <b>Sistemsiz</b>: yalnızca ızgara, token ve zar. <b>Velutan 5e</b>: inisiyatif, HP ve MANA,
                saldırı ve ZS, durumlar, ölüm zarları; hepsi açık. <b>Kendi masam</b>: mekanikleri tek tek seç. Zarların nasıl atılacağını da seç: elle salla,
                otomatik ya da hızlı. Alttaki ayar düğmesiyle istediğin an değiştirirsin.
            </>
        ),
    },
    {
        title: 'Savaş ızgarasını aç',
        image: 3,
        body: (
            <>
                Sağ üstteki <b>Savaş</b> düğmesi mekânın zeminine kareli bir savaş alanı serer. Her kare <b>1,5 m (5 ft)</b>. Aynı düğmeyle ızgarayı
                kapatırsın; token&apos;ların silinmez, ızgarayı yeniden açınca yerlerinde durur.
            </>
        ),
    },
    {
        title: 'Izgarayı mekâna oturt',
        image: 4,
        body: (
            <>
                Her panorama farklı yükseklikten çekildiği için ızgara bazen zeminde yüzer gibi görünür. <b>Izgarayı mekâna oturt</b>&apos;u aç:
                <b> Zemin derinliği</b> çizgileri yere yatırır, <b>Kare boyu</b> ölçeği, <b>Açı</b> ise kareleri yola, duvara ya da masaya hizalar.
                Ayar her mekân için ayrı saklanır.
            </>
        ),
    },
    {
        title: "Token'ını hazırla",
        image: 5,
        body: (
            <>
                Tarafı seç: <span className="text-blue-400">Oyuncu</span>, <span className="text-red-400">Düşman</span>, <span className="text-amber-400">NPC</span>{' '}
                ya da <span className="text-violet-400">Canavar</span>. Adını yaz ve boyutunu seç (insan 1×1, ogre 2×2, ejderha 3×3). İstersen{' '}
                <b>karakter görselini</b> yükle: arkası şeffaf bir PNG ya da WebP olursa karakterin ızgarada ayakta durur. Görsel yoksa baş harfli bir
                pul olur.
            </>
        ),
    },
    {
        title: 'Zemine yerleştir',
        image: 6,
        body: (
            <>
                <b>Token yerleştir</b>&apos;e bas, sonra zeminde istediğin kareye tıkla; token karenin ortasına oturur. Fikrini değiştirirsen{' '}
                <b>Vazgeç</b>&apos;e ya da Esc&apos;ye bas.
            </>
        ),
    },
    {
        title: 'Sürükle ve mesafeyi gör',
        image: 7,
        body: (
            <>
                Token&apos;ı tutup sürükle, bıraktığın kareye oturur. Sürüklerken üstte <b>kaç kare ve kaç metre</b> gittiği yazar; çapraz adım da tek
                kare sayılır (5e kuralı). Hareket hakkını buradan say.
            </>
        ),
    },
    {
        title: 'Zarı salla ve fırlat',
        image: 8,
        body: (
            <>
                <b>Savaşı başlat</b> deyince herkesin inisiyatif zarı kupaya gelir. Zarları <b>basılı tut, salla</b> (tıkırdar) ve <b>savurarak bırak</b>:
                ne kadar hızlı savurursan o kadar sert atılır, zarlar kenarlara çarpıp yuvarlanır, üstte kalan yüz sayılır. Kısa dokunuş kendiliğinden atar;
                telefonda telefon düğmesini açıp telefonu sallayarak da atabilirsin. Saldırı, hasar, kurtarma… her zar böyle atılır.
            </>
        ),
    },
    {
        title: 'Sıra ve turlar',
        image: 9,
        body: (
            <>
                Üstteki şerit inisiyatif sırasıdır: portreler, HP ve MANA çubukları, durumlar. Sırası gelen zeminde altın halkayla parlar; hızı kadar kare
                yürür (sürüklerken sayılır, <b>Atıl</b> iki katına çıkarır). İşi bitince <b>Sıradaki</b>; sıra başa dönünce yeni tur başlar.
            </>
        ),
    },
    {
        title: 'Saldır ve büyü yap',
        image: 10,
        body: (
            <>
                Kartta <b>Saldır</b>&apos;a bas, hedefe tıkla. Mesafe, hedefin ZS&apos;si ve isabet şansı görünür; durumlar (kör, zehirli, yerde…) avantaj ya da
                dezavantaj önerir. d20 isabet ederse hasar zarı atılır ve can kendiliğinden düşer; doğal 20 kritiktir. <b>Büyü</b> MANA harcar: hasar ya
                da iyileştirme, istersen hedefe kurtarma zarı attırıp başarıda yarım hasar.
            </>
        ),
    },
    {
        title: 'Oyuncuları masaya çağır',
        image: 12,
        body: (
            <>
                Üstteki <b>Oyuncuları davet et</b> bir masa açar: kodu ve bağlantıyı oyunculara gönder. Bağlantıyı açan oyuncu adını yazar, karakterini
                seçer ve aynı mekânda aynı savaşı canlı görür. Kendi karakterini yürütür, zarını atar; attığı her zar senin günlüğüne ve herkesin ekranına
                düşer. Kuralları, düşmanları ve hamleleri sen yönetirsin. Bitince <b>Masayı kapat</b>.
            </>
        ),
    },
    {
        title: 'Savaşı yönet',
        image: 11,
        body: (
            <>
                Listede ya da şeritte bir ada tıklayınca kartı açılır: HP/MANA, yetenek ve kurtarma zarları, durumlar. 0 HP&apos;ye düşen oyuncu bayılır,
                sırası geldikçe ölüm zarı atar. <b>Kütüphaneye kaydet</b> dersen o karakter her mekâna tek tıkla gelir. Masa bu tarayıcıda, o mekâna özel saklanır;
                oyuncular ortak masadan canlı izler.
            </>
        ),
    },
];

export default function BattleGuide({ onClose }: { onClose: () => void }) {
    const [i, setI] = useState(0);
    const last = i === STEPS.length - 1;
    const step = STEPS[i];

    useEffect(() => {
        const key = (e: KeyboardEvent) => {
            e.stopPropagation();
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, STEPS.length - 1));
            if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0));
        };
        // Yakalama aşamasında: panoramanın ok tuşu (mekân değiştirme) ve Esc (kapatma) tetiklenmesin
        window.addEventListener('keydown', key, true);
        return () => window.removeEventListener('keydown', key, true);
    }, [onClose]);

    return createPortal(
        <div className="fixed inset-0 z-[13000] flex items-center justify-center bg-black/80 p-3 md:p-8" onClick={onClose}>
            <section
                role="dialog"
                aria-label="Savaş ızgarası nasıl çalışır"
                onClick={(e) => e.stopPropagation()}
                className="relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border-2 border-amber-600/40 bg-[#120c06] shadow-[0_0_100px_rgba(0,0,0,1)]"
            >
                <div className="flex items-center justify-between border-b border-amber-600/20 px-4 py-3 md:px-6">
                    <div>
                        <div className="text-[11px] font-black uppercase tracking-[0.3em] text-amber-500/70">Savaş Izgarası · Nasıl Çalışır?</div>
                        <div className="text-[12px] text-amber-100/40">
                            Adım {i + 1} / {STEPS.length}
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Kapat" className="rounded-full p-1.5 text-amber-500 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                <div className="overflow-y-auto custom-scrollbar">
                    <div className="relative aspect-[1100/653] w-full bg-black">
                        {/* Bütün adımlar önceden yüklenir: geçişte boş kare görünmesin */}
                        {STEPS.map((s, n) => (
                            <img
                                key={n}
                                src={`/rehber/savas-${s.image}.webp`}
                                alt={`${n + 1}. adım: ${s.title}`}
                                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${n === i ? 'opacity-100' : 'opacity-0'}`}
                            />
                        ))}
                    </div>
                    <div className="px-4 py-4 md:px-6">
                        <h3 className="font-serif text-xl font-black text-amber-300 md:text-2xl">
                            <span className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 align-middle font-sans text-[14px] text-black">{i + 1}</span>
                            {step.title}
                        </h3>
                        <p className="mt-2 font-serif text-[15px] leading-relaxed text-amber-100/85">{step.body}</p>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-amber-600/20 px-4 py-3 md:px-6">
                    <button
                        onClick={() => setI((v) => Math.max(v - 1, 0))}
                        disabled={i === 0}
                        className="flex items-center gap-1 rounded-full border border-amber-600/30 px-3 py-1.5 text-[12px] font-bold text-amber-400 hover:border-amber-400 disabled:opacity-30"
                    >
                        <ChevronLeft size={14} /> Geri
                    </button>
                    <div className="flex gap-1.5">
                        {STEPS.map((_, n) => (
                            <button
                                key={n}
                                onClick={() => setI(n)}
                                aria-label={`${n + 1}. adım`}
                                className={`h-2 rounded-full transition-all ${n === i ? 'w-6 bg-amber-400' : 'w-2 bg-amber-600/40 hover:bg-amber-500/70'}`}
                            />
                        ))}
                    </div>
                    <button
                        onClick={() => (last ? onClose() : setI((v) => v + 1))}
                        className="flex items-center gap-1 rounded-full bg-amber-600 px-4 py-1.5 text-[12px] font-black uppercase tracking-wider text-black hover:bg-amber-500"
                    >
                        {last ? 'Başla' : 'İleri'} {!last && <ChevronRight size={14} />}
                    </button>
                </div>
                <div className="px-4 pb-2 text-center text-[10px] text-amber-100/30 md:px-6">
                    Mekân görselleri: velutanmap.com · Örnek ejderha: spacewatermelon, &quot;Dragon flying&quot; (CC BY 4.0)
                </div>
            </section>
        </div>,
        document.body,
    );
}
