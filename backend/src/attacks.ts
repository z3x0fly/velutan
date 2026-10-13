import type { Request, Response } from 'express';

/** Saldırı izleme açık kaynak sürümde devre dışıdır (bkz. guard.ts). */
export const TRAP_PATHS = /^$/;
export const startAttackWatch = () => undefined;
export const recordWebTrap = (_ev: { ip: string; ua: string; path: string; host: string }) => undefined;
export const webTrapHandler = (_req: Request, res: Response) => res.status(404).end();
export const attackStats = () => ({ ssh: { available: false, total: 0, uniqueIps: 0, topIps: [], topUsers: [], hours: [], recent: [], success: [] }, web: { total: 0, byPath: [], recent: [] } });
