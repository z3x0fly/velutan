import { API_URL } from '../../map/media';

/**
 * Ortak masa (istemci): GM masayı açar, savaş durumunu sunucuya gönderir; oyuncular bağlantıyla katılıp
 * durumu canlı (Server-Sent Events) alır. Oyuncular durumu değiştirmez, yalnızca eylem yollar
 * (kendi token'ını taşıma, attığı zar, karakter seçimi); GM'in tarayıcısı bunları uygular.
 */
export type Role = 'gm' | 'player';

export interface Seat {
    id: string;
    name: string;
    gm: boolean;
    character: string | null;
}

export interface SessionAction {
    type: 'tasi' | 'zar' | 'karakter';
    from: { id: string; name: string; character: string | null };
    tokenId?: string | null;
    cx?: number;
    cz?: number;
    label?: string;
    expr?: string;
    values?: number[];
    total?: number;
    tone?: string;
}

export interface SessionState {
    code: string | null;
    role: Role | null;
    clientId: string;
    name: string;
    status: 'off' | 'connecting' | 'live' | 'lost' | 'closed' | 'error';
    error: string | null;
    pano: { region: string; slug: string } | null;
    /** Oyuncuda: GM'den gelen son durum */
    remote: { version: number; state: unknown } | null;
    seats: Seat[];
    /** Bu oyuncunun seçtiği karakter (token id) */
    character: string | null;
    /** Katılma ekranı gösterilsin mi (oyuncu henüz adını vermedi) */
    needsName: boolean;
}

const GM_KEY = 'velutan_masa_gm';
const NAME_KEY = 'velutan_masa_ad';

const rid = () => {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
};

let state: SessionState = {
    code: null,
    role: null,
    clientId: '',
    name: '',
    status: 'off',
    error: null,
    pano: null,
    remote: null,
    seats: [],
    character: null,
    needsName: false,
};
const listeners = new Set<() => void>();
const actionListeners = new Set<(a: SessionAction) => void>();
let es: EventSource | null = null;
let gmKey: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { state: unknown; pano: { region: string; slug: string } } | null = null;

const set = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
};

async function sha256(text: string) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function ensureClientId() {
    if (state.clientId) return state.clientId;
    let id = '';
    try {
        id = sessionStorage.getItem('velutan_masa_istemci') || '';
        if (!id) sessionStorage.setItem('velutan_masa_istemci', (id = rid()));
    } catch {
        id = rid();
    }
    set({ clientId: id });
    return id;
}

async function connect() {
    if (!state.code) return;
    es?.close();
    set({ status: 'connecting', error: null });
    const q = new URLSearchParams({ istemci: ensureClientId(), ad: state.name || (state.role === 'gm' ? 'GM' : 'Oyuncu') });
    if (state.role === 'gm' && gmKey) q.set('gm', await sha256(gmKey));
    const src = new EventSource(`${API_URL}/masa/${state.code}/akis?${q}`);
    es = src;
    src.addEventListener('hos-geldin', (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        set({ status: 'live', pano: d.pano });
        // Yeniden bağlanınca karakter seçimini hatırlat
        if (state.role === 'player' && state.character) void sessionStore.chooseCharacter(state.character);
        // GM'in bekleyen durumu varsa hemen gönder
        if (state.role === 'gm') flush();
    });
    src.addEventListener('durum', (e) => {
        const d = JSON.parse((e as MessageEvent).data);
        if (state.role === 'player') set({ remote: { version: d.version, state: d.state }, ...(d.pano ? { pano: d.pano } : {}) });
    });
    src.addEventListener('oyuncular', (e) => set({ seats: JSON.parse((e as MessageEvent).data) }));
    src.addEventListener('eylem', (e) => {
        const a = JSON.parse((e as MessageEvent).data) as SessionAction;
        actionListeners.forEach((l) => l(a));
    });
    src.addEventListener('kapandi', () => {
        src.close();
        es = null;
        set({ status: 'closed' });
    });
    src.onerror = () => {
        // Masa yoksa (404) EventSource bağlanmayı bırakır
        if (src.readyState === EventSource.CLOSED) {
            void fetch(`${API_URL}/masa/${state.code}`).then((r) => {
                if (r.status === 404) set({ status: 'closed', error: 'Masa kapanmış ya da bulunamadı' });
                else setTimeout(() => state.code && state.status !== 'closed' && void connect(), 3000);
            });
        } else set({ status: 'lost' });
    };
}

function flush() {
    if (!pending || !state.code || !gmKey || state.role !== 'gm') return;
    const body = JSON.stringify({ gmKey, state: pending.state, pano: pending.pano });
    pending = null;
    void fetch(`${API_URL}/masa/${state.code}/durum`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }).then((r) => {
        if (r.status === 404) set({ status: 'closed', error: 'Masa kapanmış' });
        else if (r.status === 413) set({ error: 'Masa çok büyük: karakter görsellerini azalt' });
    });
}

export const sessionStore = {
    get: () => state,
    subscribe: (l: () => void) => {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
    onAction: (l: (a: SessionAction) => void) => {
        actionListeners.add(l);
        return () => {
            actionListeners.delete(l);
        };
    },

    /** GM: bu mekân için masa aç */
    create: async (region: string, slug: string) => {
        set({ status: 'connecting', error: null });
        const r = await fetch(`${API_URL}/masa`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region, slug }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return set({ status: 'error', error: d.error ?? 'Masa açılamadı' });
        gmKey = d.gmKey;
        try {
            localStorage.setItem(GM_KEY, JSON.stringify({ code: d.id, gmKey: d.gmKey }));
        } catch {
            /* yoksay */
        }
        set({ code: d.id, role: 'gm', name: 'GM', pano: { region, slug } });
        await connect();
    },

    /** GM: sayfa yenilenince açık masaya geri dön */
    resumeGm: async () => {
        if (state.code) return;
        try {
            const saved = JSON.parse(localStorage.getItem(GM_KEY) || 'null');
            if (!saved?.code || !saved?.gmKey) return;
            const r = await fetch(`${API_URL}/masa/${saved.code}`);
            if (!r.ok) return localStorage.removeItem(GM_KEY);
            const d = await r.json();
            gmKey = saved.gmKey;
            set({ code: saved.code, role: 'gm', name: 'GM', pano: d.pano });
            await connect();
        } catch {
            /* yoksay */
        }
    },

    /** Oyuncu: davet bağlantısıyla gelindi; ad sorulacak */
    prepareJoin: (code: string, pano: { region: string; slug: string }) => {
        let name = '';
        try {
            name = localStorage.getItem(NAME_KEY) || '';
        } catch {
            /* yoksay */
        }
        set({ code: code.toUpperCase(), role: 'player', pano, name, needsName: true, status: 'off' });
    },

    join: async (name: string) => {
        const n = name.trim().slice(0, 24) || 'Oyuncu';
        try {
            localStorage.setItem(NAME_KEY, n);
        } catch {
            /* yoksay */
        }
        set({ name: n, needsName: false });
        await connect();
    },

    chooseCharacter: async (tokenId: string | null) => {
        set({ character: tokenId });
        await sessionStore.act({ type: 'karakter', tokenId });
    },

    /** Oyuncu eylemi */
    act: async (a: Record<string, unknown>) => {
        if (!state.code || state.status !== 'live') return;
        await fetch(`${API_URL}/masa/${state.code}/eylem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ istemci: state.clientId, ...a }),
        }).catch(() => undefined);
    },

    /** GM: durumu gönder (art arda değişiklikler tek istekte toplanır) */
    push: (s: unknown, pano: { region: string; slug: string }) => {
        if (state.role !== 'gm' || !state.code) return;
        pending = { state: s, pano };
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(flush, 180);
    },

    /** Masadan ayrıl (GM için: masayı kapat) */
    leave: async () => {
        es?.close();
        es = null;
        if (state.role === 'gm' && state.code && gmKey) {
            await fetch(`${API_URL}/masa/${state.code}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gmKey }) }).catch(() => undefined);
            try {
                localStorage.removeItem(GM_KEY);
            } catch {
                /* yoksay */
            }
        }
        gmKey = null;
        set({ code: null, role: null, status: 'off', error: null, pano: null, remote: null, seats: [], character: null, needsName: false });
    },

    inviteUrl: () => (state.code ? `${window.location.origin}/?masa=${state.code}` : ''),
};
