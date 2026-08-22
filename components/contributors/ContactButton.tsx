'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Image from 'next/image';

interface ContactButtonProps {
  c: any;
  size?: 'sm' | 'md';
}

interface Item {
  icon: string;
  href: string;
  label: string;
  value?: string;
  color?: string;
  bg?: string;
}

export default function ContactButton({ c, size = 'sm' }: ContactButtonProps) {
  const [open, setOpen] = useState(false);

  const contacts: Item[] = [];
  const socials: Item[] = [];

  const email = c.publicEmail || c.email;
  if (email && !c.hideEmail) {
    contacts.push({ icon: 'fas fa-envelope', href: `mailto:${email}`, label: 'Email', value: email, color: 'text-amber-400', bg: 'bg-amber-500/15' });
  }
  if (c.whatsapp && !c.hideWhatsapp) {
    contacts.push({ icon: 'fab fa-whatsapp', href: `https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`, label: 'WhatsApp', value: c.whatsapp, color: 'text-green-400', bg: 'bg-green-500/15' });
  }
  if (c.html_url) {
    socials.push({ icon: 'fab fa-github', href: c.html_url, label: 'GitHub', color: 'text-dark-text', bg: 'bg-dark-bg3' });
  }
  if (c.website && !c.hideWebsite) {
    socials.push({ icon: 'fas fa-globe', href: c.website, label: 'Website', color: 'text-cyan-400', bg: 'bg-cyan-500/15' });
  }
  if (c.linkedin && !c.hideLinkedin) {
    socials.push({ icon: 'fab fa-linkedin-in', href: c.linkedin, label: 'LinkedIn', color: 'text-blue-400', bg: 'bg-blue-500/15' });
  }
  if (c.facebook && !c.hideFacebook) {
    socials.push({ icon: 'fab fa-facebook-f', href: c.facebook, label: 'Facebook', color: 'text-blue-500', bg: 'bg-blue-500/15' });
  }
  if (c.twitter && !c.hideTwitter) {
    socials.push({ icon: 'fab fa-x-twitter', href: c.twitter, label: 'X / Twitter', color: 'text-dark-text2', bg: 'bg-dark-bg3' });
  }

  if (contacts.length === 0 && socials.length === 0) return null;

  const btnSize = size === 'sm' ? 'h-5 text-[0.5rem]' : 'h-6 text-[0.55rem]';

  return (
    <>
      <button
        className={`${btnSize} rounded bg-dark-bg3 flex items-center gap-1 px-1.5 text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all cursor-pointer border-none`}
        title="Contact & social"
        onClick={() => setOpen(true)}
      >
        <i className="fas fa-address-card"></i>
        <span className="font-semibold">Contacts</span>
      </button>

      {open && (
        <Modal isOpen onClose={() => setOpen(false)}>
          <div className="p-4">
            {/* Profile header */}
            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-dark-border">
              {c.avatar_url && <Image src={c.avatar_url} alt={c.login} width={40} height={40} className="w-10 h-10 rounded-full object-cover border-2 border-dark-border" />}
              <div className="min-w-0 flex-1">
                <div className="text-[0.85rem] font-bold text-dark-text truncate">{c.name || c.login}</div>
                <div className="text-[0.7rem] text-dark-text3">{c.title || c.departmentShortName || ''}</div>
              </div>
              <button
                className="w-7 h-7 rounded-lg bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all cursor-pointer border-none flex-shrink-0"
                title="Close"
                onClick={() => setOpen(false)}
              >
                <i className="fas fa-xmark text-[0.7rem]"></i>
              </button>
            </div>

            {/* Contact items */}
            {contacts.length > 0 && (
              <div className="space-y-1 mb-4">
                {contacts.map((item, i) => (
                  <a
                    key={i}
                    href={item.href}
                    target={item.href.startsWith('mailto:') ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-dark-bg3 transition-colors no-underline group/item"
                    onClick={() => setOpen(false)}
                  >
                    <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0 ${item.color}`}>
                      <i className={`${item.icon} text-[0.85rem]`}></i>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.65rem] text-dark-text3 font-medium">{item.label}</div>
                      {item.value && <div className="text-[0.8rem] text-dark-text font-medium truncate group-hover/item:text-qsis transition-colors">{item.value}</div>}
                    </div>
                    <i className="fas fa-arrow-right text-[0.6rem] text-dark-text3 opacity-0 group-hover/item:opacity-100 group-hover/item:text-qsis transition-opacity flex-shrink-0"></i>
                  </a>
                ))}
              </div>
            )}

            {/* Social icons */}
            {socials.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {socials.map((s, i) => (
                  <a
                    key={i}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.label}
                    className={`w-9 h-9 rounded-full ${s.bg} flex items-center justify-center ${s.color} hover:text-qsis hover:bg-qsis/10 transition-all no-underline`}
                    onClick={() => setOpen(false)}
                  >
                    <i className={`${s.icon} text-[0.9rem]`}></i>
                  </a>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
