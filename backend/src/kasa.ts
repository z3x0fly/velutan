import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { isBanned, isTrusted, record } from './guard';

/**
 * Harita kasası: harita verisi (map3d/k/*.bin) AES-256-GCM ile şifreli durur. Veri anahtarı ağdan hiçbir zaman
 * açık geçmez: tarayıcı her oturumda geçici bir ECDH (P-256) açık anahtarı yollar; sunucu kendi geçici anahtarıyla
 * ortak sırrı hesaplar, HKDF ile sarma anahtarı türetir ve veri anahtarını onunla şifreleyip döner. Ağda yalnızca
 * iki açık anahtar ve şifreli bir blok görünür; tarayıcıda anahtar dışa aktarılamaz bir nesne olarak kalır.
 * Bot, yasaklı ya da dışarıdan gelen istemciye aynı biçimde ama çözülemeyen rastgele bir yanıt döner.
 * Anahtar: KASA_KEY ortam değişkeni ya da backend/data/kasa.key (tools/pack_map.mjs üretir).
 */
// Her istekte okunur (küçük dosya): anahtar yenilenince sunucuyu yeniden başlatmak gerekmez
function loadKey() {
    const raw = process.env.KASA_KEY?.trim() || (() => {
        try {
            return fs.readFileSync(path.join(__dirname, '..', 'data', 'kasa.key'), 'utf8').trim();
        } catch {
            return '';
        }
    })();
    return raw ? Buffer.from(raw, 'base64') : null;
}

const b64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64');

export function kasaKey(req: Request, res: Response) {
    res.set('Cache-Control', 'no-store');
    const real = loadKey();
    if (!real) return res.status(503).end();
    let clientPub: Buffer;
    try {
        clientPub = Buffer.from(String(req.body?.p ?? ''), 'base64');
        if (clientPub.length !== 65) throw new Error('boyut');
    } catch {
        return res.status(400).end();
    }
    const ecdh = crypto.createECDH('prime256v1');
    const serverPub = ecdh.generateKeys();
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const trusted = !isBanned(req) && isTrusted(req);
    if (!trusted) {
        record(req, 'bot-istemci');
        return res.json({ s: b64(serverPub), n: b64(salt), w: b64(Buffer.concat([iv, crypto.randomBytes(48)])) });
    }
    let secret: Buffer;
    try {
        secret = ecdh.computeSecret(clientPub);
    } catch {
        return res.status(400).end();
    }
    const wrap = Buffer.from(crypto.hkdfSync('sha256', secret, salt, 'velutan-kasa', 32));
    const c = crypto.createCipheriv('aes-256-gcm', wrap, iv);
    const body = Buffer.concat([c.update(real), c.final(), c.getAuthTag()]);
    res.json({ s: b64(serverPub), n: b64(salt), w: b64(Buffer.concat([iv, body])) });
}
