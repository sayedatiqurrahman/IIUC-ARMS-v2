/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['tesseract.js', '@jsquash/jpeg'],
  serverExternalPackages: ['@prisma/adapter-libsql', '@libsql/client', '@libsql/hrana-client', '@libsql/isomorphic-fetch', '@libsql/isomorphic-ws'],
  experimental: {
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'ui-avatars.com' },
    ],
  },
  webpack(config, { isServer }) {
    config.module.rules.push({ test: /\.md$/, type: 'asset/source' });
    return config;
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/((?!api/github/raw(?:/|$)|studio/app/|api/studio-apps/).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
