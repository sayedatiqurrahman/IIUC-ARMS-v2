'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';

interface ContactButtonProps {
  c: any;
  size?: 'sm' | 'md';
}

export default function ContactButton({ c, size = 'sm' }: ContactButtonProps) {
  const [open, setOpen] = useState(false);

  const contacts: { icon: string; href?: string; label: string; text: string; color: string }[] = [];

  const email = c.publicEmail || c.email;
  if (email && !c.hideEmail) {
    contacts.push({ icon: 'fas fa-envelope', href: `mailto:${email}`, label: 'Email', text: email, color: 'text-amber-400' });
  }
  if (c.whatsapp && !c.hideWhatsapp) {
    contacts.push({ icon: 'fab fa-whatsapp', href: `https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`, label: 'WhatsApp', text: c.whatsapp, color: 'text-green-400' });
  }
  if (c.phone) {
    contacts.push({ icon: 'fas fa-phone', href: `tel:${c.phone}`, label: 'Phone', text: c.phone, color: 'text-blue-400' });
  }

  if (contacts.length === 0) return null;

  const btnSize = size === 'sm' ? 'w-5 h-5 text-[0.5rem]' : 'w-6 h-6 text-[0.55rem]';

  return (
    <>
      <button
        className={`${btnSize} rounded bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all cursor-pointer border-none`}
        title="Contact info"
        onClick={() => setOpen(true)}
      >
        <i className="fas fa-address-card"></i>
      </button>

      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title={`Contact ${c.name || c.login}`}>
          <div className="space-y-1">
            {contacts.map((ct, i) => (
              <a
                key={i}
                href={ct.href}
                target={ct.href?.startsWith('mailto:') || ct.href?.startsWith('tel:') ? undefined : '_blank'}
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-bg3 transition-colors no-underline group/item"
                onClick={() => setOpen(false)}
              >
                <div className={`w-8 h-8 rounded-lg bg-dark-bg3 flex items-center justify-center flex-shrink-0 ${ct.color}`}>
                  <i className={`${ct.icon} text-[0.85rem]`}></i>
                </div>
                <div className="min-w-0">
                  <div className="text-[0.65rem] text-dark-text3 font-medium">{ct.label}</div>
                  <div className="text-[0.8rem] text-dark-text truncate group-hover/item:text-qsis transition-colors">{ct.text}</div>
                </div>
                <i className="fas fa-external-link-alt text-[0.55rem] text-dark-text3 ml-auto opacity-0 group-hover/item:opacity-100 transition-opacity"></i>
              </a>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
