'use client';

import React, { useState, useEffect } from 'react';
import { X, ChevronRight, Sparkles, Plus, Wrench } from 'lucide-react';

const PatchNotesModal = () => {
    const [isOpen, setIsOpen] = useState(false);
    const PATCH_VERSION = '1.6.4';

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
                { title: 'Dağ zirveleri', desc: 'Yüksek dağların tepesinde kar örtüsü, dik yamaçlarında soğuk gri kaya. Kışın kar sınırı aşağı iniyor ama dik kaya yüzleri karın arasından seçiliyor; dağlar beyaza gömülüp kaybolmuyor.' },
                { title: 'Kış ve sonbahar', desc: "Ayarlar > Tema'da Kış seçince bütün harita karla örtülüyor, kıyılar çatlaklı buz tutuyor, kar yağıyor; ağaçlar karlı. Sonbaharda çayırlar altın-kızıla dönüyor, ağaçlar kızıl ve sarı, yapraklar dönerek düşüyor. Geçiş yumuşak." },
                { title: 'Ham haritaya sadık 3D', desc: 'Zemin artık Velutan ham haritasının kendisi (kar, doku, gölge dahil). Ağaçlar yalnızca haritada ağaç çizili yerlerde; türü (çam, karlı çam, yapraklı) ve rengi çizimden. Dağlarda ağaç yok, dağ çizimleri kabartmayla birlikte duruyor.' },
                { title: 'Araziye göre yürüme hızı', desc: "Seyahatte orman (×0,75) ve bataklık (×0,5) de sayılıyor; ikisi de haritadaki çizimden okunuyor. Dökümde Düz, Orman, Sarp, Bataklık, Dağ ve Deniz ayrı ayrı; yolda orman cezası yok, bataklıkta geçit işe yarıyor." },
                { title: 'Daha net 360° mekânlar', desc: "Görseller velutanmap.com'daki en yüksek kaliteli hâllerinden yeniden alındı. Mekânlar oradaki gibi geniş açıyla (uzaktan) açılıyor, renkler olduğu gibi; keskin ekranlarda tam çözünürlükte." },
                { title: 'Yollar', desc: "Haritadaki noktalı yollar artık gerçek yol: Seyahat'te 'Yollardan git' açıkken (varsayılan) rota durakların arasındaki yolu izliyor. Yolda sarp arazi ve dağ geçidi daha hızlı geçiliyor; dökümde 'Yol üzerinde … km' görünüyor." },
                { title: 'Gece ve gündüz', desc: "Seyahat simülasyonunda günler geçiyor: güneş doğuyor, batıyor, gece harita ay ışığına bürünüyor ve şehirler fener gibi yanıyor; sağ üstte kaçıncı gün ve saat. Ayarlar > Tema'dan haritayı sürekli döngüye ya da kendi saatine de bağlayabilirsin." },
                { title: 'Temalar', desc: 'Ayarlar > Tema: ağaçlar Doğal, Gri tonlu (siyah-beyaz-gri), Sonbahar ya da Kış; harita Renkli, Siyah-beyaz ya da Sepya.' },
                { title: '360° mekânlarda gezinti', desc: "Street View gibi: mekândaki oklu halkaya bas, bakış oraya dönüp yaklaşır ve bağlı mekâna geçersin (ör. Kahel: Harabeler → Koridor → Salon → Malphasius). 'i' halkası wiki kaydını açar: karakter, yer, hikâye; metindeki bağlantılar ve ilgili kayıtlar aynı pencerede açılır. Noktalar ve kayıtlar velutanmap.com'dan canlı geliyor, orada eklendikçe burada da görünür." },
                { title: 'Doğru bakış yönü', desc: "360° mekânlar artık velutanmap.com'daki gibi görselin ortasından, asıl sahneye bakarak açılıyor." },
                { title: 'Sade arayüz', desc: "Harita artık arayüzün altında kalmıyor: Seyahat, Lejant ve Defter sol üstte ince bir çubuk, bir sekmeye basınca açılıyor. Teşekkürler, Kim Yaptı?, Meraklısına ve GitHub tek 'Hakkında' menüsünde; zar, ayarlar, müzik, pusula ve logo küçüldü." },
                { title: 'Günlükte geçmiş zarlar', desc: 'Savaş günlüğündeki her satırın altında o anda atılan zarlar şekilleriyle duruyor: hangi zar, kaç geldi; doğal 20 altın, doğal 1 kırmızı. Ortak masada oyuncuların zarları da.' },
                { title: 'Ortak masa: oyuncular kendi ekranından', desc: "GM 'Oyuncuları davet et' der, bağlantıyı paylaşır. Oyuncular adını yazıp karakterini seçer; aynı mekânda aynı savaşı canlı görür, kendi karakterini yürütür, zarını atar. Atılan her zar herkesin ekranına ve günlüğe düşer." },
                { title: 'Fizikli zarlar', desc: 'Zarları basılı tut, salla, savurarak fırlat: ekranda yuvarlanıp kenarlara çarpar, tıkırdar, üstte kalan yüz sayılır. Kısa dokunuş otomatik atar, telefonda sallayarak da atılır. d4, d6, d8, d10, d12, d20 ve d100.' },
                { title: 'Velutan 5e ile oyna', desc: "360° mekânlarda tam savaş: inisiyatif sırası ve turlar, HP ve MANA, d20'yle Zırh Sınıfına karşı saldırı ve otomatik hasar, büyüler, durumlar, ölüm kurtarma zarları, hareket hakkı ve savaş günlüğü." },
                { title: 'Sistemli ya da sistemsiz', desc: 'Oyunu kurarken seç: sistemsiz (ızgara, token, zar), Velutan 5e ya da mekanikleri tek tek açtığın kendi masan. Zarların elle mi, otomatik mi, hızlı mı atılacağı da senin.' },
                { title: 'Akıl sağlığı ve karakter kütüphanesi', desc: "İstersen akıl sağlığı (Sanity): akıl zarı başarısız olunca akıl puanı düşer. Karakterini bir kez kaydet, her mekâna tek tıkla ekle." },
                { title: '360° mekânlarda savaş ızgarası', desc: "Bir mekâna girip Savaş'a bas: zemine 1,5 m'lik kareli bir savaş alanı serilir. Oyuncu, düşman, NPC ve canavar token'ları koy, sürükle; kaç kare gittiği anında görünür. Izgarayı her mekânın zeminine göre ayarlayabilirsin." },
                { title: '2D karakterlerin sahnede', desc: "Token'a arkası şeffaf bir karakter görseli yükle; karakterin ızgarada ayakta durur, tarafının rengindeki tabanla. Görsel yoksa baş harfli bir pul olur. Hepsi o mekâna özel saklanır." },
                { title: 'Nasıl Çalışır? rehberi', desc: 'Savaş panelindeki rehber, ekran görüntüleriyle adım adım anlatıyor: mekâna gir, ızgarayı aç ve oturt, token hazırla, yerleştir, taşı ve mesafeyi say.' },
                { title: 'Grafik ayarları', desc: "Sol alttaki Ayarlar'dan kaliteyi kendin seç: Otomatik (varsayılan), Asgari, Düşük, Orta, Yüksek ya da yeni Ultra. Ağaç yoğunluğu, rüzgâr, bulutlar, su, ejderha ve çözünürlük tek tek ayarlanabiliyor; seçimin saklanıyor." },
                { title: 'Yeni müzik çalar', desc: 'Velutan Ezgileri artık %0–100 ses ayarlı: sessize al, önceki/sonraki, karıştır, ileri sar, listeden şarkı seç. Paneli küçültünce müzik çalmaya devam ediyor.' },
                { title: 'Yaşayan denizler', desc: 'Su baştan yazıldı: kıyıda sığ ve köpüklü, açıkta derin ve koyu. Büyük okyanuslar dalgalanıyor, güneş dalgalarda parlıyor, ufka doğru gökyüzünü yansıtıyor.' },
                { title: 'Ejderhanın gerçek gölgesi', desc: 'Düz elips yerine ejderhanın kendi silueti karaya, ormana ve suya düşüyor; kanat çırpışı, süzülüşü ve dönüşteki yatışı gölgede de görünüyor.' },
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
                { title: 'Dağlarda ve tepelerde ağaç yok', desc: 'Dağ çizimlerinin çevresinde ve tepelerde hiç ağaç kalmadı; ormanlar ovalarda ve vadilerde.' },
                { title: 'Yer isimleri', desc: 'İsimler bazı yerlerde havada, bazı yerlerde arazinin içinde kalıyordu; artık harflerin altındaki araziye göre oturuyor.' },
                { title: 'Dağ tepelerinde ağaç', desc: 'Dağların zirvesindeki ağaçlar kaldırıldı; ormanlar eteklerde ve vadilerde.' },
                { title: 'Kahel ve Willburg', desc: "İki yerin haritadaki konumu velutanmap.com'daki düzeltmeye göre güncellendi." },
                { title: 'Denizde tekrar eden desen', desc: 'Okyanusta aynı desen kare kare tekrar ediyordu. Dalgalar artık gürültüyle bükülüyor; yönleri ve boyları yerden yere değişiyor, köpük ve parıltı serpiştiriliyor. Altta tekrar eden deniz dokusu da örtüldü.' },
                { title: 'Savaş günlüğü kapanınca çökme', desc: 'Günlüğü çarpıyla kapatınca sayfa hata veriyordu; düzeltildi.' },
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
