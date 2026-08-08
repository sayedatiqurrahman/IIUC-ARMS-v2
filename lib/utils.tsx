import { config } from './config';
import { FACULTIES } from './departments';

export interface SelectOption {
  value: string;
  label: string;
  icon: string;
  group?: string;
}

export function getSemesterOptions(): SelectOption[] {
  return config.semesters.map(s => ({ value: s.id, label: s.label, icon: 'fa-calendar' }));
}

export function getDepartmentOptions(): SelectOption[] {
  return FACULTIES.flatMap(f =>
    f.departments.map(d => ({
      value: d.id,
      label: `${d.shortName} — ${d.name}`,
      icon: d.icon || 'fa-building',
      group: f.shortName,
    }))
  );
}

export async function safeJson(res: Response): Promise<any> {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(text.includes('<!DOCTYPE') ? `Server returned HTML instead of JSON (${res.status})` : `Expected JSON, got: ${ct}`);
  }
  return res.json();
}

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
  if (['jpg','jpeg','png','gif','webp','svg','bmp','avif','ico'].includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (['doc','docx'].includes(e)) return 'doc';
  if (['xls','xlsx','csv'].includes(e)) return 'sheet';
  if (['ppt','pptx'].includes(e)) return 'ppt';
  if (e === 'epub') return 'epub';
  if (['mobi','azw3','azw','kfx','prc','pdb','lit'].includes(e)) return 'kindle';
  if (['txt','md','markdown','log','json','ini','yaml','yml'].includes(e)) return 'text';
  if (['mp4','webm','mkv','mov','avi','m4v','ogv'].includes(e)) return 'video';
  if (['mp3','wav','ogg','m4a','flac','aac','opus'].includes(e)) return 'audio';
  return 'other';
}

export function getFileIconByType(mime: string) {
  if (mime === 'image') return <i className="fas fa-file-image" style={{color:'#34d399'}}></i>;
  if (mime === 'pdf') return <i className="fas fa-file-pdf" style={{color:'#ef4444'}}></i>;
  if (mime === 'doc') return <i className="fas fa-file-word" style={{color:'#3b82f6'}}></i>;
  if (mime === 'sheet') return <i className="fas fa-file-excel" style={{color:'#22c55e'}}></i>;
  if (mime === 'ppt') return <i className="fas fa-file-powerpoint" style={{color:'#f97316'}}></i>;
  if (mime === 'epub') return <i className="fas fa-book" style={{color:'#a855f7'}}></i>;
  if (mime === 'kindle') return <i className="fab fa-kindle" style={{color:'#f59e0b'}}></i>;
  if (mime === 'text') return <i className="fas fa-file-alt" style={{color:'#94a3b8'}}></i>;
  if (mime === 'video') return <i className="fas fa-file-video" style={{color:'#ec4899'}}></i>;
  if (mime === 'audio') return <i className="fas fa-file-audio" style={{color:'#14b8a6'}}></i>;
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

export function getRawUrl(path: string, githubPath?: string) {
  const fileRelPath = githubPath || path;
  const encoded = fileRelPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${config.uploadPath}/${encoded}`;
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
