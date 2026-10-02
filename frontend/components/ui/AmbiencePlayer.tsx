'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ListMusic, Music2, Pause, Play, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, X } from 'lucide-react';

/**
 * Velutan Ezgileri: YouTube oynatıcı API'si ile çalınan ortam müziği listesi.
 * Spotify gömülü oynatıcısı ses seviyesi ayarına izin vermediği için YouTube'a geçildi; burada %0–100 ses,
 * sessize alma, önceki/sonraki, karıştırma ve ileri sarma var. Panel küçültülünce müzik çalmaya devam eder.
 * YouTube oynatıcısı (video) şarkı listesi açıkken görünür.
 */
const TRACKS: { id: string; title: string; artist: string }[] = [
    { id: 'gieF_kpkTUE', title: 'Lonely', artist: 'Andreas Rönnberg' },
    { id: 'uyevPuVDdhg', title: 'Subete no mono no owari wa sugu ni yattekuru.7', artist: 'Rory in early 20s' },
    { id: 'VWU_E51BMhw', title: "The Seer's Lair", artist: 'Mountain Realm' },
    { id: '883e7wydHo0', title: 'A Fallen Warrior Stands Again', artist: 'Mountain Realm' },
    { id: '4y2rt_yh8HI', title: 'The Chosen Ones', artist: 'Avith Ortega' },
    { id: 'Rf9xpkol77c', title: 'Seas of White', artist: 'Ziggurath' },
    { id: 'rP8mv-3bxng', title: 'Foraging', artist: 'Nocmar' },
    { id: 'pWT8ksMuLm0', title: 'Lady Tamamo', artist: 'Devakant' },
];

// --- YouTube IFrame API (yalnızca kullanıcı müziği açınca yüklenir)
interface YTPlayer {
    playVideo(): void;
    pauseVideo(): void;
    loadVideoById(id: string): void;
    cueVideoById(id: string): void;
    setVolume(v: number): void;
    mute(): void;
    unMute(): void;
    seekTo(s: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getDuration(): number;
    destroy(): void;
}
interface YTNamespace {
    Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer;
}
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

let ytPromise: Promise<YTNamespace> | null = null;
function loadYouTube(): Promise<YTNamespace> {
    if (ytPromise) return ytPromise;
    ytPromise = new Promise((resolve, reject) => {
        const w = window as YTWindow;
        if (w.YT?.Player) return resolve(w.YT);
        const prev = w.onYouTubeIframeAPIReady;
        w.onYouTubeIframeAPIReady = () => {
            prev?.();
            if (w.YT) resolve(w.YT);
        };
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.async = true;
        s.onerror = () => {
            ytPromise = null;
            reject(new Error('YouTube yüklenemedi'));
        };
        document.head.appendChild(s);
    });
    return ytPromise;
}

const VOLUME_KEY = 'velutan_ses';
const readVolume = () => {
    try {
        const v = Number(localStorage.getItem(VOLUME_KEY));
        return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(100, Math.max(0, v)) : 50;
    } catch {
        return 50;
    }
};

const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

type View = 'closed' | 'mini' | 'bar';

export default function AmbiencePlayer() {
    const [view, setView] = useState<View>('closed');
    const [showList, setShowList] = useState(false);
    const [index, setIndex] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [volume, setVolumeState] = useState(50);
    const [muted, setMuted] = useState(false);
    const [shuffle, setShuffle] = useState(false);
    const [time, setTime] = useState({ at: 0, total: 0 });

    const host = useRef<HTMLDivElement>(null);
    const player = useRef<YTPlayer | null>(null);
    const indexRef = useRef(0);
    const shuffleRef = useRef(false);
    const failures = useRef(0);
    const volumeRef = useRef(50);
    const mutedRef = useRef(false);
    shuffleRef.current = shuffle;

    useEffect(() => {
        const v = readVolume();
        volumeRef.current = v;
        setVolumeState(v);
    }, []);

    const playIndex = useCallback((i: number) => {
        const n = ((i % TRACKS.length) + TRACKS.length) % TRACKS.length;
        indexRef.current = n;
        setIndex(n);
        setTime({ at: 0, total: 0 });
        player.current?.loadVideoById(TRACKS[n].id);
    }, []);

    const step = useCallback(
        (dir: 1 | -1) => {
            if (shuffleRef.current && TRACKS.length > 1) {
                let n = indexRef.current;
                while (n === indexRef.current) n = Math.floor(Math.random() * TRACKS.length);
                playIndex(n);
            } else playIndex(indexRef.current + dir);
        },
        [playIndex],
    );

    const start = useCallback(async () => {
        setView('bar');
        if (player.current) {
            player.current.playVideo();
            return;
        }
        setError(null);
        try {
            const YT = await loadYouTube();
            if (!host.current || player.current) return;
            const el = document.createElement('div');
            host.current.replaceChildren(el);
            player.current = new YT.Player(el, {
                host: 'https://www.youtube-nocookie.com',
                videoId: TRACKS[indexRef.current].id,
                width: '100%',
                height: '100%',
                playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3, disablekb: 1 },
                events: {
                    onReady: (e: { target: YTPlayer }) => {
                        e.target.setVolume(volumeRef.current);
                        if (mutedRef.current) e.target.mute();
                        e.target.playVideo();
                        setReady(true);
                    },
                    onStateChange: (e: { data: number }) => {
                        // 0 bitti, 1 çalıyor, 2 duraklatıldı, 3 arabellek
                        if (e.data === 1) failures.current = 0;
                        if (e.data === 0) step(1);
                        setPlaying(e.data === 1 || e.data === 3);
                    },
                    onError: () => {
                        // Gömülmesi kapatılmış ya da kaldırılmış parça: sıradakine geç (hepsi bozuksa dur)
                        failures.current += 1;
                        if (failures.current >= TRACKS.length) {
                            setError('Müzik şu an çalınamıyor.');
                            setPlaying(false);
                        } else step(1);
                    },
                },
            });
        } catch {
            setError('Müzik yüklenemedi. Bağlantını kontrol et.');
        }
    }, [step]);

    const stop = () => {
        player.current?.destroy();
        player.current = null;
        host.current?.replaceChildren();
        setReady(false);
        setPlaying(false);
        setShowList(false);
        setView('closed');
    };

    const togglePlay = () => {
        const p = player.current;
        if (!p) return void start();
        if (playing) p.pauseVideo();
        else p.playVideo();
    };

    const applyVolume = (v: number) => {
        volumeRef.current = v;
        setVolumeState(v);
        player.current?.setVolume(v);
        if (v > 0 && mutedRef.current) {
            mutedRef.current = false;
            setMuted(false);
            player.current?.unMute();
        }
        try {
            localStorage.setItem(VOLUME_KEY, String(v));
        } catch {
            /* yoksay */
        }
    };

    const toggleMute = () => {
        const next = !mutedRef.current;
        mutedRef.current = next;
        setMuted(next);
        if (next) player.current?.mute();
        else {
            player.current?.unMute();
            if (volumeRef.current === 0) applyVolume(30);
        }
    };

    // İlerleme çubuğu: yalnızca panel açıkken okunur
    useEffect(() => {
        if (view !== 'bar' || !ready) return;
        const id = setInterval(() => {
            const p = player.current;
            if (p) setTime({ at: p.getCurrentTime() || 0, total: p.getDuration() || 0 });
        }, 500);
        return () => clearInterval(id);
    }, [view, ready]);

    useEffect(() => () => player.current?.destroy(), []);

    const track = TRACKS[index];
    const effectiveVolume = muted ? 0 : volume;
    const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 50 ? Volume1 : Volume2;
    const progress = time.total > 0 ? (time.at / time.total) * 100 : 0;

    return (
        // Kapsayıcı tıklamayı yutmaz: gizli oynatıcı ekran genişliğinde, alttaki düğmeleri örtmesin
        <div className="pointer-events-none flex flex-col items-end gap-2 [&>*]:pointer-events-auto">
            {/* Oynatıcı + liste. Oynatıcı DOM'dan hiç sökülmez: panel kapanınca müzik sürer */}
            <div
                className={`w-[calc(100vw-24px)] md:w-[360px] overflow-hidden rounded-2xl border-2 border-amber-600/30 bg-[#0a0a0a] shadow-[0_0_60px_rgba(0,0,0,0.8)] transition-all duration-300 ${
                    view === 'bar' && showList ? 'max-h-[60dvh] opacity-100' : '!pointer-events-none max-h-0 border-0 opacity-0'
                }`}
                aria-hidden={!(view === 'bar' && showList)}
            >
                <div className="aspect-video w-full bg-black">
                    <div ref={host} className="h-full w-full" />
                </div>
                <ol className="max-h-[calc(60dvh-210px)] overflow-y-auto custom-scrollbar py-1">
                    {TRACKS.map((t, i) => (
                        <li key={t.id}>
                            <button
                                onClick={() => (player.current ? playIndex(i) : ((indexRef.current = i), setIndex(i), start()))}
                                className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-amber-500/10 ${i === index ? 'text-amber-300' : 'text-amber-100/70'}`}
                            >
                                <span className="w-4 shrink-0 text-center font-mono text-[11px] opacity-60">{i === index && playing ? '♪' : i + 1}</span>
                                <span className="min-w-0">
                                    <span className="block truncate text-[13px] font-bold">{t.title}</span>
                                    <span className="block truncate text-[11px] opacity-60">{t.artist}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ol>
            </div>

            {view === 'bar' && (
                <div className="w-[calc(100vw-24px)] md:w-[360px] rounded-2xl border-2 border-amber-600/40 bg-[#0a0a0a] p-3 shadow-[0_0_60px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500/60">Velutan Ezgileri</div>
                            <div className="truncate font-serif text-[15px] font-bold text-amber-100" title={track.title}>
                                {track.title}
                            </div>
                            <div className="truncate text-[11px] text-amber-100/50">{error ?? track.artist}</div>
                        </div>
                        <button onClick={() => setShowList((v) => !v)} aria-label="Şarkı listesi" title="Şarkı listesi" className={`rounded-full p-1.5 transition-colors hover:bg-amber-500/10 ${showList ? 'text-amber-300' : 'text-amber-500/70'}`}>
                            <ListMusic size={16} />
                        </button>
                        <button onClick={() => (setView('mini'), setShowList(false))} aria-label="Küçült" title="Küçült (müzik çalmaya devam eder)" className="rounded-full p-1.5 text-amber-500/70 transition-colors hover:bg-amber-500/10">
                            <ChevronDown size={16} />
                        </button>
                        <button onClick={stop} aria-label="Müziği kapat" title="Müziği kapat" className="rounded-full p-1.5 text-amber-500/70 transition-colors hover:bg-red-500/10 hover:text-red-400">
                            <X size={16} />
                        </button>
                    </div>

                    {/* İlerleme: tıklayıp/sürükleyip ileri sar */}
                    <div className="mt-2 flex items-center gap-2 font-mono text-[10px] text-amber-100/40">
                        <span className="w-8">{fmt(time.at)}</span>
                        <input
                            type="range"
                            min={0}
                            max={1000}
                            value={Math.round(progress * 10)}
                            onChange={(e) => {
                                const s = (Number(e.target.value) / 1000) * time.total;
                                setTime((t) => ({ ...t, at: s }));
                                player.current?.seekTo(s, true);
                            }}
                            disabled={!ready || time.total === 0}
                            aria-label="Şarkıda ilerle"
                            className="h-1 flex-1 accent-amber-500"
                        />
                        <span className="w-8 text-right">{fmt(time.total)}</span>
                    </div>

                    <div className="mt-2 flex items-center gap-1">
                        <button onClick={() => setShuffle((v) => !v)} aria-label="Karıştır" title="Karıştır" aria-pressed={shuffle} className={`rounded-full p-1.5 transition-colors hover:bg-amber-500/10 ${shuffle ? 'text-amber-300' : 'text-amber-500/50'}`}>
                            <Shuffle size={14} />
                        </button>
                        <button onClick={() => step(-1)} disabled={!ready} aria-label="Önceki" className="rounded-full p-1.5 text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-30">
                            <SkipBack size={16} />
                        </button>
                        <button onClick={togglePlay} aria-label={playing ? 'Duraklat' : 'Çal'} className="rounded-full border border-amber-500/50 bg-amber-500/15 p-2 text-amber-300 transition-colors hover:bg-amber-500/25">
                            {playing ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <button onClick={() => step(1)} disabled={!ready} aria-label="Sonraki" className="rounded-full p-1.5 text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-30">
                            <SkipForward size={16} />
                        </button>

                        <div className="ml-auto flex items-center gap-1.5">
                            <button onClick={toggleMute} aria-label={muted ? 'Sesi aç' : 'Sessize al'} title={muted ? 'Sesi aç' : 'Sessize al'} className="rounded-full p-1.5 text-amber-400 transition-colors hover:bg-amber-500/10">
                                <VolumeIcon size={16} />
                            </button>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                step={1}
                                value={effectiveVolume}
                                onChange={(e) => applyVolume(Number(e.target.value))}
                                aria-label="Ses seviyesi"
                                className="h-1 w-20 md:w-24 accent-amber-500"
                            />
                            <span className="w-9 text-right font-mono text-[11px] text-amber-300">%{effectiveVolume}</span>
                        </div>
                    </div>
                </div>
            )}

            {view !== 'bar' && (
                <button
                    onClick={() => (view === 'mini' ? setView('bar') : start())}
                    className="flex h-11 items-center gap-2.5 rounded-full border border-amber-500/40 bg-black/80 p-1 text-amber-500 shadow-xl transition-colors duration-300 hover:border-amber-400 md:pl-4"
                    aria-label={view === 'mini' ? 'Müzik panelini aç' : 'Ambiyansı aç'}
                    title={view === 'mini' ? track.title : 'Velutan Ezgileri'}
                >
                    <div className="hidden flex-col items-end leading-tight md:flex">
                        <span className="text-[11px] font-black uppercase tracking-[0.18em]">{view === 'mini' ? (playing ? 'Çalıyor' : 'Duraklatıldı') : 'Müzik'}</span>
                        <span className="max-w-[150px] truncate text-right font-serif text-[11px] italic opacity-50">{view === 'mini' ? track.title : 'Velutan Ezgileri'}</span>
                    </div>
                    <div className="rounded-full border border-amber-500/30 bg-amber-500/10 p-2">
                        {view === 'mini' && playing ? (
                            // Çalarken küçük ekolayzer
                            <span className="flex h-5 w-5 items-end justify-center gap-[3px]">
                                {[0, 1, 2].map((i) => (
                                    <span key={i} className="w-[3px] rounded-sm bg-amber-400 animate-[vlEq_0.9s_ease-in-out_infinite]" style={{ animationDelay: `${i * 0.18}s` }} />
                                ))}
                            </span>
                        ) : (
                            <Music2 size={18} />
                        )}
                    </div>
                </button>
            )}
        </div>
    );
}
