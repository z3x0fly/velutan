'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, X } from 'lucide-react';
import type { Region } from '../map/types';
import { mediaUrl, parseLore } from '../map/media';
import dynamic from 'next/dynamic';

// three.js içerir: yalnızca 360° açılınca yüklenir
const PanoramaViewer = dynamic(() => import('./PanoramaViewer'), { ssr: false });

interface LorePanelProps {
  region: Region | null;
  onClose: () => void;
  /** Açılınca doğrudan bu 360° mekâna gir (ortak masa daveti) */
  initialPanoSlug?: string | null;
}

const LorePanel: React.FC<LorePanelProps> = ({ region, onClose, initialPanoSlug }) => {
  const [panoIndex, setPanoIndex] = useState<number | null>(null);
  useEffect(() => {
    if (!initialPanoSlug || !region?.panoramas) return;
    const i = region.panoramas.findIndex((p) => p.slug === initialPanoSlug);
    if (i >= 0) setPanoIndex(i);
  }, [initialPanoSlug, region?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const blocks = useMemo(() => parseLore(region?.lore ?? ''), [region?.lore]);
  if (!region) return null;

  const cover = mediaUrl(region.image);
  const panoramas = region.panoramas ?? [];
  let dropCapUsed = false;

  return (
    <div className="relative w-full max-w-5xl max-h-[88vh] md:max-h-[82vh] overflow-hidden glass-panel rounded-3xl shadow-[0_0_100px_rgba(0,0,0,1)] border border-amber-500/30">
      <div className="hud-corner hud-corner-tl scale-150 origin-top-left translate-x-4 translate-y-4" />
      <div className="hud-corner hud-corner-tr scale-150 origin-top-right -translate-x-4 translate-y-4" />
      <div className="hud-corner hud-corner-bl scale-150 origin-bottom-left translate-x-4 -translate-y-4" />
      <div className="hud-corner hud-corner-br scale-150 origin-bottom-right -translate-x-4 -translate-y-4" />

      <button
        onClick={onClose}
        aria-label="Kapat"
        className="absolute top-4 right-4 md:top-8 md:right-8 p-2 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-500 transition-all z-20"
      >
        <X size={24} />
      </button>

      <div className="flex flex-col md:flex-row h-full max-h-[88vh] md:max-h-[82vh] md:min-h-[500px]">
        {/* SOL: kapak */}
        <div className="md:w-1/3 shrink-0 relative min-h-[200px] bg-gradient-to-br from-amber-900/40 to-black/60 border-r border-amber-500/10 flex flex-col">
          {cover && (
            <div className="absolute inset-0">
              <img src={cover} alt={region.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
            </div>
          )}
          <div className="relative z-10 p-6 md:p-10 flex flex-col justify-end h-full overflow-y-auto custom-scrollbar">
            <span className="text-sm font-bold tracking-[0.5em] text-amber-500/60 uppercase mb-4">Bölge Atlası</span>
            <h2 className="text-3xl md:text-4xl font-serif font-black text-gold uppercase tracking-tighter leading-none mb-4 drop-shadow-lg break-words">
              {region.name}
            </h2>
            {region.description && (
              <p className="text-amber-100/80 font-medium leading-relaxed italic text-base drop-shadow-md">&ldquo;{region.description}&rdquo;</p>
            )}
            {panoramas.length > 0 && (
              <button
                onClick={() => setPanoIndex(0)}
                className="mt-6 self-start flex items-center gap-2 rounded-full bg-amber-600 hover:bg-amber-500 px-5 py-2 text-sm font-black uppercase tracking-widest text-white shadow-lg"
              >
                <Compass size={16} /> 360° Gez ({panoramas.length})
              </button>
            )}
          </div>
        </div>

        {/* SAĞ: kronikler */}
        <div className="md:w-2/3 min-h-0 flex-1 p-6 md:p-12 overflow-y-auto bg-black/20 custom-scrollbar relative">
          <div className="mb-8 border-b border-amber-500/20 pb-4">
            <h3 className="text-2xl font-serif text-[#a89361] uppercase tracking-widest flex items-center gap-3">
              <span className="text-4xl text-amber-500/40">❧</span>
              Kronikler & Hikaye
            </h3>
          </div>

          {blocks.length === 0 && <p className="text-amber-500/40 italic text-center mt-20">Henüz kaydedilmiş bir kronik yok...</p>}

          <div className="space-y-6">
            {blocks.map((b, i) => {
              if (b.kind === 'images') {
                return (
                  <div key={i} className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {b.images.map((img) => (
                      <button key={img.src + img.alt} onClick={() => setZoomed(img)} className="group text-left">
                        <div className="aspect-[3/4] rounded-lg overflow-hidden border border-amber-500/20 bg-black/40">
                          <img src={img.src} alt={img.alt} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        </div>
                        <div className="mt-1 text-[13px] font-serif text-amber-100/70 truncate">{img.alt}</div>
                      </button>
                    ))}
                  </div>
                );
              }
              const withCap = !dropCapUsed;
              dropCapUsed = true;
              return (
                <div key={i} className="text-base md:text-lg leading-relaxed text-amber-100/80 whitespace-pre-wrap font-serif">
                  {withCap ? (
                    <>
                      <span className="float-left text-6xl font-serif mr-3 mt-[-6px] text-gold drop-shadow-md">{b.text.charAt(0)}</span>
                      {b.text.slice(1)}
                    </>
                  ) : (
                    b.text
                  )}
                </div>
              );
            })}
          </div>

          {panoramas.length > 0 && (
            <div className="mt-10 border-t border-amber-500/20 pt-6">
              <h4 className="text-sm font-black uppercase tracking-[0.3em] text-amber-500/80 mb-4 flex items-center gap-2">
                <Compass size={16} /> 360° Mekânlar
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {panoramas.map((p, i) => (
                  <button key={p.id} onClick={() => setPanoIndex(i)} className="group text-left">
                    <div className="relative aspect-[2/1] rounded-lg overflow-hidden border border-amber-500/20">
                      <img src={mediaUrl(p.thumb) ?? mediaUrl(p.image)} alt={p.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                      <span className="absolute top-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[12px] font-black text-amber-400">360°</span>
                    </div>
                    <div className="mt-1 text-[14px] font-serif text-amber-100/80 truncate">{p.title}</div>
                  </button>
                ))}
              </div>
              {panoramas.some((p) => p.image.startsWith('/static/panoramas/seed/')) && (
                <p className="mt-3 text-[13px] text-amber-100/40">
                  360° görüntülerin kaynağı:{' '}
                  <a href="https://velutanmap.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-amber-300">
                    velutanmap.com
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Panel içindeki fixed öğeler kırpılmasın diye body'ye portal */}
      {zoomed && createPortal(
        <div className="fixed inset-0 z-[11500] bg-black/90 flex items-center justify-center p-6" onClick={() => setZoomed(null)}>
          <figure className="max-w-3xl max-h-full flex flex-col items-center">
            <img src={zoomed.src} alt={zoomed.alt} className="max-h-[80vh] object-contain rounded-lg border border-amber-500/30" />
            <figcaption className="mt-3 font-serif text-lg text-amber-100">{zoomed.alt}</figcaption>
          </figure>
        </div>,
        document.body,
      )}

      {panoIndex !== null && createPortal(
        <PanoramaViewer
          panoramas={panoramas}
          index={panoIndex}
          regionName={region.name}
          regionSlug={region.slug}
          onIndexChange={setPanoIndex}
          onClose={() => setPanoIndex(null)}
        />,
        document.body,
      )}
    </div>
  );
};

export default LorePanel;
