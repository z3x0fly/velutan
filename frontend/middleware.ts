import { NextResponse } from 'next/server';

/** Bekçi (önyüz) açık kaynak sürümde devre dışıdır. */
export function middleware() {
    return NextResponse.next();
}

export const config = { matcher: [] as string[] };
