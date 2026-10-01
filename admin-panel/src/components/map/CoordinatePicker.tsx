'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as PIXI from 'pixi.js';
import { MAP_HEIGHT, MAP_WIDTH, Region } from '@/lib/api';

interface CoordinatePickerProps {
    x: number;
    y: number;
    onPick: (x: number, y: number) => void;
    regions?: Region[]; // Diğer bölgeler gri nokta olarak gösterilir
}

const CoordinatePicker: React.FC<CoordinatePickerProps> = ({ x, y, onPick, regions = [] }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const pixiApp = useRef<PIXI.Application | null>(null);
    const markerRef = useRef<PIXI.Graphics | null>(null);
    const regionsLayerRef = useRef<PIXI.Container | null>(null);
    // PIXI asenkron kurulur; işaret ve diğer bölgeler kurulum bittikten sonra (ready) güncellenir
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        
        let isDestroyed = false;

        const init = async () => {
            try {
                // Initialize PIXI Application
                const app = new PIXI.Application();
                await app.init({
                    resizeTo: containerRef.current!,
                    backgroundColor: 0xa89361,
                    antialias: true,
                    resolution: window.devicePixelRatio || 1,
                    eventMode: 'static',
                });

                if (isDestroyed) {
                    app.destroy(true, { children: true, texture: true });
                    return;
                }

                containerRef.current!.innerHTML = '';
                app.canvas.style.display = 'block';
                app.canvas.style.width = '100%';
                app.canvas.style.height = '100%';
                containerRef.current!.appendChild(app.canvas);
                pixiApp.current = app;

                const world = new PIXI.Container();
                app.stage.addChild(world);

                // Load Texture
                const texture = await PIXI.Assets.load('/map/velutan_map_4096.jpg');
                if (!texture || isDestroyed) return;

                const sprite = new PIXI.Sprite(texture);
                sprite.width = MAP_WIDTH;
                sprite.height = MAP_HEIGHT;
                world.addChild(sprite);

                // Regions Layer (for showing other regions)
                const regionsLayer = new PIXI.Container();
                world.addChild(regionsLayer);
                regionsLayerRef.current = regionsLayer;

                // Marker (Current Selection)
                const marker = new PIXI.Graphics();
                marker.circle(0, 0, 28).fill(0xff0000).stroke({ width: 6, color: 0xffffff });
                marker.x = x;
                marker.y = y;
                world.addChild(marker);
                markerRef.current = marker;
                setReady(true);

                // --- ZOOM & PAN LOGIC ---
                // Center map initially
                const initialScale = Math.min(
                    containerRef.current!.clientWidth / MAP_WIDTH,
                    containerRef.current!.clientHeight / MAP_HEIGHT
                ) * 0.9; // 90% fit
                
                world.scale.set(initialScale || 0.2);
                world.x = (containerRef.current!.clientWidth - MAP_WIDTH * world.scale.x) / 2;
                world.y = (containerRef.current!.clientHeight - MAP_HEIGHT * world.scale.y) / 2;

                // Interaction
                app.stage.eventMode = 'static';
                app.stage.hitArea = app.screen;
                app.stage.cursor = 'grab';

                let isDragging = false;
                let lastPos = { x: 0, y: 0 };

                app.stage.on('pointerdown', (e) => {
                    // Left click to drag
                    if (e.button === 0) {
                        isDragging = true;
                        lastPos = { x: e.global.x, y: e.global.y };
                        app.stage.cursor = 'grabbing';
                    }
                });

                app.stage.on('pointermove', (e) => {
                    if (isDragging) {
                        const dx = e.global.x - lastPos.x;
                        const dy = e.global.y - lastPos.y;
                        world.x += dx;
                        world.y += dy;
                        lastPos = { x: e.global.x, y: e.global.y };
                    }
                });

                app.stage.on('pointerup', () => { isDragging = false; app.stage.cursor = 'grab'; });
                app.stage.on('pointerupoutside', () => { isDragging = false; app.stage.cursor = 'grab'; });

                // Right click to set marker
                app.canvas.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const rect = app.canvas.getBoundingClientRect();
                    const globalX = (e.clientX - rect.left) * (app.canvas.width / rect.width);
                    const globalY = (e.clientY - rect.top) * (app.canvas.height / rect.height);
                    
                    const localPos = world.toLocal({ x: globalX, y: globalY });
                    
                    // Bounds check
                    const px = Math.max(0, Math.min(localPos.x, MAP_WIDTH));
                    const py = Math.max(0, Math.min(localPos.y, MAP_HEIGHT));
                    
                    marker.x = px;
                    marker.y = py;
                    onPick(Math.round(px), Math.round(py));
                });

                // Zoom with wheel
                app.canvas.addEventListener('wheel', (e) => {
                    e.preventDefault();
                    const delta = -e.deltaY * 0.001;
                    const newScale = Math.max(0.05, Math.min(world.scale.x + delta, 5.0));
                    
                    const rect = app.canvas.getBoundingClientRect();
                    const globalX = (e.clientX - rect.left) * (app.canvas.width / rect.width);
                    const globalY = (e.clientY - rect.top) * (app.canvas.height / rect.height);

                    const localPos = {
                        x: (globalX - world.x) / world.scale.x,
                        y: (globalY - world.y) / world.scale.y
                    };

                    world.scale.set(newScale);
                    world.x = globalX - localPos.x * newScale;
                    world.y = globalY - localPos.y * newScale;
                }, { passive: false });

            } catch (err) { console.error(err); }
        };

        init();

        return () => {
            isDestroyed = true;
            if (pixiApp.current) {
                pixiApp.current.destroy(true, { children: true, texture: true });
                pixiApp.current = null;
            }
        };
    }, []);

    // Update marker when props change (if updated from outside)
    useEffect(() => {
        if (markerRef.current) {
            markerRef.current.x = x;
            markerRef.current.y = y;
        }
    }, [ready, x, y]);

    // Render existing regions
    useEffect(() => {
        if (!regionsLayerRef.current) return;
        const layer = regionsLayerRef.current;
        layer.removeChildren();
        
        regions.forEach(r => {
            // Don't draw self if editing
            if (Math.abs(r.x - x) < 1 && Math.abs(r.y - y) < 1) return;
            
            const dot = new PIXI.Graphics().circle(0, 0, 16).fill(0x333333).stroke({ width: 3, color: 0xffffff }); // gri nokta
            dot.x = r.x;
            dot.y = r.y;
            layer.addChild(dot);
        });
    }, [ready, regions, x, y]);

    return (
        <div className="w-full h-full relative group">
            <div 
                ref={containerRef} 
                className="w-full h-full bg-[#050505]"
            />
            <div className="absolute bottom-2 right-2 bg-black/70 text-[#a89361] text-[10px] px-2 py-1 rounded pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                Sağ tık: konum seç • Sürükle: kaydır • Tekerlek: yakınlaş
            </div>
        </div>
    );
};

export default CoordinatePicker;
