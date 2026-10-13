import type { MetadataRoute } from 'next';
import { fetchLoreList, fetchRegions, SITE_URL } from '../lib/seo';

export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const [regions, lore] = await Promise.all([fetchRegions(), fetchLoreList()]);
    const now = new Date();
    return [
        { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
        { url: `${SITE_URL}/bolgeler`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
        { url: `${SITE_URL}/kayitlar`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
        ...regions.map((r) => ({
            url: `${SITE_URL}/bolge/${r.slug}`,
            lastModified: now,
            changeFrequency: 'monthly' as const,
            priority: r.type === 'capital' ? 0.8 : 0.6,
        })),
        // velutanmap.com'dan senkronlanan wiki kayıtları (karakter, yer, 360°)
        ...lore.map((e) => ({
            url: `${SITE_URL}/kayit/${e.slug}`,
            lastModified: e.updated ? new Date(e.updated) : now,
            changeFrequency: 'monthly' as const,
            priority: e.kind === 'location' ? 0.6 : 0.5,
        })),
    ];
}
