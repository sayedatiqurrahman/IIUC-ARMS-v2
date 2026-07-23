import type { Metadata } from 'next';
import Script from 'next/script';
import Providers from '@/components/Providers';
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
        <Providers>{children}</Providers>
        <div id="toast" className="toast"></div>
        <script dangerouslySetInnerHTML={{ __html: `
          function showToast(msg, type) {
            var t = document.getElementById('toast');
            if (!t) return;
            t.textContent = msg;
            t.className = 'toast ' + (type || 'info') + ' show';
            clearTimeout(t._timer);
            t._timer = setTimeout(function() { t.classList.remove('show'); }, 3500);
          }
        `}} />
      </body>
    </html>
  );
}
