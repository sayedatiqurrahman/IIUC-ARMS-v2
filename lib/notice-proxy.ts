const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

export function noticeAttachmentUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/notices/attachment')) return rawUrl;
  return `${SITE_URL}/api/notices/attachment?url=${encodeURIComponent(rawUrl)}`;
}
