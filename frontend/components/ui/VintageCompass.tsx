'use client';

import React, { useMemo, useRef } from 'react';

interface VintageCompassProps {
  rotation: number;
  onReset?: () => void;
}

const VintageCompass: React.FC<VintageCompassProps> = ({ rotation, onReset }) => {
  // Kamera azimutu (radyan) -> kadran açısı. Kamera saat yönünde döndükçe harita kuzeyi ekranda
  // saat yönünde kayar; bu yüzden kadran +açıyla döner. Açı -180/+180'de atlar: sürekli (unwrap)
  // tutulmazsa CSS geçişi kadranı 360 derece ters yönden çevirir.
  const continuous = useRef<{ last: number; total: number } | null>(null);
  if (continuous.current === null) continuous.current = { last: rotation, total: rotation };
  else {
    let delta = rotation - continuous.current.last;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    continuous.current.total += delta;
    continuous.current.last = rotation;
  }
  const rotationDeg = (continuous.current.total * 180) / Math.PI;

  const cx = 160;
  const cy = 160;

  const polar = (angleDeg: number, radius: number) => {
    const rad = (angleDeg - 90) * (Math.PI / 180);
    return {
      x: Math.round((cx + Math.cos(rad) * radius) * 1000) / 1000,
      y: Math.round((cy + Math.sin(rad) * radius) * 1000) / 1000,
    };
  };

  const outerDots = useMemo(() => {
    const dots = [];
    for (let deg = 0; deg < 360; deg += 6) {
      const p = polar(deg, 128);
      dots.push(
        <circle
          key={`dot-${deg}`}
          cx={p.x}
          cy={p.y}
          r={deg % 18 === 0 ? 1.9 : 1.2}
          fill="currentColor"
          opacity={deg % 18 === 0 ? "1" : ".75"}
        />
      );
    }
    return dots;
  }, []);

  const majorTicks = useMemo(() => {
    const ticks = [];
    for (let deg = 0; deg < 360; deg += 10) {
      const major = deg % 45 === 0;
      const p1 = polar(deg, major ? 111 : 113);
      const p2 = polar(deg, major ? 121 : 118);
      ticks.push(
        <line
          key={`major-${deg}`}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke="currentColor"
          strokeWidth={major ? "2.1" : "1.15"}
          strokeLinecap="round"
        />
      );
    }
    return ticks;
  }, []);

  const minorTicks = useMemo(() => {
    const ticks = [];
    for (let deg = 0; deg < 360; deg += 5) {
      if (deg % 10 === 0) continue;
      const p1 = polar(deg, 113.5);
      const p2 = polar(deg, 117.5);
      ticks.push(
        <line
          key={`minor-${deg}`}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          stroke="currentColor"
          strokeWidth=".85"
          opacity=".8"
          strokeLinecap="round"
        />
      );
    }
    return ticks;
  }, []);

  const roseElements = useMemo(() => {
    const elements = [];
    // Primary Rose
    for (let deg = 0; deg < 360; deg += 45) {
      const tip = polar(deg, deg % 90 === 0 ? 104 : 88);
      const left = polar(deg - 8, 20);
      const right = polar(deg + 8, 20);
      const back = polar(deg + 180, 18);
      elements.push(
        <path
          key={`rose-p-${deg}`}
          d={`M ${tip.x} ${tip.y} L ${right.x} ${right.y} L ${back.x} ${back.y} L ${left.x} ${left.y} Z`}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1"
        />
      );
    }
    // Secondary Rose
    for (let deg = 22.5; deg < 360; deg += 45) {
      const tip = polar(deg, 62);
      const left = polar(deg - 9, 15);
      const right = polar(deg + 9, 15);
      const back = polar(deg + 180, 14);
      elements.push(
        <path
          key={`rose-s-${deg}`}
          d={`M ${tip.x} ${tip.y} L ${right.x} ${right.y} L ${back.x} ${back.y} L ${left.x} ${left.y} Z`}
          fill="rgba(255, 248, 220, 0.9)"
          stroke="currentColor"
          strokeWidth="1.1"
        />
      );
    }
    // Inner Rose
    for (let deg = 0; deg < 360; deg += 45) {
      const tip = polar(deg, 36);
      const left = polar(deg - 12, 10);
      const right = polar(deg + 12, 10);
      elements.push(
        <path
          key={`rose-i-${deg}`}
          d={`M ${tip.x} ${tip.y} L ${right.x} ${right.y} L ${cx} ${cy} L ${left.x} ${left.y} Z`}
          fill={deg % 90 === 0 ? "currentColor" : "rgba(255, 248, 220, 0.9)"}
          stroke="currentColor"
          strokeWidth="1"
        />
      );
    }
    return elements;
  }, []);

  return (
    <div className="relative group select-none pointer-events-auto">
      <button
        onClick={onReset}
        className="w-[180px] h-[180px] md:w-[230px] md:h-[230px] bg-transparent border-0 p-0 cursor-pointer outline-none hover:scale-105 transition-transform"
        type="button"
        title="Pusulayı Sıfırla"
      >
        <svg 
            className="w-full h-full block overflow-visible text-amber-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.3)]" 
            viewBox="0 0 320 320"
        >
          <g id="outerDots">{outerDots}</g>

          <circle cx="160" cy="160" r="118" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="160" cy="160" r="108" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="160" cy="160" r="84" fill="none" stroke="currentColor" strokeWidth="1.25" strokeDasharray="2.5 6" opacity="0.9" />
          <circle cx="160" cy="160" r="72" fill="none" stroke="currentColor" strokeWidth="1.25" />

          <g 
            id="chartCompassDial" 
            style={{ 
                transform: `rotate(${rotationDeg}deg)`, 
                transformOrigin: '160px 160px',
                transition: 'transform 0.18s linear'
            }}
          >
            <g id="majorTicks">{majorTicks}</g>
            <g id="minorTicks">{minorTicks}</g>
            <g id="compassRose">{roseElements}</g>

            <text x="160" y="26" textAnchor="middle" className="fill-current font-serif font-bold text-2xl tracking-widest">N</text>
            <text x="295" y="167" textAnchor="middle" className="fill-current font-serif font-bold text-2xl tracking-widest">E</text>
            <text x="160" y="312" textAnchor="middle" className="fill-current font-serif font-bold text-2xl tracking-widest">S</text>
            <text x="25" y="167" textAnchor="middle" className="fill-current font-serif font-bold text-2xl tracking-widest">W</text>

            <text x="64" y="70" textAnchor="middle" className="fill-current font-serif font-bold text-sm">NW</text>
            <text x="256" y="70" textAnchor="middle" className="fill-current font-serif font-bold text-sm">NE</text>
            <text x="256" y="264" textAnchor="middle" className="fill-current font-serif font-bold text-sm">SE</text>
            <text x="64" y="264" textAnchor="middle" className="fill-current font-serif font-bold text-sm">SW</text>
          </g>

          <circle cx="160" cy="160" r="7" className="fill-current" />
        </svg>
      </button>
    </div>
  );
};

export default VintageCompass;
