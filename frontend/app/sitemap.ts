import type { MetadataRoute } from 'next';
import { fetchRegions, SITE_URL } from '../lib/seo';

export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const regions = await fetchRegions();
    const now = new Date();
    return [
        { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
        { url: `${SITE_URL}/bolgeler`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
        ...regions.map((r) => ({
            url: `${SITE_URL}/bolge/${r.slug}`,
            lastModified: now,
            changeFrequency: 'monthly' as const,
            priority: r.type === 'capital' ? 0.8 : 0.6,
        })),
    ];
}
