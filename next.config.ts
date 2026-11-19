import type { NextConfig } from 'next';

const pagesPath = process.env.NEXT_PUBLIC_AUDITFLOW_BASE_PATH;

const config: NextConfig = {
  ...(pagesPath && { assetPrefix: pagesPath, distDir: '.next-pages' }),
  poweredByHeader: false,
  async rewrites() {
    return [
      'login',
      'register',
      'recover',
      'dashboard',
      'templates',
      'audits',
      'findings',
      'capa',
      'reports',
      'analytics',
      'settings',
    ].map((segment) => ({ source: `/${segment}/:path*`, destination: '/' }));
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default config;
