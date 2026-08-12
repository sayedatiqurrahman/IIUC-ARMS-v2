/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['tesseract.js', '@jsquash/jpeg'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'ui-avatars.com' },
    ],
  },
  async headers() {
    return [
      // Never cache the service worker, otherwise browsers hold a stale SW for
      // up to the max-age (the old SW broke /pdfjs/ and produced X-Frame-Options
      // and "Failed to convert value to 'Response'" errors).
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      // The pdf.js viewer page runs inside an <iframe>; it must not be
      // blocked by X-Frame-Options (the catch-all below skips /pdfjs/*).
      {
        source: '/pdfjs/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // Everything except pdf.js viewer and the raw inline proxy (which loads
        // inside an <iframe> for the PDF viewer / Office embed) gets DENY.
        source: '/((?!pdfjs/|api/github/raw(?:/|$)).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
