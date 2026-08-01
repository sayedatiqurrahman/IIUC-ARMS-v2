import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Providers from '@/components/Providers';
import AppShell from '@/components/AppShell';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'IIUC-ARMS | Academic Resource Management System',
    template: '%s | IIUC-ARMS',
  },
  description: 'Free open-source academic resource management system for IIUC departments including Qur\'anic Sciences & Islamic Studies (QSIS). Browse, share, and manage notes, sheets, syllabi, and previous questions.',
  keywords: [
    'QSIS', 'IIUC', 'academic resources', 'Quranic Sciences', 'Islamic Studies',
    'IIUC notes', 'previous questions', 'sheets', 'syllabus', 'academic file manager',
    'open source', 'free education', 'IIUC academic', 'QSIS IIUC',
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
    title: 'IIUC-ARMS | Academic Resource Management System',
    description: 'Free open-source academic resource management system for IIUC departments. Browse, share, and manage notes, sheets, syllabi, and previous questions.',
    images: [
      {
        url: 'https://i.imgur.com/r7LuDVs.png',
        width: 1200,
        height: 630,
        alt: 'IIUC-ARMS',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IIUC-ARMS | Academic Resource Management System',
    description: 'Free open-source academic resource management system for IIUC departments.',
    images: ['https://i.imgur.com/r7LuDVs.png'],
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
    alternateName: 'QSIS Academic Resource Management System',
    url: siteUrl,
    description: 'Free open-source academic resource management system for IIUC departments including Qur\'anic Sciences & Islamic Studies. Browse, share, and manage notes, sheets, syllabi, and previous questions.',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    author: { '@type': 'Person', name: 'Sayed Atiqur Rahman', url: 'https://github.com/sayedatiqurrahman' },
    publisher: { '@type': 'Organization', name: 'Programming Light' },
    inLanguage: 'en',
    isAccessibleForFree: true,
    keywords: ['QSIS', 'IIUC', 'academic resources', 'Quranic Sciences', 'Islamic Studies', 'notes', 'previous questions', 'sheets', 'syllabus'],
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
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
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
