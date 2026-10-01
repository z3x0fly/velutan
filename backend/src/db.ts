import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import { config } from './config';

/** Yerleşik node:sqlite (Node 22.13+): native derleme gerektirmez, Docker'da sorunsuz kurulur. */
export const db = new DatabaseSync(config.dbPath);

db.exec(`
    -- WAL kullanılmaz: docker-compose yalnızca velutan.db dosyasını bağlıyor; -wal dosyası konteynerde
    -- kalır ve konteyner yeniden oluşturulunca son yazılanlar kaybolurdu.
    PRAGMA journal_mode = DELETE;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS regions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR,
        slug VARCHAR,
        description TEXT,
        lore TEXT,
        image VARCHAR,
        type VARCHAR,
        x FLOAT,
        y FLOAT,
        created_at DATETIME
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ix_regions_slug ON regions (slug);
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    );
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS panoramas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        image TEXT NOT NULL,
        initial_yaw REAL NOT NULL DEFAULT 0,
        initial_pitch REAL NOT NULL DEFAULT 0,
        sort INTEGER NOT NULL DEFAULT 0,
        created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_panoramas_region ON panoramas (region_id, sort);
`);

// Rol sütunu (eski kurulumlarda yok): mevcut kullanıcılar yönetici kalır
const userColumns = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
if (!userColumns.some((c) => c.name === 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
}

// Panorama küçük resmi (eski kurulumlarda yok)
const panoColumns = db.prepare('PRAGMA table_info(panoramas)').all() as { name: string }[];
if (!panoColumns.some((c) => c.name === 'thumb')) db.exec('ALTER TABLE panoramas ADD COLUMN thumb TEXT');

export const ROLES = ['admin', 'editor'] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_LEGACY_PASSWORD = 'admin123';

/** İlk yönetici: ADMIN_PASSWORD verilmediyse rastgele şifre üretip bir kez log'a yazar. */
export function ensureAdmin() {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
    if (count > 0) {
        warnIfDefaultPassword();
        return;
    }
    const { username } = config.bootstrapAdmin;
    let password = config.bootstrapAdmin.password;
    if (!password) {
        password = crypto.randomBytes(12).toString('base64url');
        console.warn(`[güvenlik] İlk yönetici oluşturuldu -> kullanıcı: ${username}  şifre: ${password}  (giriş yapıp değiştirin)`);
    }
    db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')").run(username, bcrypt.hashSync(password, 12));
}

function warnIfDefaultPassword() {
    const rows = db.prepare('SELECT username, password FROM users').all() as { username: string; password: string }[];
    for (const row of rows) {
        if (row.password && bcrypt.compareSync(DEFAULT_LEGACY_PASSWORD, row.password)) {
            console.warn(`[güvenlik] UYARI: "${row.username}" kullanıcısı hâlâ varsayılan şifreyi kullanıyor. Admin panelinden hemen değiştirin!`);
        }
    }
}
