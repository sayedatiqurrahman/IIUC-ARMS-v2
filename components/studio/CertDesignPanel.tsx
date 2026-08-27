'use client';

import { useState } from 'react';
import { CertTheme, DESIGN_DEFAULTS, resolveDesign } from '@/lib/cert-theme';

interface Props {
  theme: CertTheme;
  onChange: (theme: CertTheme) => void;
}

export default function CertDesignPanel({ theme, onChange }: Props) {
  const [open, setOpen] = useState(true);
  const design = resolveDesign(theme.design);

  const set = (patch: Record<string, any>) => {
    const d = resolveDesign(theme.design);
    for (const group of Object.keys(patch) as (keyof typeof d)[]) {
      d[group] = { ...(d[group] as any), ...(patch[group] as any) };
    }
    onChange({ ...theme, design: d });
  };

  const input = (label: string, value: string | number | undefined, onVal: (v: string) => void, placeholder?: string) => (
    <div className="flex flex-col gap-1">
      <label className="text-[0.65rem] text-dark-text2">{label}</label>
      <input type="text" value={value ?? ''} placeholder={placeholder}
        onChange={e => onVal(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg2 text-dark-text text-xs outline-none focus:border-qsis" />
    </div>
  );

  const toggle = (label: string, checked: boolean, onVal: (v: boolean) => void) => (
    <label className="flex items-center gap-2 text-xs text-dark-text2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onVal(e.target.checked)} className="accent-qsis" />
      {label}
    </label>
  );

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5">
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full">
        <h3 className="text-sm font-bold text-dark-text"><i className="fas fa-sliders-h text-qsis mr-2"></i>Design Customization</h3>
        <i className={`fas fa-chevron-${open ? 'up' : 'down'} text-dark-text2 text-xs`}></i>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {/* TEXT */}
          <section>
            <h4 className="text-xs font-semibold text-qsis uppercase tracking-wide mb-2">Text</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {input('Main Title', design.text.mainTitle, v => set({ text: { mainTitle: v } }), 'CERTIFICATE')}
              {input('Subtitle', design.text.subtitle, v => set({ text: { subtitle: v } }), 'OF APPRECIATION')}
              {input('Intro', design.text.intro, v => set({ text: { intro: v } }), 'This is to certify that')}
              {input('Closing', design.text.closing, v => set({ text: { closing: v } }), 'THANK YOU')}
              {input('Institution Name', design.text.institutionName, v => set({ text: { institutionName: v } }))}
              {input('Header Tagline', design.text.tagline, v => set({ text: { tagline: v } }))}
            </div>
          </section>

          {/* FONTS & SIZES */}
          <section>
            <h4 className="text-xs font-semibold text-qsis uppercase tracking-wide mb-2">Typography & Layout</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {input('Title Size', design.fonts.titleFontSize, v => set({ fonts: { titleFontSize: Number(v) || undefined } }))}
              {input('Subtitle Size', design.fonts.subtitleFontSize, v => set({ fonts: { subtitleFontSize: Number(v) || undefined } }))}
              {input('Subtitle Letter Spacing', design.fonts.titleLetterSpacing, v => set({ fonts: { titleLetterSpacing: Number(v) || undefined } }))}
              {input('Body Size', design.fonts.bodySize, v => set({ fonts: { bodySize: Number(v) || undefined } }))}
              {input('Recipient Name Size', design.fonts.nameSize, v => set({ fonts: { nameSize: Number(v) || undefined } }))}
              {input('Recipient Script Font', design.fonts.nameScriptFont, v => set({ fonts: { nameScriptFont: v } }), 'Great Vibes')}
            </div>
          </section>

          {/* TOGGLES */}
          <section>
            <h4 className="text-xs font-semibold text-qsis uppercase tracking-wide mb-2">Visibility</h4>
            <div className="flex flex-wrap gap-4">
              {toggle('Bismillah marker', design.bismillah.enabled !== false, v => set({ bismillah: { enabled: v } }))}
              {toggle('Signature line', design.signatureLine.enabled !== false, v => set({ signatureLine: { enabled: v } }))}
              {toggle('Verification QR', design.qr.enabled !== false, v => set({ qr: { enabled: v } }))}
            </div>
          </section>

          <div className="flex items-center gap-3 pt-1">
            <button onClick={() => onChange({ ...theme, design: DESIGN_DEFAULTS })}
              className="px-3 py-1.5 border border-dark-border text-dark-text2 rounded-lg text-xs font-semibold hover:border-qsis/50 transition">
              Reset to Defaults
            </button>
            <span className="text-[0.65rem] text-dark-text2">Changes apply instantly to previews and downloads.</span>
          </div>
        </div>
      )}
    </div>
  );
}
