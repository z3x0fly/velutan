'use client';

import React, { useEffect, useState } from 'react';
import { Map, Navigation, Trash2, Play, Brush, MapPinned, X } from 'lucide-react';
import PinsTab from './PinsTab';
import RouteBreakdown from './RouteBreakdown';
import type { RouteAnalysis } from '../map/travelAnalysis';
import BordersSection from './BordersSection';
import { pinStore, usePins } from '../map/pinStore';

interface LegendPanelProps {
  onTypeSelect?: (type: string | null) => void;
  selectedType?: string | null;
  
  // Travel Mode Props
  isTravelMode: boolean;
  setIsTravelMode: (val: boolean) => void;
  travelPath: { x: number, y: number }[];
  setTravelPath: (path: { x: number, y: number }[]) => void;
  travelSpeed: string;
  setTravelSpeed: (val: string) => void;
  route: RouteAnalysis | null;
  followRoads: boolean;
  setFollowRoads: (v: boolean) => void;
  startSimulation: () => void;
  stopSimulation: () => void;
  isSimulating: boolean;
  showBrush?: boolean;
}

const LegendPanel: React.FC<LegendPanelProps> = ({ 
    onTypeSelect, 
    selectedType, 
    isTravelMode,
    setIsTravelMode,
    travelPath,
    setTravelPath,
    travelSpeed,
    setTravelSpeed,
    route,
    followRoads,
    setFollowRoads,
    startSimulation,
    stopSimulation,
    isSimulating,
    showBrush = false
}) => {
  // Harita görünsün diye kapalı başlar: yalnızca ince sekme çubuğu; sekmeye basınca o sekme açılır
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeTab, setActiveTab] = useState<'legend' | 'travel' | 'pins' | 'draw'>('legend');
  const pick = (tab: typeof activeTab) => {
    if (!isCollapsed && activeTab === tab) return setIsCollapsed(true);
    setActiveTab(tab);
    setIsCollapsed(false);
  };
  const tabClass = (tab: typeof activeTab) =>
    `flex items-center justify-center gap-1.5 py-2.5 transition-colors ${isCollapsed ? 'px-3' : 'min-w-0 flex-1 px-1.5'} ${!isCollapsed && activeTab === tab ? 'bg-amber-600/15 text-amber-400' : 'text-zinc-400 hover:text-amber-200'}`;
  const { pins, placing } = usePins();

  // Bir işarete haritadan tıklanınca defter sekmesi açılsın
  useEffect(() => pinStore.subscribe(() => {
    if (pinStore.get().activeId) { setActiveTab('pins'); setIsCollapsed(false); }
  }), []);

  // Brush Controls
  const [paintMode, setPaintMode] = useState<'forest'|'autumn'|'clear'|null>(null);
  const [brushStatus, setBrushStatus] = useState<string | null>(null);

  useEffect(() => {
    const onStatus = (e: Event) => {
      setBrushStatus((e as CustomEvent<string>).detail);
      setTimeout(() => setBrushStatus(null), 3000);
    };
    window.addEventListener('brush-status', onStatus);
    return () => window.removeEventListener('brush-status', onStatus);
  }, []);
  const [brushSize, setBrushSize] = useState(0.8);

  const propagatePaintMode = (mode: 'forest'|'autumn'|'clear'|null) => {
      setPaintMode(mode);
      window.dispatchEvent(new CustomEvent('set-paint-mode', { detail: mode }));
  };

  const propagateBrushSize = (val: number) => {
      setBrushSize(val);
      window.dispatchEvent(new CustomEvent('set-brush-size', { detail: val }));
  };

  const emitClearZones = () => window.dispatchEvent(new CustomEvent('clear-zones'));
  const emitCopyZones = () => window.dispatchEvent(new CustomEvent('copy-zones'));

  const legendItems = [
    { type: 'capital', label: 'Başkent', color: 'bg-red-500', shape: 'clip-star', shapeStyle: {clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)"} },
    { type: 'city', label: 'Şehir', color: 'bg-amber-500', shape: 'rounded-full' },
    { type: 'fortress', label: 'Kale / Hisar', color: 'bg-gray-500', shape: 'rounded-none' },
    { type: 'ruin', label: 'Harabe / Zindan', color: 'bg-purple-500', shape: 'triangle-up' },
    { type: 'landmark', label: 'Doğal Yapı', color: 'bg-green-500', shape: 'rounded-full' },
    { type: 'character', label: 'Karakter', color: 'bg-blue-500', shape: 'rotate-45' },
    { type: 'lore', label: 'Lore / Hikaye', color: 'bg-cyan-500', shape: 'rounded-sm' },
    { type: 'event', label: 'Olay / Savaş', color: 'bg-orange-500', shape: 'rounded-full' },
  ];

  return (
    <div className={`relative glass-panel overflow-hidden rounded-xl border border-amber-600/25 shadow-[0_8px_30px_rgba(0,0,0,0.45)] ${isCollapsed ? 'w-fit' : 'w-[calc(100vw-24px)] md:w-[300px]'}`}>
      {/* Sekme çubuğu: kapalıyken tek başına durur */}
      <div className={`flex w-full items-stretch text-[11px] font-black uppercase tracking-[0.14em] ${isCollapsed ? '' : 'border-b border-amber-600/20 bg-black/40'}`}>
           <button onClick={() => pick('travel')} aria-label="Seyahat" title="Seyahat: rota çiz, süre hesapla" className={tabClass('travel')}>
              <Navigation size={14} className={isTravelMode ? 'animate-pulse text-amber-400' : ''} />
              <span className={isCollapsed ? 'hidden md:inline' : ''}>Seyahat</span>
           </button>
           <button onClick={() => pick('legend')} aria-label="Lejant" title="Lejant: türe göre süz, sınırlar" className={`${tabClass('legend')} border-l border-amber-600/10`}>
              <Map size={14} className={selectedType ? 'text-amber-400' : ''} />
              <span className={isCollapsed ? 'hidden md:inline' : ''}>Lejant</span>
           </button>
           <button onClick={() => pick('pins')} aria-label="Defter" title="Defter: işaretlerin" className={`${tabClass('pins')} border-l border-amber-600/10`}>
              <MapPinned size={14} className={placing ? 'animate-pulse text-amber-400' : ''} />
              <span className={isCollapsed ? 'hidden md:inline' : ''}>Defter{pins.length ? <sup className="ml-0.5 text-[10px] text-amber-400">{pins.length}</sup> : null}</span>
           </button>
           {showBrush && <button onClick={() => pick('draw')} aria-label="Fırça" className={`${tabClass('draw')} border-l border-amber-600/10`}>
              <Brush size={14} className={paintMode ? 'animate-pulse text-amber-400' : ''} />
              <span className={isCollapsed ? 'hidden md:inline' : ''}>Fırça</span>
           </button>}
           {!isCollapsed && (
             <button onClick={() => setIsCollapsed(true)} aria-label="Paneli kapat" title="Kapat" className="shrink-0 border-l border-amber-600/10 px-2.5 text-amber-500/60 hover:text-amber-300">
               <X size={15} />
             </button>
           )}
      </div>

      {/* İçerik */}
      {!isCollapsed && (
      <div className="relative z-10 flex max-h-[calc(100dvh-170px)] md:max-h-[calc(100vh-300px)] flex-col overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
        
        {activeTab === 'legend' && (
          <div className="flex flex-col gap-3 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold tracking-[0.2em] text-amber-500/70 uppercase">Türe göre süz</span>
              {selectedType && (
                <button
                    onClick={() => onTypeSelect?.(null)}
                    className="text-[11px] uppercase font-bold text-red-400 hover:text-red-300 transition-colors"
                >
                    Sıfırla
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1">
                {legendItems.map((item) => (
                    <button
                        key={item.type}
                        onClick={() => onTypeSelect?.(selectedType === item.type ? null : item.type)}
                        aria-pressed={selectedType === item.type}
                        className={`flex items-center gap-2 group text-left px-1.5 py-1 rounded-md transition-colors ${selectedType === item.type ? 'bg-amber-600/20 ring-1 ring-amber-600/40' : 'hover:bg-white/5'}`}
                    >
                        <div className={`w-6 h-6 shrink-0 rounded-full border ${selectedType === item.type ? 'border-amber-500' : 'border-white/10'} flex items-center justify-center bg-black/60 group-hover:border-amber-500/40 transition-colors`}>
                            <div 
                                className={`w-3 h-3 ${item.color} ${item.shape === 'triangle-up' ? 'w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-purple-500 bg-transparent' : item.shape}`} 
                                style={item.shapeStyle}
                            />
                        </div>
                        <span className={`text-[11.5px] font-bold uppercase tracking-wide leading-tight transition-colors ${selectedType === item.type ? 'text-amber-100' : 'text-zinc-400 group-hover:text-amber-100'}`}>
                            {item.label}
                        </span>
                    </button>
                ))}
            </div>
            <BordersSection />
          </div>
        )}

        {activeTab === 'pins' && <PinsTab />}

        {activeTab === 'travel' && (
          <div className="flex flex-col gap-4 animate-in fade-in duration-200">
             <div className="flex flex-col gap-4 bg-black/40 p-3 rounded-lg border border-amber-600/10">
                <div className="flex justify-between items-center">
                    <span className="text-[13px] font-black uppercase text-zinc-400">Seyahat Modu</span>
                    <button 
                      onClick={() => setIsTravelMode(!isTravelMode)}
                      className={`w-12 h-6 rounded-full transition-all relative ${isTravelMode ? 'bg-amber-600' : 'bg-zinc-800'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isTravelMode ? 'left-7' : 'left-1'}`} />
                    </button>
                </div>

                <div className="flex justify-between items-center gap-3">
                    <span className="flex flex-col">
                      <span className="text-[13px] font-black uppercase text-zinc-400">Yollardan git</span>
                      <span className="text-[11px] text-zinc-500">Duraklar yola yakınsa rota yolu izler</span>
                    </span>
                    <button
                      onClick={() => setFollowRoads(!followRoads)}
                      role="switch"
                      aria-checked={followRoads}
                      aria-label="Yollardan git"
                      className={`w-12 h-6 shrink-0 rounded-full transition-all relative ${followRoads ? 'bg-amber-600' : 'bg-zinc-800'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${followRoads ? 'left-7' : 'left-1'}`} />
                    </button>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5">
                   <div className="flex flex-col gap-2">
                       <label className="text-[12px] font-black uppercase text-amber-600/60 tracking-widest">Seyahat Hızı</label>
                       <div className="grid grid-cols-3 gap-1">
                           {['slow', 'normal', 'fast'].map(v => (
                               <button 
                                 key={v}
                                 onClick={() => setTravelSpeed(v)}
                                 className={`py-2 text-[12px] font-black uppercase border transition-all ${travelSpeed === v ? 'bg-amber-600 text-white border-amber-400' : 'bg-zinc-900/50 text-zinc-600 border-zinc-800'}`}
                               >
                                  {v === 'slow' ? 'Yavaş' : v === 'normal' ? 'Normal' : 'Hızlı'}
                               </button>
                           ))}
                       </div>
                   </div>

                   <div className="flex flex-col gap-2">
                       <label className="text-[12px] font-black uppercase text-amber-600/60 tracking-widest">Arazi (rotadan)</label>
                       <RouteBreakdown route={route} />
                   </div>
                </div>
             </div>

             <div className="flex flex-col gap-2">
                <button
                   onClick={() => setTravelPath([])}
                   className="flex items-center justify-center gap-2 py-3 bg-red-900/20 border border-red-500/20 text-red-400 hover:bg-red-900/40 transition-all rounded-lg text-[13px] font-black uppercase tracking-widest"
                >
                   <Trash2 size={14} /> Temizle
                </button>
                {travelPath.length > 1 && (
                    !isSimulating ? (
                        <button 
                            onClick={startSimulation}
                            className="flex items-center justify-center gap-2 py-4 bg-amber-600 text-white hover:bg-amber-500 transition-all rounded-lg text-[14px] font-black uppercase tracking-widest shadow-xl shadow-amber-900/20 active:scale-95"
                        >
                            <Play size={16} fill="currentColor" /> Simülasyonu Başlat
                        </button>
                    ) : (
                        <button 
                            onClick={stopSimulation}
                            className="flex items-center justify-center gap-2 py-4 bg-red-600 text-white hover:bg-red-500 transition-all rounded-lg text-[14px] font-black uppercase tracking-widest shadow-xl shadow-red-900/20 active:scale-95 animate-pulse"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12"></rect></svg>
                            Simülasyonu Durdur
                        </button>
                    )
                )}
             </div>

             <div className="text-[12px] italic text-zinc-500 border-l-2 border-amber-600/20 pl-3 py-1">
                Seyahat modunu açıp haritaya tıklayarak durak ekle.
             </div>
          </div>
        )}

        {/* BRUSH / DRAW MODE TAB */}
        {showBrush && activeTab === 'draw' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left duration-300">
             <div className="flex flex-col gap-1">
                <span className="text-[12px] font-bold tracking-[0.3em] text-emerald-500/60 uppercase">Yaratıcılık Modu</span>
                <h3 className="text-xl font-serif font-black text-amber-400 tracking-wide">Orman Fırçası</h3>
             </div>

             <div className="flex flex-col gap-4 bg-black/40 p-4 rounded-xl border border-amber-600/10">
                <p className="text-[12px] text-zinc-400 mb-2 font-medium">
                    Bölge boya, kopyala, <code>tools/forest_zones.json</code> içine ekle ve <code>python tools/build_map_assets.py</code> çalıştır.
                </p>

                <div className="flex flex-col gap-2">
                    <button 
                        onClick={() => propagatePaintMode('forest')}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${paintMode === 'forest' ? 'bg-emerald-600/20 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 'bg-black/50 border-white/5 hover:border-emerald-500/30'}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${paintMode === 'forest' ? 'bg-emerald-500' : 'bg-zinc-800'}`}>
                            <span className="text-sm">🌳</span>
                        </div>
                        <div className="flex flex-col items-start pr-5">
                            <span className={`text-[14px] font-black uppercase tracking-widest ${paintMode === 'forest' ? 'text-emerald-400' : 'text-zinc-500'}`}>Canlı Orman</span>
                        </div>
                    </button>
                    
                    <button 
                        onClick={() => propagatePaintMode('autumn')}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${paintMode === 'autumn' ? 'bg-amber-600/20 border-amber-500 shadow-[0_0_15px_rgba(217,119,6,0.2)]' : 'bg-black/50 border-white/5 hover:border-amber-500/30'}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${paintMode === 'autumn' ? 'bg-amber-500' : 'bg-zinc-800'}`}>
                            <span className="text-[13px] translate-y-[-1px]">🍂</span>
                        </div>
                        <div className="flex flex-col items-start pr-5">
                            <span className={`text-[14px] font-black uppercase tracking-widest ${paintMode === 'autumn' ? 'text-amber-400' : 'text-zinc-500'}`}>Solmuş Orman</span>
                        </div>
                    </button>
                </div>

                <div className="flex flex-col gap-3 mt-2 pt-4 border-t border-white/5">
                    <div className="flex justify-between items-center text-[12px] font-black uppercase tracking-widest text-zinc-400">
                        <span>Fırça Kalınlığı</span>
                        <span className="text-amber-500">{brushSize.toFixed(1)}</span>
                    </div>
                    <input 
                        type="range" 
                        min="0.1" max="3.0" step="0.1" 
                        value={brushSize} 
                        onChange={e => propagateBrushSize(parseFloat(e.target.value))} 
                        className="w-full accent-amber-500"
                    />
                </div>
             </div>

             <div className="flex flex-col gap-2.5 pt-2">
                <div className="flex gap-2">
                    <button 
                        onClick={() => propagatePaintMode(null)}
                        className="flex-1 py-3 bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700 transition-all rounded-lg text-[12px] font-black uppercase tracking-widest text-white shadow-xl shadow-black/20"
                    >
                        İptal Et
                    </button>
                    <button 
                        onClick={emitClearZones}
                        className="flex-1 py-3 bg-red-900/20 border border-red-500/20 text-red-400 hover:bg-red-900/40 transition-all rounded-lg text-[12px] font-black uppercase tracking-widest"
                    >
                        <Trash2 size={12} className="inline mr-1 -mt-0.5" /> Sil
                    </button>
                </div>
                
                <button 
                    onClick={emitCopyZones}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-amber-600 text-white hover:bg-amber-500 transition-all rounded-lg text-[14px] font-black uppercase tracking-widest shadow-xl shadow-amber-900/20 active:scale-95"
                >
                    Bölgeleri Kopyala
                </button>
                {brushStatus && <div className="text-[12px] text-emerald-400 text-center">{brushStatus}</div>}
             </div>
             
             <div className="mt-2 text-[12px] italic text-zinc-500 border-l-2 border-emerald-500/20 pl-3 py-1">
                Aktif edildiğinde kamera hareketi kilitlenir. Haritaya sürükleyerek boyayabilirsiniz.
             </div>
          </div>
        )}

      </div>
      )}
    </div>
  );
};

export default LegendPanel;
