/**
 * Sol alttaki "Teşekkürler", "Kim Yaptı?" ve "Meraklısına" pencerelerinin metinleri.
 * Her bölüm paragraflardan oluşur; `links` paragrafın altına bağlantı olarak eklenir.
 */
export interface InfoSection {
    heading?: string;
    paragraphs: string[];
    links?: { label: string; href: string }[];
    list?: string[];
}

export interface InfoPage {
    id: 'tesekkurler' | 'kim-yapti' | 'meraklisina';
    title: string;
    kicker: string;
    sections: InfoSection[];
}

export const INFO_PAGES: InfoPage[] = [
    {
        id: 'tesekkurler',
        title: 'Teşekkürler',
        kicker: 'Bu harita yalnız yapılmadı',
        sections: [
            {
                heading: 'Intch ve velutanmap.com',
                paragraphs: [
                    "Bu projenin en büyük ilham kaynağı, Intch'in emek emek inşa ettiği velutanmap.com oldu. Velutan'ın yerlerini, rotalarını ve ölçeğini ilk kez bu kadar yaşayan bir haritada gördüğümüzde, \"bunu bir adım öteye, üç boyuta taşıyalım\" fikri doğdu.",
                    "Haritadaki bölge konumlarının önemli bir kısmı ve resmi ölçek (harita genişliği 5431 km) velutanmap.com'dan alındı. Oradaki 360 derece gezinti özelliği, içerikleriyle birlikte buraya da aynen entegre edildi: Demir Yemin'in avlusundan Atrapolis kulesine, Qasaar çölündeki kamptan Ira'Zherak'ın kovanına kadar 65 panoramanın hepsi velutanmap.com'dan geliyor.",
                    'Bize yol gösterdiğin, ilham verdiğin ve Velutan\'ı keşfedilebilir bir dünyaya dönüştürdüğün için kocaman teşekkürler Intch. Bu harita, senin açtığın yolda yürüyor.',
                ],
                links: [{ label: 'velutanmap.com', href: 'https://velutanmap.com' }],
            },
            {
                heading: 'Velutan Wiki topluluğu',
                paragraphs: [
                    "Bölgelerin kronikleri, karakterlerin hikâyeleri ve portreleri Velutan Fandom Wiki'yi besleyen herkesin emeğidir. Atrapolis'in Hiç Sönmeyen Ateş altındaki karanlığı, Lord Aldor'un Dorngalir zaferi, Sindar Boynuzluları ve Gulbaranlar... Bu haritadaki lore'un neredeyse tamamı onların yazdıklarından derlendi.",
                    'Bilgiyi düzenleyen, görselleri yükleyen ve evreni kayıt altına alan tüm wiki editörlerine teşekkürler.',
                ],
                links: [{ label: 'velutan.fandom.com', href: 'https://velutan.fandom.com/tr' }],
            },
            {
                heading: 'Velutan evreni ve oyuncuları',
                paragraphs: [
                    "Ve elbette bu dünyayı yaratan Swaggybark'a, karakterlere can veren oyunculara ve her oturumu izleyip evreni büyüten topluluğa: Velutan sizinle var.",
                ],
            },
            {
                heading: 'Dayıya selam',
                paragraphs: [
                    "Velutan'ın babası, dayımız Swaggybark'a (Alpcan Alpar) CanGPT'den ve w0fly'dan kocaman selam! Bu harita, senin kurduğun dünyada kaybolmayı sevenlerin sana küçük bir hediyesi.",
                ],
            },
            {
                heading: 'Haritayı tavaf eden ejderha',
                paragraphs: [
                    'Gökyüzündeki ejderha modeli, spacewatermelon\'un "Dragon flying" çalışmasıdır (CC BY 4.0). Model haritaya uyarlanıp sıkıştırıldı, rengi Velutan\'ın kızılına çekildi.',
                ],
                links: [{ label: 'Dragon flying (Sketchfab)', href: 'https://sketchfab.com/3d-models/dragon-flying-5c8c586da7ad450a8e58b56289a26739' }],
            },
            {
                heading: 'Velutan Ezgileri',
                paragraphs: [
                    'Ambiyans listesindeki parçalar YouTube oynatıcısıyla, sanatçıların kendi yüklemelerinden çalınır; haklar sahiplerine aittir: Andreas Rönnberg, Rory in early 20s, Mountain Realm, Avith Ortega, Ziggurath, Nocmar ve Devakant. Beğendiysen onları dinleyerek destek ol.',
                ],
            },
        ],
    },
    {
        id: 'kim-yapti',
        title: 'Kim Yaptı?',
        kicker: 'Haritanın arkasındakiler',
        sections: [
            {
                paragraphs: [
                    "Merhaba, ben Emre yani w0fly.",
                    "Biraz vaktinizi çalacağım ancak okursanız da sevinirim :)",
                    "Bu projeye başlarken ümidim ve motivasyonum aslında yerindeydi fakat hayatımda bazı olaylar oldu ve mentalitemi sarsacak çok şey yaşandı. Özel hayatımı açmayı açıkçası çok sevmem ancak hepimiz neticede kusursuz hayatlar yaşamıyoruz. Bu proje, benim aciz ve çaresiz kaldığım ilk projedir. Sebebi ise daha önce 3D Web teknolojileri ile çalışma deneyimimin olmaması ve 3D konusunda çok usta bir kademede olmayışımdır. Ortalama 11-12 aydır (9'dan sonra saymayı unuttum, çünkü tek amacım kusursuz bir şey çıkarmaktı) uğraştığım bu projede derdim, onu kendi gözümde geliştirebilmek için gece gündüz işimden ve zamanımdan feragat ederek topluluğa güzel bir içerik sunabilmekti. Başarabildim mi, fikrim yok. Lakin sevileceğine ve güzel geri dönüşler bırakacağına şüphem yok. İlgili sistemi yazarken çalmadığım kapı, görmediğim muamele ve atılmadık iftira kalmadı. Ben bunlara alışığım ve hepsini sineye çekecek kadar da sabırlı biriyim. Ancak çocuk dalaşına girmektense hayatıma yön verip, işlerimle birlikte bu baş koyduğum projeyi söylenenlere kulak asmadan tamamlamak ve sorunsuz bir hâle getirmek istedim. Yaptım mı? Sanırım. Umarım beğenir ve seve seve kullanırsınız. Umarım lore anlatımlarında ve çeşitli rehberlerde işinize yarar. Bu proje geliştirmeye ve uzatılmaya açıktır. İlgili proje GitHub ve benzeri repository'lerde kullanıma açılacaktır. Ancak bu sadece teknik bir talep ve istek göndermeniz için mümkün kılınacaktır. İlgili projeyi başka bir yerde Dayının, yani Swaggybark'ın talebi, isteği ve ricası olmadan kullanıma sunmak benim işim ya da görevim değil. Söz vermiştim, sözümü tutuyorum. Gecikmeler oldu. Bunun tamamen farkındayım. Ancak takdir edersiniz ki tek başına yapılabilecek çok kolay bir proje değil. Kınayıp alay eden, bu konuyu saçma sapan yerlere çeken arkadaşlara buradan şunu söylemek istiyorum: Lütfen en iyisini siz yapın, biz de kullanalım. Ben en iyisini yaptığımı iddia etmiyorum; sadece işe yarayabilecek güzel bir şey sunduğumu düşünüyorum. Benim için en iyisi diye bir şey işimde bile olmamıştır. Her müşterime zaten \"Web siteleri her zaman beta modundadır. Web bir moda gibidir ve her şey ilerledikçe güzelleşir.\" derim. Bu söylemim, bu proje de dâhil olmak üzere yaptığım her proje için geçerlidir.",
                    "Uzun lafın kısası, insanlara faydalı olmaya çalışın. Yardımcı olun. Faydanın ve yardımın size illaki güzel geri dönüşü olacaktır. Şayet bana olmadıysa, en azından size olsun.",
                    "Bu yazımı okuduğunuz, yazdığım projeyi incelediğiniz ve çeşitli geri dönüşlerinizi gönderdiğiniz için müteşekkirim. Unutmadan: bu projeye editörler veri girebilir ve güncelleme yapabilir.",
                ],
            },
            {
                heading: 'İrtibat',
                paragraphs: [],
                list: [
                    'Discord: w0fly',
                    'E-posta: hi@nitrobyte.com.tr',
                    'Teknik konularda ya da güvenlik tarafında bir şey mi buldunuz? Ya fork atın ya da yazın: teknik@nitrobyte.com.tr',
                ],
                links: [
                    { label: 'hi@nitrobyte.com.tr', href: 'mailto:hi@nitrobyte.com.tr' },
                    { label: 'teknik@nitrobyte.com.tr', href: 'mailto:teknik@nitrobyte.com.tr' },
                ],
            },
            {
                paragraphs: [
                    "velutanmap.com'un yapımcısı Intch dayıya ve Velutan Fandom'daki editörlere buradan çok çok teşekkürler. Lore ve kavramlar konusunda önemli bir bilgi kaynağı ve rehber oldukları için.",
                    'Sadece Velutan.',
                ],
            },
        ],
    },
    {
        id: 'meraklisina',
        title: 'Meraklısına',
        kicker: 'Perde arkası',
        sections: [
            {
                heading: 'Emeğin dağılımı',
                paragraphs: [
                    "Bu projenin yaklaşık %20'sinde yapay zekâ desteği kullanıldı: kodun bir kısmı, optimizasyon ve hata ayıklama süreçlerinde. Geri kalan her şey, yani haritanın kendisi, zemin (terrain) katmanları, su ve kara dokuları, dağlar, ormanlar, yollar, isimler, 3D sahnenin kurgusu ve görsel dil, tamamen insan eliyle, tek tek yapıldı.",
                    "Bu %20'lik yapay zekâ payının %5'lik kısmı CanGPT'ye ait: CanGPT'nin eski hafıza verileri videolardan çıkarıldı ve Gemma / Qwen tabanlı bir modele eğitilerek projeye kazandırıldı.",
                ],
            },
            {
                heading: 'Nasıl çalışıyor?',
                paragraphs: [
                    'Harita, el ile çizilmiş 8192×7192 piksellik katmanlardan oluşuyor: su, kara, yollar, semboller (dağlar ve ağaçlar), isimler ve çerçeve. Bir derleme aracı bu katmanları okuyup tarayıcının kaldırabileceği hâle getiriyor:',
                ],
                list: [
                    'Zemin: su, kara, yollar ve dağ çizimleri tek bir dokuda birleşiyor; cihaza göre 4K ya da 2K sürümü yükleniyor.',
                    'Yükselti: dağ sembollerinden bir yükselti haritası çıkarılıyor ve zemin gerçek 3D röliefe dönüşüyor. Işık bu yükseltiye göre düşüyor.',
                    'Ormanlar: çizimdeki her ağaç sembolü okunup türüne (çam, yapraklı, karlı, solmuş) ve rengine göre 3D ağaca dönüşüyor. 25 binden fazla ağaç tek seferde (instancing) çiziliyor ve rüzgârda salınıyor.',
                    'İsimler: isim katmanı kelime kelime ayrılıp, her biri altındaki en yüksek noktanın üzerinde düz duracak şekilde ayrı bir katmanda çiziliyor; dağların üstünde bükülmüyor.',
                    'Kamera: uzaktan neredeyse tepeden bakıyor, yaklaştıkça eğilerek manzaraya dönüşüyor. Zoom imlecin olduğu yere yapılıyor.',
                ],
            },
            {
                heading: 'Teknoloji',
                paragraphs: [],
                list: [
                    'Harita: Next.js, React, Three.js (React Three Fiber, Drei), GSAP, Tailwind CSS',
                    'İçerik paneli: Next.js, PIXI.js koordinat seçici, rol tabanlı yetki (yönetici / editör)',
                    'Sunucu: Node.js, Express, yerleşik SQLite, JWT, Docker, nginx',
                    'Harita derleme aracı: Python (Pillow, NumPy, SciPy)',
                    '360° görüntüleyici: Three.js üzerinde eşdikdörtgen küre',
                ],
            },
            {
                heading: 'Neden bu kadar sürdü?',
                paragraphs: [
                    "İlk sürüm 2D bir haritaydı (PIXI.js). Üç boyuta geçerken asıl savaş görsellikle değil, performans ve render sorunlarıyla verildi:",
                ],
                list: [
                    'Bellek: yedi adet 8K katman aynı anda yüklenince ekran kartı belleğinde yaklaşık 1.6 GB yer kaplıyordu. Bu da özellikle dizüstü ve mobil cihazlarda çökmelere yol açıyordu. Katmanlar birleştirilip sıkıştırıldı; 160 MB\'lık görseller ~7 MB\'a indi.',
                    'Oranlar: harita kare formattayken 3D sahnede 16:9\'a gerilmişti; her şey dikeyde ezik görünüyordu.',
                    'Ağaçlar: binlerce ağacı tek tek çizmek kare hızını öldürüyordu. Hepsini tek çizim komutunda toplayan instancing ve sembollerden otomatik ağaç çıkaran bir sistem gerekti.',
                    'İsimler: zemine gömülü isimler, dağlar yükselince onlarla birlikte bükülüp okunmaz hâle geliyordu. Ayrı bir katmana taşındılar.',
                    "Zoom takılması: her yakınlaştırmada 4K doku ekran kartına baştan yükleniyordu. Bu gizli hata bulunup giderilince kare süresi 245 ms'den 15 ms'ye indi.",
                ],
            },
        ],
    },
];
