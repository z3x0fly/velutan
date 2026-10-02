import { Feather, Flag, Gem, Scroll, Skull, Tent, type LucideIcon } from 'lucide-react';
import type { PinKind } from './pinStore';

/** İşaret türleri: harita mürekkebiyle uyumlu, birbirinden kolay ayrılan renkler */
export const PIN_META: Record<PinKind, { label: string; icon: LucideIcon; color: string }> = {
    kamp: { label: 'Kamp', icon: Tent, color: '#d4a24c' },
    gorev: { label: 'Görev', icon: Scroll, color: '#e8d9b0' },
    hazine: { label: 'Hazine', icon: Gem, color: '#5fc1b0' },
    tehlike: { label: 'Tehlike', icon: Skull, color: '#d0533f' },
    bulusma: { label: 'Buluşma', icon: Flag, color: '#7aa2e0' },
    not: { label: 'Not', icon: Feather, color: '#c9b48a' },
};
