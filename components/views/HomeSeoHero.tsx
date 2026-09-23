import Link from 'next/link';

/**
 * Static, server-rendered landing content for the homepage. Search engines see
 * this in the initial HTML (the interactive browse UI only mounts on the client),
 * so crawlers get real descriptive content instead of an empty <main>.
 */
export default function HomeSeoHero() {
  return (
    <main className="min-h-[80vh] max-w-6xl mx-auto px-4 py-10">
      <section className="rounded-3xl bg-gradient-to-br from-qsis/15 via-dark-bg2 to-accent/10 border border-dark-border p-6 sm:p-10 mb-8">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-qsis/15 text-qsis text-[0.7rem] font-bold uppercase tracking-wide mb-4">
          <i className="fas fa-graduation-cap"></i> IIUC Academic Platform
        </span>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-dark-text leading-tight mb-3">
          Academic Resource &amp; Research Management System
        </h1>
        <p className="text-dark-text2 text-[0.9rem] sm:text-[1rem] max-w-2xl leading-relaxed">
          One place for everything academic at the International Islamic University Chittagong (IIUC) — class
          routines, exam routines, notices, course materials, department clubs, and research resources — organized
          by faculty, department, and semester.
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SeoCard href="/notices" icon="fas fa-bullhorn" title="Notice Board" desc="Academic notices, calendar updates, exam schedules, and announcements." />
        <SeoCard href="/routine" icon="fas fa-calendar-alt" title="Routines" desc="Class routines, exam routines, and seat plans for every department." />
        <SeoCard href="/faculty" icon="fas fa-users" title="Faculty & Staff" desc="Faculty directory with designations and contact information." />
        <SeoCard href="/clubs" icon="fas fa-flag" title="Clubs" desc="Department clubs, events, and verified membership certificates." />
        <SeoCard href="/studio" icon="fas fa-palette" title="Studio" desc="Create designs, compress files, and use research tools for academic work." />
        <SeoCard href="/contributors" icon="fas fa-code-branch" title="Contributors" desc="The open-source developers and resource providers behind IIUC-ARMS." />
        <SeoCard href="/support" icon="fas fa-circle-question" title="Support" desc="Get help with routines, notices, uploads, and your IIUC-ARMS profile." />
      </div>
    </main>
  );
}

function SeoCard({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link href={href} className="block rounded-2xl bg-dark-bg2 border border-dark-border p-5 hover:border-qsis/40 hover:bg-dark-bg3 transition no-underline group">
      <i className={`${icon} text-qsis text-lg mb-2.5 block`}></i>
      <h2 className="text-[0.95rem] font-bold text-dark-text mb-1.5 group-hover:text-qsis transition">{title}</h2>
      <p className="text-[0.78rem] text-dark-text2 leading-relaxed">{desc}</p>
    </Link>
  );
}