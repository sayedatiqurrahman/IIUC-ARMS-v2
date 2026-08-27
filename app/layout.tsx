import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Providers from '@/components/Providers';
import AppShell from '@/components/app-shell';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

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
      icon: '/arms-logo-icon.png',
    apple: '/arms-logo-icon.png',
    shortcut: '/arms-logo-icon.png',
  },
  manifest: '/manifest.json',
  alternates: {
    canonical: siteUrl,
  },
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
        <link rel="icon" href="/arms-logo-icon.png" sizes="any" />
        <link rel="apple-touch-icon" href="/arms-logo-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="IIUC-ARMS" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="msapplication-TileColor" content="#0f172a" />
        <meta name="msapplication-TileImage" content="/arms-logo-icon.png" />
        <meta name="google-site-verification" content="XgkbMrbzPfBjc-INVUQNQlSv53Ik2Gq04rrYb88aS9o" />
        <meta name="msvalidate.01" content="DD448DBC883F1B6109FDB70D65A3BB56" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@7.3.1/css/all.min.css" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}
        />
      </head>
      <body className="min-h-screen" suppressHydrationWarning>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-HW4QNEHD8B" strategy="afterInteractive" />
        <Script id="ga-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-HW4QNEHD8B');
        `}</Script>
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
