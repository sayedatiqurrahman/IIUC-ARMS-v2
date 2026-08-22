'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Image from 'next/image';

interface ContactButtonProps {
  c: any;
  size?: 'sm' | 'md';
}

export default function ContactButton({ c, size = 'sm' }: ContactButtonProps) {
  const [open, setOpen] = useState(false);

  const items: { icon: string; href?: string; label: string; text: string; color: string; bg: string }[] = [];

  const email = c.publicEmail || c.email;
  if (email && !c.hideEmail) {
    items.push({ icon: 'fas fa-envelope', href: `mailto:${email}`, label: 'Email', text: email, color: 'text-amber-400', bg: 'bg-amber-500/15' });
  }
  if (c.whatsapp && !c.hideWhatsapp) {
    items.push({ icon: 'fab fa-whatsapp', href: `https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`, label: 'WhatsApp', text: c.whatsapp, color: 'text-green-400', bg: 'bg-green-500/15' });
  }
  if (c.phone) {
    items.push({ icon: 'fas fa-phone', href: `tel:${c.phone}`, label: 'Phone', text: c.phone, color: 'text-blue-400', bg: 'bg-blue-500/15' });
  }
  if (c.html_url) {
    items.push({ icon: 'fab fa-github', href: c.html_url, label: 'GitHub', text: c.login, color: 'text-dark-text', bg: 'bg-dark-bg3' });
  }
  if (c.website && !c.hideWebsite) {
    items.push({ icon: 'fas fa-globe', href: c.website, label: 'Website', text: c.website.replace(/^https?:\/\//, ''), color: 'text-cyan-400', bg: 'bg-cyan-500/15' });
  }
  if (c.linkedin && !c.hideLinkedin) {
    items.push({ icon: 'fab fa-linkedin-in', href: c.linkedin, label: 'LinkedIn', text: c.linkedin, color: 'text-blue-400', bg: 'bg-blue-500/15' });
  }
  if (c.facebook && !c.hideFacebook) {
    items.push({ icon: 'fab fa-facebook-f', href: c.facebook, label: 'Facebook', text: c.facebook, color: 'text-blue-500', bg: 'bg-blue-500/15' });
  }
  if (c.twitter && !c.hideTwitter) {
    items.push({ icon: 'fab fa-x-twitter', href: c.twitter, label: 'X / Twitter', text: c.twitter, color: 'text-dark-text2', bg: 'bg-dark-bg3' });
  }

  if (items.length === 0) return null;

  const btnSize = size === 'sm' ? 'w-5 h-5 text-[0.5rem]' : 'w-6 h-6 text-[0.55rem]';

  return (
    <>
      <button
        className={`${btnSize} rounded bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all cursor-pointer border-none`}
        title="Contact & social"
        onClick={() => setOpen(true)}
      >
        <i className="fas fa-address-card"></i>
      </button>

      {open && (
        <Modal isOpen onClose={() => setOpen(false)}>
          <div className="p-4">
            {/* Profile header */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-dark-border">
              {c.avatar_url && <Image src={c.avatar_url} alt={c.login} width={40} height={40} className="w-10 h-10 rounded-full object-cover border-2 border-dark-border" />}
              <div className="min-w-0">
                <div className="text-[0.85rem] font-bold text-dark-text truncate">{c.name || c.login}</div>
                <div className="text-[0.7rem] text-dark-text3">{c.title || c.departmentShortName || ''}</div>
              </div>
            </div>

            {/* Contact items */}
            <div className="space-y-1">
              {items.map((item, i) => (
                <a
                  key={i}
                  href={item.href}
                  target={item.href?.startsWith('mailto:') || item.href?.startsWith('tel:') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-bg3 transition-colors no-underline group/item"
                  onClick={() => setOpen(false)}
                >
                  <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0 ${item.color}`}>
                    <i className={`${item.icon} text-[0.85rem]`}></i>
                  </div>
                  <div className="min-w-0">
                    <div className="text-[0.65rem] text-dark-text3 font-medium">{item.label}</div>
                    <div className="text-[0.8rem] text-dark-text truncate group-hover/item:text-qsis transition-colors">{item.text}</div>
                  </div>
                  <i className="fas fa-external-link-alt text-[0.55rem] text-dark-text3 ml-auto opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0"></i>
                </a>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
