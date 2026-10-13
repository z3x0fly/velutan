import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchLoreList, KIND_LABEL } from '../../lib/seo';

export const revalidate = 600;

export const metadata: Metadata = {
    title: 'Velutan Wiki — Karakterler, Yerler ve 360° Mekânlar',
    description:
        'Velutan evreninin bütün kayıtları: karakterler, krallıklar, şehirler, hikâyeler ve 360° mekânlar. velutanmap.com ile senkron, Velutan 3D haritasında.',
    alternates: { canonical: '/kayitlar' },
};

const GROUPS: { kind: string; title: string }[] = [
    { kind: 'content', title: 'Karakterler ve Hikâyeler' },
    { kind: 'location', title: 'Yerler' },
    { kind: 'panorama', title: '360° Mekânlar' },
];

export default async function LoreIndex() {
    const list = await fetchLoreList();
    return (
        <main className="min-h-screen bg-[#0b0806] px-5 py-10 text-amber-50">
            <div className="mx-auto max-w-5xl">
                <nav className="mb-8 text-sm text-amber-200/60">
                    <Link href="/" className="hover:text-amber-300">
                        ← Velutan Haritası
                    </Link>{' '}
                    ·{' '}
                    <Link href="/bolgeler" className="hover:text-amber-300">
                        Bölgeler
                    </Link>
                </nav>
                <h1 className="font-serif text-5xl font-black text-amber-300">Velutan Wiki</h1>
                <p className="mt-3 max-w-2xl font-serif text-lg text-amber-100/80">
                    Velutan evreninin {list.length} kaydı. İçerik{' '}
                    <a href="https://velutanmap.com" target="_blank" rel="noopener" className="underline">
                        velutanmap.com
                    </a>{' '}
                    ile senkron.
                </p>
                {GROUPS.map((g) => {
                    const items = list.filter((e) => e.kind === g.kind);
                    if (!items.length) return null;
                    return (
                        <section key={g.kind} className="mt-10">
                            <h2 className="mb-4 border-b border-amber-500/20 pb-2 font-serif text-2xl text-amber-200">
                                {g.title} <span className="text-base text-amber-100/40">({items.length})</span>
                            </h2>
                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {items.map((e) => (
                                    <li key={e.slug}>
                                        <Link href={`/kayit/${e.slug}`} className="flex items-center gap-3 rounded-lg border border-amber-500/15 bg-black/30 p-2 hover:border-amber-500/50">
                                            {e.cover ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={e.cover} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded object-cover" />
                                            ) : (
                                                <span className="h-12 w-12 shrink-0 rounded bg-gradient-to-br from-amber-900/40 to-black" />
                                            )}
                                            <span className="min-w-0">
                                                <span className="block truncate font-serif text-amber-100">{e.title}</span>
                                                <span className="block text-[11px] uppercase tracking-widest text-amber-500/60">{e.label || KIND_LABEL[e.kind]}</span>
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}
            </div>
        </main>
    );
}
