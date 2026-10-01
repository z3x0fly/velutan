'use client';

import React, { useEffect, useState } from 'react';
import { MAP_WIDTH_KM, WORLD_WIDTH } from '../map/utils/coords';

// MapCanvas3D ile aynı: açılış mesafesi ve dikey görüş açısı
const START_DIST = 34;
const FOV_DEG = 40;

interface MapScaleBarProps {
    zoom: number;
    initialZoom: number;
}

const MapScaleBar = ({ zoom, initialZoom }: MapScaleBarProps) => {
    const [viewportH, setViewportH] = useState(900);
    useEffect(() => {
        const update = () => setViewportH(window.innerHeight);
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    // Ekran pikseli / km: kamera mesafesi = START_DIST / zoom (eğim yaklaşık olarak ihmal edilir)
    const dist = START_DIST / Math.max(zoom / initialZoom, 0.01);
    const worldUnitsOnScreen = 2 * dist * Math.tan((FOV_DEG / 2) * Math.PI / 180);
    const kmPerWorldUnit = MAP_WIDTH_KM / WORLD_WIDTH;
    const currentPxPerKm = viewportH / (worldUnitsOnScreen * kmPerWorldUnit);

    // Pick a distance label based on zoom
    const getTargetKm = () => {
        for (const km of [10, 25, 50, 100, 250, 500, 1000]) {
            if (km * currentPxPerKm >= 90) return km;
        }
        return 1000;
    };

    const targetKm = getTargetKm();
    const barWidth = targetKm * currentPxPerKm;
    const maxWidth = 250; // Max allowed width for the scale bar in the corner

    return (
        <div 
            className="flex flex-col gap-2 p-4 select-none pointer-events-none group animate-in fade-in slide-in-from-bottom-5 duration-700"
            style={{ 
                background: 'radial-gradient(ellipse at bottom left, rgba(16, 12, 8, 0.4) 0%, transparent 70%)' 
            }}
        >
            <div className="relative flex flex-col items-start gap-1">
                {/* Distance Labels */}
                <div className="flex justify-between w-full px-0.5 text-[12px] font-serif font-black text-white tracking-widest uppercase drop-shadow-[0_2px_2px_rgba(0,0,0,1)]">
                    <span className="flex flex-col items-center">
                        0
                        <div className="w-[1.5px] h-1.5 bg-white" />
                    </span>
                    <span className="flex flex-col items-center ml-auto">
                        {targetKm} KM
                        <div className="w-[1.5px] h-1.5 bg-white ml-auto" />
                    </span>
                </div>

                {/* The Vintage Bar */}
                <div 
                    className="relative h-[4px] flex items-center shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
                    style={{ width: `${Math.min(maxWidth, barWidth)}px` }}
                >
                    {/* Left Decorative Swirl */}
                    <div className="absolute -left-2 w-4 h-4 border-b-2 border-l-2 border-amber-600/60 rounded-bl-full -rotate-45" />
                    
                    {/* Main Axis Line */}
                    <div className="w-full h-[2px] bg-amber-600/40" />
                    
                    {/* Right Decorative Swirl */}
                    <div className="absolute -right-2 w-4 h-4 border-t-2 border-r-2 border-amber-600/60 rounded-tr-full -rotate-45" />

                    {/* Dotted/Segmented Overlay */}
                    <div className="absolute inset-0 flex h-full">
                        <div className="h-full flex-1 bg-amber-500/30 border-r border-black/40" />
                        <div className="h-full flex-1 bg-transparent border-r border-black/40" />
                        <div className="h-full flex-1 bg-amber-500/30 border-r border-black/40" />
                        <div className="h-full flex-1 bg-transparent" />
                    </div>
                </div>

                {/* Metadata */}
                <div className="mt-1 flex items-center gap-3 opacity-90">
                    <span className="text-[10px] font-bold tracking-[0.2em] text-white/80 uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">Kartografik Veri</span>
                    <div className="h-[1px] w-8 bg-white/40" />
                    <span className="text-[11px] font-serif italic text-amber-300 tracking-wider font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{(zoom / initialZoom).toFixed(2)}x Büyütme</span>
                </div>
            </div>

            {/* Corner HUD Accent */}
            <div className="absolute bottom-0 left-0 w-12 h-12 border-b-2 border-l-2 border-amber-500/20 rounded-bl-xl pointer-events-none" />
        </div>
    );
};

export default MapScaleBar;
