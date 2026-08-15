'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { showToast } from '@/lib/utils';
import type { HubTheme, IucdProject } from './creative-hub/types';
import { BUNDLED_THEMES, extractFieldTypes, fieldLabel, applyFieldValuesToString, AUTO_FILL_RULES, PAGE_SIZES, buildCommunityFolder } from './creative-hub/templates';
import CanvasEditor from './creative-hub/CanvasEditor';
import {
  listDraftMeta, getDraft, saveDraft, deleteDraft, saveSession, newDraftId,
  type CreativeHubDraft,
} from '@/lib/creative-hub-store';

// ============================================================
// Creative Hub — thesis / assignment cover-page designer.
//
//  • Gallery of default themes (served from the dedicated themes repo,
//    bundled fallback embedded in the app for offline reliability).
//  • Community designs published by users (fetched from the themes repo).
//  • Three editing modes: Form Fill-up (dynamic from data-field-type),
//    Auto-Fill (dashboard profile), Manual (fabric.js canvas editor that
//    covers the navbar with a fixed overlay + close-only button).
//  • Local drafts kept on-device in IndexedDB (no cloud DB).
//  • Export PDF / DOCX / PNG always at the selected page size (A4 default)
//    and .iucd project files that can be re-imported.
// ============================================================

const THEMES_RAW = 'https://raw.githubusercontent.com';
const PREVIEW_RAW = (themeId: string) =>
  `${THEMES_RAW}/sayedatiqurrahman/QSIS-CREATIVE-HUB-THEMES/main/themes/${themeId}/preview.svg`;

interface CreativeHubProps {
  onClose: () => void;
}

type EditorTab = 'gallery' | 'drafts' | 'community';

export default function CreativeHub({ onClose }: CreativeHubProps) {
  const profile = useAppStore((s) => s.profile);
  const profileLoaded = !!profile?.name || !!profile?.universityId;

  const [themes, setThemes] = useState<HubTheme[]>(BUNDLED_THEMES);
  const [community, setCommunity] = useState<HubTheme[]>([]);
  const [authors, setAuthors] = useState<any[]>([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [tab, setTab] = useState<EditorTab>('gallery');

  const [selected, setSelected] = useState<HubTheme | null>(null);
  const [mode, setMode] = useState<'form-fill' | 'auto-fill' | 'manual' | null>(null);
  const [fieldTypes, setFieldTypes] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [designHtml, setDesignHtml] = useState('');

  const [drafts, setDrafts] = useState<CreativeHubDraft[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [currentDraftName, setCurrentDraftName] = useState('Untitled Design');

  const [manualOpen, setManualOpen] = useState(false);
  const [manualLayers, setManualLayers] = useState<unknown>(null);
  const [manualImage, setManualImage] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState<'pdf' | 'docx' | 'png' | 'iucd' | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishMeta, setPublishMeta] = useState({
    name: '',
    subtitle: '',
    description: '',
    language: 'english',
    categories: ['thesis'] as string[],
  });

  const previewRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const pageSize = selected?.pageSize || 'a4';
  const pagePx = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;

  // ─── Load local drafts + community data on mount ─────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    void listDraftMeta().then((d) => {
      if (mountedRef.current) setDrafts(d);
    });
    fetch('/api/creative-hub/community')
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (!mountedRef.current) return;
        if (data?.authors) setAuthors(data.authors);
        if (Array.isArray(data?.community)) setCommunity(data.community);
        if (data?.manifest?.themes && Array.isArray(data.manifest.themes)) {
          setThemes((cur) =>
            cur.map((t) => {
              const m = data.manifest.themes.find((x: any) => x.id === t.id);
              if (m && m.preview) return { ...t, preview: m.preview };
              return t;
            })
          );
        }
        setCommunityLoading(false);
      })
      .catch(() => setCommunityLoading(false));
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Persist the last session so the user can resume next time.
  useEffect(() => {
    if (!currentDraftId) return;
    void saveSession({ draftId: currentDraftId, templateId: selected?.id || '', updatedAt: Date.now() });
  }, [currentDraftId, selected]);

  // ─── Draft persistence (debounced) ───────────────────────────────────────
  const persistDraft = useCallback(
    (draft: CreativeHubDraft) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveDraft(draft).then(() => {
          void listDraftMeta().then((d) => {
            if (mountedRef.current) setDrafts(d);
          });
        });
      }, 400);
    },
    []
  );

  const selectTheme = useCallback(
    (theme: HubTheme) => {
      const types = extractFieldTypes(theme.html);
      const existingValues: Record<string, string> = {};
      types.forEach((t) => {
        existingValues[t] = '';
      });
      const id = newDraftId();
      const draft: CreativeHubDraft = {
        id,
        name: theme.name,
        templateId: theme.id,
        mode: 'form-fill',
        fields: existingValues,
        layers: null,
        html: theme.html,
        metadata: { title: theme.name, pageSize: theme.pageSize },
        pageSize: theme.pageSize,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      };
      void saveDraft(draft);
      setSelected(theme);
      setFieldTypes(types);
      setFields(existingValues);
      setDesignHtml(theme.html);
      setManualLayers(null);
      setManualImage('');
      setMode('form-fill');
      setCurrentDraftId(id);
      setCurrentDraftName(theme.name);
      void listDraftMeta().then((d) => {
        if (mountedRef.current) setDrafts(d);
      });
    },
    []
  );

  const resumeDraft = useCallback((draft: CreativeHubDraft) => {
    const types = extractFieldTypes(draft.html);
    const values: Record<string, string> = { ...draft.fields };
    types.forEach((t) => {
      if (values[t] === undefined) values[t] = '';
    });
    const theme: HubTheme = {
      id: draft.templateId || 'imported',
      name: draft.name || 'Imported Design',
      subtitle: '',
      description: '',
      language: 'english',
      categories: [],
      preview: '',
      html: draft.html,
      pageSize: draft.pageSize || 'a4',
      source: 'fallback',
      fields: types.map((t) => ({ type: t, label: fieldLabel(t) })),
    };
    setSelected(theme);
    setFieldTypes(types);
    setFields(values);
    setDesignHtml(draft.html);
    setManualLayers(draft.layers || null);
    setManualImage('');
    setMode((draft.mode as any) || 'form-fill');
    setCurrentDraftId(draft.id);
    setCurrentDraftName(draft.name || 'Imported Design');
  }, []);

  // Re-render the live A4 preview whenever the design or its field values change.
  useEffect(() => {
    if (!selected || !designHtml || !previewRef.current) return;
    previewRef.current.innerHTML = applyFieldValuesToString(designHtml, fields);
  }, [selected, designHtml, fields]);

  const updateField = useCallback(
    (type: string, value: string) => {
      setFields((prev) => {
        const next = { ...prev, [type]: value };
        if (currentDraftId) {
          persistDraft({
            id: currentDraftId,
            name: currentDraftName,
            templateId: selected?.id || '',
            mode: mode || 'form-fill',
            fields: next,
            layers: manualLayers,
            html: designHtml,
            metadata: { title: currentDraftName, pageSize },
            pageSize,
            updatedAt: Date.now(),
            createdAt: Date.now(),
          });
        }
        return next;
      });
    },
    [currentDraftId, currentDraftName, selected, mode, manualLayers, designHtml, pageSize, persistDraft]
  );

  // ─── Auto-Fill from dashboard profile ────────────────────────────────────
  const applyAutoFill = useCallback(() => {
    if (!profileLoaded) {
      showToast('Complete your dashboard profile first to auto-fill.', 'info');
      return;
    }
    const filled: Record<string, string> = {};
    fieldTypes.forEach((t) => {
      const rule = AUTO_FILL_RULES.find((r) => r.type === t);
      const value = rule ? rule.get(profile as any) : '';
      if (value) filled[t] = value;
    });
    const anyFilled = Object.keys(filled).length > 0;
    if (!anyFilled) {
      showToast('No matching profile data found for this design.', 'info');
      return;
    }
    setFields((prev) => {
      const next = { ...prev, ...filled };
      if (currentDraftId) {
        persistDraft({
          id: currentDraftId,
          name: currentDraftName,
          templateId: selected?.id || '',
          mode: mode || 'auto-fill',
          fields: next,
          layers: manualLayers,
          html: designHtml,
          metadata: { title: currentDraftName, pageSize },
          pageSize,
          updatedAt: Date.now(),
          createdAt: Date.now(),
        });
      }
      return next;
    });
    showToast('This data is pulled from your dashboard profile.', 'success');
    setMode('form-fill');
  }, [fieldTypes, profileLoaded, profile, currentDraftId, currentDraftName, selected, mode, manualLayers, designHtml, pageSize, persistDraft]);

  // ─── Manual editor callbacks ─────────────────────────────────────────────
  const openManual = useCallback(() => {
    setManualOpen(true);
  }, []);

  const closeManual = useCallback(() => {
    setManualOpen(false);
    showToast('Canvas changes saved to your draft.', 'success');
  }, []);

  const handleManualSave = useCallback(
    (layers: unknown) => {
      setManualLayers(layers);
      if (currentDraftId) {
        persistDraft({
          id: currentDraftId,
          name: currentDraftName,
          templateId: selected?.id || '',
          mode: 'manual',
          fields,
          layers,
          html: designHtml,
          metadata: { title: currentDraftName, pageSize },
          pageSize,
          updatedAt: Date.now(),
          createdAt: Date.now(),
        });
      }
    },
    [currentDraftId, currentDraftName, selected, fields, designHtml, pageSize, persistDraft]
  );

  const handleManualSnapshot = useCallback((dataUrl: string) => {
    setManualImage(dataUrl);
  }, []);

  // ─── Render the design to a PNG at its natural page size ─────────────────
  const renderDesignPng = useCallback(async (): Promise<string> => {
    if (mode === 'manual' && manualImage) return manualImage;
    const src = previewRef.current;
    if (!src) throw new Error('Design preview not ready');
    const { toPng } = await import('dom-to-image-more');
    const container = document.createElement('div');
    container.style.cssText = `position:fixed;left:-9999px;top:0;width:${pagePx.width}px;height:${pagePx.height}px;background:#ffffff;`;
    const clone = src.cloneNode(true) as HTMLElement;
    clone.style.margin = '0';
    container.appendChild(clone);
    document.body.appendChild(container);
    try {
      const dataUrl = await toPng(clone, {
        width: pagePx.width,
        height: pagePx.height,
        pixelRatio: 2,
        bgcolor: '#ffffff',
        cacheBust: true,
      });
      return dataUrl;
    } finally {
      document.body.removeChild(container);
    }
  }, [mode, manualImage, previewRef, pagePx]);

  // ─── Export: PDF / PNG / DOCX / .iucd ────────────────────────────────────
  const slugName = useMemo(
    () => (currentDraftName || 'design').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase(),
    [currentDraftName]
  );

  const exportPdf = useCallback(async () => {
    if (isExporting) return;
    setIsExporting('pdf');
    try {
      const dataUrl = await renderDesignPng();
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [pagePx.width, pagePx.height] });
      pdf.addImage(dataUrl, 'PNG', 0, 0, pagePx.width, pagePx.height);
      pdf.save(`${slugName}.pdf`);
      showToast('PDF exported', 'success');
    } catch (e) {
      showToast('PDF export failed', 'error');
    } finally {
      setIsExporting(null);
    }
  }, [isExporting, renderDesignPng, pagePx, slugName]);

  const exportPng = useCallback(async () => {
    if (isExporting) return;
    setIsExporting('png');
    try {
      const dataUrl = await renderDesignPng();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${slugName}.png`;
      a.click();
      showToast('PNG exported', 'success');
    } catch (e) {
      showToast('PNG export failed', 'error');
    } finally {
      setIsExporting(null);
    }
  }, [isExporting, renderDesignPng, slugName]);

  const exportDocx = useCallback(async () => {
    if (isExporting) return;
    setIsExporting('docx');
    try {
      const dataUrl = await renderDesignPng();
      const { Document, Packer, Paragraph, ImageRun, convertMillimetersToTwip } = await import('docx');
      const b64 = dataUrl.split(',')[1];
      const uint8 = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                size: { width: convertMillimetersToTwip(pagePx.width * 0.2646), height: convertMillimetersToTwip(pagePx.height * 0.2646) },
                margin: { top: 0, right: 0, bottom: 0, left: 0 },
              },
            },
            children: [
              new Paragraph({
                children: [
                  new ImageRun({ type: 'png', data: uint8, transformation: { width: pagePx.width, height: pagePx.height } }),
                ],
              }),
            ],
          },
        ],
      });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugName}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('DOCX exported', 'success');
    } catch (e) {
      showToast('DOCX export failed', 'error');
    } finally {
      setIsExporting(null);
    }
  }, [isExporting, renderDesignPng, pagePx, slugName]);

  const exportIucd = useCallback(async () => {
    if (isExporting || !currentDraftId) return;
    setIsExporting('iucd');
    try {
      const project: IucdProject = {
        version: '1.0',
        kind: 'creative-hub',
        id: currentDraftId,
        name: currentDraftName,
        templateId: selected?.id || '',
        mode: (mode as any) || 'form-fill',
        pageSize,
        fields,
        layers: manualLayers,
        html: designHtml,
        metadata: { title: currentDraftName },
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugName}.iucd`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('.iucd project exported', 'success');
    } catch (e) {
      showToast('.iucd export failed', 'error');
    } finally {
      setIsExporting(null);
    }
  }, [isExporting, currentDraftId, currentDraftName, selected, mode, pageSize, fields, manualLayers, designHtml, slugName]);

  // ─── Import .iucd project files ──────────────────────────────────────────
  const importIucd = useCallback(async (file: File) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as IucdProject;
      if (data.kind !== 'creative-hub') throw new Error('Not a Creative Hub project file');
      const id = newDraftId();
      const draft: CreativeHubDraft = {
        id,
        name: data.name || file.name.replace(/\.iucd$/i, ''),
        templateId: data.templateId || 'imported',
        mode: (data.mode as any) || 'form-fill',
        fields: data.fields || {},
        layers: data.layers || null,
        html: data.html || '',
        metadata: data.metadata || {},
        pageSize: data.pageSize || 'a4',
        updatedAt: Date.now(),
        createdAt: Date.now(),
      };
      if (!draft.html) {
        showToast('This .iucd file has no design content.', 'error');
        return;
      }
      await saveDraft(draft);
      setCurrentDraftId(id);
      setCurrentDraftName(draft.name);
      resumeDraft(draft);
      void listDraftMeta().then((d) => {
        if (mountedRef.current) setDrafts(d);
      });
      showToast('Project imported — adjust fields and export again.', 'success');
      setTab('drafts');
    } catch (e) {
      showToast('Invalid .iucd file', 'error');
    }
  }, [resumeDraft]);

  // ─── Delete a local draft ────────────────────────────────────────────────
  const removeDraft = useCallback(async (id: string) => {
    await deleteDraft(id);
    void listDraftMeta().then((d) => {
      if (mountedRef.current) setDrafts(d);
    });
    if (currentDraftId === id) {
      setSelected(null);
      setCurrentDraftId(null);
      setMode(null);
    }
    showToast('Draft deleted', 'info');
  }, [currentDraftId]);

  // ─── Publish to the community repo ───────────────────────────────────────
  const myDesignSn = useMemo(() => {
    const login = profile?.githubLogin || profile?.email?.split('@')[0] || '';
    const email = profile?.email || '';
    const mine = authors.find(
      (a: any) => (a.githubLogin && a.githubLogin === login) || (a.email && email && a.email.toLowerCase() === email.toLowerCase())
    );
    return (mine?.designCount || 0) + 1;
  }, [authors, profile]);

  const folderPreview = useMemo(() => {
    const fullName = publishMeta.name || profile?.name || 'student';
    const email = profile?.email || 'user@example.com';
    const uniId = profile?.universityId || '';
    const sn = myDesignSn;
    return buildCommunityFolder(fullName, email, uniId, sn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishMeta.name, profile, authors]);

  const publishToCommunity = useCallback(async () => {
    if (!selected || !designHtml) {
      showToast('Open a design first to publish.', 'error');
      return;
    }
    const missingFields = fieldTypes.filter((t) => !fields[t]?.trim());
    if (missingFields.length > 0) {
      showToast('Fill every field before publishing.', 'error');
      setMode('form-fill');
      return;
    }
    setIsPublishing(true);
    try {
      // Generate a webp thumbnail from the rendered A4 design.
      let thumbnailBase64 = '';
      try {
        const png = await renderDesignPng();
        const img = new Image();
        img.src = png;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(pagePx.width / 2);
        canvas.height = Math.round(pagePx.height / 2);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
          if (blob) {
            thumbnailBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          }
        }
      } catch {
        thumbnailBase64 = '';
      }

      const res = await fetch('/api/creative-hub/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: designHtml,
          fields,
          name: publishMeta.name || currentDraftName,
          subtitle: publishMeta.subtitle,
          description: publishMeta.description,
          language: publishMeta.language,
          categories: publishMeta.categories,
          pageSize,
          thumbnailBase64,
          authorName: profile?.name || '',
          authorEmail: profile?.email || '',
          universityId: profile?.universityId || '',
          githubLogin: profile?.githubLogin || '',
          designSn: myDesignSn,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Publish failed', 'error');
        return;
      }
      showToast(`Published! folder: ${data.folder}`, 'success');
      setPublishOpen(false);
      fetch('/api/creative-hub/community')
        .then((r) => r.json().catch(() => null))
        .then((d) => {
          if (d?.authors) setAuthors(d.authors);
          if (Array.isArray(d?.community)) setCommunity(d.community);
        })
        .catch(() => {});
    } catch (e) {
      showToast('Publish failed', 'error');
    } finally {
      setIsPublishing(false);
    }
  }, [selected, designHtml, fieldTypes, fields, renderDesignPng, pagePx, publishMeta, currentDraftName, pageSize, profile, myDesignSn]);

  // ─── The A4 preview renderer (scaled to fit, never re-wrapped) ───────────
  function FitScalePreview() {
    const boxRef = useRef<HTMLDivElement | null>(null);
    const [fit, setFit] = useState(0.5);
    useEffect(() => {
      const el = boxRef.current;
      if (!el) return;
      const recompute = () => {
        const availW = el.clientWidth - 24;
        const availH = el.clientHeight - 24;
        setFit(Math.min(availW / pagePx.width, availH / pagePx.height, 1));
      };
      recompute();
      const ro = new ResizeObserver(recompute);
      ro.observe(el);
      return () => ro.disconnect();
    }, [pagePx.width, pagePx.height]);

    return (
      <div ref={boxRef} className="relative h-full w-full overflow-hidden">
        <div
          className="absolute left-1/2 top-1/2"
          style={{ transform: `translate(-50%, -50%) scale(${fit})` }}
        >
          {mode === 'manual' && manualImage ? (
            <img
              src={manualImage}
              alt="Canvas preview"
              style={{ width: pagePx.width, height: pagePx.height }}
              className="rounded-sm shadow-xl"
            />
          ) : (
            <div
              ref={previewRef}
              dir={selected?.dir || 'ltr'}
              style={{
                width: pagePx.width,
                height: pagePx.height,
                background: '#ffffff',
                boxShadow: '0 10px 40px -12px rgba(0,0,0,.6)',
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-[80vh] bg-dark-bg p-4 text-dark-text"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = Array.from(e.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith('.iucd'));
        if (file) void importIucd(file);
        else if (e.dataTransfer.files.length > 0) showToast('Drop a .iucd file to import.', 'info');
      }}
    >
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">
            <i className="fas fa-palette mr-2 text-indigo-400"></i>Creative Hub
          </h2>
          <p className="text-[0.82rem] text-dark-text2">
            Thesis, assignment cover pages &amp; academic design hub
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => importRef.current?.click()}
            className="rounded-xl border border-dark-border bg-dark-bg2 px-3 py-2 text-[0.7rem] font-medium text-dark-text transition hover:border-indigo-500 hover:text-indigo-400"
          >
            <i className="fas fa-upload mr-1"></i>Import .iucd
          </button>
          <button
            onClick={onClose}
            className="rounded-xl border border-dark-border bg-dark-bg2 px-3 py-2 text-[0.7rem] font-medium text-dark-text transition hover:border-rose-500 hover:text-rose-400"
          >
            <i className="fas fa-times mr-1"></i>Close
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept=".iucd,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importIucd(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-2">
        {(
          [
            ['gallery', 'Templates', 'fa-th-large'],
            ['drafts', `My Drafts${drafts.length ? ` (${drafts.length})` : ''}`, 'fa-save'],
            ['community', 'Community', 'fa-globe'],
          ] as [EditorTab, string, string][]
        ).map(([id, label, icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded-xl px-4 py-2 text-[0.75rem] font-semibold transition ${
              tab === id ? 'bg-indigo-600 text-white' : 'border border-dark-border bg-dark-bg2 text-dark-text hover:text-indigo-400'
            }`}
          >
            <i className={`fas ${icon} mr-1.5`}></i>{label}
          </button>
        ))}
      </div>

      {/* ── Gallery tab ── */}
      {tab === 'gallery' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => (
            <div
              key={theme.id}
              onClick={() => selectTheme(theme)}
              className="group cursor-pointer overflow-hidden rounded-xl border border-dark-border bg-dark-bg2 transition hover:border-indigo-500"
            >
              <div className="relative h-56 overflow-hidden bg-dark-bg3">
                <img
                  src={theme.preview}
                  alt={theme.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition group-hover:scale-105"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = PREVIEW_RAW(theme.id);
                  }}
                />
                <div className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 text-[0.6rem] font-semibold text-white">
                  {PAGE_SIZES[theme.pageSize]?.label || 'A4'}
                </div>
                <div className="absolute right-2 top-2 rounded-lg bg-indigo-600/90 px-2 py-1 text-[0.6rem] font-semibold text-white">
                  {theme.categories.join(' / ') || 'Design'}
                </div>
              </div>
              <div className="p-3">
                <h4 className="text-[0.8rem] font-semibold">{theme.name}</h4>
                <p className="mt-1 line-clamp-2 text-[0.65rem] text-dark-text3">{theme.description}</p>
                <p className="mt-2 text-[0.6rem] text-indigo-400">
                  <i className="fas fa-edit mr-1"></i>
                  {theme.fields.length} editable field{theme.fields.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Drafts tab ── */}
      {tab === 'drafts' && (
        <div>
          {drafts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-dark-border bg-dark-bg2 p-10 text-center">
              <i className="fas fa-inbox mb-3 text-3xl text-dark-text3"></i>
              <p className="text-[0.8rem] text-dark-text2">No drafts yet. Pick a template from the gallery to start.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {drafts.map((d) => (
                <div key={d.id} className="rounded-xl border border-dark-border bg-dark-bg2 p-4 transition hover:border-indigo-500">
                  <div className="flex items-center justify-between">
                    <h4 className="truncate text-[0.78rem] font-semibold">{d.name}</h4>
                    <button
                      onClick={() => void removeDraft(d.id)}
                      className="text-dark-text3 transition hover:text-rose-400"
                      title="Delete draft"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                  <p className="mt-1 text-[0.6rem] text-dark-text3">
                    {d.mode === 'form-fill' ? 'Form Fill-up' : d.mode === 'auto-fill' ? 'Auto-Fill' : 'Manual'}
                    {' · '}
                    {PAGE_SIZES[d.pageSize]?.label || 'A4'}
                  </p>
                  <p className="mt-1 text-[0.58rem] text-dark-text3">
                    Edited {new Date(d.updatedAt).toLocaleString()}
                  </p>
                  <button
                    onClick={() => resumeDraft(d)}
                    className="mt-3 w-full rounded-lg bg-indigo-600 py-2 text-[0.7rem] font-semibold text-white transition hover:bg-indigo-500"
                  >
                    <i className="fas fa-play mr-1"></i>Resume
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Community tab ── */}
      {tab === 'community' && (
        <div>
          <div className="mb-4 flex items-center justify-between rounded-xl border border-dark-border bg-dark-bg2 px-4 py-3">
            <div>
              <p className="text-[0.72rem] text-dark-text2">Community designs</p>
              <p className="text-[0.62rem] text-dark-text3">Published from the Creative Hub into the themes repo.</p>
            </div>
            <button
              onClick={() => setPublishOpen(true)}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-[0.68rem] font-semibold text-white transition hover:bg-indigo-500"
            >
              <i className="fas fa-share mr-1"></i>Publish yours
            </button>
          </div>

          {communityLoading ? (
            <div className="py-10 text-center text-[0.72rem] text-dark-text3">
              <i className="fas fa-spinner fa-spin mr-2 text-indigo-400"></i>Loading community designs…
            </div>
          ) : community.length === 0 ? (
            <div className="rounded-xl border border-dashed border-dark-border bg-dark-bg2 p-10 text-center">
              <i className="fas fa-users mb-3 text-3xl text-dark-text3"></i>
              <p className="text-[0.8rem] text-dark-text2">No community designs yet — be the first to publish!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {community.map((d) => (
                <div
                  key={d.id}
                  onClick={() => {
                    showToast('Loading community design…', 'info');
                    fetch(d.html)
                      .then((r) => r.text())
                      .then((html) => {
                        if (!html) throw new Error('empty');
                        const types = extractFieldTypes(html);
                        const values: Record<string, string> = {};
                        types.forEach((t) => (values[t] = ''));
                        setSelected({ ...d, html });
                        setFieldTypes(types);
                        setFields(values);
                        setDesignHtml(html);
                        setManualLayers(null);
                        setManualImage('');
                        setMode('form-fill');
                        const id = newDraftId();
                        setCurrentDraftId(id);
                        setCurrentDraftName(d.name || 'Community Design');
                        void saveDraft({
                          id,
                          name: d.name || 'Community Design',
                          templateId: d.id,
                          mode: 'form-fill',
                          fields: values,
                          layers: null,
                          html,
                          metadata: { title: d.name, pageSize: d.pageSize },
                          pageSize: d.pageSize,
                          updatedAt: Date.now(),
                          createdAt: Date.now(),
                        });
                        void listDraftMeta().then((list) => {
                          if (mountedRef.current) setDrafts(list);
                        });
                        showToast('Design opened — fill in your details below.', 'success');
                      })
                      .catch(() => showToast('Could not load that design from the repo.', 'error'));
                  }}
                  className="group cursor-pointer overflow-hidden rounded-xl border border-dark-border bg-dark-bg2 transition hover:border-emerald-500"
                >
                  <div className="relative h-48 overflow-hidden bg-dark-bg3">
                    <img
                      src={d.preview}
                      alt={d.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                    {d.designSn && (
                      <div className="absolute right-2 top-2 rounded-lg bg-emerald-600/90 px-2 py-1 text-[0.6rem] font-semibold text-white">
                        Design #{d.designSn}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h4 className="text-[0.78rem] font-semibold">{d.name}</h4>
                    <p className="mt-1 line-clamp-2 text-[0.63rem] text-dark-text3">{d.description || d.subtitle}</p>
                    {d.author && (
                      <p className="mt-2 text-[0.6rem] text-emerald-400">
                        <i className="fas fa-palette mr-1"></i>{d.author}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {authors.length > 0 && (
            <div className="mt-6 rounded-xl border border-dark-border bg-dark-bg2 p-4">
              <h3 className="mb-3 text-[0.8rem] font-semibold">
                <i className="fas fa-trophy mr-1 text-emerald-400"></i>Design Contributors
              </h3>
              <div className="flex flex-wrap gap-2">
                {authors
                  .slice()
                  .sort((a, b) => (b.designCount || 0) - (a.designCount || 0))
                  .map((a: any) => (
                    <span key={a.email || a.githubLogin} className="rounded-full border border-emerald-700/40 bg-emerald-900/20 px-3 py-1 text-[0.62rem] text-emerald-300">
                      <i className="fas fa-palette mr-1"></i>
                      {a.name} · {a.designCount} design{a.designCount === 1 ? '' : 's'}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Editor panel (when a design is selected) ── */}
      {selected && (
        <div className="mt-6 rounded-2xl border border-indigo-500/60 bg-dark-bg2 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-[0.9rem] font-bold text-indigo-300">{currentDraftName}</h3>
              <p className="text-[0.65rem] text-dark-text3">
                {selected.source === 'community' ? 'Community design' : 'Default template'} · {PAGE_SIZES[pageSize]?.label || 'A4'} page
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMode('form-fill')}
                className={`rounded-lg px-3 py-1.5 text-[0.65rem] font-semibold transition ${mode === 'form-fill' ? 'bg-indigo-600 text-white' : 'border border-dark-border text-dark-text hover:text-indigo-400'}`}
              >
                Form Fill-up
              </button>
              <button
                onClick={() => setMode('auto-fill')}
                className={`rounded-lg px-3 py-1.5 text-[0.65rem] font-semibold transition ${mode === 'auto-fill' ? 'bg-indigo-600 text-white' : 'border border-dark-border text-dark-text hover:text-indigo-400'}`}
              >
                Auto-Fill
              </button>
              <button
                onClick={openManual}
                className={`rounded-lg px-3 py-1.5 text-[0.65rem] font-semibold transition ${mode === 'manual' ? 'bg-emerald-600 text-white' : 'border border-dark-border text-dark-text hover:text-emerald-400'}`}
              >
                <i className="fas fa-draw-polygon mr-1"></i>Manual Edit
              </button>
            </div>
          </div>

          {/* Live A4 preview */}
          <FitScalePreview />

          {/* Controls per mode */}
          <div className="mt-5">
            {mode === 'form-fill' && (
              <div>
                <h4 className="mb-3 text-[0.72rem] font-semibold text-indigo-300">
                  <i className="fas fa-pen mr-1"></i>Form Fill-up
                  <span className="ml-2 font-normal text-dark-text3">
                    Fields below update the preview live. Export keeps the A4 layout exactly as designed.
                  </span>
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {fieldTypes.map((type) => (
                    <div key={type}>
                      <label className="mb-1 block text-[0.6rem] text-dark-text2">{fieldLabel(type)}</label>
                      <input
                        type="text"
                        value={fields[type] || ''}
                        onChange={(e) => updateField(type, e.target.value)}
                        className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.75rem] text-dark-text outline-none transition focus:border-indigo-500"
                        placeholder={`Enter ${fieldLabel(type).toLowerCase()}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mode === 'auto-fill' && (
              <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/10 p-4">
                <h4 className="text-[0.75rem] font-semibold text-emerald-300">
                  <i className="fas fa-magic mr-1"></i>Auto-Fill from Dashboard Profile
                </h4>
                <p className="mt-1 text-[0.65rem] text-dark-text3">
                  Pulls your name, ID, department, session and email from the dashboard profile.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {fieldTypes.map((type) => {
                    const rule = AUTO_FILL_RULES.find((r) => r.type === type);
                    return (
                      <span key={type} className="rounded-full border border-dark-border bg-dark-bg px-3 py-1 text-[0.6rem] text-dark-text2">
                        <span className="mr-1 text-dark-text3">{fieldLabel(type)}:</span>
                        {rule ? (rule.get(profile as any) || '—') : 'manual input'}
                      </span>
                    );
                  })}
                </div>
                <button
                  onClick={applyAutoFill}
                  className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-[0.7rem] font-semibold text-white transition hover:bg-emerald-500"
                >
                  <i className="fas fa-bolt mr-1"></i>Apply &amp; Fill the Design
                </button>
              </div>
            )}

            {mode === 'manual' && (
              <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/10 p-4 text-center">
                <h4 className="text-[0.75rem] font-semibold text-emerald-300">
                  <i className="fas fa-draw-polygon mr-1"></i>Manual Editor (Canvas)
                </h4>
                <p className="mt-1 text-[0.65rem] text-dark-text3">
                  Opens a full-screen Canva-style editor (fabric.js). The navbar is hidden while editing; a Close button returns here. Add text, images, shapes and backgrounds freely — the canvas stays at A4 size so your export is always pixel-perfect.
                </p>
                <button
                  onClick={openManual}
                  className="mt-4 rounded-xl bg-emerald-600 px-6 py-2.5 text-[0.75rem] font-semibold text-white transition hover:bg-emerald-500"
                >
                  <i className="fas fa-expand mr-1"></i>Open Full Editor
                </button>
              </div>
            )}

            {/* Export + Publish bar */}
            <div className="mt-5 border-t border-dark-border pt-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => void exportPdf()}
                  disabled={!!isExporting}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-[0.7rem] font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                >
                  <i className="fas fa-file-pdf mr-1"></i>{isExporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
                </button>
                <button
                  onClick={() => void exportDocx()}
                  disabled={!!isExporting}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-[0.7rem] font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  <i className="fas fa-file-word mr-1"></i>{isExporting === 'docx' ? 'Exporting…' : 'Export DOCX'}
                </button>
                <button
                  onClick={() => void exportPng()}
                  disabled={!!isExporting}
                  className="rounded-xl border border-dark-border bg-dark-bg px-4 py-2 text-[0.7rem] font-semibold text-dark-text transition hover:text-indigo-400 disabled:opacity-50"
                >
                  <i className="fas fa-file-image mr-1"></i>{isExporting === 'png' ? 'Exporting…' : 'PNG'}
                </button>
                <button
                  onClick={() => void exportIucd()}
                  disabled={!!isExporting}
                  className="rounded-xl border border-dark-border bg-dark-bg px-4 py-2 text-[0.7rem] font-semibold text-dark-text transition hover:text-indigo-400 disabled:opacity-50"
                >
                  <i className="fas fa-file-code mr-1"></i>{isExporting === 'iucd' ? 'Exporting…' : '.iucd'}
                </button>
                <div className="mx-1 h-6 w-px bg-dark-border" />
                <button
                  onClick={() => setPublishOpen(true)}
                  disabled={isPublishing}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-[0.7rem] font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  <i className="fas fa-share-alt mr-1"></i>Publish to Community
                </button>
              </div>
              <p className="text-[0.58rem] text-dark-text3">
                PDF / DOCX / PNG are exported at the design page size (default A4 794×1123 px @ 96dpi) with no text re-wrapping.
                Publishing requires the design&apos;s data-field-type attributes — they power Form Fill-up for other users.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Publish modal */}
      {publishOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-dark-border bg-dark-bg2 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[0.95rem] font-bold text-indigo-300">
                <i className="fas fa-globe mr-1"></i>Publish to Community
              </h3>
              <button onClick={() => setPublishOpen(false)} className="text-dark-text3 transition hover:text-rose-400">
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[0.6rem] text-dark-text2">Design name *</label>
                <input
                  type="text"
                  value={publishMeta.name}
                  onChange={(e) => setPublishMeta((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Islamic Thesis Cover"
                  className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.75rem] text-dark-text outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[0.6rem] text-dark-text2">Language</label>
                  <select
                    value={publishMeta.language}
                    onChange={(e) => setPublishMeta((p) => ({ ...p, language: e.target.value }))}
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.75rem] text-dark-text outline-none focus:border-indigo-500"
                  >
                    {['english', 'arabic', 'bangla', 'turkish', 'urdu'].map((l) => (
                      <option key={l} value={l} className="capitalize">{l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[0.6rem] text-dark-text2">Category</label>
                  <div className="flex gap-2 pt-1">
                    {['thesis', 'assignment'].map((c) => (
                      <button
                        key={c}
                        onClick={() =>
                          setPublishMeta((p) => ({
                            ...p,
                            categories: p.categories.includes(c) ? p.categories.filter((x) => x !== c) : [...p.categories, c],
                          }))
                        }
                        className={`rounded-lg px-3 py-1.5 text-[0.65rem] font-semibold transition ${
                          publishMeta.categories.includes(c) ? 'bg-indigo-600 text-white' : 'border border-dark-border text-dark-text2'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[0.6rem] text-dark-text2">Subtitle (optional)</label>
                <input
                  type="text"
                  value={publishMeta.subtitle}
                  onChange={(e) => setPublishMeta((p) => ({ ...p, subtitle: e.target.value }))}
                  placeholder="Short tagline shown in the gallery"
                  className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.75rem] text-dark-text outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-[0.6rem] text-dark-text2">Description (optional)</label>
                <textarea
                  value={publishMeta.description}
                  onChange={(e) => setPublishMeta((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="What makes this design special?"
                  className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.75rem] text-dark-text outline-none focus:border-indigo-500"
                />
              </div>

              <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/10 p-3">
                <p className="text-[0.6rem] font-semibold text-emerald-300">Publish preview</p>
                <p className="mt-1 break-all text-[0.6rem] text-dark-text2">
                  <span className="text-dark-text3">Folder:</span> {folderPreview}
                </p>
                <p className="mt-1 text-[0.58rem] text-dark-text3">
                  Files: design.html + design.json + thumbnail.webp · authors.json design count: {myDesignSn}
                </p>
                {fieldTypes.length === 0 && (
                  <p className="mt-2 text-[0.62rem] text-rose-400">
                    <i className="fas fa-exclamation-triangle mr-1"></i>No data-field-type attributes found — publishing will be rejected.
                  </p>
                )}
              </div>

              <button
                onClick={() => void publishToCommunity()}
                disabled={isPublishing}
                className="w-full rounded-xl bg-indigo-600 py-3 text-[0.75rem] font-bold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {isPublishing ? (
                  <span><i className="fas fa-spinner fa-spin mr-2"></i>Publishing…</span>
                ) : (
                  <span><i className="fas fa-rocket mr-2"></i>Publish Design</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual canvas editor — full-screen overlay above the navbar (z-200),
          only a Close button to return to the drafted design. */}
      <CanvasEditor
        open={manualOpen}
        pageSize={pageSize}
        initialLayers={manualLayers || undefined}
        onClose={closeManual}
        onSave={handleManualSave}
        onSnapshot={handleManualSnapshot}
      />
    </div>
  );
}
