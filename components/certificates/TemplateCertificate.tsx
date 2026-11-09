'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { buildTemplateValues, renderTemplateDocument } from '@/lib/cert-template';

export interface TemplateCertificateHandle {
  downloadPng: (filename?: string) => Promise<void>;
  downloadPdf: (filename?: string) => Promise<void>;
}

interface Props {
  template: { html: string; css: string; name?: string };
  cert: any;
  siteUrl?: string;
  className?: string;
}

async function waitForFrame(iframe: HTMLIFrameElement): Promise<HTMLElement> {
  const doc = iframe.contentDocument;
  const body = doc?.body;
  if (!doc || !body) throw new Error('Certificate frame is not ready');

  try {
    await (doc as any).fonts?.ready;
  } catch {}

  const images = Array.from(doc.images || []);
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
    ),
  );

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return body;
}

const TemplateCertificate = forwardRef<TemplateCertificateHandle, Props>(function TemplateCertificate(
  { template, cert, siteUrl, className },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const resolvedSiteUrl = siteUrl || (typeof window !== 'undefined' ? window.location.origin : 'https://arms.iiuc.net');

  useEffect(() => {
    const url = `${resolvedSiteUrl}/clubs/preview/${cert?.certificateId || ''}`;
    QRCode.toDataURL(url, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#1a1a2e', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(''));
  }, [cert?.certificateId, resolvedSiteUrl]);

  const doc = useMemo(() => {
    const values = buildTemplateValues(cert, { siteUrl: resolvedSiteUrl, qrDataUrl });
    return renderTemplateDocument(template?.html || '', template?.css || '', values);
  }, [template, cert, resolvedSiteUrl, qrDataUrl]);

  async function renderPng(): Promise<{ dataUrl: string; width: number; height: number }> {
    const iframe = iframeRef.current;
    if (!iframe) throw new Error('Certificate frame is not ready');
    const body = await waitForFrame(iframe);
    const width = Math.max(body.scrollWidth, body.offsetWidth, 1123);
    const height = Math.max(body.scrollHeight, body.offsetHeight, 794);
    const { toPng } = await import('dom-to-image-more');
    const dataUrl = await toPng(body, {
      quality: 1,
      bgcolor: '#ffffff',
      width,
      height,
      style: { transform: 'none', margin: '0' },
    });
    return { dataUrl, width, height };
  }

  useImperativeHandle(
    ref,
    () => ({
      async downloadPng(filename?: string) {
        const { dataUrl } = await renderPng();
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename || `certificate-${cert?.certificateId || 'download'}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      },
      async downloadPdf(filename?: string) {
        const { dataUrl, width, height } = await renderPng();
        const { jsPDF } = await import('jspdf');
        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pageW / width, pageH / height);
        const w = width * ratio;
        const h = height * ratio;
        pdf.addImage(dataUrl, 'PNG', (pageW - w) / 2, (pageH - h) / 2, w, h);
        pdf.save(filename || `certificate-${cert?.certificateId || 'download'}.pdf`);
      },
    }),
    [cert],
  );

  return (
    <iframe
      ref={iframeRef}
      title={`Certificate ${cert?.certificateId || ''}`}
      srcDoc={doc}
      sandbox="allow-same-origin"
      className={className || 'w-full rounded-xl border border-dark-border bg-white'}
      style={{ aspectRatio: '1123 / 794', minHeight: 320 }}
    />
  );
});

export default TemplateCertificate;
