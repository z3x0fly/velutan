'use client';

import React from 'react';

interface State {
    error: Error | null;
}

/**
 * 3D sahne çökerse (WebGL desteklenmiyor, GPU belleği bitti, doku yüklenemedi...) beyaz ekran yerine
 * açıklama ve yeniden deneme göster. "?kalite=dusuk" düşük çözünürlüklü dokularla açar.
 */
export default class MapErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error) {
        console.error('[Velutan] Harita hatası:', error);
    }

    componentDidMount() {
        window.addEventListener('webglcontextlost', this.onContextLost, true);
    }

    componentWillUnmount() {
        window.removeEventListener('webglcontextlost', this.onContextLost, true);
    }

    private onContextLost = () => {
        this.setState({ error: new Error('Grafik bağlamı kayboldu (GPU belleği yetersiz olabilir).') });
    };

    private retryLow = () => {
        const url = new URL(window.location.href);
        url.searchParams.set('kalite', 'dusuk');
        window.location.href = url.toString();
    };

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0d1218] p-6 text-center">
                <div className="max-w-md space-y-4 rounded-2xl border border-amber-600/30 bg-black/60 p-8">
                    <h2 className="font-serif text-2xl font-black text-amber-400">Harita açılamadı</h2>
                    <p className="text-sm text-amber-100/70">{this.state.error.message}</p>
                    <div className="flex flex-wrap justify-center gap-3 pt-2">
                        <button
                            onClick={() => window.location.reload()}
                            className="rounded-lg bg-amber-600 px-5 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-amber-500"
                        >
                            Yeniden dene
                        </button>
                        <button
                            onClick={this.retryLow}
                            className="rounded-lg border border-amber-600/40 px-5 py-2 text-xs font-black uppercase tracking-widest text-amber-400 hover:bg-amber-600/10"
                        >
                            Düşük kalitede aç
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
