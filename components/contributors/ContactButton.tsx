'use client';

interface ContactButtonProps {
  c: any;
  size?: 'sm' | 'md';
}

export default function ContactButton({ c, size = 'sm' }: ContactButtonProps) {
  const contacts: { icon: string; href?: string; text: string; color: string }[] = [];

  const email = c.publicEmail || c.email;
  if (email && !c.hideEmail) {
    contacts.push({ icon: 'fas fa-envelope', href: `mailto:${email}`, text: email, color: 'text-amber-400' });
  }
  if (c.whatsapp && !c.hideWhatsapp) {
    contacts.push({ icon: 'fab fa-whatsapp', href: `https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}`, text: c.whatsapp, color: 'text-green-400' });
  }
  if (c.phone) {
    contacts.push({ icon: 'fas fa-phone', href: `tel:${c.phone}`, text: c.phone, color: 'text-blue-400' });
  }

  if (contacts.length === 0) return null;

  const btnSize = size === 'sm' ? 'w-5 h-5 text-[0.5rem]' : 'w-6 h-6 text-[0.55rem]';

  return (
    <div className="relative group/contact">
      <button
        className={`${btnSize} rounded bg-dark-bg3 flex items-center justify-center text-dark-text3 hover:text-qsis hover:bg-qsis/10 transition-all cursor-pointer border-none`}
        title="Contact info"
      >
        <i className="fas fa-address-card"></i>
      </button>
      <div className="pointer-events-none absolute bottom-full left-0 mb-2 z-50 w-56 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-left opacity-0 translate-y-1 transition-all duration-150 group-hover/contact:opacity-100 group-hover/contact:translate-y-0 shadow-xl">
        <span className="block text-[0.65rem] font-bold text-dark-text mb-1.5">
          <i className="fas fa-address-card mr-1 text-qsis"></i>Contact
        </span>
        {contacts.map((ct, i) => (
          <a
            key={i}
            href={ct.href}
            target={ct.href?.startsWith('mailto:') || ct.href?.startsWith('tel:') ? undefined : '_blank'}
            rel="noopener noreferrer"
            className="flex items-center gap-2 py-1 text-[0.62rem] text-dark-text2 hover:text-dark-text transition-colors no-underline"
          >
            <i className={`${ct.icon} ${ct.color} w-3 text-center`}></i>
            <span className="truncate">{ct.text}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
