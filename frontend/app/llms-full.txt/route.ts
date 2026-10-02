import { fetchRegions, SITE_URL, TYPE_LABEL } from '../../lib/seo';

export const revalidate = 600;

/** llms-full.txt: bütün bölgelerin kronikleri düz metin olarak (görsel satırları karakter listesine çevrilir). */
export async function GET() {
    const regions = await fetchRegions();
    const parts = [
        '# Velutan Haritası — Tüm Kronikler',
        '',
        `> Velutan evreninin bölgeleri ve kronikleri. Kaynak: ${SITE_URL} (Velutan Fandom Wiki ve velutanmap.com içeriklerinden derlenmiştir).`,
        '',
    ];
    for (const r of regions) {
        const lore = (r.lore || '').split('\n');
        const people = lore.map((l) => /^!\[([^\]]*)\]\(.*\)$/.exec(l.trim())?.[1]).filter(Boolean);
        const text = lore.filter((l) => !/^!\[.*\]\(.*\)$/.test(l.trim())).join('\n').replace(/\n{3,}/g, '\n\n').trim();
        parts.push(
            `## ${r.name}`,
            '',
            `Tür: ${TYPE_LABEL[r.type ?? ''] ?? 'Bölge'} · Sayfa: ${SITE_URL}/bolge/${r.slug}`,
            r.description ? `\n${r.description}` : '',
            '',
            text,
            people.length ? `\nİlgili karakterler/yaratıklar: ${people.join(', ')}` : '',
            r.panoramas?.length ? `360° mekânlar: ${r.panoramas.map((p) => p.title).join(', ')}` : '',
            '',
        );
    }
    return new Response(parts.filter((p, i, a) => !(p === '' && a[i - 1] === '')).join('\n'), {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=600' },
    });
}
