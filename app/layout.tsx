import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Providers from '@/components/Providers';
import AppShell from '@/components/app-shell';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://arms.iiuc.net';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'IIUC-ARMS',
    template: '%s | IIUC-ARMS',
  },
  description: 'IIUC-ARMS — Academic resource and research management system for IIUC.',
  keywords: [
    'IIUC', 'IIUC-ARMS', 'academic resources', 'research tools',
    'university management', 'open source', 'education platform',
  ],
  authors: [{ name: 'Sayed Atiqur Rahman', url: 'https://github.com/sayedatiqurrahman' }],
  creator: 'Programming Light',
  publisher: 'Programming Light',
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'IIUC-ARMS',
    title: 'IIUC-ARMS',
    description: 'Academic resource and research management system for IIUC departments.',
    images: [
      {
        url: `${siteUrl}/arms-logo-icon.png`,
        width: 1200,
        height: 630,
        alt: 'IIUC-ARMS',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IIUC-ARMS',
    description: 'Academic resource and research management system for IIUC.',
    images: [`${siteUrl}/arms-logo-icon.png`],
    creator: '@sayedatiqurrahman',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: `${siteUrl}/favicon.ico`, sizes: 'any' },
      { url: `${siteUrl}/icon-32.png`, type: 'image/png', sizes: '32x32' },
      { url: `${siteUrl}/icon-48.png`, type: 'image/png', sizes: '48x48' },
      { url: `${siteUrl}/icon-192.png`, type: 'image/png', sizes: '192x192' },
    ],
    apple: [
      { url: `${siteUrl}/apple-touch-icon.png`, sizes: '180x180' },
      { url: `${siteUrl}/icon-152.png`, sizes: '152x152' },
    ],
    shortcut: `${siteUrl}/icon-48.png`,
  },
  manifest: '/manifest.json',
  category: 'education',
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'IIUC-ARMS',
    alternateName: 'IIUC Academic Resource & Research Management System',
    url: siteUrl,
    description: 'Academic resource and research management system for IIUC departments.',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Person', name: 'Sayed Atiqur Rahman', url: 'https://github.com/sayedatiqurrahman' },
    publisher: { '@type': 'Organization', name: 'Programming Light' },
    inLanguage: 'en',
    isAccessibleForFree: true,
    keywords: ['IIUC', 'IIUC-ARMS', 'academic resources', 'research tools', 'education platform', 'open source'],
  };

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="IIUC-ARMS" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="msapplication-TileColor" content="#0f172a" />
        <meta name="msapplication-TileImage" content={`${siteUrl}/icon-144.png`} />
        <meta name="google-site-verification" content="XgkbMrbzPfBjc-INVUQNQlSv53Ik2Gq04rrYb88aS9o" />
        <meta name="google-site-verification" content="UDIdn7-WixkkceHoeYWJZ_5epOeBWOBKOQ1dDmrjy9U" />
        <meta name="msvalidate.01" content="DD448DBC883F1B6109FDB70D65A3BB56" />
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-HW4QNEHD8B" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-HW4QNEHD8B');`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "ymthdw3fw7");`,
          }}
        />
        <script type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'WebSite',
                  '@id': `${siteUrl}/#website`,
                  url: siteUrl,
                  name: 'IIUC-ARMS',
                  description:
                    'Academic Resource Management System for IIUC departments — browse notes, sheets, questions, and results.',
                  publisher: { '@id': `${siteUrl}/#organization` },
                  inLanguage: 'en',
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: {
                      '@type': 'EntryPoint',
                      urlTemplate: `${siteUrl}/?q={search_term_string}`,
                    },
                    'query-input': 'required name=search_term_string',
                  },
                },
                {
                  '@type': 'Organization',
                  '@id': `${siteUrl}/#organization`,
                  name: 'IIUC-ARMS',
                  url: siteUrl,
                  logo: {
                    '@type': 'ImageObject',
                    url: `${siteUrl}/icon-512.png`,
                    width: 512,
                    height: 512,
                  },
                },
                {
                  '@type': 'SiteNavigationElement',
                  name: ['Browse', 'Routine', 'Studio', 'Team', 'Clubs'],
                  url: [
                    `${siteUrl}/`,
                    `${siteUrl}/routine`,
                    `${siteUrl}/studio`,
                    `${siteUrl}/contributors`,
                    `${siteUrl}/clubs`,
                  ],
                },
              ],
            }),
          }}
        />
        <link rel="sitemap" type="application/xml" href={`${siteUrl}/sitemap.xml`} />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@7.3.1/css/all.min.css" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
        />
      </head>
      <body className="min-h-screen" suppressHydrationWarning>
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer></script>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <div id="toast" className="toast"></div>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
