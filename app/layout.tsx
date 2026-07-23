import type { Metadata } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import Providers from '@/components/Providers';
import AppShell from '@/components/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'QSIS-ARMS | QSIS Academic Resource System',
  description: 'Free academic resource management system for Qur\'anic Sciences & Islamic Studies, IIUC.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </head>
      <body className="min-h-screen">
        <Script src="https://acrobatservices.adobe.com/view-sdk/viewer.js" strategy="beforeInteractive" />
        <Script src="https://www.google.com/recaptcha/enterprise.js?render=6LcR-WAtAAAAAJhcElM2R7BVtnipP88bqio0AKUs" strategy="beforeInteractive" />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <div id="toast" className="toast"></div>
        <Analytics />
      </body>
    </html>
  );
}
