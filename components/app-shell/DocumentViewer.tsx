'use client';

import ReactFileViewer from './ReactFileViewer';
import PdfViewer from '@/components/PdfViewer';
import ImageViewer from './ImageViewer';
import EpubViewer from './EpubViewer';
import OfficeViewer from './OfficeViewer';
import TextViewer from './TextViewer';
import MediaViewer from './MediaViewer';
import UnsupportedViewer from './UnsupportedViewer';

const RFV_TYPES: Record<string, string> = {
  mp3: 'mp3',
  mp4: 'mp4',
  webm: 'webm',
};

export default function DocumentViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const mime = item.mimeType;
  const ext = item.path?.split('.').pop()?.toLowerCase() || '';
  const rfvType = RFV_TYPES[ext];

  // PDFs always use the custom pdf.js viewer (sharp DPR rendering, zoom, text
  // selection) — the generic react-file-viewer iframe render was blurry/unreliable.
  if (mime === 'pdf' || ext === 'pdf') {
    return <PdfViewer url={item.rawUrl} name={item.name} filePath={item.path} onClose={onClose} />;
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
  if (mime === 'doc' || mime === 'sheet' || mime === 'ppt') return <OfficeViewer item={item} onClose={onClose} />;
  return <UnsupportedViewer item={item} onClose={onClose} />;
}
