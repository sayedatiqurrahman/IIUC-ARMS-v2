'use client';

import PdfViewer from '@/components/PdfViewer';
import OfficeViewer from './OfficeViewer';
import WordViewer from './WordViewer';
import ImageViewer from './ImageViewer';
import EpubViewer from './EpubViewer';
import TextViewer from './TextViewer';
import MediaViewer from './MediaViewer';
import UnsupportedViewer from './UnsupportedViewer';

const OFFICE_TYPES = ['doc', 'xls', 'xlsx', 'ppt', 'pptx'];

export default function DocumentViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const mime = item.mimeType;
  const ext = item.path?.split('.').pop()?.toLowerCase() || '';

  // pdf renders in the in-app pdf.js viewer; docx renders natively via
  // docx-preview; the remaining office formats (doc/xls/xls/ppt/pptx) render in
  // the Microsoft Office embed; media (mp3/mp4/webm/…) render in the native
  // HTML5 video/audio player.
  if (ext === 'pdf') return <PdfViewer url={item.rawUrl} name={item.name} onClose={onClose} />;
  if (ext === 'docx') return <WordViewer item={item} onClose={onClose} />;
  if (OFFICE_TYPES.includes(ext)) return <OfficeViewer item={item} onClose={onClose} />;
  if (mime === 'image') return <ImageViewer item={item} onClose={onClose} />;
  if (mime === 'epub') return <EpubViewer item={item} onClose={onClose} />;
  if (mime === 'kindle') return <UnsupportedViewer item={item} kindle onClose={onClose} />;
  if (mime === 'text') return <TextViewer item={item} onClose={onClose} />;
  if (mime === 'video' || mime === 'audio') return <MediaViewer item={item} onClose={onClose} />;
  return <UnsupportedViewer item={item} onClose={onClose} />;
}
