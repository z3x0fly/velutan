import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { mediaUrl, parseLore } from '../../../components/map/media';
import { fetchRegions, plainSummary, SITE_NAME, SITE_URL, TYPE_LABEL } from '../../../lib/seo';

export const revalidate = 60;
export const dynamicParams = true;

export async function generateStaticParams() {
    const regions = await fetchRegions();
    return regions.map((r) => ({ slug: r.slug }));
}

async function getRegion(slug: string) {
    const regions = await fetchRegions();
    return { region: regions.find((r) => r.slug === slug), regions };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
    const { region } = await getRegion(params.slug);
    if (!region) return { title: 'Bölge bulunamadı', robots: { index: false } };
    const description = plainSummary(`${region.description ? region.description + ' ' : ''}${region.lore}`);
    const image = mediaUrl(region.image);
    const title = `${region.name} — Velutan ${TYPE_LABEL[region.type ?? ''] ?? 'Bölge'}`;
    return {
        title,
        description,
        alternates: { canonical: `/bolge/${region.slug}` },
        keywords: [region.name, `${region.name} velutan`, 'velutan harita', 'velutan 3d map', 'velutan lore'],
        openGraph: {
            type: 'article',
            title: `${title} | ${SITE_NAME}`,
            description,
            url: `${SITE_URL}/bolge/${region.slug}`,
            images: image ? [{ url: image, alt: region.name }] : [{ url: '/og.jpg', width: 1200, height: 630 }],
        },
        twitter: { card: 'summary_large_image', title, description },
    };
}

export default async function RegionPage({ params }: { params: { slug: string } }) {
    const { region, regions } = await getRegion(params.slug);
    if (!region) notFound();

    const cover = mediaUrl(region.image);
    const blocks = parseLore(region.lore ?? '');
    const panoramas = region.panoramas ?? [];
    const typeLabel = TYPE_LABEL[region.type ?? ''] ?? 'Bölge';
    const others = regions.filter((r) => r.id !== region.id);

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article',
                headline: `${region.name} — Velutan`,
                description: plainSummary(region.lore ?? ''),
                image: cover ? [cover] : [`${SITE_URL}/og.jpg`],
                inLanguage: 'tr-TR',
                mainEntityOfPage: `${SITE_URL}/bolge/${region.slug}`,
                isPartOf: { '@id': `${SITE_URL}/#website` },
                author: { '@type': 'Person', name: 'w0fly' },
                about: { '@type': 'Place', name: region.name, description: region.description },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
                    { '@type': 'ListItem', position: 2, name: 'Bölgeler', item: `${SITE_URL}/bolgeler` },
                    { '@type': 'ListItem', position: 3, name: region.name, item: `${SITE_URL}/bolge/${region.slug}` },
                ],
            },
        ],
    };

    return (
        <main className="min-h-screen bg-[#0b0806] text-amber-50">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <div className="relative">
                {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt={region.name} className="absolute inset-0 h-full w-full object-cover opacity-40" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#0b0806]/80 to-[#0b0806]" />
                <div className="relative mx-auto max-w-4xl px-5 pb-10 pt-8">
                    <nav aria-label="Konum" className="mb-10 text-sm text-amber-200/60">
                        <Link href="/" className="hover:text-amber-300">
                            Velutan Haritası
                        </Link>{' '}
                        /{' '}
                        <Link href="/bolgeler" className="hover:text-amber-300">
                            Bölgeler
                        </Link>{' '}
                        / <span className="text-amber-200">{region.name}</span>
                    </nav>
                    <p className="text-xs font-bold uppercase tracking-[0.4em] text-amber-500/80">{typeLabel}</p>
                    <h1 className="mt-2 font-serif text-5xl font-black text-amber-300 md:text-6xl">{region.name}</h1>
                    {region.description && <p className="mt-4 max-w-2xl font-serif text-xl italic text-amber-100/85">{region.description}</p>}
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link
                            href={`/?bolge=${region.slug}`}
                            className="rounded-full bg-amber-600 px-6 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-amber-500"
                        >
                            Haritada aç
                        </Link>
                        {panoramas.length > 0 && (
                            <Link
                                href={`/?bolge=${region.slug}`}
                                className="rounded-full border border-amber-500/50 px-6 py-3 text-sm font-black uppercase tracking-widest text-amber-300 hover:bg-amber-500/10"
                            >
                                360° gez ({panoramas.length})
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            <article className="mx-auto max-w-4xl space-y-6 px-5 pb-16">
                <h2 className="border-b border-amber-500/20 pb-3 font-serif text-2xl text-amber-200">{region.name} Kronikleri</h2>
                {blocks.map((b, i) =>
                    b.kind === 'text' ? (
                        <p key={i} className="whitespace-pre-line font-serif text-lg leading-relaxed text-amber-100/85">
                            {b.text}
                        </p>
                    ) : (
                        <div key={i} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                            {b.images.map((img) => (
                                <figure key={img.src + img.alt}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={img.src} alt={`${img.alt} — Velutan`} loading="lazy" className="aspect-[3/4] w-full rounded-lg border border-amber-500/20 object-cover" />
                                    <figcaption className="mt-1 text-sm text-amber-100/70">{img.alt}</figcaption>
                                </figure>
                            ))}
                        </div>
                    ),
                )}

                {panoramas.length > 0 && (
                    <section className="pt-6">
                        <h2 className="mb-4 font-serif text-2xl text-amber-200">{region.name} 360° Mekânlar</h2>
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {panoramas.map((p) => (
                                <li key={p.id}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={mediaUrl(p.thumb) ?? mediaUrl(p.image)} alt={`${region.name} — ${p.title} 360°`} loading="lazy" className="aspect-[2/1] w-full rounded-md object-cover" />
                                    <span className="text-sm text-amber-100/80">{p.title}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-3 text-sm text-amber-100/50">
                            360° görüntülerin kaynağı:{' '}
                            <a href="https://velutanmap.com" target="_blank" rel="noopener noreferrer" className="underline">
                                velutanmap.com
                            </a>
                        </p>
                    </section>
                )}

                {others.length > 0 && (
                    <nav aria-label="Diğer bölgeler" className="border-t border-amber-500/20 pt-8">
                        <h2 className="mb-4 font-serif text-xl text-amber-200">Velutan'ın diğer bölgeleri</h2>
                        <ul className="flex flex-wrap gap-2">
                            {others.map((r) => (
                                <li key={r.id}>
                                    <Link href={`/bolge/${r.slug}`} className="inline-block rounded-full border border-amber-500/30 px-3 py-1 text-sm text-amber-200 hover:bg-amber-500/10">
                                        {r.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </nav>
                )}
            </article>
        </main>
    );
}
