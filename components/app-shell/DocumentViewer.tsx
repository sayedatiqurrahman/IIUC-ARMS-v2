'use client';

import ReactFileViewer from './ReactFileViewer';
import ReactDocViewer from './ReactDocViewer';
import PdfViewer from '@/components/PdfViewer';
import ImageViewer from './ImageViewer';
import EpubViewer from './EpubViewer';
import TextViewer from './TextViewer';
import MediaViewer from './MediaViewer';
import UnsupportedViewer from './UnsupportedViewer';

const RFV_TYPES: Record<string, string> = {
  mp3: 'mp3',
  mp4: 'mp4',
  webm: 'webm',
};

const DOC_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

export default function DocumentViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const mime = item.mimeType;
  const ext = item.path?.split('.').pop()?.toLowerCase() || '';
  const rfvType = RFV_TYPES[ext];

  // pdf / doc / docx / xls / xlsx / ppt / pptx render inline via react-doc-viewer
  // (pdf.js for PDFs, Microsoft Office embed for the rest) — no downloads.
  if (DOC_TYPES.includes(ext)) {
    return <ReactDocViewer item={item} onClose={onClose} />;
  }
  if (mime === 'image') return <ImageViewer item={item} onClose={onClose} />;
  if (rfvType) {
    return (
      <ReactFileViewer
        fileType={rfvType}
        url={item.rawUrl}
        name={item.name}
        onClose={onClose}
      />
    );
  }
  if (mime === 'epub') return <EpubViewer item={item} onClose={onClose} />;
  if (mime === 'kindle') return <UnsupportedViewer item={item} kindle onClose={onClose} />;
  if (mime === 'text') return <TextViewer item={item} onClose={onClose} />;
  if (mime === 'video' || mime === 'audio') return <MediaViewer item={item} onClose={onClose} />;
  return <UnsupportedViewer item={item} onClose={onClose} />;
}
