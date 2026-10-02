import crypto from 'crypto';
import path from 'path';

const env = process.env;
export const isProduction = env.NODE_ENV === 'production';

function jwtSecret(): string {
    const secret = env.JWT_SECRET;
    if (secret && secret.length >= 32) return secret;
    if (isProduction) {
        throw new Error('JWT_SECRET tanımlı değil ya da 32 karakterden kısa. Üretimde zorunludur.');
    }
    console.warn('[güvenlik] JWT_SECRET yok: geliştirme için rastgele bir anahtar üretildi (her yeniden başlatmada oturumlar düşer).');
    return crypto.randomBytes(48).toString('hex');
}

const ROOT = path.join(__dirname, '..');

export const config = {
    port: Number(env.PORT) || 8000,
    /** Docker içinde 0.0.0.0; doğrudan sunucuda 127.0.0.1 (yalnızca nginx erişsin) */
    host: env.HOST || '0.0.0.0',
    jwtSecret: jwtSecret(),
    jwtExpiresIn: '12h' as const,
    dbPath: env.DB_PATH || path.join(ROOT, 'velutan.db'),
    staticDir: path.join(ROOT, 'static'),
    corsOrigins: (env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    /** Kullanıcı tablosu boşken oluşturulacak ilk yönetici */
    bootstrapAdmin: {
        username: env.ADMIN_USERNAME || 'admin',
        password: env.ADMIN_PASSWORD || '',
    },
    uploadMaxBytes: 8 * 1024 * 1024,
    panoramaMaxBytes: 30 * 1024 * 1024,
};
