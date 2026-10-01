import axios, { AxiosError } from 'axios';

// Ortam değişkeni verilmezse resmi API (yalnızca resmi alan adlarına CORS izni verir)
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://api.velutan.com.tr').replace(/\/$/, '');

export const api = axios.create({ baseURL: API_URL });

export type Role = 'admin' | 'editor';

export interface Session {
    token: string;
    username: string;
    role: Role;
}

const SESSION_KEY = 'velutan_session';

export function loadSession(): Session | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
        return null;
    }
}

export function saveSession(s: Session | null) {
    try {
        if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
        else localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem('token'); // eski sürümün anahtarı
    } catch {
        /* gizli mod vb. */
    }
    if (s) api.defaults.headers.common.Authorization = `Bearer ${s.token}`;
    else delete api.defaults.headers.common.Authorization;
}

/** Oturum düşünce (401) panel giriş ekranına döner */
export function onUnauthorized(handler: () => void) {
    const id = api.interceptors.response.use(undefined, (err: AxiosError) => {
        if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) handler();
        return Promise.reject(err);
    });
    return () => api.interceptors.response.eject(id);
}

export function errorMessage(err: unknown, fallback = 'Bir hata oluştu'): string {
    const e = err as AxiosError<{ error?: string; detail?: string }>;
    return e.response?.data?.error || e.response?.data?.detail || fallback;
}

/** Backend'deki göreli "/static/..." yollarını API adresine göre çözer */
export function mediaUrl(url?: string | null): string | undefined {
    if (!url) return undefined;
    if (/^https?:\/\//.test(url)) return url;
    if (url.startsWith('/static/')) return `${API_URL}${url}`;
    return undefined;
}

export async function uploadImage(file: File, kind: 'image' | 'panorama'): Promise<string> {
    const data = new FormData();
    data.append('file', file);
    const path = kind === 'panorama' ? '/panoramas/upload' : '/regions/upload-image/';
    const res = await api.post<{ url: string }>(path, data);
    return res.data.url;
}

/** Türkçe karakterleri sadeleştirip slug üretir */
export function slugify(text: string): string {
    const map: Record<string, string> = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };
    return text
        .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (c) => map[c] ?? c)
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export interface Panorama {
    id: number;
    region_id: number;
    slug: string;
    title: string;
    image: string;
    thumb?: string | null;
    initial_yaw: number;
    initial_pitch: number;
    sort: number;
}

export interface Region {
    id: number;
    name: string;
    slug: string;
    description: string;
    lore: string;
    x: number;
    y: number;
    image?: string;
    type?: string;
    panoramas?: Panorama[];
}

export const REGION_TYPES: { value: string; label: string }[] = [
    { value: 'capital', label: 'Başkent' },
    { value: 'city', label: 'Şehir' },
    { value: 'fortress', label: 'Kale / Hisar' },
    { value: 'ruin', label: 'Harabe / Zindan' },
    { value: 'landmark', label: 'Doğal Yapı / Önemli Yer' },
    { value: 'character', label: 'Karakter' },
    { value: 'lore', label: 'Lore / Hikaye' },
    { value: 'event', label: 'Olay / Savaş' },
];

// Harita koordinat uzayı (frontend ile aynı)
export const MAP_WIDTH = 8192;
export const MAP_HEIGHT = 7192;
