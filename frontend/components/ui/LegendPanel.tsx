'use client';

import React, { useEffect, useState } from 'react';
import { ChevronUp, Map, Navigation, Trash2, Play, Brush } from 'lucide-react';

interface LegendPanelProps {
  onTypeSelect?: (type: string | null) => void;
  selectedType?: string | null;
  zoom?: number;
  initialZoom?: number;
  
  // Travel Mode Props
  isTravelMode: boolean;
  setIsTravelMode: (val: boolean) => void;
  travelPath: { x: number, y: number }[];
  setTravelPath: (path: { x: number, y: number }[]) => void;
  travelSpeed: string;
  setTravelSpeed: (val: string) => void;
  terrainType: string;
  setTerrainType: (val: string) => void;
  startSimulation: () => void;
  stopSimulation: () => void;
  isSimulating: boolean;
  showBrush?: boolean;
}

const LegendPanel: React.FC<LegendPanelProps> = ({ 
    onTypeSelect, 
    selectedType, 
    zoom = 1, 
    initialZoom = 1,
    isTravelMode,
    setIsTravelMode,
    travelPath,
    setTravelPath,
    travelSpeed,
    setTravelSpeed,
    terrainType,
    setTerrainType,
    startSimulation,
    stopSimulation,
    isSimulating,
    showBrush = false
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<'legend' | 'travel' | 'draw'>('legend');

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
    <div className={`relative transition-all duration-500 ease-in-out ${isCollapsed ? 'w-16 h-16' : 'w-80 p-0'} glass-panel rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-amber-600/20`}>
      <div className="hud-corner hud-corner-tl opacity-60" />
      <div className="hud-corner hud-corner-tr opacity-40" />

      {/* Toggle Button */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`absolute z-30 text-amber-500/60 hover:text-amber-500 transition-all duration-300 flex items-center justify-center
          ${isCollapsed ? 'inset-0 w-full h-full' : 'top-3 right-3 p-1'}`}
      >
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-1 group translate-y-1">
            <Map size={24} className="group-hover:scale-110 transition-transform text-amber-500" />
            <span className="text-[8px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity text-amber-500/80">Aç</span>
          </div>
        ) : (
          <ChevronUp size={20} />
        )}
      </button>

      {/* Tab Switcher */}
      {!isCollapsed && (
        <div className="flex w-full border-b border-amber-600/20 bg-black/40">
           <button 
             onClick={() => setActiveTab('travel')}
             className={`flex-1 py-4 flex items-center justify-center gap-2 transition-all ${activeTab === 'travel' ? 'bg-amber-600/10 text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
           >
              <Navigation size={14} className={isTravelMode ? 'animate-pulse' : ''} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Seyahat</span>
           </button>
           <button 
             onClick={() => setActiveTab('legend')}
             className={`flex-1 py-4 flex items-center justify-center gap-2 transition-all border-l border-amber-600/10 ${activeTab === 'legend' ? 'bg-amber-600/10 text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
           >
              <Map size={14} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Lejant</span>
           </button>
           {showBrush && <button 
             onClick={() => setActiveTab('draw')}
             className={`flex-1 py-4 flex items-center justify-center gap-2 transition-all border-l border-amber-600/10 ${activeTab === 'draw' ? 'bg-amber-600/10 text-amber-500' : 'text-zinc-500 hover:text-zinc-300'}`}
           >
              <Brush size={14} className={paintMode ? 'animate-pulse text-amber-400' : ''} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Fırça</span>
           </button>}
        </div>
      )}

      {/* Content */}
      <div className={`relative z-10 flex flex-col p-6 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        
        {activeTab === 'legend' && (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-left duration-300">
            <div className="flex justify-between items-end border-b border-amber-500/10 pb-3">
              <div>
                <span className="text-[10px] font-bold tracking-[0.3em] text-amber-500/60 uppercase">Harita Bilgisi</span>
                <h3 className="text-xl font-serif font-black text-amber-400 tracking-wide mt-1">Görünüm</h3>
              </div>
              {selectedType && (
                <button 
                    onClick={() => onTypeSelect?.(null)}
                    className="text-[8px] uppercase font-bold text-red-400 hover:text-red-300 px-2 py-1 transition-all"
                >
                    Sıfırla
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2.5 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {legendItems.map((item) => (
                    <div 
                        key={item.type}
                        onClick={() => onTypeSelect?.(selectedType === item.type ? null : item.type)}
                        className={`flex items-center gap-4 group cursor-pointer p-1.5 rounded-lg transition-all ${selectedType === item.type ? 'bg-amber-600/20 border border-amber-600/40' : 'hover:bg-white/5 border border-transparent'}`}
                    >
                        <div className={`w-8 h-8 rounded-full border ${selectedType === item.type ? 'border-amber-500' : 'border-white/10'} flex items-center justify-center bg-black/60 group-hover:border-amber-500/40 transition-colors`}>
                            <div 
                                className={`w-3 h-3 ${item.color} ${item.shape === 'triangle-up' ? 'w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[8px] border-b-purple-500 bg-transparent' : item.shape}`} 
                                style={item.shapeStyle}
                            />
                        </div>
                        <span className={`text-[11px] font-bold uppercase tracking-widest transition-colors ${selectedType === item.type ? 'text-amber-100' : 'text-zinc-500 group-hover:text-amber-100'}`}>
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
          </div>
        )}

        {activeTab === 'travel' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left duration-300">
             <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold tracking-[0.3em] text-amber-500/60 uppercase">Simülasyon</span>
                <h3 className="text-xl font-serif font-black text-amber-400 tracking-wide">Yol Hazırlığı</h3>
             </div>

             <div className="flex flex-col gap-4 bg-black/40 p-4 rounded-xl border border-amber-600/10">
                <div className="flex justify-between items-center">
                    <span className="text-[11px] font-black uppercase text-zinc-400">Seyahat Modu</span>
                    <button 
                      onClick={() => setIsTravelMode(!isTravelMode)}
                      className={`w-12 h-6 rounded-full transition-all relative ${isTravelMode ? 'bg-amber-600' : 'bg-zinc-800'}`}
                    >
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${isTravelMode ? 'left-7' : 'left-1'}`} />
                    </button>
                </div>

                <div className="space-y-4 pt-4 border-t border-white/5">
                   <div className="flex flex-col gap-2">
                       <label className="text-[9px] font-black uppercase text-amber-600/60 tracking-widest">Seyahat Hızı</label>
                       <div className="grid grid-cols-3 gap-1">
                           {['slow', 'normal', 'fast'].map(v => (
                               <button 
                                 key={v}
                                 onClick={() => setTravelSpeed(v)}
                                 className={`py-2 text-[9px] font-black uppercase border transition-all ${travelSpeed === v ? 'bg-amber-600 text-white border-amber-400' : 'bg-zinc-900/50 text-zinc-600 border-zinc-800'}`}
                               >
                                  {v === 'slow' ? 'Yavaş' : v === 'normal' ? 'Normal' : 'Hızlı'}
                               </button>
                           ))}
                       </div>
                   </div>

                   <div className="flex flex-col gap-2">
                       <label className="text-[9px] font-black uppercase text-amber-600/60 tracking-widest">Arazi Tipi</label>
                       <div className="grid grid-cols-3 gap-1">
                           {['normal', 'rough', 'mountain'].map(v => (
                               <button 
                                 key={v}
                                 onClick={() => setTerrainType(v)}
                                 className={`py-2 text-[9px] font-black uppercase border transition-all ${terrainType === v ? 'bg-amber-600 text-white border-amber-400' : 'bg-zinc-900/50 text-zinc-600 border-zinc-800'}`}
                               >
                                  {v === 'normal' ? 'Düz' : v === 'rough' ? 'Sarp' : 'Dağ'}
                               </button>
                           ))}
                       </div>
                   </div>
                </div>
             </div>

             <div className="flex flex-col gap-2 pt-4">
                <button 
                   onClick={() => setTravelPath([])}
                   className="flex items-center justify-center gap-2 py-3 bg-red-900/20 border border-red-500/20 text-red-400 hover:bg-red-900/40 transition-all rounded-lg text-[11px] font-black uppercase tracking-widest"
                >
                   <Trash2 size={14} /> Temizle
                </button>
                {travelPath.length > 1 && (
                    !isSimulating ? (
                        <button 
                            onClick={startSimulation}
                            className="flex items-center justify-center gap-2 py-4 bg-amber-600 text-white hover:bg-amber-500 transition-all rounded-lg text-[12px] font-black uppercase tracking-widest shadow-xl shadow-amber-900/20 active:scale-95"
                        >
                            <Play size={16} fill="currentColor" /> Simülasyonu Başlat
                        </button>
                    ) : (
                        <button 
                            onClick={stopSimulation}
                            className="flex items-center justify-center gap-2 py-4 bg-red-600 text-white hover:bg-red-500 transition-all rounded-lg text-[12px] font-black uppercase tracking-widest shadow-xl shadow-red-900/20 active:scale-95 animate-pulse"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12"></rect></svg>
                            Simülasyonu Durdur
                        </button>
                    )
                )}
             </div>

             <div className="mt-2 text-[10px] italic text-zinc-500 border-l-2 border-amber-600/20 pl-3 py-1">
                Haritaya tıklayarak durak ekleyebilirsin.
             </div>
          </div>
        )}

        {/* BRUSH / DRAW MODE TAB */}
        {showBrush && activeTab === 'draw' && (
          <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-left duration-300">
             <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold tracking-[0.3em] text-emerald-500/60 uppercase">Yaratıcılık Modu</span>
                <h3 className="text-xl font-serif font-black text-amber-400 tracking-wide">Orman Fırçası</h3>
             </div>

             <div className="flex flex-col gap-4 bg-black/40 p-4 rounded-xl border border-amber-600/10">
                <p className="text-[10px] text-zinc-400 mb-2 font-medium">
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
                            <span className={`text-[12px] font-black uppercase tracking-widest ${paintMode === 'forest' ? 'text-emerald-400' : 'text-zinc-500'}`}>Canlı Orman</span>
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
                            <span className={`text-[12px] font-black uppercase tracking-widest ${paintMode === 'autumn' ? 'text-amber-400' : 'text-zinc-500'}`}>Solmuş Orman</span>
                        </div>
                    </button>
                </div>

                <div className="flex flex-col gap-3 mt-2 pt-4 border-t border-white/5">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-zinc-400">
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
                        className="flex-1 py-3 bg-zinc-800/80 border border-zinc-700 hover:bg-zinc-700 transition-all rounded-lg text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-black/20"
                    >
                        İptal Et
                    </button>
                    <button 
                        onClick={emitClearZones}
                        className="flex-1 py-3 bg-red-900/20 border border-red-500/20 text-red-400 hover:bg-red-900/40 transition-all rounded-lg text-[10px] font-black uppercase tracking-widest"
                    >
                        <Trash2 size={12} className="inline mr-1 -mt-0.5" /> Sil
                    </button>
                </div>
                
                <button 
                    onClick={emitCopyZones}
                    className="w-full flex items-center justify-center gap-2 py-4 bg-amber-600 text-white hover:bg-amber-500 transition-all rounded-lg text-[12px] font-black uppercase tracking-widest shadow-xl shadow-amber-900/20 active:scale-95"
                >
                    Bölgeleri Kopyala
                </button>
                {brushStatus && <div className="text-[10px] text-emerald-400 text-center">{brushStatus}</div>}
             </div>
             
             <div className="mt-2 text-[10px] italic text-zinc-500 border-l-2 border-emerald-500/20 pl-3 py-1">
                Aktif edildiğinde kamera hareketi kilitlenir. Haritaya sürükleyerek boyayabilirsiniz.
             </div>
          </div>
        )}

        {/* Footer info */}
        <div className="pt-4 flex justify-between items-center opacity-40 border-t border-amber-500/10 mt-6">
          <div className="flex flex-col">
            <span className="text-[8px] uppercase font-bold tracking-tighter">Kartografik Veri</span>
            <span className="text-[9px] font-serif italic text-amber-200/40 uppercase">Aktif Velutan</span>
          </div>
          <div className="flex items-center gap-1.5 grayscale opacity-50">
             <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
             <span className="text-[9px] font-black">CANLI</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegendPanel;
