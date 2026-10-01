import { BookOpen, Castle, Crown, Home, LucideIcon, Mountain, Skull, Swords, User } from 'lucide-react';

export interface MarkerStyle {
    label: string;
    color: string;
    icon: LucideIcon;
    /** Bu mesafenin (kamera->işaretçi) altında görünür */
    showWithin: number;
}

export const MARKER_STYLES: Record<string, MarkerStyle> = {
    capital: { label: 'Başkent', color: '#ef4444', icon: Crown, showWithin: Infinity },
    city: { label: 'Şehir', color: '#f59e0b', icon: Home, showWithin: 30 },
    fortress: { label: 'Kale / Hisar', color: '#a8a29e', icon: Castle, showWithin: 34 },
    ruin: { label: 'Harabe / Zindan', color: '#a855f7', icon: Skull, showWithin: 24 },
    landmark: { label: 'Doğal Yapı', color: '#22c55e', icon: Mountain, showWithin: 24 },
    character: { label: 'Karakter', color: '#3b82f6', icon: User, showWithin: 18 },
    lore: { label: 'Lore / Hikaye', color: '#06b6d4', icon: BookOpen, showWithin: 22 },
    event: { label: 'Olay / Savaş', color: '#f97316', icon: Swords, showWithin: 22 },
};

export const markerStyle = (type?: string): MarkerStyle => MARKER_STYLES[type ?? ''] ?? MARKER_STYLES.city;
