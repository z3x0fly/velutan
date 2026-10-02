import { fetchRegions, plainSummary, SITE_URL, TYPE_LABEL } from '../../lib/seo';

export const revalidate = 600;

/**
 * llms.txt (https://llmstxt.org): yapay zekâ araçlarının siteyi anlaması için kısa, düz metin özet.
 * Bölgeler API'den gelir; panelden eklenen içerik otomatik yansır.
 */
export async function GET() {
    const regions = await fetchRegions();
    const lines = [
        '# Velutan Haritası — Velutan 3D Dünya Haritası',
        '',
        "> Velutan fantezi FRP evreninin (yaratıcısı Swaggybark) interaktif 3D dünya haritası. Bölgeler, kronikler, karakterler, 360° mekân gezintisi, seyahat/mesafe hesaplayıcı ve zar tepsisi içerir. Türkçedir.",
        '',
        'Harita WebGL ile çizilir; metin içerik bölge sayfalarındadır. Ölçek: harita genişliği 5431 km.',
        'İçerik kaynakları: Velutan Fandom Wiki (https://velutan.fandom.com/tr) ve velutanmap.com (360° panoramalar).',
        '',
        '## Ana sayfalar',
        '',
        `- [Velutan Haritası](${SITE_URL}/): İnteraktif 3D dünya haritası`,
        `- [Velutan Bölgeleri](${SITE_URL}/bolgeler): Tüm bölgelerin listesi`,
        `- [Tüm kronikler (tam metin)](${SITE_URL}/llms-full.txt): Bütün bölgelerin lore metinleri tek dosyada`,
        '',
        '## Bölgeler',
        '',
        ...regions.map((r) => `- [${r.name}](${SITE_URL}/bolge/${r.slug}): ${TYPE_LABEL[r.type ?? ''] ?? 'Bölge'}. ${plainSummary(r.description || r.lore || '', 140)}`),
        '',
        '## İletişim',
        '',
        '- Geliştirici: w0fly — hi@nitrobyte.com.tr',
        '',
    ];
    return new Response(lines.join('\n'), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
    });
}
