import { config } from './config';

export function getFileIcon(ext: string) {
  if (['jpg','jpeg','png','gif','webp'].includes(ext)) return 'fa-file-image';
  if (ext === 'pdf') return 'fa-file-pdf';
  if (['doc','docx'].includes(ext)) return 'fa-file-word';
  if (['xls','xlsx','csv'].includes(ext)) return 'fa-file-excel';
  if (['ppt','pptx'].includes(ext)) return 'fa-file-powerpoint';
  return 'fa-file';
}

export function getMimeFromExt(ext: string) {
  const e = ext.toLowerCase();
  if (['jpg','jpeg','png','gif','webp'].includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (['doc','docx'].includes(e)) return 'doc';
  if (['xls','xlsx','csv'].includes(e)) return 'sheet';
  if (['ppt','pptx'].includes(e)) return 'ppt';
  return 'other';
}

export function getFileIconByType(mime: string) {
  if (mime === 'image') return <i className="fas fa-file-image" style={{color:'#34d399'}}></i>;
  if (mime === 'pdf') return <i className="fas fa-file-pdf" style={{color:'#ef4444'}}></i>;
  if (mime === 'word') return <i className="fas fa-file-word" style={{color:'#3b82f6'}}></i>;
  if (mime === 'excel') return <i className="fas fa-file-excel" style={{color:'#22c55e'}}></i>;
  if (mime === 'powerpoint') return <i className="fas fa-file-powerpoint" style={{color:'#f97316'}}></i>;
  return <i className="fas fa-file" style={{color:'#94a3b8'}}></i>;
}

export function esc(text: string) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function timeAgo(ts: number) {
  const d = Date.now() - ts;
  if (d < 60000) return 'Just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return Math.floor(d / 86400000) + 'd ago';
}

export function makeId(path: string) {
  return btoa(unescape(encodeURIComponent(path))).replace(/[=+/]/g, '');
}

export function getRawUrl(path: string) {
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${config.uploadPath}/${path}`;
}

export function extractYear(name: string): string {
  const m = name.match(/(20\d{2})/);
  return m ? m[1] : '';
}

export function showToast(msg: string, type: string) {
  if (typeof document === 'undefined') return;
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type || 'info'} show`;
  clearTimeout((t as any)._timer);
  (t as any)._timer = setTimeout(() => t.classList.remove('show'), 3500);
}
