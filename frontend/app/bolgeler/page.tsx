import type { Metadata } from 'next';
import Link from 'next/link';
import { mediaUrl } from '../../components/map/media';
import { fetchRegions, TYPE_LABEL } from '../../lib/seo';

export const revalidate = 60;

export const metadata: Metadata = {
    title: 'Velutan Bölgeleri — Şehirler, Kaleler ve Diyarlar',
    description:
        "Velutan haritasındaki tüm bölgeler: Barglass, Atrapolis, Citradel, Demir Yemin, Qasaar, Nobu ve daha fazlası. Kronikler, karakterler ve 360° mekânlar.",
    alternates: { canonical: '/bolgeler' },
};

export default async function RegionsIndex() {
    const regions = await fetchRegions();
    return (
        <main className="min-h-screen bg-[#0b0806] px-5 py-10 text-amber-50">
            <div className="mx-auto max-w-5xl">
                <nav className="mb-8 text-sm text-amber-200/60">
                    <Link href="/" className="hover:text-amber-300">
                        ← Velutan Haritası
                    </Link>
                </nav>
                <h1 className="font-serif text-5xl font-black text-amber-300">Velutan Bölgeleri</h1>
                <p className="mt-3 max-w-2xl font-serif text-lg text-amber-100/80">
                    Velutan 3D dünya haritasındaki şehirler, kaleler, harabeler ve efsanevi yerler.
                </p>
                <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {regions.map((r) => (
                        <li key={r.id}>
                            <Link href={`/bolge/${r.slug}`} className="group block overflow-hidden rounded-xl border border-amber-500/20 bg-black/40 hover:border-amber-500/60">
                                {mediaUrl(r.image) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={mediaUrl(r.image)} alt={`${r.name} — Velutan`} loading="lazy" className="h-40 w-full object-cover opacity-80 transition group-hover:opacity-100" />
                                ) : (
                                    <div className="h-40 bg-gradient-to-br from-amber-900/40 to-black" />
                                )}
                                <div className="p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-500/70">{TYPE_LABEL[r.type ?? ''] ?? 'Bölge'}</p>
                                    <h2 className="font-serif text-2xl font-bold text-amber-200">{r.name}</h2>
                                    {r.description && <p className="mt-1 text-sm text-amber-100/70">{r.description}</p>}
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </main>
    );
}
