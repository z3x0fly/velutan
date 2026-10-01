import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { config } from './config';

// Yalnızca görseller; uzantı dosya adından değil MIME türünden belirlenir
const IMAGE_TYPES: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

/** `static/<subdir>` altına kaydeden, boyut sınırlı görsel yükleyici. */
export function imageUploader(subdir: string, maxBytes: number) {
    const dir = path.join(config.staticDir, subdir);
    fs.mkdirSync(dir, { recursive: true });
    return multer({
        storage: multer.diskStorage({
            destination: dir,
            filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
        }),
        limits: { fileSize: maxBytes, files: 1 },
        fileFilter: (_req, file, cb) => cb(null, file.mimetype in IMAGE_TYPES),
    });
}

/** MIME başlığı taklit edilebilir; dosyanın ilk baytlarını da kontrol et. */
export function hasImageSignature(file: string): boolean {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    const hex = buf.toString('hex');
    return (
        hex.startsWith('ffd8ff') || // jpeg
        hex.startsWith('89504e470d0a1a0a') || // png
        buf.subarray(0, 6).toString('ascii').startsWith('GIF8') ||
        (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP')
    );
}

/**
 * Yüklenen dosyanın adresi. Göreli "/static/..." döner; harita ve panel bunu API adresine göre çözer
 * (alan adı değişse de kayıtlar bozulmaz).
 */
export function uploadedUrl(subdir: string, filename: string) {
    return `/static/${subdir}/${filename}`;
}
