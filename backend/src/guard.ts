import type { NextFunction, Request, Response } from 'express';

/**
 * Bekçi (bot koruması) açık kaynak sürümde devre dışıdır: velutan.com.tr'de çalışan sürüm,
 * kazıyıcılara karşı ayrıntıları gizli tutulan önlemler içerir.
 */
const pass = (_req: Request, _res: Response, next: NextFunction) => next();
export const dataGuard = pass;
export const staticGuard = pass;
export const honeypot = pass;
export const poisonJson = pass;
export const record = (_req: Request, _reason: string) => undefined;
export const ban = (_key: string, _reason: string) => undefined;
export const unban = (_key: string) => undefined;
export const isBanned = (_req: Request) => false;
export const isTrusted = (_req: Request) => true;
export const guardStats = () => ({ bans: [], events: [], counts: {} });
