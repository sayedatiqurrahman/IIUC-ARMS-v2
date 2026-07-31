'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { config } from '@/lib/config';
import { showToast } from '@/lib/utils';
import CustomSelect from '@/components/CustomSelect';

interface ReadmeEditorProps {
  folder: string;
  isOwner: boolean;
  isLoggedIn: boolean;
  canEdit?: boolean;
  courseCode?: string;
  courseTitle?: string;
  category?: string;
  midFinal?: string;
}

function parseLinks(content: string): { title: string; url: string }[] {
  const links: { title: string; url: string }[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*[-*]\s*\[(.+?)\]\((.+?)\)/);
    if (match) {
      links.push({ title: match[1], url: match[2] });
    }
  }
  return links;
}

function linksToContent(links: { title: string; url: string }[]): string {
  if (links.length === 0) return '';
  return links.map(l => `- [${l.title}](${l.url})`).join('\n') + '\n';
}

function getSemesterLabelFromFolder(folder: string): string {
  const parts = folder.split('/');
  for (const part of parts) {
    const sem = config.semesters.find(s => s.id === part);
    if (sem) return sem.label;
  }
  return '';
}

const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => {
  const year = new Date().getFullYear() - i;
  return { value: String(year), label: String(year), icon: 'fa-calendar' };
});

const SESSION_OPTIONS = [
  { value: 'Autumn', label: 'Autumn', icon: 'fa-leaf' },
  { value: 'Spring', label: 'Spring', icon: 'fa-seedling' },
];

function extractYearFromTitle(title: string): number {
  const match = title.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1]) : 0;
}

function sortLinksByYear(links: { title: string; url: string }[]): { title: string; url: string }[] {
  return [...links].sort((a, b) => extractYearFromTitle(b.title) - extractYearFromTitle(a.title));
}

export default function ReadmeEditor({ folder, isOwner, isLoggedIn, canEdit, courseCode, courseTitle, category, midFinal }: ReadmeEditorProps) {
  const [content, setContent] = useState('');
  const [sha, setSha] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkSession, setNewLinkSession] = useState(
    new Date().getMonth() >= 4 && new Date().getMonth() <= 9 ? 'Autumn' : 'Spring'
  );
  const [newLinkYear, setNewLinkYear] = useState(String(new Date().getFullYear()));

  const profile = useAppStore(s => s.profile);
  const authorName = profile.name || '';

  const semesterLabel = useMemo(() => getSemesterLabelFromFolder(folder), [folder]);

  const autoTitle = useMemo(() => {
    if (!newLinkSession || !newLinkYear || !semesterLabel || !authorName) return '';
    return `${newLinkSession} ${newLinkYear} - ${semesterLabel} - ${authorName}`;
  }, [newLinkSession, newLinkYear, semesterLabel, authorName]);

  const loadReadme = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/github/readme?folder=${encodeURIComponent(folder)}`);
      const data = await res.json();
      setContent(data.content || '');
      setSha(data.sha);
    } catch {
      setContent('');
      setSha(null);
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    loadReadme();
  }, [loadReadme]);

  const links = useMemo(() => sortLinksByYear(parseLinks(content)), [content]);

  async function handleSave(newContent?: string) {
    const contentToSave = newContent || editContent;
    setSaving(true);
    try {
      const res = await fetch('/api/github/readme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, content: contentToSave }),
      });
      const data = await res.json();
      if (data.success) {
        setContent(contentToSave);
        setSha(data.sha);
        setEditing(false);
        showToast('Links saved!', 'success');
      } else {
        showToast(data.error || 'Failed to save', 'error');
      }
    } catch {
      showToast('Network error', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleAddLink() {
    if (!autoTitle.trim() || !newLinkUrl.trim()) {
      showToast('Please select year and enter URL', 'error');
      return;
    }
    const url = newLinkUrl.trim().startsWith('http') ? newLinkUrl.trim() : `https://${newLinkUrl.trim()}`;
    const newLink = `- [${autoTitle.trim()}](${url})`;
    const updated = content ? content.trim() + '\n' + newLink + '\n' : newLink + '\n';
    handleSave(updated);
    setNewLinkUrl('');
  }

  if (loading) {
    return (
      <div className="px-3 py-2 text-[0.72rem] text-dark-text3">
        <i className="fas fa-spinner fa-spin mr-1"></i> Loading links...
      </div>
    );
  }

  // Owner or admin/manager/teacher/CR: full editor with links preview
  if (isOwner || canEdit) {
    return (
      <div className="mb-3 bg-dark-bg2 border border-dark-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-dark-border">
          <span className="text-[0.75rem] font-semibold text-dark-text2 flex items-center gap-1.5">
            <i className="fas fa-link text-qsis"></i> Shared Links
            {links.length > 0 && <span className="text-[0.65rem] text-dark-text3">({links.length})</span>}
          </span>
          {!editing && (
            <button
              className="text-[0.68rem] text-qsis hover:text-qsis-dark cursor-pointer bg-transparent border-none font-semibold"
              onClick={() => { setEditing(true); setEditContent(content); }}
            >
              <i className="fas fa-pen mr-1"></i>Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="p-3">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="Auto-generated title"
                value={autoTitle}
                readOnly
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg3 text-dark-text2 text-[0.78rem] outline-none cursor-not-allowed"
              />
            </div>
            <div className="flex gap-2 mb-2">
              <div className="w-[130px]">
                <CustomSelect
                  value={newLinkSession}
                  onChange={setNewLinkSession}
                  placeholder="Session"
                  options={SESSION_OPTIONS}
                />
              </div>
              <div className="w-[100px]">
                <CustomSelect
                  value={newLinkYear}
                  onChange={setNewLinkYear}
                  placeholder="Year"
                  options={YEAR_OPTIONS}
                />
              </div>
              <input
                type="url"
                placeholder="https://..."
                value={newLinkUrl}
                onChange={e => setNewLinkUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddLink()}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.78rem] outline-none focus:border-qsis"
              />
              <button
                className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.75rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
                onClick={handleAddLink}
                disabled={saving || !newLinkUrl.trim() || !autoTitle.trim()}
              >
                <i className="fas fa-plus"></i>
              </button>
            </div>
            <p className="text-[0.68rem] text-dark-text3 mb-2">
              Title: <code className="bg-dark-bg3 px-1 rounded">{autoTitle || 'Autumn 2026 - 6th Semester - AuthorName'}</code>
            </p>
            <p className="text-[0.68rem] text-dark-text3 mb-2">
              Or edit raw markdown: <code className="bg-dark-bg3 px-1 rounded">- [Title](https://url)</code>
            </p>
            <textarea
              className="w-full px-2.5 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] font-mono outline-none resize-y min-h-[80px]"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              placeholder={"- [Google Drive Link](https://drive.google.com/...)\n- [YouTube Playlist](https://youtube.com/...)"}
            />
            <div className="flex gap-2 mt-2">
              <button
                className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.75rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
                onClick={() => handleSave()}
                disabled={saving}
              >
                {saving ? <><i className="fas fa-spinner fa-spin mr-1"></i>Saving...</> : <><i className="fas fa-check mr-1"></i>Save</>}
              </button>
              <button
                className="px-3 py-1.5 rounded-lg bg-dark-bg3 text-dark-text2 text-[0.75rem] font-semibold border border-dark-border cursor-pointer hover:bg-dark-bg2"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3">
            {links.length === 0 ? (
              <p className="text-[0.72rem] text-dark-text3 text-center py-2">No links shared yet. Click Edit to add links.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/50 hover:bg-qsis/5 transition-all no-underline group"
                  >
                    <i className="fas fa-external-link-alt text-[0.65rem] text-dark-text3 group-hover:text-qsis"></i>
                    <span className="text-[0.8rem] text-dark-text font-semibold group-hover:text-qsis truncate">{link.title}</span>
                    <span className="text-[0.62rem] text-dark-text3 ml-auto truncate max-w-[200px]">{link.url.replace(/^https?:\/\//, '').slice(0, 40)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Everyone else (logged-in non-owner AND non-logged-in): read-only links preview
  if (links.length > 0) {
    return (
      <div className="mb-3 bg-dark-bg2 border border-dark-border rounded-xl overflow-hidden">
        <div className="px-3 py-2 border-b border-dark-border">
          <span className="text-[0.75rem] font-semibold text-dark-text2 flex items-center gap-1.5">
            <i className="fas fa-link text-qsis"></i> Shared Links
            <span className="text-[0.65rem] text-dark-text3">({links.length})</span>
          </span>
        </div>
        <div className="p-3">
          <div className="flex flex-col gap-1.5">
            {links.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border hover:border-qsis/50 hover:bg-qsis/5 transition-all no-underline group"
              >
                <i className="fas fa-external-link-alt text-[0.65rem] text-dark-text3 group-hover:text-qsis"></i>
                <span className="text-[0.8rem] text-dark-text font-semibold group-hover:text-qsis truncate">{link.title}</span>
                <span className="text-[0.62rem] text-dark-text3 ml-auto truncate max-w-[200px]">{link.url.replace(/^https?:\/\//, '').slice(0, 40)}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // No links — show course info placeholder for everyone
  return null;
}
