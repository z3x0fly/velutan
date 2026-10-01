'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import LorePanel from '../components/ui/LorePanel';
import VintageCompass from '../components/ui/VintageCompass';
import LegendPanel from '../components/ui/LegendPanel';
import MapCanvas3D, { MapCanvas3DHandle } from '../components/map/MapCanvas3D';
import PatchNotesModal from '../components/ui/modals/PatchNotesModal';
import MapScaleBar from '../components/ui/MapScaleBar';
import DiceRoller from '../components/ui/DiceRoller';
import InfoLinks from '../components/ui/InfoLinks';
import type { Region } from '../components/map/types';
import { API_URL } from '../components/map/media';
import { KM_PER_PIXEL, pathLengthKm } from '../components/map/utils/coords';

// velutanmap.com resmi yolculuk temposu (km/gün)
const PACE_KM_PER_DAY: Record<string, number> = { slow: 30, normal: 45, fast: 60 };
const TERRAIN_MULT: Record<string, number> = { normal: 1, rough: 0.7, mountain: 0.4 };


export default function Home() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null);
  const [mapRotation, setMapRotation] = useState(0);
  const [showSplash, setShowSplash] = useState(true);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [initialZoom, setInitialZoom] = useState(1);
  const [spamCount, setSpamCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [easterEggAssets, setEasterEggAssets] = useState<string[]>([]);
  const [selectedDayi, setSelectedDayi] = useState<string | null>(null);
  const [showDayiModal, setShowDayiModal] = useState(false);
  const [spamFeedback, setSpamFeedback] = useState<string | null>(null);
  const [isTravelMode, setIsTravelMode] = useState(false);
  const [travelPath, setTravelPath] = useState<{ x: number, y: number }[]>([]);
  const [travelSpeed, setTravelSpeed] = useState('normal'); // slow, normal, fast
  const [terrainType, setTerrainType] = useState('normal'); // normal, rough, mountain
  const [mounted, setMounted] = useState(false);
  const [showTravelDetails, setShowTravelDetails] = useState(false);
  const [isAmbienceMounted, setIsAmbienceMounted] = useState(false);
  const [ambienceVolume, setAmbienceVolume] = useState(60);
  const [isSimulating, setIsSimulating] = useState(false);
  const [brushEnabled, setBrushEnabled] = useState(false);
  const mapRef = useRef<MapCanvas3DHandle>(null);

  // Fetch Easter Egg Assets
  useEffect(() => {
    fetch('/api/easter-egg')
      .then(res => res.json())
      .then(data => setEasterEggAssets(Array.isArray(data) ? data : []))
      .catch(err => console.error("Easter Egg Assets fetch error:", err));
  }, []);

  // Fetch Regions
  useEffect(() => {
    fetch(`${API_URL}/regions/`)
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(data => setRegions(Array.isArray(data) ? data : []))
      .catch(err => console.error("Regions fetch error:", err));
  }, []);

  // Filter regions based on selected type
  const filteredRegions = useMemo(
    () => (selectedType ? regions.filter(r => r.type === selectedType) : regions),
    [regions, selectedType],
  );
  // Haritaya giden callback'ler sabit: aksi halde her zoom güncellemesinde 3D sahne yeniden render olur
  const handleRegionClick = useCallback((region: Region) => setSelectedRegion(region), []);
  const handleTravelPointAdd = useCallback((p: { x: number, y: number }) => setTravelPath(prev => [...prev, p]), []);
  const handleSimulationEnd = useCallback(() => setIsSimulating(false), []);
  useEffect(() => {
    setMounted(true);
    // Orman fırçası yalnızca geliştirici modunda: ?firca=1
    setBrushEnabled(new URLSearchParams(window.location.search).get('firca') === '1');
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  const handleCompassReset = () => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTime;
    
    // Reset spam count if more than 2 seconds passed
    let newCount = timeSinceLastClick > 2000 ? 1 : spamCount + 1;
    setSpamCount(newCount);
    setLastClickTime(now);

    // Feedback Messages
    if (newCount > 5 && newCount < 15) {
        const messages = ["Durdurulamıyor!", "Aman Verme!", "Pusula Ağlıyor!", "Daha Hızlı!", "Nereye Dönüyoruz?"];
        setSpamFeedback(messages[Math.floor(Math.random() * messages.length)]);
        setTimeout(() => setSpamFeedback(null), 1000);
    }

    // Trigger Easter Egg
    if (newCount >= 15 && easterEggAssets.length > 0) {
        const randomAsset = easterEggAssets[Math.floor(Math.random() * easterEggAssets.length)];
        setSelectedDayi(randomAsset);
        setShowDayiModal(true);
        setSpamCount(0); // Reset after success
    }

    if (mapRef.current) {
      mapRef.current.resetRotation();
    }
  };

  // Mesafe & süre (ölçek: velutanmap.com, harita genişliği 5431 km)
  const calculateStats = () => {
    const km = pathLengthKm(travelPath);
    const effectiveSpeed = (PACE_KM_PER_DAY[travelSpeed] ?? 45) * (TERRAIN_MULT[terrainType] ?? 1);
    const totalDays = km / effectiveSpeed;
    const days = Math.floor(totalDays);
    const hours = Math.floor((totalDays - days) * 24);
    return { km: Math.round(km), days, hours, totalDays };
  };

  const stats = calculateStats();

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#a89361] overflow-hidden select-none">

      {/* SPLASH SCREEN */}
      <div className={`fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-[#050505] transition-opacity duration-1000 pointer-events-none ${showSplash ? 'opacity-100' : 'opacity-0'}`}>
        <div className="relative">
          <div className="absolute inset-0 bg-amber-500/20 blur-[100px] rounded-full animate-pulse" />
          <img
            src="/logo.svg"
            alt="Velutan Logo"
            className="relative w-48 object-contain drop-shadow-[0_0_30px_rgba(255,215,0,0.3)] animate-bounce-slow"
          />
        </div>
        <div className="mt-8 flex items-center gap-4">
          <div className="h-[1px] w-32 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
          <span className="text-amber-100/60 font-serif tracking-[0.5em] text-sm animate-pulse">HARİTA YÜKLENİYOR</span>
          <div className="h-[1px] w-32 bg-gradient-to-r from-transparent via-amber-500 to-transparent" />
        </div>
      </div>

      <PatchNotesModal />

      {/* 1. MAP LAYER: Harita en dipte (Hata giderme: Hydration guard) */}
      <div className="absolute inset-0 z-0">
        {mounted && (
          <MapCanvas3D
            ref={mapRef}
            regions={filteredRegions}
            onRegionClick={handleRegionClick}
            onRotationChange={setMapRotation}
            onZoom={setMapZoom}
            isTravelMode={isTravelMode}
            travelPath={travelPath}
            onTravelPointAdd={handleTravelPointAdd}
            onSimulationEnd={handleSimulationEnd}
            brushEnabled={brushEnabled}
          />
        )}
      </div>

      {/* 2. ATMOSPHERE LAYER: Haritanın üstünde ama UI'ın altında görsel efektler */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {/* Vintage Vignette - Warmer tone */}
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(circle at center, transparent 30%, rgba(66, 50, 30, 0.2) 70%, rgba(43, 30, 15, 0.7) 100%)',
            boxShadow: 'inset 0 0 150px rgba(43, 30, 15, 0.8)'
          }}
        />
        {/* Frame Border */}
        <div className="absolute inset-8 border border-[#4a3b22]/30 rounded-xl pointer-events-none" />
      </div>

      {/* 3. UI LAYER: En üstte butonlar ve paneller */}
      <div className="absolute inset-0 z-50 pointer-events-none">


        {/* TOP RIGHT: Yolculuk Özeti Panel (Moved below Compass) */}
        {isTravelMode && travelPath.length > 0 && (
          <div className="absolute top-[289px] right-10 pointer-events-auto animate-in fade-in slide-in-from-right duration-500">
             <div className="bg-black/90 backdrop-blur-md border-2 border-amber-600/40 p-4 rounded-xl shadow-[0_0_50px_rgba(0,0,0,0.8)] min-w-[280px]">
                <div className="flex justify-between items-center mb-4 border-b border-amber-600/20 pb-2">
                    <h3 className="text-amber-500 font-serif italic font-bold tracking-widest text-sm">YOLCULUK ÖZETİ</h3>
                    <span className="text-[10px] text-amber-500/40 font-mono italic">v1.1.2</span>
                </div>
                
                <div className="space-y-4">
                    <div className="flex justify-between items-end border-b border-white/5 pb-2">
                        <span className="text-zinc-400 text-xs font-serif italic">Toplam Mesafe:</span>
                        <span className="text-white font-black text-xl font-serif tracking-tighter">
                            {stats.km} <span className="text-amber-600 text-sm italic">km</span>
                        </span>
                    </div>

                    <div className="flex justify-between items-end border-b border-white/5 pb-2">
                        <span className="text-zinc-400 text-xs font-serif italic">Tahmini Süre:</span>
                        <span className="text-white font-black text-xl font-serif tracking-tighter">
                            {stats.days} <span className="text-amber-600 text-sm italic">gün</span>, {stats.hours} <span className="text-amber-600 text-sm italic">sa</span>
                        </span>
                    </div>
                </div>

                <div className="mt-4 pt-2 flex justify-end">
                   <button 
                     onClick={() => setShowTravelDetails(true)}
                     className="text-[9px] uppercase font-bold tracking-[0.2em] text-amber-500/40 hover:text-amber-500 transition-colors"
                   >
                      Detayları Gör →
                   </button>
                </div>
             </div>
          </div>
        )}

        {/* 6. TRAVEL DETAILS MODAL */}
        {showTravelDetails && (
          <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto p-4 md:p-10">
             <div className="bg-[#120c06] border-2 border-amber-600/40 w-full max-w-md p-8 rounded-2xl relative shadow-[0_0_100px_rgba(0,0,0,1)]">
                <button 
                  onClick={() => setShowTravelDetails(false)}
                  className="absolute top-4 right-4 text-amber-500 hover:text-white"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>
                </button>
                
                <h3 className="text-2xl font-serif italic font-black text-amber-400 mb-6 border-b border-amber-600/20 pb-4">YOLCULUK DÖKÜMÜ</h3>
                
                <div className="max-h-[60vh] overflow-y-auto pr-4 custom-scrollbar space-y-3">
                   {travelPath.length === 0 ? (
                      <p className="text-zinc-500 italic text-sm">Henüz bir rota çizilmedi.</p>
                   ) : (
                      travelPath.map((pt, i) => (
                        <div key={i} className="flex items-center gap-4 group">
                           <div className="w-8 h-8 rounded-full border border-amber-600/40 flex items-center justify-center font-black text-amber-500 bg-black/40 text-xs shrink-0">{i+1}</div>
                           <div className="flex-1 flex flex-col">
                              <span className="text-white font-serif text-sm">Durak #{i+1}</span>
                              <span className="text-zinc-600 text-[10px] uppercase font-bold tracking-widest">{pt.x.toFixed(0)}, {pt.y.toFixed(0)}</span>
                           </div>
                           {i > 0 && (
                             <div className="text-amber-500/60 font-black text-xs font-mono italic">
                               +{Math.round(Math.hypot(pt.x - travelPath[i-1].x, pt.y - travelPath[i-1].y) * KM_PER_PIXEL)}km
                             </div>
                           )}
                           <button 
                              onClick={() => {
                                setTravelPath(prev => prev.filter((_, index) => index !== i));
                              }}
                              className="p-2 text-zinc-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                              title="Durağı Sil"
                            >
                               <Trash2 size={14} />
                            </button>
                        </div>
                      ))
                   )}
                </div>

                <div className="mt-8 pt-6 border-t border-amber-600/20 flex flex-col gap-2">
                    <div className="flex justify-between">
                       <span className="text-amber-500/40 text-[10px] uppercase font-black uppercase tracking-[0.2em]">Toplam Mesafe</span>
                       <span className="text-white font-black">{stats.km} km</span>
                    </div>
                </div>
             </div>
          </div>
        )}


        {/* Sol Üst: Legend + Seyahat Kontrolleri */}
        <div className="absolute top-10 left-10 pointer-events-auto">
          <LegendPanel 
            selectedType={selectedType} 
            onTypeSelect={setSelectedType} 
            zoom={mapZoom} 
            initialZoom={initialZoom}
            isTravelMode={isTravelMode}
            setIsTravelMode={setIsTravelMode}
            travelPath={travelPath}
            setTravelPath={setTravelPath}
            travelSpeed={travelSpeed}
            setTravelSpeed={setTravelSpeed}
            terrainType={terrainType}
            setTerrainType={setTerrainType}
            isSimulating={isSimulating}
            showBrush={brushEnabled}
            startSimulation={() => {
              if (travelPath.length < 2) return;
              setIsSimulating(true);
              // 1 gün yolculuk ≈ 2 sn animasyon (4-60 sn arası)
              mapRef.current?.startSimulation(travelPath, Math.min(60, Math.max(4, stats.totalDays * 2)));
            }}
            stopSimulation={() => {
              setIsSimulating(false);
              mapRef.current?.stopSimulation();
            }}
          />
        </div>

        <div
          className="absolute top-10 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-transform duration-300 ease-out"
          style={{
            // Inverted scaling: logo shrinks as map zoom increases
            // Normalized zoom ratio: mapZoom / initialZoom
            // Scale formula: 1 / ratio (with a dampening effect to keep it readable)
            transform: `translateX(-50%) scale(${Math.max(0.7, 1 / (1 + (mapZoom / initialZoom - 1) * 0.4))})`,
            transformOrigin: 'top center'
          }}
        >
          <img
            src="/logo.svg"
            alt="Velutan"
            className="w-32 object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,1)] opacity-90"
          />
          <div className="flex items-center gap-6 mt-2 opacity-80">
            <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
            <p className="text-amber-100/60 font-bold tracking-[0.5em] uppercase text-[12px] whitespace-nowrap">
              Kayıp Dünyanın Kronikleri
            </p>
            <div className="h-[1px] w-24 bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
          </div>
        </div>

        {/* COMPASS: z-index artırıldı ve konumu sabitlendi */}
        <div className="absolute top-10 right-10 pointer-events-auto scale-75 z-[10001]">
          <VintageCompass rotation={mapRotation} onReset={handleCompassReset} />
          
          {/* Spam Feedback floating text */}
          {spamFeedback && (
            <div className="absolute -left-48 top-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-sm px-6 py-3 border-2 border-red-600 shadow-[0_0_40px_rgba(255,0,0,0.6)] -rotate-6 text-red-500 font-serif font-black text-3xl italic drop-shadow-[0_2px_10px_black] animate-bounce pointer-events-none whitespace-nowrap z-[10002]">
                {spamFeedback}
            </div>
          )}
        </div>

        {/* BOTTOM LEFT: Map Scale Bar & Dice Roller */}
        <div className="absolute bottom-6 left-10 pointer-events-auto flex flex-col gap-6">
           <DiceRoller />
           <MapScaleBar zoom={mapZoom} initialZoom={initialZoom} />
           <InfoLinks />
        </div>

        {/* BOTTOM: Navigator Icon REMOVED */}
      </div>

      {/* 4. MODALS (Lore Panel & Easter Egg) */}
      {selectedRegion && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-md pointer-events-auto p-3 md:p-20" onClick={() => setSelectedRegion(null)}>
          <div className="contents" onClick={(e) => e.stopPropagation()}>
          <LorePanel
            region={selectedRegion}
            onClose={() => setSelectedRegion(null)}
          />
          </div>
        </div>
      )}

      {showDayiModal && selectedDayi && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/90 backdrop-blur-3xl pointer-events-auto p-4 overflow-hidden">
           
           {/* Retro Glitch Background Layer */}
           <div className="absolute inset-0 opacity-20 pointer-events-none" 
                style={{ background: 'repeating-linear-gradient(0deg, #000, #000 1px, transparent 1px, transparent 2px)', backgroundSize: '100% 2px' }} />
           
           <div className="relative max-w-4xl max-h-[80vh] flex flex-col items-center animate-in zoom-in duration-300">
               <div className="absolute -top-12 text-amber-500 font-serif font-black italic tracking-[0.5em] text-2xl drop-shadow-[0_0_20px_rgba(245,158,11,0.6)] animate-bounce shrink-0">
                   DAYIIICOOOOOOO!
               </div>
               
               <div className="relative border-4 border-amber-600/50 p-2 bg-black shadow-[0_0_100px_rgba(245,158,11,0.3)]">
                 {/\.(mp4|webm|mov)$/i.test(selectedDayi) ? (
                    <video 
                      src={`/dayim/${selectedDayi}`}
                      autoPlay
                      loop
                      playsInline
                      className="max-w-full max-h-[70vh] object-contain shadow-2xl"
                    />
                 ) : (
                    <img
                      src={`/dayim/${selectedDayi}`}
                      alt="Dayı Easter Egg"
                      className="max-w-full max-h-[70vh] object-contain shadow-2xl"
                    />
                 )}
                 {/* Decorative Corner HUD elements for modal */}
                 <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-amber-500" />
                 <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-amber-500" />
               </div>

               <button 
                 onClick={(e) => { e.stopPropagation(); setShowDayiModal(false); }}
                 className="mt-8 px-10 py-3 bg-amber-600 hover:bg-amber-500 text-white font-black italic uppercase tracking-[0.2em] transform skew-x-12 transition-all hover:scale-105 active:scale-95 shadow-xl border-l-4 border-amber-900"
               >
                 Aman Verme!
               </button>
           </div>
        </div>
      )}

      {/* 5. SPOTIFY AMBIYANS PANEL */}
      <div className="fixed bottom-10 right-10 z-[10000] pointer-events-auto">
        <div className="group relative flex flex-col items-end gap-3">
            {/* Widget Container - Larger and with Header */}
            <div className={`overflow-hidden transition-all duration-700 rounded-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] border-2 border-amber-600/30 bg-[#0a0a0a] 
                ${isAmbienceMounted ? 'h-[520px] w-[380px] opacity-100 mb-2' : 'h-0 w-0 opacity-0'}`}>
               
               <div className="p-4 border-b border-amber-600/10 flex justify-between items-center bg-black/40">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 italic">Playlist: Velutan Haritası</span>
                  <div className="flex gap-1.5">
                     <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                     <span className="text-[8px] text-green-500 font-bold uppercase">Canlı Yayın</span>
                  </div>
               </div>

               {isAmbienceMounted && (
                 <iframe
                   style={{ borderRadius: '0' }}
                   src="https://open.spotify.com/embed/playlist/3Gn9sNeFAIoi8rIHLm2QvU?utm_source=generator&theme=0"
                   width="100%"
                   height="450"
                   frameBorder="0"
                   allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                   loading="lazy"
                 />
               )}
            </div>

            {/* Combined Control Bar */}
            <div className="flex items-center gap-4 animate-in slide-in-from-right duration-700">


                {/* Toggle Button */}
                <button 
                    onClick={() => setIsAmbienceMounted(!isAmbienceMounted)}
                    className={`flex items-center gap-4 px-8 py-4 rounded-full border-2 transition-all duration-500 shadow-2xl group active:scale-95
                        ${isAmbienceMounted 
                            ? 'bg-red-950/40 border-red-500/50 text-red-400 hover:bg-red-900/60' 
                            : 'bg-black/90 border-amber-500/50 text-amber-500 hover:border-amber-400 hover:scale-105'}`}
                >
                    <div className="flex flex-col items-end">
                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">{isAmbienceMounted ? 'AMBİYANSI SUSTUR' : 'AMBİYANSI AÇ'}</span>
                        <span className="text-[8px] opacity-40 font-serif italic text-right">{isAmbienceMounted ? 'Sessizliğe Dön' : 'Velutan Ezgileri'}</span>
                    </div>
                    <div className={`p-2 rounded-full border transition-colors ${isAmbienceMounted ? 'border-red-500/30 bg-red-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
                        {isAmbienceMounted ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                        )}
                    </div>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}
