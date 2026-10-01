const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
    poweredByHeader: false,
    async headers() {
        return [
            { source: '/:path*', headers: securityHeaders },
            // Harita verisi (doku, ağaç, etiket) nadiren değişir: uzun önbellek
            { source: '/map3d/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' }] },
        ];
    },
};

export default nextConfig;
