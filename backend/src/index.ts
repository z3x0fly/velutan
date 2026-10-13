import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { config } from './config';
import { ensureAdmin } from './db';
import regionsRouter from './routes/regions';
import authRouter from './routes/auth';
import panoramasRouter from './routes/panoramas';
import territoriesRouter from './routes/territories';
import masaRouter from './routes/masa';
import loreRouter from './routes/lore';
import guardRouter from './routes/guard';
import syncRouter from './routes/sync';
import feedbackRouter from './routes/feedback';
import { kasaKey } from './kasa';
import { dataGuard, honeypot, poisonJson, staticGuard } from './guard';
import { db } from './db';
import { startSync } from './sync';
import { recordWebTrap, startAttackWatch, TRAP_PATHS, webTrapHandler } from './attacks';

fs.mkdirSync(path.join(config.staticDir, 'images'), { recursive: true });
ensureAdmin();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
    helmet({
        // Görseller frontend/admin alan adlarından gömülür
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
);
app.use(
    cors({
        origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        maxAge: 600,
    }),
);
// Ortak masa kendi gövde sınırını (3 MB: token görselleri) kullanır; genel sınırdan önce bağlanır
app.use('/masa', masaRouter);
app.use(express.json({ limit: '1mb' }));

// robots.txt: arama motorlarına veri uçları kapalı; /veri/ ve /api/ bal küpü (kurala uymayan bot düşer)
app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /\nDisallow: /veri/\nDisallow: /api/\n');
});

// Web tuzakları: saldırı tarayıcılarının denediği adresler (wp-login, .env, .git ...)
app.use((req, res, next) => (req.method === 'GET' || req.method === 'POST') && TRAP_PATHS.test(req.path) ? webTrapHandler(req, res) : next());
// Önyüzün (Next) kendi tuzaklarını bildirdiği iç uç: yalnızca aynı makineden
app.post('/bekci/iz', (req, res) => {
    const raw = req.socket.remoteAddress || '';
    if (req.headers['x-forwarded-for'] || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(raw)) return res.status(404).end();
    const b = req.body ?? {};
    recordWebTrap({ ip: String(b.ip ?? '?').slice(0, 45), ua: String(b.ua ?? '').slice(0, 200), path: String(b.path ?? '').slice(0, 200), host: String(b.host ?? '').slice(0, 60) });
    res.json({ ok: true });
});

// Bal küpü: gerçek gibi görünen "tam veri" adresleri. Gelen IP yasaklanır, zehirli veri alır.
const fullDump = (_req: express.Request, res: express.Response) => {
    const regions = db.prepare('SELECT * FROM regions ORDER BY id').all() as { id: number }[];
    const panoramas = db.prepare('SELECT id, region_id, slug, title, image FROM panoramas').all();
    const territories = db.prepare('SELECT id, name, kind, points FROM territories').all();
    res.json({ surum: 3, kaynak: 'velutan.com.tr', regions, panoramas, territories });
};
app.get(['/veri/harita-tam.json', '/veri/export', '/api/v1/regions', '/api/regions', '/regions/export/all'], honeypot, poisonJson, fullDump);

// Medya (görsel, 360°) yalnızca izinli alan adlarından WebGL dokusu olarak yüklenebilir
app.use('/static', staticGuard);
app.use('/static', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    next();
});
app.use(
    '/static',
    express.static(config.staticDir, {
        dotfiles: 'deny',
        index: false,
        maxAge: '7d',
        setHeaders: (res) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
        },
    }),
);

app.use('/auth', authRouter);
// Harita verisi: tarayıcı olmayan ya da yasaklı istemciye zehirli veri (GET); yazma uçları zaten girişli
const guardGet = (req: express.Request, res: express.Response, next: express.NextFunction) => (req.method === 'GET' ? dataGuard(req, res, () => poisonJson(req, res, next)) : next());
app.use('/regions', guardGet, regionsRouter);
app.use('/panoramas', guardGet, panoramasRouter);
app.use('/territories', guardGet, territoriesRouter);
// Wiki kayıtları: bot ve yasaklıya kapalı
app.use('/lore', (req, res, next) => (req.method === 'GET' ? dataGuard(req, res, () => (res.locals.poison ? res.status(403).json({ error: 'Erişim yok' }) : next())) : next()), loreRouter);
app.use('/bekci', guardRouter);
app.use('/senkron', syncRouter);
app.use('/geri-bildirim', feedbackRouter);
app.post('/oturum', kasaKey);

app.get('/', (_req, res) => {
    res.json({ message: 'Velutan World Map API' });
});
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});

app.use((_req, res) => {
    res.status(404).json({ error: 'Bulunamadı' });
});

// Express 5 async hataları buraya düşer; iç ayrıntı istemciye sızdırılmaz
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ detail: err.code === 'LIMIT_FILE_SIZE' ? 'Dosya boyutu sınırı aşıldı' : 'Yükleme hatası' });
    }
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Geçersiz JSON' });
    console.error(err);
    res.status(500).json({ error: 'Sunucu hatası' });
});

startSync();
startAttackWatch();

app.listen(config.port, config.host, () => {
    console.log(`Velutan API http://${config.host}:${config.port} (CORS: ${config.corsOrigins.join(', ')})`);
});
