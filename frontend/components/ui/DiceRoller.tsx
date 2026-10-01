'use client';

import React, { useState, useRef } from 'react';
import { Dices, RefreshCw } from 'lucide-react';
import gsap from 'gsap';

const DiceRoller = () => {
    const [result, setResult] = useState<number | null>(null);
    const [isRolling, setIsRolling] = useState(false);
    const diceRef = useRef<HTMLDivElement>(null);

    const rollDice = () => {
        if (isRolling) return;
        setIsRolling(true);
        setResult(null);

        // Animation
        const tl = gsap.timeline();
        tl.to(diceRef.current, {
            rotationX: "+=720",
            rotationY: "+=720",
            scale: 1.5,
            duration: 0.6,
            ease: "power2.in"
        })
        .to(diceRef.current, {
            rotationX: "+=360",
            rotationY: "+=360",
            scale: 1,
            duration: 0.4,
            ease: "bounce.out",
            onComplete: () => {
                const res = Math.floor(Math.random() * 20) + 1;
                setResult(res);
                setIsRolling(false);
            }
        });
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div 
                ref={diceRef}
                className={`relative w-20 h-20 flex items-center justify-center cursor-pointer preserve-3d
                    ${isRolling ? 'pointer-events-none' : ''}`}
                onClick={rollDice}
            >
                {/* D20 Shape Placeholder/Styling */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#a89361] to-[#6b5a32] shadow-[0_0_30px_rgba(168,147,97,0.4)] rotate-45 border-2 border-amber-900/40 rounded-lg">
                    <div className="absolute inset-2 border border-white/20 rounded-sm" />
                </div>
                
                <div className="relative z-10 flex flex-col items-center">
                    {result !== null ? (
                        <span className="text-3xl font-black text-white drop-shadow-[0_2px_4px_black]">
                            {result}
                        </span>
                    ) : (
                        <Dices className="w-10 h-10 text-white/80" />
                    )}
                </div>
                
                {isRolling && (
                    <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
                        <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />
                    </div>
                )}
            </div>
            
            <div className="bg-black/80 backdrop-blur-md px-4 py-1.5 rounded-full border border-amber-600/20">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500/80 italic">
                    {isRolling ? "Zarlar Atılıyor..." : result ? `Zar Sonucu: ${result}` : "Zar At"}
                </span>
            </div>

            <style jsx>{`
                .preserve-3d {
                    transform-style: preserve-3d;
                }
            `}</style>
        </div>
    );
};

export default DiceRoller;
