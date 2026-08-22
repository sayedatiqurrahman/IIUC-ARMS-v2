'use client';

export default function SocialIcons({ c }: { c: any }) {
  const links: { icon: string; href?: string; label: string; color: string }[] = [];

  if (c.html_url) links.push({ icon: 'fab fa-github', href: c.html_url, label: `@${c.login}`, color: 'text-dark-text2 hover:text-dark-text' });
  if (c.website && !c.hideWebsite) links.push({ icon: 'fas fa-globe', href: c.website, label: 'Website', color: 'text-cyan-400 hover:text-cyan-300' });
  if (c.linkedin && !c.hideLinkedin) links.push({ icon: 'fab fa-linkedin-in', href: c.linkedin, label: 'LinkedIn', color: 'text-blue-400 hover:text-blue-300' });
  if (c.facebook && !c.hideFacebook) links.push({ icon: 'fab fa-facebook-f', href: c.facebook, label: 'Facebook', color: 'text-blue-500 hover:text-blue-400' });
  if (c.twitter && !c.hideTwitter) links.push({ icon: 'fab fa-x-twitter', href: c.twitter, label: 'X / Twitter', color: 'text-dark-text2 hover:text-dark-text' });

  if (links.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {links.map((l, i) => (
        l.href ? (
          <a
            key={i}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            title={l.label}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[0.55rem] transition-colors bg-dark-bg3 border border-dark-border hover:border-qsis/40 ${l.color}`}
          >
            <i className={l.icon}></i>
          </a>
        ) : null
      ))}
    </div>
  );
}
