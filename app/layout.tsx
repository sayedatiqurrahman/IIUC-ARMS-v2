import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Providers from '@/components/Providers';
import AppShell from '@/components/AppShell';
import './globals.css';

const siteUrl = 'https://qsis-arms.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'QSIS-ARMS | Academic Resource Management System',
    template: '%s | QSIS-ARMS',
  },
  description: 'Free open-source academic resource management system for the Department of Qur\'anic Sciences & Islamic Studies (QSIS), International Islamic University Chittagong (IIUC). Browse, share, and manage notes, sheets, syllabi, and previous questions.',
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
    siteName: 'QSIS-ARMS',
    title: 'QSIS-ARMS | Academic Resource Management System',
    description: 'Free open-source academic resource management system for QSIS, IIUC. Browse, share, and manage notes, sheets, syllabi, and previous questions.',
    images: [
      {
        url: '/arms-logo.png',
        width: 512,
        height: 512,
        alt: 'QSIS-ARMS Logo',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'QSIS-ARMS | Academic Resource Management System',
    description: 'Free open-source academic resource management system for QSIS, IIUC.',
    images: ['/arms-logo.png'],
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
    icon: '/arms-logo.png',
    apple: '/arms-logo.png',
    shortcut: '/arms-logo.png',
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
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/arms-logo.png" sizes="any" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </head>
      <body className="min-h-screen">
        <Script src="https://www.google.com/recaptcha/enterprise.js?render=6LcR-WAtAAAAAJhcElM2R7BVtnipP88bqio0AKUs" strategy="beforeInteractive" />
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
