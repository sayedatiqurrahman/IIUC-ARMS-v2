'use client';

import { useEffect, useState } from 'react';
import DocViewer, { DocViewerRenderers } from 'react-doc-viewer';
import { pdfjs } from 'react-pdf';

// react-doc-viewer bundles react-pdf for PDF rendering. Its own workerSrc is
// built from import.meta.url (invalid under Next.js webpack), so we point the
// shared react-pdf instance at a worker file we serve from /public (matching
// pdfjs-dist 4.3.136). Loading this component also auto-fetches the PDF bytes
// (fetch), so files render inline instead of downloading.
export default function DocViewerInner({ uri, fileType }: { uri: string; fileType: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker-4.3.136.min.mjs';
    } catch {}
    setReady(true);
  }, []);

  if (!ready) return null;

  return (
    <div className="w-full h-full bg-[#0a0f1e]">
      <DocViewer
        documents={[{ uri, fileType }]}
        pluginRenderers={DocViewerRenderers}
        config={{ header: { disableHeader: true, disableFileName: true, retainURLParams: false } }}
        theme={{
          primary: '#0b1120',
          secondary: '#1f2937',
          tertiary: '#374151',
          text_primary: '#f3f4f6',
          text_secondary: '#9ca3af',
          text_tertiary: '#6b7280',
        }}
      />
    </div>
  );
}
