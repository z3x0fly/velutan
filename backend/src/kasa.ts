import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { isBanned, isTrusted, record } from './guard';

/**
 * Harita kasası anahtarı: harita verisi (map3d/k/*.bin) AES-256-GCM ile şifreli durur; anahtar yalnızca kendi
 * sayfalarımızdan gelen isteklere verilir. Bot, yasaklı ya da dışarıdan gelen istemciye rastgele (yanlış) bir
 * anahtar döner: paketler açılmaz, istek Bekçi'ye kaydedilir.
 * Anahtar: KASA_KEY ortam değişkeni ya da backend/data/kasa.key (tools/pack_map.mjs üretir).
 */
let key: string | null = null;
function loadKey() {
    if (key) return key;
    const env = process.env.KASA_KEY?.trim();
    if (env) return (key = env);
    try {
        key = fs.readFileSync(path.join(__dirname, '..', 'data', 'kasa.key'), 'utf8').trim();
    } catch {
        key = null;
    }
    return key;
}

export function kasaKey(req: Request, res: Response) {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Origin, Sec-Fetch-Site, Referer');
    const real = loadKey();
    if (!real) return res.status(503).json({ error: 'Kasa hazır değil' });
    if (isBanned(req) || !isTrusted(req)) {
        record(req, 'bot-istemci');
        return res.json({ k: crypto.randomBytes(32).toString('base64') });
    }
    res.json({ k: real });
}
