'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { showToast } from '@/lib/utils';
import { config } from '@/lib/config';
import type { HubTheme, IucdProject } from './creative-hub/types';
import {
  BUNDLED_THEMES,
  extractFieldTypes,
  fieldLabel,
  applyFieldValuesToString,
  AUTO_FILL_RULES,
  PAGE_SIZES,
  buildCommunityFolder,
  getDepartmentFieldOptions,
  templateMarkdownToHtml,
} from './creative-hub/templates';
import { generateManualDesignHtml, renderManualBackground } from './creative-hub/manual-publish';
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
//  • Clicking a theme opens a selection modal: Form Fill-up or Manual Edit.
//  • Form Fill-up opens a modal with a live A4 preview + a field form
//    (department renders as a real dropdown of all IIUC departments).
//  • Manual Edit opens the full-screen fabric.js canvas editor; text can be
//    assigned a form field (data-field-type) so the design becomes fill-up
//    ready when published. The flattened background + positioned fields are
//    uploaded to the themes repo together.
//  • Templates can also be published directly from HTML or Markdown
//    ({{field_type}} placeholders become data-field-type spans).
//  • Local drafts stay on-device in IndexedDB (no cloud DB).
//  • Export PDF / DOCX / PNG always at the selected page size (A4 default)
//    and .iucd project files that can be re-imported.
// ============================================================

const THEMES_RAW_BASE = config.creativeHubRaw();
const PREVIEW_RAW = (themeId: string) => config.creativeHubRaw(`themes/${themeId}/preview.svg`);

interface CreativeHubProps {
  onClose: () => void;
}

type EditorTab = 'gallery' | 'drafts' | 'community';
type DesignMode = 'form-fill' | 'auto-fill' | 'manual';

// Reduce a full <html> document (or fragment) to body inner HTML so it can be
// rendered inside a preview <div> and captured pixel-perfectly.
function htmlBodyInner(html: string): string {
  try {
    return new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  } catch {
    return html;
  }
}

// Render an arbitrary HTML string to a PNG at the given page size. The output
// is identical to what other users will see, so exports and thumbnails always
// match the final design.
async function captureHtml(html: string, w: number, h: number): Promise<string> {
  const { toPng } = await import('dom-to-image-more');
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px;background:#ffffff;z-index:-1000;pointer-events:none;`;
  container.innerHTML = htmlBodyInner(html);
  document.body.appendChild(container);
  try {
    const el = container.firstElementChild as HTMLElement;
    if (!el) throw new Error('empty design');
    return await toPng(el, { width: w, height: h, pixelRatio: 2, bgcolor: '#ffffff', cacheBust: true });
  } finally {
    document.body.removeChild(container);
  }
}

// Half-size webp thumbnail (base64) of a rendered PNG, for the repo.
async function pngToWebp(dataUrl: string, w: number, h: number): Promise<string> {
  try {
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w / 2);
    canvas.height = Math.round(h / 2);
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob) return '';
    const b64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return b64;
  } catch {
    return '';
  }
}

// A4-scaled preview wrapper: the design keeps its true page size and is only
// scaled with a CSS transform to fit its container (no text re-wrapping).
function ScaledA4({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(0.5);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const recompute = () => {
      const availW = el.clientWidth - 24;
      const availH = el.clientHeight - 24;
      setFit(Math.min(availW / width, availH / height, 1));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);
  return (
    <div ref={boxRef} className="relative h-full w-full overflow-hidden">
      <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%, -50%) scale(${fit})` }}>
        {children}
      </div>
    </div>
  );
}

function HtmlPreview({ html, width, height, className }: { html: string; width: number; height: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = htmlBodyInner(html);
  }, [html]);
  return (
    <div
      ref={ref}
      className={className}
      dir="ltr"
      style={{ width, height, background: '#ffffff', boxShadow: '0 10px 40px -12px rgba(0,0,0,.6)' }}
    />
  );
}

export default function CreativeHub({ onClose }: CreativeHubProps) {
  const profile = useAppStore((s) => s.profile);
  const profileLoaded = !!profile?.name || !!profile?.universityId;

  const [themes, setThemes] = useState<HubTheme[]>(BUNDLED_THEMES);
  const [community, setCommunity] = useState<HubTheme[]>([]);
  const [authors, setAuthors] = useState<any[]>([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const [tab, setTab] = useState<EditorTab>('gallery');

  // Active design project
  const [selected, setSelected] = useState<HubTheme | null>(null);
  const [mode, setMode] = useState<DesignMode>('form-fill');
  const [fieldTypes, setFieldTypes] = useState<string[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [designHtml, setDesignHtml] = useState('');
  const [manualLayers, setManualLayers] = useState<unknown>(null);
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({});
  const [manualImage, setManualImage] = useState('');
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [currentDraftName, setCurrentDraftName] = useState('Untitled Design');

  // Modal state
  const [selectionTheme, setSelectionTheme] = useState<HubTheme | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishSource, setPublishSource] = useState<'design' | 'template'>('design');
  const [templateText, setTemplateText] = useState('');
  const [templateIsMd, setTemplateIsMd] = useState(true);
  const [publishMeta, setPublishMeta] = useState({
    name: '',
    subtitle: '',
    description: '',
    language: 'english',
    categories: ['thesis'] as string[],
  });

  const [drafts, setDrafts] = useState<CreativeHubDraft[]>([]);
  const [isExporting, setIsExporting] = useState<'pdf' | 'docx' | 'png' | 'iucd' | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  const importRef = useRef<HTMLInputElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const pageSize = selected?.pageSize || 'a4';
  const pagePx = PAGE_SIZES[pageSize] || PAGE_SIZES.a4;
  const isManual = mode === 'manual';

  const refreshDrafts = useCallback(() => {
    void listDraftMeta().then((d) => {
      if (mountedRef.current) setDrafts(d);
    });
  }, []);

  // ─── Load local drafts + community data on mount ─────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    refreshDrafts();
    fetch('/api/creative-hub/community')
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (!mountedRef.current) return;
        if (Array.isArray(data?.authors)) setAuthors(data.authors);
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
  }, [refreshDrafts]);

  // Persist the last session so the user can resume next time.
  useEffect(() => {
    if (!currentDraftId) return;
    void saveSession({ draftId: currentDraftId, templateId: selected?.id || '', updatedAt: Date.now() });
  }, [currentDraftId, selected]);

  // ─── Draft persistence (debounced) ───────────────────────────────────────
  const buildDraft = useCallback(
    (overrides?: Partial<CreativeHubDraft>): CreativeHubDraft => ({
      id: currentDraftId || '',
      name: currentDraftName,
      templateId: selected?.id || 'imported',
      mode,
      fields,
      layers: manualLayers,
      fieldMappings: manualMappings,
      html: designHtml,
      metadata: { title: currentDraftName, pageSize },
      pageSize,
      updatedAt: Date.now(),
      createdAt: Date.now(),
      ...overrides,
    }),
    [currentDraftId, currentDraftName, selected, mode, fields, manualLayers, manualMappings, designHtml, pageSize]
  );

  const persistDraft = useCallback(
    (overrides?: Partial<CreativeHubDraft>) => {
      if (!currentDraftId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const draft = buildDraft(overrides);
      saveTimer.current = setTimeout(() => {
        void saveDraft(draft).then(refreshDrafts);
      }, 400);
    },
    [currentDraftId, buildDraft, refreshDrafts]
  );

  // ─── Start a new project from a theme (selection modal) ──────────────────
  const openFormFromTheme = useCallback(
    (theme: HubTheme) => {
      const types = extractFieldTypes(theme.html);
      const values: Record<string, string> = {};
      types.forEach((t) => (values[t] = ''));
      const id = newDraftId();
      setSelected(theme);
      setMode('form-fill');
      setFieldTypes(types);
      setFields(values);
      setDesignHtml(theme.html);
      setManualLayers(null);
      setManualMappings({});
      setManualImage('');
      setCurrentDraftId(id);
      setCurrentDraftName(theme.name);
      void saveDraft({
        id,
        name: theme.name,
        templateId: theme.id,
        mode: 'form-fill',
        fields: values,
        layers: null,
        fieldMappings: {},
        html: theme.html,
        metadata: { title: theme.name, pageSize: theme.pageSize },
        pageSize: theme.pageSize,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      }).then(refreshDrafts);
      setSelectionTheme(null);
      setFormOpen(true);
    },
    [refreshDrafts]
  );

  const openManualFromTheme = useCallback(
    async (theme: HubTheme) => {
      const types = extractFieldTypes(theme.html);
      const values: Record<string, string> = {};
      types.forEach((t) => (values[t] = ''));
      const id = newDraftId();
      setSelected(theme);
      setMode('manual');
      setFieldTypes(types);
      setFields(values);
      setDesignHtml(theme.html);
      setManualLayers(null);
      setManualMappings({});
      setManualImage('');
      setCurrentDraftId(id);
      setCurrentDraftName(theme.name);
      void saveDraft({
        id,
        name: theme.name,
        templateId: theme.id,
        mode: 'manual',
        fields: values,
        layers: null,
        fieldMappings: {},
        html: theme.html,
        metadata: { title: theme.name, pageSize: theme.pageSize },
        pageSize: theme.pageSize,
        updatedAt: Date.now(),
        createdAt: Date.now(),
      }).then(refreshDrafts);
      setSelectionTheme(null);
      setFormOpen(false);
      try {
        const bg = await captureHtml(applyFieldValuesToString(theme.html, values), pagePx.width, pagePx.height);
        setManualImage(bg);
      } catch {
        // blank canvas fallback
      }
      setManualOpen(true);
    },
    [refreshDrafts, pagePx]
  );

  const resumeDraft = useCallback(
    (draft: CreativeHubDraft) => {
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
      const m: DesignMode = (draft.mode as DesignMode) || 'form-fill';
      setSelected(theme);
      setMode(m);
      setFieldTypes(types);
      setFields(values);
      setDesignHtml(draft.html);
      setManualLayers(draft.layers || null);
      setManualMappings(draft.fieldMappings || {});
      setManualImage('');
      setCurrentDraftId(draft.id);
      setCurrentDraftName(draft.name || 'Imported Design');
      setFormOpen(m !== 'manual');
    },
    []
  );

  const updateField = useCallback(
    (type: string, value: string) => {
      setFields((prev) => {
        const next = { ...prev, [type]: value };
        persistDraft({ fields: next });
        return next;
      });
    },
    [persistDraft]
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
    if (Object.keys(filled).length === 0) {
      showToast('No matching profile data found for this design.', 'info');
      return;
    }
    setFields((prev) => {
      const next = { ...prev, ...filled };
      persistDraft({ fields: next, mode: 'form-fill' });
      return next;
    });
    setMode('form-fill');
    showToast('This data is pulled from your dashboard profile.', 'success');
  }, [profileLoaded, fieldTypes, profile, persistDraft]);

  // ─── Manual editor callbacks ─────────────────────────────────────────────
  const openManual = useCallback(async () => {
    setFormOpen(false);
    if (manualLayers) {
      setMode('manual');
      setManualOpen(true);
      return;
    }
    if (!manualImage && designHtml) {
      try {
        const bg = await captureHtml(applyFieldValuesToString(designHtml, fields), pagePx.width, pagePx.height);
        setManualImage(bg);
      } catch {
        // blank canvas fallback
      }
    }
    setMode('manual');
    setManualOpen(true);
  }, [manualLayers, manualImage, designHtml, fields, pagePx]);

  const closeManual = useCallback(() => {
    setManualOpen(false);
    showToast('Canvas changes saved to your draft.', 'success');
  }, []);

  const handleManualSave = useCallback(
    (payload: { layers: unknown; fieldMappings: Record<string, string> }) => {
      setManualLayers(payload.layers);
      setManualMappings(payload.fieldMappings);
      persistDraft({ mode: 'manual', layers: payload.layers, fieldMappings: payload.fieldMappings });
    },
    [persistDraft]
  );

  const handleManualSnapshot = useCallback((dataUrl: string) => {
    setManualImage(dataUrl);
  }, []);

  // ─── Render the design to a PNG at its natural page size ─────────────────
  const designPng = useCallback(async (): Promise<string> => {
    if (isManual) {
      if (manualImage) return manualImage;
      throw new Error('Canvas preview not ready');
    }
    return captureHtml(applyFieldValuesToString(designHtml, fields), pagePx.width, pagePx.height);
  }, [isManual, manualImage, designHtml, fields, pagePx]);

  // ─── Export: PDF / PNG / DOCX / .iucd ────────────────────────────────────
  const slugName = useMemo(
    () => (currentDraftName || 'design').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase(),
    [currentDraftName]
  );

  const exportPdf = useCallback(async () => {
    if (isExporting) return;
    setIsExporting('pdf');
    try {
      const dataUrl = await designPng();
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
  }, [isExporting, designPng, pagePx, slugName]);

  const exportPng = useCallback(async () => {
    if (isExporting) return;
    setIsExporting('png');
    try {
      const dataUrl = await designPng();
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
  }, [isExporting, designPng, slugName]);

  const exportDocx = useCallback(async () => {
    if (isExporting) return;
    setIsExporting('docx');
    try {
      const dataUrl = await designPng();
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
  }, [isExporting, designPng, pagePx, slugName]);

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
        mode: isManual ? 'manual' : 'form-fill',
        pageSize,
        fields,
        layers: manualLayers,
        fieldMappings: manualMappings,
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
  }, [isExporting, currentDraftId, currentDraftName, selected, isManual, pageSize, fields, manualLayers, manualMappings, designHtml, slugName]);

  // ─── Import .iucd project files ──────────────────────────────────────────
  const importIucd = useCallback(
    async (file: File) => {
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
          fieldMappings: data.fieldMappings || {},
          html: data.html || '',
          metadata: data.metadata || {},
          pageSize: data.pageSize || 'a4',
          updatedAt: Date.now(),
          createdAt: Date.now(),
        };
        if (!draft.html && !draft.layers) {
          showToast('This .iucd file has no design content.', 'error');
          return;
        }
        await saveDraft(draft);
        setCurrentDraftId(id);
        setCurrentDraftName(draft.name);
        resumeDraft(draft);
        refreshDrafts();
        showToast('Project imported — adjust fields and export again.', 'success');
        setTab('drafts');
      } catch (e) {
        showToast('Invalid .iucd file', 'error');
      }
    },
    [resumeDraft, refreshDrafts]
  );

  // ─── Delete a local draft ────────────────────────────────────────────────
  const removeDraft = useCallback(
    async (id: string) => {
      await deleteDraft(id);
      refreshDrafts();
      if (currentDraftId === id) {
        setSelected(null);
        setCurrentDraftId(null);
        setMode('form-fill');
        setFormOpen(false);
        setManualOpen(false);
      }
      showToast('Draft deleted', 'info');
    },
    [currentDraftId, refreshDrafts]
  );

  // ─── Publish to the community repo ───────────────────────────────────────
  const myDesignSn = useMemo(() => {
    const login = profile?.githubLogin || profile?.email?.split('@')[0] || '';
    const email = profile?.email || '';
    const list = Array.isArray(authors) ? authors : [];
    const mine = list.find(
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

  const templatePreviewHtml = useMemo(() => {
    if (!templateText.trim()) return '';
    try {
      return templateIsMd ? templateMarkdownToHtml(templateText, pageSize) : templateText;
    } catch {
      return '';
    }
  }, [templateText, templateIsMd, pageSize]);

  const publishToCommunity = useCallback(async () => {
    if (!selected && publishSource !== 'template') {
      showToast('Open a design first to publish.', 'error');
      return;
    }
    setIsPublishing(true);
    try {
      const w = pagePx.width;
      const h = pagePx.height;
      let finalHtml = '';
      let thumbnailDataUrl = '';
      const assets: { path: string; content: string }[] = [];

      if (publishSource === 'template') {
        const text = templateText.trim();
        if (!text) {
          showToast('Paste your template HTML or Markdown first.', 'error');
          return;
        }
        finalHtml = templateIsMd ? templateMarkdownToHtml(text, pageSize) : text;
        const fts = extractFieldTypes(finalHtml);
        if (fts.length === 0) {
          showToast('Add at least one data-field-type attribute or {{field}} placeholder.', 'error');
          return;
        }
        thumbnailDataUrl = await captureHtml(finalHtml, w, h);
      } else if (isManual) {
        const mapCount = Object.keys(manualMappings).length;
        if (mapCount === 0) {
          showToast('Assign at least one text to a form field before publishing.', 'error');
          return;
        }
        const bg = await renderManualBackground(manualLayers, w, h, manualMappings);
        // Absolute raw URL so the design.html renders correctly anywhere (the
        // community tab injects it via innerHTML, where ./assets/bg.png would
        // resolve against the app origin and 404).
        const bgUrl = `${THEMES_RAW_BASE}/community/${folderPreview}/assets/bg.png`;
        finalHtml = generateManualDesignHtml({
          layers: manualLayers as any,
          fieldMappings: manualMappings,
          width: w,
          height: h,
          backgroundRef: bgUrl,
        });
        assets.push({ path: 'assets/bg.png', content: bg.split(',')[1] || '' });
        thumbnailDataUrl = manualImage || (await captureHtml(finalHtml.replace(bgUrl, bg), w, h));
      } else {
        const missing = fieldTypes.filter((t) => !fields[t]?.trim());
        if (missing.length > 0) {
          showToast('Fill every field before publishing.', 'error');
          return;
        }
        finalHtml = applyFieldValuesToString(designHtml, fields);
        const fts = extractFieldTypes(finalHtml);
        if (fts.length === 0) {
          showToast('This design has no data-field-type attributes — publishing was rejected.', 'error');
          return;
        }
        thumbnailDataUrl = await captureHtml(finalHtml, w, h);
      }

      const thumbnailBase64 = await pngToWebp(thumbnailDataUrl, w, h);

      const res = await fetch('/api/creative-hub/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: finalHtml,
          fields,
          name: publishMeta.name || currentDraftName,
          subtitle: publishMeta.subtitle,
          description: publishMeta.description,
          language: publishMeta.language,
          categories: publishMeta.categories,
          pageSize,
          thumbnailBase64,
          assets,
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
          if (mountedRef.current) {
            if (Array.isArray(d?.authors)) setAuthors(d.authors);
            if (Array.isArray(d?.community)) setCommunity(d.community);
          }
        })
        .catch(() => {});
    } catch (e) {
      showToast('Publish failed', 'error');
    } finally {
      setIsPublishing(false);
    }
  }, [selected, publishSource, pagePx, templateText, templateIsMd, pageSize, isManual, manualMappings, manualLayers, manualImage, fieldTypes, fields, designHtml, publishMeta, currentDraftName, profile, myDesignSn, folderPreview]);

  const mappedFieldList = useMemo(() => {
    return Object.values(manualMappings).map((t) => ({ type: t, label: fieldLabel(t) }));
  }, [manualMappings]);

  const departmentOptions = useMemo(() => getDepartmentFieldOptions(), []);

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
          <h2 className="text-2xl font-bold">Creative Hub</h2>
          <p className="text-[0.82rem] text-dark-text2">Thesis, assignment cover pages &amp; academic design hub</p>
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

      {/* Current design dock */}
      {selected && currentDraftId && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-indigo-500/50 bg-dark-bg2 px-4 py-3">
          <div className="h-16 w-11 shrink-0 overflow-hidden rounded bg-dark-bg3 ring-1 ring-dark-border">
            {isManual && manualImage ? (
              <img src={manualImage} alt="Design" className="h-full w-full object-cover" />
            ) : (
              <img src={selected.preview || PREVIEW_RAW(selected.id)} alt="Design" className="h-full w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[0.82rem] font-bold text-indigo-300">{currentDraftName}</h3>
            <p className="text-[0.62rem] text-dark-text3">
              {isManual ? 'Manual design' : mode === 'auto-fill' ? 'Auto-filled form' : 'Form fill-up'} ·{' '}
              {PAGE_SIZES[pageSize]?.label || 'A4'} ·{' '}
              {selected.source === 'community' ? 'community design' : selected.name || 'imported'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isManual && (
              <button
                onClick={() => setFormOpen(true)}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-[0.68rem] font-semibold text-white transition hover:bg-indigo-500"
              >
                <i className="fas fa-pen mr-1"></i>Fill-up fields
              </button>
            )}
            <button
              onClick={() => void openManual()}
              className="rounded-lg border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-[0.68rem] font-semibold text-emerald-300 transition hover:bg-emerald-900/40"
            >
              <i className="fas fa-draw-polygon mr-1"></i>Manual edit
            </button>
            <button
              onClick={() => void exportPng()}
              disabled={!!isExporting}
              className="rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.68rem] font-semibold text-dark-text transition hover:text-indigo-400 disabled:opacity-50"
            >
              <i className="fas fa-file-image mr-1"></i>PNG
            </button>
            <button
              onClick={() => void exportPdf()}
              disabled={!!isExporting}
              className="rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.68rem] font-semibold text-dark-text transition hover:text-indigo-400 disabled:opacity-50"
            >
              <i className="fas fa-file-pdf mr-1"></i>PDF
            </button>
            <button
              onClick={() => void exportIucd()}
              disabled={!!isExporting}
              className="rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.68rem] font-semibold text-dark-text transition hover:text-indigo-400 disabled:opacity-50"
            >
              <i className="fas fa-file-code mr-1"></i>.iucd
            </button>
            <button
              onClick={() => setPublishOpen(true)}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-[0.68rem] font-semibold text-white transition hover:bg-indigo-500"
            >
              <i className="fas fa-share-alt mr-1"></i>Publish
            </button>
          </div>
        </div>
      )}

      {/* ── Gallery tab ── */}
      {tab === 'gallery' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((theme) => (
            <div
              key={theme.id}
              onClick={() => setSelectionTheme(theme)}
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
                  {theme.fields.length} editable field{theme.fields.length === 1 ? '' : 's'} · click to open
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
                        setManualMappings({});
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
                          fieldMappings: {},
                          html,
                          metadata: { title: d.name, pageSize: d.pageSize },
                          pageSize: d.pageSize,
                          updatedAt: Date.now(),
                          createdAt: Date.now(),
                        }).then(refreshDrafts);
                        setFormOpen(true);
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

      {/* ── Theme selection modal ── */}
      {selectionTheme && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-dark-border bg-dark-bg2">
            <div className="flex items-center justify-between border-b border-dark-border px-5 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-[0.95rem] font-bold text-indigo-300">{selectionTheme.name}</h3>
                <p className="truncate text-[0.65rem] text-dark-text3">{selectionTheme.description}</p>
              </div>
              <button onClick={() => setSelectionTheme(null)} className="text-dark-text3 transition hover:text-rose-400">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-5 md:grid-cols-[1fr_280px]">
              <div className="h-[420px] md:h-auto md:max-h-[560px]">
                <ScaledA4 width={pagePx.width} height={pagePx.height}>
                  <HtmlPreview html={applyFieldValuesToString(selectionTheme.html, {})} width={pagePx.width} height={pagePx.height} />
                </ScaledA4>
              </div>
              <div className="flex flex-col justify-center gap-3">
                <p className="text-[0.7rem] text-dark-text2">
                  <i className="fas fa-edit mr-1 text-indigo-400"></i>
                  {selectionTheme.fields.length} editable field{selectionTheme.fields.length === 1 ? '' : 's'} ·{' '}
                  {PAGE_SIZES[selectionTheme.pageSize]?.label || 'A4'}
                </p>
                <button
                  onClick={() => openFormFromTheme(selectionTheme)}
                  className="rounded-xl bg-indigo-600 py-3 text-[0.78rem] font-bold text-white transition hover:bg-indigo-500"
                >
                  <i className="fas fa-pen mr-2"></i>Form Fill-up
                </button>
                <button
                  onClick={() => void openManualFromTheme(selectionTheme)}
                  className="rounded-xl border border-emerald-700/50 bg-emerald-900/20 py-3 text-[0.78rem] font-bold text-emerald-300 transition hover:bg-emerald-900/40"
                >
                  <i className="fas fa-draw-polygon mr-2"></i>Manual Edit
                </button>
                <button
                  onClick={() => setSelectionTheme(null)}
                  className="rounded-xl border border-dark-border py-2.5 text-[0.72rem] font-semibold text-dark-text2 transition hover:text-rose-400"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Form fill-up modal ── */}
      {formOpen && selected && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-dark-border bg-dark-bg2">
            <div className="flex items-center justify-between border-b border-dark-border px-5 py-3">
              <div className="min-w-0">
                <h3 className="truncate text-[0.95rem] font-bold text-indigo-300">{currentDraftName}</h3>
                <p className="text-[0.62rem] text-dark-text3">Form Fill-up · fields update the preview live</p>
              </div>
              <button onClick={() => setFormOpen(false)} className="rounded-lg border border-dark-border px-3 py-1.5 text-[0.7rem] font-semibold text-dark-text2 transition hover:text-indigo-400">
                Done
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 md:grid-cols-2">
              <div className="h-[480px] md:h-auto">
                <ScaledA4 width={pagePx.width} height={pagePx.height}>
                  <HtmlPreview
                    html={applyFieldValuesToString(designHtml, fields)}
                    width={pagePx.width}
                    height={pagePx.height}
                  />
                </ScaledA4>
              </div>
              <div className="flex flex-col gap-3 overflow-y-auto">
                {profileLoaded && (
                  <button
                    onClick={applyAutoFill}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-[0.7rem] font-semibold text-white transition hover:bg-emerald-500"
                  >
                    <i className="fas fa-bolt mr-1"></i>Auto-fill from my dashboard profile
                  </button>
                )}
                {fieldTypes.map((type) => (
                  <div key={type}>
                    <label className="mb-1 block text-[0.6rem] text-dark-text2">{fieldLabel(type)}</label>
                    {type === 'department' ? (
                      <select
                        value={fields[type] || ''}
                        onChange={(e) => updateField(type, e.target.value)}
                        className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.75rem] text-dark-text outline-none transition focus:border-indigo-500"
                      >
                        <option value="">Select department…</option>
                        {departmentOptions.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={fields[type] || ''}
                        onChange={(e) => updateField(type, e.target.value)}
                        className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.75rem] text-dark-text outline-none transition focus:border-indigo-500"
                        placeholder={`Enter ${fieldLabel(type).toLowerCase()}`}
                      />
                    )}
                  </div>
                ))}
                <div className="mt-auto flex flex-wrap gap-2 border-t border-dark-border pt-3">
                  <button
                    onClick={() => void exportPdf()}
                    disabled={!!isExporting}
                    className="rounded-xl bg-rose-600 px-3 py-2 text-[0.68rem] font-semibold text-white transition hover:bg-rose-500 disabled:opacity-50"
                  >
                    <i className="fas fa-file-pdf mr-1"></i>{isExporting === 'pdf' ? '…' : 'PDF'}
                  </button>
                  <button
                    onClick={() => void exportDocx()}
                    disabled={!!isExporting}
                    className="rounded-xl bg-blue-600 px-3 py-2 text-[0.68rem] font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    <i className="fas fa-file-word mr-1"></i>{isExporting === 'docx' ? '…' : 'DOCX'}
                  </button>
                  <button
                    onClick={() => void exportPng()}
                    disabled={!!isExporting}
                    className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-[0.68rem] font-semibold text-dark-text transition hover:text-indigo-400 disabled:opacity-50"
                  >
                    <i className="fas fa-file-image mr-1"></i>PNG
                  </button>
                  <button
                    onClick={() => void exportIucd()}
                    disabled={!!isExporting}
                    className="rounded-xl border border-dark-border bg-dark-bg px-3 py-2 text-[0.68rem] font-semibold text-dark-text transition hover:text-indigo-400 disabled:opacity-50"
                  >
                    <i className="fas fa-file-code mr-1"></i>.iucd
                  </button>
                  <button
                    onClick={() => setPublishOpen(true)}
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-[0.68rem] font-semibold text-white transition hover:bg-indigo-500"
                  >
                    <i className="fas fa-share-alt mr-1"></i>Publish
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Publish modal ── */}
      {publishOpen && (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-dark-border bg-dark-bg2 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[0.95rem] font-bold text-indigo-300">
                <i className="fas fa-globe mr-1"></i>Publish to Community
              </h3>
              <button onClick={() => setPublishOpen(false)} className="text-dark-text3 transition hover:text-rose-400">
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Source selector */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => setPublishSource('design')}
                className={`rounded-xl px-4 py-3 text-[0.72rem] font-semibold transition ${
                  publishSource === 'design' ? 'bg-indigo-600 text-white' : 'border border-dark-border text-dark-text2 hover:text-indigo-400'
                }`}
              >
                <i className="fas fa-file-image mr-1"></i>This design
              </button>
              <button
                onClick={() => setPublishSource('template')}
                className={`rounded-xl px-4 py-3 text-[0.72rem] font-semibold transition ${
                  publishSource === 'template' ? 'bg-indigo-600 text-white' : 'border border-dark-border text-dark-text2 hover:text-indigo-400'
                }`}
              >
                <i className="fas fa-code mr-1"></i>New HTML / Markdown template
              </button>
            </div>

            {publishSource === 'design' ? (
              <div className="space-y-3">
                {isManual ? (
                  <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/10 p-3">
                    <p className="text-[0.62rem] font-semibold text-emerald-300">Assigned form fields</p>
                    {mappedFieldList.length === 0 ? (
                      <div className="mt-2">
                        <p className="text-[0.62rem] text-rose-400">
                          No text is mapped to a form field yet. Mapping turns your text into fill-up inputs for other users.
                        </p>
                        <button
                          onClick={() => {
                            setPublishOpen(false);
                            void openManual();
                          }}
                          className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-[0.65rem] font-semibold text-white transition hover:bg-emerald-500"
                        >
                          <i className="fas fa-draw-polygon mr-1"></i>Open editor to assign fields
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {mappedFieldList.map((f) => (
                          <span key={f.type} className="rounded-full border border-emerald-700/40 bg-emerald-900/30 px-2.5 py-1 text-[0.6rem] text-emerald-300">
                            <i className="fas fa-tag mr-1"></i>{f.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mt-2 text-[0.58rem] text-dark-text3">
                      The flattened background is uploaded as assets/bg.png and text fields are positioned exactly where they sit on the page.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-700/40 bg-emerald-900/10 p-3">
                    <p className="text-[0.62rem] font-semibold text-emerald-300">Design fields</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {fieldTypes.map((t) => (
                        <span key={t} className="rounded-full border border-emerald-700/40 bg-emerald-900/30 px-2.5 py-1 text-[0.6rem] text-emerald-300">
                          <i className="fas fa-tag mr-1"></i>{fieldLabel(t)}
                        </span>
                      ))}
                    </div>
                    {fieldTypes.length === 0 && (
                      <p className="mt-2 text-[0.62rem] text-rose-400">No data-field-type attributes found — publishing will be rejected.</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[0.6rem] text-dark-text2">Template format</label>
                  <select
                    value={templateIsMd ? 'md' : 'html'}
                    onChange={(e) => setTemplateIsMd(e.target.value === 'md')}
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 text-[0.75rem] text-dark-text outline-none focus:border-indigo-500"
                  >
                    <option value="md">Markdown — {'{{field_type}}'} placeholders</option>
                    <option value="html">HTML — data-field-type attributes</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[0.6rem] text-dark-text2">Template source *</label>
                  <textarea
                    value={templateText}
                    onChange={(e) => setTemplateText(e.target.value)}
                    rows={8}
                    placeholder={
                      templateIsMd
                        ? 'Thesis Title: {{thesis_title}}\nStudent: {{student_name}}\nDepartment: {{department}}\n\nYou can also use {{field_type:Custom Label}} to change the label shown.'
                        : '<div data-field-type="university_name">International Islamic University Chittagong</div>'
                    }
                    className="w-full rounded-lg border border-dark-border bg-dark-bg px-3 py-2 font-mono text-[0.7rem] text-dark-text outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="rounded-xl border border-dark-border bg-dark-bg p-3">
                  <p className="text-[0.6rem] font-semibold text-dark-text2">How the form connects</p>
                  <p className="mt-1 text-[0.58rem] text-dark-text3">
                    In HTML add <code className="text-emerald-300">data-field-type="student_name"</code> to an element; in
                    Markdown write <code className="text-emerald-300">{'{{student_name}}'}</code>. Each unique type becomes a
                    fill-up input for other users. The published page is wrapped in an A4 frame with the IIUC logo.
                  </p>
                </div>
                {templatePreviewHtml && (
                  <div className="h-64">
                    <p className="mb-1 text-[0.6rem] font-semibold text-dark-text2">Live preview</p>
                    <ScaledA4 width={pagePx.width} height={pagePx.height}>
                      <HtmlPreview html={templatePreviewHtml} width={pagePx.width} height={pagePx.height} />
                    </ScaledA4>
                  </div>
                )}
              </div>
            )}

            {/* Metadata */}
            <div className="mt-4 space-y-3">
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
                  Files: design.html + design.json + thumbnail.webp
                  {publishSource === 'design' && isManual ? ' + assets/bg.png' : ''} · design count: {myDesignSn}
                </p>
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
          only a Done button to return to the drafted design. */}
      <CanvasEditor
        open={manualOpen}
        pageSize={pageSize}
        initialLayers={manualLayers || undefined}
        backgroundImage={manualLayers ? undefined : manualImage || undefined}
        initialMappings={manualMappings}
        onClose={closeManual}
        onSave={handleManualSave}
        onSnapshot={handleManualSnapshot}
      />
    </div>
  );
}
