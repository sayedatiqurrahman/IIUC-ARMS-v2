import Link from 'next/link';
import { redirect } from 'next/navigation';
import { fetchRegistryFromGitHub, mergeStudioApps, APP_ID_REGEX } from '@/lib/studio-apps';

// /studio/app/<id> — runs a contributed static app from GitHub inside an iframe.
// Built-in apps redirect to their own routes.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const community = await fetchRegistryFromGitHub();
  const app = mergeStudioApps(community).find((a) => a.id === id);
  return { title: app ? `${app.title} — Studio` : 'App — Studio' };
}

export default async function StudioAppHost({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const community = await fetchRegistryFromGitHub();
  const app = mergeStudioApps(community).find((a) => a.id === id);

  if (!app || !APP_ID_REGEX.test(id)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <div className="text-5xl mb-4 text-dark-text3"><i className="fas fa-shapes"></i></div>
        <h1 className="text-xl font-bold text-dark-text mb-2">App not found</h1>
        <p className="text-[0.8rem] text-dark-text2 mb-5 max-w-sm">
          This app doesn&apos;t exist (yet). If you just published it, it may still be syncing to GitHub — give it a minute.
        </p>
        <Link href="/studio" className="rounded-xl border border-dark-border bg-dark-bg2 px-4 py-2 text-[0.78rem] font-medium text-dark-text transition hover:border-qsis hover:text-qsis no-underline">
          <i className="fas fa-arrow-left mr-1"></i>Back to Studio
        </Link>
      </div>
    );
  }

  if (app.source === 'builtin' && app.path) {
    redirect(app.path);
  }

  const entry = app.entry || 'index.html';
  const src = `/api/studio-apps/serve/${id}/${entry}`;
  const author = app.author;

  return (
    <div className="min-h-[80vh] flex flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-12 w-12 shrink-0 rounded-2xl bg-indigo-500/15 flex items-center justify-center overflow-hidden">
            {app.iconSvg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={app.iconSvg} alt="" className="h-6 w-6 object-contain" />
            ) : (
              <span className="material-symbols-outlined text-indigo-400 text-2xl">{app.icon}</span>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-dark-text truncate">{app.title}</h1>
            <p className="text-[0.76rem] text-dark-text2 truncate">{app.subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {author && (
            <div className="flex items-center gap-2 rounded-full border border-dark-border bg-dark-bg2 pl-1 pr-3 py-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://github.com/${author.githubLogin}.png`}
                alt={author.githubLogin}
                className="h-6 w-6 rounded-full"
              />
              <span className="text-[0.72rem] text-dark-text2">
                by <span className="text-dark-text font-medium">{author.name}</span>
              </span>
            </div>
          )}
          <Link
            href="/studio"
            className="rounded-xl border border-dark-border bg-dark-bg2 px-3 py-2 text-[0.72rem] font-medium text-dark-text transition hover:border-qsis hover:text-qsis no-underline"
          >
            <i className="fas fa-arrow-left mr-1"></i>Studio
          </Link>
        </div>
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden border border-dark-border bg-white">
        <iframe src={src} title={app.title} className="h-[calc(100dvh-220px)] min-h-[480px] w-full" allow="clipboard-write; fullscreen" />
      </div>
      <p className="mt-2 text-[0.68rem] text-dark-text3">
        Community app · runs from GitHub, nothing leaves your browser.
      </p>
    </div>
  );
}
