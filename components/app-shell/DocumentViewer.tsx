'use client';

import { useState } from 'react';
import ReactFileViewer from './ReactFileViewer';
import PdfViewer from '@/components/PdfViewer';
import ImageViewer from './ImageViewer';
import EpubViewer from './EpubViewer';
import OfficeViewer from './OfficeViewer';
import TextViewer from './TextViewer';
import MediaViewer from './MediaViewer';
import UnsupportedViewer from './UnsupportedViewer';

const RFV_TYPES: Record<string, string> = {
  pdf: 'pdf',
  png: 'png',
  jpg: 'jpg',
  jpeg: 'jpeg',
  gif: 'gif',
  bmp: 'bmp',
  docx: 'docx',
  xlsx: 'xlsx',
  csv: 'csv',
  mp3: 'mp3',
  mp4: 'mp4',
  webm: 'webm',
};

export default function DocumentViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const mime = item.mimeType;
  const ext = item.path?.split('.').pop()?.toLowerCase() || '';
  const [useLegacyPdf, setUseLegacyPdf] = useState(false);
  const rfvType = RFV_TYPES[ext];

  if (useLegacyPdf) {
    return <PdfViewer url={item.rawUrl} name={item.name} filePath={item.path} onClose={onClose} />;
  }
  if (rfvType) {
    return (
      <ReactFileViewer
        fileType={rfvType}
        url={item.rawUrl}
        name={item.name}
        onClose={onClose}
        onError={rfvType === 'pdf' ? () => setUseLegacyPdf(true) : undefined}
      />
    );
  }
  if (mime === 'image') return <ImageViewer item={item} onClose={onClose} />;
  if (mime === 'epub') return <EpubViewer item={item} onClose={onClose} />;
  if (mime === 'kindle') return <UnsupportedViewer item={item} kindle onClose={onClose} />;
  if (mime === 'text') return <TextViewer item={item} onClose={onClose} />;
  if (mime === 'video' || mime === 'audio') return <MediaViewer item={item} onClose={onClose} />;
  if (mime === 'doc' || mime === 'sheet' || mime === 'ppt') return <OfficeViewer item={item} onClose={onClose} />;
  return <UnsupportedViewer item={item} onClose={onClose} />;
}
