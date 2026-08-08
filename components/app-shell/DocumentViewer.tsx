'use client';

import PdfViewer from '@/components/PdfViewer';
import ImageViewer from './ImageViewer';
import DocViewer from './DocViewer';
import EpubViewer from './EpubViewer';
import OfficeViewer from './OfficeViewer';
import TextViewer from './TextViewer';
import MediaViewer from './MediaViewer';
import UnsupportedViewer from './UnsupportedViewer';

export default function DocumentViewer({ item, onClose }: { item: any; onClose: () => void }) {
  const mime = item.mimeType;
  const ext = item.path?.split('.').pop()?.toLowerCase() || '';

  if (mime === 'pdf') return <PdfViewer url={item.rawUrl} name={item.name} filePath={item.path} onClose={onClose} />;
  if (mime === 'image') return <ImageViewer item={item} onClose={onClose} />;
  if (mime === 'epub') return <EpubViewer item={item} onClose={onClose} />;
  if (mime === 'kindle') return <UnsupportedViewer item={item} kindle onClose={onClose} />;
  if (mime === 'text') return <TextViewer item={item} onClose={onClose} />;
  if (mime === 'video' || mime === 'audio') return <MediaViewer item={item} onClose={onClose} />;
  if (mime === 'doc' && ext === 'docx') return <DocViewer item={item} onClose={onClose} />;
  if (mime === 'doc' || mime === 'sheet' || mime === 'ppt') return <OfficeViewer item={item} onClose={onClose} />;
  return <UnsupportedViewer item={item} onClose={onClose} />;
}
