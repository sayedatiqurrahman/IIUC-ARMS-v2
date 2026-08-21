'use client';

import { useState } from 'react';

export default function ContactSection({ c, size = 'sm' }: { c: any; size?: 'sm' | 'md' }) {
  const [open, setOpen] = useState(false);
  const hasWhatsApp = c.whatsapp && !c.hideWhatsapp;
  const hasEmail = (c.publicEmail || c.email) && !c.hideEmail;
  const hasCompany = c.company && !c.hideCompany;
  const hasAny = hasWhatsApp || hasEmail || hasCompany;
  if (!hasAny) return null;

  const textSize = size === 'md' ? 'text-[0.7rem]' : 'text-[0.6rem]';
  const iconSize = size === 'md' ? 'text-[0.65rem]' : 'text-[0.55rem]';

  return (
    <div className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-dark-bg3 border border-dark-border hover:border-qsis/40 cursor-pointer transition-all ${textSize} text-dark-text3 hover:text-dark-text`}
        title="Contact info"
      >
        <i className={`fas fa-address-card ${iconSize}`}></i>
        <span className="hidden sm:inline">Contacts</span>
        {open ? <i className="fas fa-chevron-up text-[0.45rem]"></i> : <i className="fas fa-chevron-down text-[0.45rem]"></i>}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-[250] bg-neutral-900 border border-dark-border rounded-xl shadow-xl p-2.5 min-w-[180px]">
          {hasWhatsApp && (
            <a
              href={`https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-dark-bg3 transition-colors no-underline"
              onClick={(e) => e.stopPropagation()}
            >
              <i className={`fab fa-whatsapp text-green-400 ${iconSize}`}></i>
              <span className={`${textSize} text-dark-text2`}>{c.whatsapp}</span>
            </a>
          )}
          {hasEmail && (
            <a
              href={`mailto:${c.publicEmail || c.email}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-dark-bg3 transition-colors no-underline"
              onClick={(e) => e.stopPropagation()}
            >
              <i className={`fas fa-envelope text-amber-400 ${iconSize}`}></i>
              <span className={`${textSize} text-dark-text2`}>{c.publicEmail || c.email}</span>
            </a>
          )}
          {hasCompany && (
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
              <i className={`fas fa-briefcase text-purple-400 ${iconSize}`}></i>
              <span className={`${textSize} text-dark-text2`}>{c.company}</span>
              {c.companyUrl && (
                <a href={c.companyUrl} target="_blank" rel="noopener noreferrer" className={`${textSize} text-qsis hover:underline no-underline`}>↗</a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
