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
app.use(express.json({ limit: '1mb' }));

// Medya (görsel, 360°) yalnızca izinli alan adlarından WebGL dokusu olarak yüklenebilir
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
app.use('/regions', regionsRouter);
app.use('/panoramas', panoramasRouter);
app.use('/territories', territoriesRouter);

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

app.listen(config.port, config.host, () => {
    console.log(`Velutan API http://${config.host}:${config.port} (CORS: ${config.corsOrigins.join(', ')})`);
});
