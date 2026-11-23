/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // No page may be framed by another site...
      { source: '/((?!payment/).*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] },
      // ...but the payment return pages may load inside the card-page iframe on our own checkout
      // page (the hosted page redirects its frame there), and then move the whole window.
      { source: '/payment/:path*', headers: [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }] },
    ];
  },
};

export default nextConfig;
