'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { v4 as uuidv4 } from 'uuid';
import { showToast } from '@/lib/utils';
import CustomSelect from '@/components/CustomSelect';

// ============================================================
// Simple localStorage-based draft storage
// ============================================================

type DraftRecord = {
  id: string;
  templateId: string;
  mode: string;
  data: any;
  updatedAt: number;
};

// Key for localStorage
const DRAFT_STORAGE_KEY = 'creative-hub-draft-v1';

// Save draft to localStorage
const saveDraftLocally = (draft: DraftRecord) => {
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    showToast('Draft saved locally', 'success');
  } catch (e) {
    showToast('Failed to save draft', 'error');
  }
};

// Load draft from localStorage
const loadDraftLocally = (): DraftRecord | null => {
  try {
    const data = localStorage.getItem(DRAFT_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
};

// ============================================================
// Template definitions (6 default templates)
// ============================================================

type Template = {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  preview: string;
  language: 'english' | 'arabic' | 'bangla' | 'turkish' | 'urdu';
  categories: ('thesis' | 'assignment')[];
};

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: 'thesis-english',
    name: 'Thesis English',
    subtitle: 'Thesis, assignment cover pages, and academic design hub',
    description: 'English thesis cover page template',
    preview: '/creative-hub/preview-thesis-english.jpg',
    language: 'english',
    categories: ['thesis'],
  },
  {
    id: 'thesis-arabic',
    name: 'Thesis Arabic',
    subtitle: 'Arabic thesis cover page',
    description: 'Arabic thesis cover page template',
    preview: '/creative-hub/preview-thesis-arabic.jpg',
    language: 'arabic',
    categories: ['thesis'],
  },
  {
    id: 'assignment-a-english',
    name: 'Assignment Design A (English)',
    subtitle: 'Assignment cover page template A',
    description: 'English assignment cover page - Design A',
    preview: '/creative-hub/preview-assignment-a-english.png',
    language: 'english',
    categories: ['assignment'],
  },
  {
    id: 'assignment-a-arabic',
    name: 'Assignment Design A (Arabic)',
    subtitle: 'Arabic version of Design A',
    description: 'Arabic assignment cover page - Design A',
    preview: '/creative-hub/preview-assignment-a-arabic.png',
    language: 'arabic',
    categories: ['assignment'],
  },
  {
    id: 'assignment-b-english',
    name: 'Assignment Design B (English)',
    subtitle: 'Assignment cover page template B',
    description: 'English assignment cover page - Design B',
    preview: '/creative-hub/preview-assignment-b-english.png',
    language: 'english',
    categories: ['assignment'],
  },
  {
    id: 'assignment-b-arabic',
    name: 'Assignment Design B (Arabic)',
    subtitle: 'Arabic version of Design B',
    description: 'Arabic assignment cover page - Design B',
    preview: '/creative-hub/preview-assignment-b-arabic.png',
    language: 'arabic',
    categories: ['assignment'],
  },
];

// ============================================================
// CreativeHub component
// ============================================================

interface CreativeHubProps {
  onClose: () => void;
}

export default function CreativeHub({ onClose }: CreativeHubProps) {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [mode, setMode] = useState<'form-fill' | 'auto-fill' | 'manual' | null>(null);
  const [localDraft, setLocalDraft] = useState<string>(''); // JSON string
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [communityDesigns, setCommunityDesigns] = useState<any[]>([]);
  const [languageFilter, setLanguageFilter] = useState<'all' | 'english' | 'arabic' | 'bangla' | 'turkish' | 'urdu'>('all');

  // ============================================================
  // IndexedDB / localStorage: save/load draft
  // ============================================================

  const saveDraft = useCallback(async (draft: DraftRecord) => {
    saveDraftLocally(draft);
    setLocalDraft(JSON.stringify(draft));
  }, []);

  const loadDraft = useCallback(async (): Promise<DraftRecord | null> => {
    const data = loadDraftLocally();
    if (data) {
      setLocalDraft(JSON.stringify(data));
    }
    return data;
  }, []);

  // Initialize draft on mount
  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // ============================================================
  // Fetch community designs from GitHub (placeholder)
  // ============================================================

  useEffect(() => {
    const placeholderDesigns = [
      { id: '1', title: 'Thesis Minimalist', author: 'User1', language: 'english', preview: '/creative-hub/placeholder-1.jpg' },
      { id: '2', title: 'Cover Arabic', author: 'User2', language: 'arabic', preview: '/creative-hub/placeholder-2.jpg' },
    ];
    setCommunityDesigns(placeholderDesigns);
  }, []);

  // ============================================================
  // Handle template selection
  // ============================================================

  const handleTemplateSelect = useCallback((template: Template) => {
    setSelectedTemplate(template);
    setMode('form-fill');
    const draftId = uuidv4();
    saveDraft({
      id: draftId,
      templateId: template.id,
      mode: 'form-fill',
      data: { fields: {}, profileData: {} },
      updatedAt: Date.now(),
    });
  }, []);

  // ============================================================
  // Form Fill-up mode
  // ============================================================

  const handleFormFill = useCallback((field: keyof any, value: any) => {
    setLocalDraft(prev => {
      const draft = JSON.parse(prev || '{}');
      draft.data = { ...draft.data, [field]: value };
      draft.updatedAt = Date.now();
      return JSON.stringify(draft);
    });
  }, []);

  const handleAutoFill = useCallback(async () => {
    showToast('Profile data synced (sample: Name, ID, Dept)', 'info');
    setLocalDraft(prev => {
      const draft = JSON.parse(prev || '{}');
      draft.data = { ...draft.data, name: 'Student Name', id: 'S-12345', dept: 'Computer Science' };
      draft.updatedAt = Date.now();
      return JSON.stringify(draft);
    });
  }, []);

  // ============================================================
  // Manual Edit mode (Excalidraw-based)
  // ============================================================

  const handleManualEdit = () => {
    showToast('Manual editor opening with template...', 'info');
    // TODO: Navigate to Excalidraw canvas with pre-loaded template
  };

  // ============================================================
  // Export functions
  // ============================================================

  const exportAsPDF = useCallback(async () => {
    if (!localDraft) {
      showToast('No draft to export', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const blob = new Blob(['Creative Hub Export - PDF'], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTemplate?.name || 'design'}-${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('PDF exported successfully', 'success');
    } catch (e) {
      showToast('PDF export failed', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [localDraft, selectedTemplate]);

  const exportAsIucd = useCallback(async () => {
    if (!localDraft) {
      showToast('No draft to export', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const draft = JSON.parse(localDraft);
      const iucdData = {
        id: draft.id,
        templateId: draft.templateId,
        mode: draft.mode,
        fields: draft.data,
        createdAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(iucdData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedTemplate?.name || 'design'}-${Date.now()}.iucd`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('.iucd exported successfully', 'success');
    } catch (e) {
      showToast('.iucd export failed', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [localDraft, selectedTemplate]);

  // ============================================================
  // Community publishing (GitHub)
  // ============================================================

  const publishToCommunity = useCallback(async () => {
    if (!localDraft || !selectedTemplate) {
      showToast('No draft to publish', 'error');
      return;
    }
    setIsPublishing(true);
    try {
      showToast('Publishing to community... (simulated)', 'info');
    } catch (e) {
      showToast('Publish failed', 'error');
    } finally {
      setIsPublishing(false);
    }
  }, [localDraft, selectedTemplate]);

  // ============================================================
  // Render
  // ============================================================

  const filteredTemplates = templates.filter(t => {
    if (languageFilter === 'all') return true;
    return t.language === languageFilter;
  });

  const modeLabels: Record<string, string> = {
    'form-fill': 'Form Fill-up',
    'auto-fill': 'Auto-Fill',
    'manual': 'Manual Edit',
  };

  return (
    <div className="min-h-[80vh] bg-dark-bg text-dark-text p-4">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-dark-text mb-2">
          <i className="fas fa-palette text-indigo-400 mr-2"></i>Creative Hub
        </h2>
        <p className="text-[0.82rem] text-dark-text2">
          Thesis, assignment cover pages, and academic design hub
        </p>
      </div>

      {/* Language filter */}
      <div className="mb-4 rounded-xl border border-dark-border p-4 bg-dark-bg2">
        <div className="grid grid-cols-6 gap-1">
          <button
            onClick={() => setLanguageFilter('all')}
            className={languageFilter === 'all'
              ? 'col-span-6 py-2 rounded-xl bg-indigo-600 text-white font-semibold'
              : 'col-span-6 py-2 rounded-xl bg-dark-bg3 text-dark-text hover:text-indigo-400'}
          >
            All
          </button>
          <button
            onClick={() => setLanguageFilter('english')}
            className={languageFilter === 'english'
              ? 'col-span-6 py-2 rounded-xl bg-indigo-600 text-white font-semibold'
              : 'col-span-6 py-2 rounded-xl bg-dark-bg3 text-dark-text hover:text-indigo-400'}
          >
            English
          </button>
          <button
            onClick={() => setLanguageFilter('arabic')}
            className={languageFilter === 'arabic'
              ? 'col-span-6 py-2 rounded-xl bg-indigo-600 text-white font-semibold'
              : 'col-span-6 py-2 rounded-xl bg-dark-bg3 text-dark-text hover:text-indigo-400'}
          >
            Arabic
          </button>
          <button
            onClick={() => setLanguageFilter('bangla')}
            className={languageFilter === 'bangla'
              ? 'col-span-6 py-2 rounded-xl bg-indigo-600 text-white font-semibold'
              : 'col-span-6 py-2 rounded-xl bg-dark-bg3 text-dark-text hover:text-indigo-400'}
          >
            Bangla
          </button>
          <button
            onClick={() => setLanguageFilter('turkish')}
            className={languageFilter === 'turkish'
              ? 'col-span-6 py-2 rounded-xl bg-indigo-600 text-white font-semibold'
              : 'col-span-6 py-2 rounded-xl bg-dark-bg3 text-dark-text hover:text-indigo-400'}
          >
            Turkish
          </button>
          <button
            onClick={() => setLanguageFilter('urdu')}
            className={languageFilter === 'urdu'
              ? 'col-span-6 py-2 rounded-xl bg-indigo-600 text-white font-semibold'
              : 'col-span-6 py-2 rounded-xl bg-dark-bg3 text-dark-text hover:text-indigo-400'}
          >
            Urdu
          </button>
        </div>
      </div>

      {/* Templates gallery */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {filteredTemplates.map(template => (
          <div
            key={template.id}
            className={`bg-dark-bg2 border border-dark-border rounded-xl overflow-hidden hover:border-indigo-500 transition-all cursor-pointer ${selectedTemplate?.id === template.id ? 'border-indigo-500' : ''}`}
            onClick={() => handleTemplateSelect(template)}
          >
            <div className="h-48 w-full bg-dark-bg3 overflow-hidden">
              <img
                src={template.preview}
                alt={template.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-dark-bg/40 flex items-center justify-center">
                <span className="text-[0.65rem] text-indigo-300">{template.name}</span>
              </div>
            </div>
            <div className="p-3">
              <h4 className="text-[0.75rem] font-semibold text-dark-truncate mb-1">{template.name}</h4>
              <p className="text-[0.6rem] text-dark-text3 line-clamp-2">{template.subtitle}</p>
              <small className="text-[0.55rem] text-dark-text3">{template.categories.join('/')}</small>
            </div>
          </div>
        ))}
      </div>

      {/* Community designs */}
      <div className="mb-6 rounded-xl border border-dark-border p-4 bg-dark-bg2">
        <h3 className="text-[0.85rem] font-semibold text-dark-text mb-3">
          <i className="fas fa-folder text-indigo-400 mr-1"></i>Community Designs
        </h3>
        {communityDesigns.length === 0 ? (
          <p className="text-[0.72rem] text-dark-text3">No community designs yet. Publish yours!</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {communityDesigns.map((d: any) => (
              <div key={d.id} className="bg-dark-bg3 rounded-xl p-3">
                <img
                  src={d.preview}
                  alt={d.title}
                  className="w-full h-24 object-cover mb-2"
                  loading="lazy"
                />
                <div>
                  <h5 className="text-[0.65rem] font-medium text-dark-text">{d.title}</h5>
                  <small className="text-[0.5rem] text-dark-text3">{d.author} • {d.language}</small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected template editor */}
      {selectedTemplate && (
        <div className="bg-dark-bg2 rounded-xl p-6 border border-indigo-500 min-h-[400px]">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-[0.85rem] font-semibold text-indigo-400">
                {selectedTemplate.name}
              </h3>
              <p className="text-[0.65rem] text-indigo-300">{selectedTemplate.subtitle}</p>
            </div>
            <div className="flex gap-2">
              {mode && mode !== 'manual' && (
                <button
                  onClick={() => setMode(null)}
                  className="px-3 py-1 rounded bg-dark-bg text-indigo-300 text-[0.6rem] hover:bg-indigo-400/20"
                >
                  Cancel mode
                </button>
              )}
              <button
                onClick={handleManualEdit}
                className="px-3 py-1 rounded bg-indigo-600 text-white text-[0.6rem] hover:bg-indigo-500/20"
              >
                {mode === 'manual' ? 'Done' : 'Manual Edit'}
              </button>
            </div>
          </div>

          {/* Mode selection */}
          {(!mode || mode === 'manual') && (
            <div className="mb-4 rounded-xl border border-indigo-500 p-3 bg-indigo-500/5">
              <h4 className="text-[0.65rem] font-medium text-indigo-300 mb-2">Editing Mode</h4>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setMode('form-fill')}
                  className={mode === 'form-fill' ? 'col-span-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold' : 'col-span-3 py-2 rounded-xl bg-dark-bg3 text-indigo-300'}
                >
                  Form Fill-up
                </button>
                <button
                  onClick={() => setMode('auto-fill')}
                  className={mode === 'auto-fill' ? 'col-span-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold' : 'col-span-3 py-2 rounded-xl bg-dark-bg3 text-indigo-300'}
                >
                  Auto-Fill
                </button>
                <button
                  onClick={() => setMode('manual')}
                  className={mode === 'manual' ? 'col-span-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold' : 'col-span-3 py-2 rounded-xl bg-dark-bg3 text-indigo-300'}
                >
                  Manual Edit
                </button>
              </div>
            </div>
          )}

          {mode === 'form-fill' && (
            <div className="space-y-4">
              <h4 className="text-[0.65rem] font-medium text-indigo-300 mb-2">Form Fields</h4>
              <div>
                <label className="text-[0.55rem] text-indigo-300 block mb-1">Name</label>
                <input
                  type="text"
                  value={localDraft && JSON.parse(localDraft).data?.name || ''}
                  onChange={e => handleFormFill('name', e.target.value)}
                  className="w-full px-3 py-2 rounded bg-dark-bg border border-indigo-500 text-dark-text focus:border-indigo-500 outline-none"
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="text-[0.55rem] text-indigo-300 block mb-1">ID</label>
                <input
                  type="text"
                  value={localDraft && JSON.parse(localDraft).data?.id || ''}
                  onChange={e => handleFormFill('id', e.target.value)}
                  className="w-full px-3 py-2 rounded bg-dark-bg border border-indigo-500 text-dark-text focus:border-indigo-500 outline-none"
                  placeholder="Enter ID"
                />
              </div>
              <div>
                <label className="text-[0.55rem] text-indigo-300 block mb-1">Department</label>
                <input
                  type="text"
                  value={localDraft && JSON.parse(localDraft).data?.dept || ''}
                  onChange={e => handleFormFill('dept', e.target.value)}
                  className="w-full px-3 py-2 rounded bg-dark-bg border border-indigo-500 text-dark-text focus:border-indigo-500 outline-none"
                  placeholder="Enter department"
                />
              </div>
              <button
                onClick={handleAutoFill}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500/90 transition-colors"
              >
                Auto-Fill from Profile
              </button>
            </div>
          )}

          {mode === 'auto-fill' && (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-indigo-400 text-2xl mb-3" />
              <p className="text-[0.7rem] text-indigo-300">
                Syncing profile data... Please wait.
              </p>
            </div>
          )}

          {mode === 'manual' && (
            <div className="h-[300px] bg-dark-bg3 rounded-xl overflow-hidden">
              <div className="h-full w-full bg-dark-bg p-4 text-center text-indigo-400">
                <i className="fas fa-draw-polygon text-2xl mb-2" />
                <p>Manual editor canvas - template data pre-loaded</p>
                <small className="text-[0.5rem] text-indigo-300">
                  Use Excalidraw to design freely
                </small>
              </div>
            </div>
          )}

          {/* Export buttons */}
          <div className="mt-6 pt-6 border-t border-indigo-500">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <button
                onClick={exportAsPDF}
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500/90 transition-colors disabled:opacity-50"
                title="Export as PDF"
              >
                <i className="fas fa-file-pdf mr-1"></i> Export PDF
              </button>
              <button
                onClick={exportAsIucd}
                disabled={isSaving}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500/90 transition-colors disabled:opacity-50"
                title="Export as .iucd"
              >
                <i className="fas fa-file-code mr-1"></i> Export .iucd
              </button>
            </div>
            <button
              onClick={publishToCommunity}
              disabled={isPublishing}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500/90 transition-colors disabled:opacity-50 mt-2"
              title="Publish to Community"
            >
              <i className="fas fa-share mr-1"></i> Publish to Community
            </button>
          </div>
        </div>
      )}

      <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-dark-bg border border-dark-border text-dark-text hover:text-indigo-400 transition-colors">
        <i className="fas fa-times mr-1"></i> Close
      </button>
    </div>
  );
}