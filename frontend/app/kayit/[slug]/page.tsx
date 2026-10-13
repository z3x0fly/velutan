import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import React from 'react';
import { fetchLore, fetchLoreList, fetchRegions, KIND_LABEL, plainSummary, SITE_NAME, SITE_URL } from '../../../lib/seo';
import type { Region } from '../../../components/map/types';
import { mediaUrl } from '../../../components/map/media';

export const revalidate = 600;
export const dynamicParams = true;

export async function generateStaticParams() {
    const list = await fetchLoreList();
    return list.map((e) => ({ slug: e.slug }));
}

const norm = (t: string) =>
    t
        .toLocaleLowerCase('tr')
        .replace(/ı/g, 'i')
        .replace(/ş/g, 's')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/[^a-z]/g, '');

/** Haritadaki bölge: yer kaydının kendisi ya da 360°'nin bulunduğu yer */
function regionFor(slug: string, title: string, regions: Region[]) {
    return regions.find((r) => r.slug === slug || norm(r.name) === norm(title)) ?? regions.find((r) => r.panoramas?.some((p) => p.slug === slug));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
    const e = await fetchLore(params.slug);
    if (!e) return { title: 'Kayıt bulunamadı', robots: { index: false } };
    const kind = e.label || KIND_LABEL[e.kind] || 'Kayıt';
    const description = plainSummary(`${e.summary ? e.summary + ' ' : ''}${(e.body ?? '').replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (_, s, t) => t ?? e.refs[s] ?? s)}`) || `${e.title} — Velutan evreninden bir ${kind.toLocaleLowerCase('tr')}.`;
    const title = `${e.title} — Velutan ${kind}`;
    return {
        title,
        description,
        alternates: { canonical: `/kayit/${e.slug}` },
        keywords: [e.title, `${e.title} velutan`, 'velutan wiki', 'velutan lore', 'velutan karakterleri', 'velutan harita'],
        openGraph: {
            type: 'article',
            title: `${title} | ${SITE_NAME}`,
            description,
            url: `${SITE_URL}/kayit/${e.slug}`,
            images: e.cover ? [{ url: e.cover, alt: e.title }] : [{ url: '/og.jpg', width: 1200, height: 630 }],
        },
        twitter: { card: 'summary_large_image', title, description },
    };
}

/** Wiki metni: paragraflar, başlıklar, listeler, **kalın**, *eğik*, [[bağlantı]] (HTML yok) */
function Body({ md, refs }: { md: string; refs: Record<string, string> }) {
    const inline = (text: string, key: string) => {
        const out: React.ReactNode[] = [];
        const re = /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
        let last = 0;
        let m: RegExpExecArray | null;
        let n = 0;
        while ((m = re.exec(text))) {
            if (m.index > last) out.push(text.slice(last, m.index));
            const k = `${key}-${n++}`;
            if (m[1])
                out.push(
                    <Link key={k} href={`/kayit/${m[1]}`} className="font-bold text-amber-300 underline decoration-amber-500/40 underline-offset-2 hover:text-amber-200">
                        {m[2] ?? refs[m[1]] ?? m[1]}
                    </Link>,
                );
            else if (m[3]) out.push(<strong key={k}>{m[3]}</strong>);
            else if (m[4]) out.push(<em key={k}>{m[4]}</em>);
            last = re.lastIndex;
        }
        if (last < text.length) out.push(text.slice(last));
        return out;
    };
    return (
        <div className="space-y-4 font-serif text-lg leading-relaxed text-amber-100/85">
            {md
                .replace(/\r\n/g, '\n')
                .split(/\n{2,}/)
                .map((b, i) => {
                    const lines = b.split('\n').filter((l) => l.trim());
                    if (!lines.length) return null;
                    const h = /^(#{1,4})\s+(.*)$/.exec(lines[0]);
                    if (h && lines.length === 1)
                        return (
                            <h2 key={i} className="pt-2 font-serif text-2xl text-amber-200">
                                {inline(h[2], `h${i}`)}
                            </h2>
                        );
                    if (lines.every((l) => /^\s*([-*+]|\d+\.)\s+/.test(l)))
                        return (
                            <ul key={i} className="list-disc space-y-1 pl-6 marker:text-amber-600">
                                {lines.map((l, j) => (
                                    <li key={j}>{inline(l.replace(/^\s*([-*+]|\d+\.)\s+/, ''), `l${i}-${j}`)}</li>
                                ))}
                            </ul>
                        );
                    return <p key={i}>{inline(lines.join(' '), `p${i}`)}</p>;
                })}
        </div>
    );
}

export default async function LorePage({ params }: { params: { slug: string } }) {
    const [e, regions] = await Promise.all([fetchLore(params.slug), fetchRegions()]);
    if (!e) notFound();
    const kind = e.label || KIND_LABEL[e.kind] || 'Kayıt';
    const region = regionFor(e.slug, e.title, regions);
    const pano = region?.panoramas?.find((p) => p.slug === e.slug);
    const mapHref = region ? `/?bolge=${region.slug}` : '/';
    const pageUrl = `${SITE_URL}/kayit/${e.slug}`;

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article',
                headline: `${e.title} — Velutan`,
                description: plainSummary(e.summary || e.body || e.title),
                image: e.cover ? [e.cover] : [`${SITE_URL}/og.jpg`],
                inLanguage: 'tr-TR',
                mainEntityOfPage: pageUrl,
                isPartOf: { '@id': `${SITE_URL}/#website` },
                author: { '@type': 'Organization', name: 'Velutan', url: 'https://velutanmap.com' },
                about: e.kind === 'location' || e.kind === 'panorama' ? { '@type': 'Place', name: e.title } : { '@type': 'Thing', name: e.title },
                isBasedOn: e.url,
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
                    { '@type': 'ListItem', position: 2, name: 'Velutan Wiki', item: `${SITE_URL}/kayitlar` },
                    { '@type': 'ListItem', position: 3, name: e.title, item: pageUrl },
                ],
            },
        ],
    };

    return (
        <main className="min-h-screen bg-[#0b0806] text-amber-50">
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
            <div className="relative">
                {e.cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.cover} alt={e.title} className="absolute inset-0 h-full w-full object-cover object-top opacity-35" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-[#0b0806]/80 to-[#0b0806]" />
                <div className="relative mx-auto max-w-4xl px-5 pb-10 pt-8">
                    <nav aria-label="Konum" className="mb-10 text-sm text-amber-200/60">
                        <Link href="/" className="hover:text-amber-300">
                            Velutan Haritası
                        </Link>{' '}
                        /{' '}
                        <Link href="/kayitlar" className="hover:text-amber-300">
                            Velutan Wiki
                        </Link>{' '}
                        / <span className="text-amber-200">{e.title}</span>
                    </nav>
                    <p className="text-xs font-bold uppercase tracking-[0.4em] text-amber-500/80">{kind}</p>
                    <h1 className="mt-2 font-serif text-5xl font-black text-amber-300 md:text-6xl">{e.title}</h1>
                    {e.summary && <p className="mt-4 max-w-2xl font-serif text-xl italic text-amber-100/85">{e.summary}</p>}
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link href={mapHref} className="rounded-full bg-amber-600 px-6 py-3 text-sm font-black uppercase tracking-widest text-white hover:bg-amber-500">
                            {region ? `${region.name} haritada` : 'Haritayı aç'}
                        </Link>
                        {region && (
                            <Link href={`/bolge/${region.slug}`} className="rounded-full border border-amber-500/50 px-6 py-3 text-sm font-black uppercase tracking-widest text-amber-300 hover:bg-amber-500/10">
                                {region.name} kronikleri
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            <article className="mx-auto max-w-4xl space-y-8 px-5 pb-16">
                {pano && (
                    <figure>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(pano.thumb) ?? mediaUrl(pano.image)} alt={`${e.title} 360° — Velutan`} className="aspect-[2/1] w-full rounded-xl border border-amber-500/20 object-cover" />
                        <figcaption className="mt-2 text-sm text-amber-100/60">360° mekân: haritada açıp içinde dolaşabilirsin.</figcaption>
                    </figure>
                )}
                {e.body ? <Body md={e.body} refs={e.refs ?? {}} /> : !e.summary && <p className="font-serif italic text-amber-100/50">Bu kayıt için henüz yazı yok.</p>}

                {(e.related ?? [])
                    .filter((g) => g.items.length)
                    .map((g) => (
                        <section key={g.title}>
                            <h2 className="mb-3 font-serif text-xl text-amber-200">{g.title}</h2>
                            <ul className="flex flex-wrap gap-2">
                                {g.items.map((i) => (
                                    <li key={i.slug}>
                                        <Link href={`/kayit/${i.slug}`} className="inline-block rounded-full border border-amber-500/30 px-3 py-1 text-sm text-amber-200 hover:bg-amber-500/10">
                                            {i.title}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}

                <p className="border-t border-amber-500/20 pt-6 text-sm text-amber-100/50">
                    Kaynak:{' '}
                    <a href={e.url} target="_blank" rel="noopener" className="underline hover:text-amber-300">
                        velutanmap.com
                    </a>{' '}
                    (Velutan resmi haritası ve wikisi; içerik izinle paylaşılmaktadır)
                </p>
            </article>
        </main>
    );
}
