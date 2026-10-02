import MapApp from '../components/MapApp';
import { DEFAULT_DESCRIPTION, fetchRegions, SITE_NAME, SITE_URL } from '../lib/seo';

export const revalidate = 60;

/**
 * Sunucu bileşeni: harita WebGL'de çizildiği için arama motorlarının okuyabileceği metni
 * (başlık, açıklama, bölge bağlantıları, yapılandırılmış veri) HTML olarak sunar.
 * Metin ekran okuyuculara açıktır (sr-only), görsel arayüzü değiştirmez.
 */
export default async function Home() {
    const regions = await fetchRegions();

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebSite',
                '@id': `${SITE_URL}/#website`,
                url: SITE_URL,
                name: SITE_NAME,
                alternateName: ['Velutan 3D Map', 'Velutan Map', 'Velutan Dünya Haritası', 'Velutan 3D Harita'],
                inLanguage: 'tr-TR',
            },
            {
                '@type': 'WebApplication',
                '@id': `${SITE_URL}/#app`,
                name: 'Velutan 3D Dünya Haritası',
                url: SITE_URL,
                applicationCategory: 'GameApplication',
                operatingSystem: 'Web',
                inLanguage: 'tr-TR',
                description: DEFAULT_DESCRIPTION,
                image: `${SITE_URL}/og.jpg`,
                isAccessibleForFree: true,
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'TRY' },
                author: { '@type': 'Person', name: 'w0fly' },
                about: { '@type': 'CreativeWork', name: 'Velutan', creator: { '@type': 'Person', name: 'Swaggybark' } },
            },
        ],
    };

    return (
        <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <header className="sr-only">
                <h1>Velutan Haritası — Velutan 3D Dünya Haritası</h1>
                <p>{DEFAULT_DESCRIPTION}</p>
                {regions.length > 0 && (
                    <nav aria-label="Velutan bölgeleri">
                        <h2>Velutan bölgeleri</h2>
                        <ul>
                            {regions.map((r) => (
                                <li key={r.id}>
                                    <a href={`/bolge/${r.slug}`}>{r.name}</a>
                                    {r.description ? ` — ${r.description}` : ''}
                                </li>
                            ))}
                        </ul>
                        <a href="/bolgeler">Tüm Velutan bölgeleri</a>
                    </nav>
                )}
            </header>
            <MapApp initialRegions={regions} />
        </>
    );
}
