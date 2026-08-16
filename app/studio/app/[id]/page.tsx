import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { fetchRegistryFromGitHub, mergeStudioApps, APP_ID_REGEX } from '@/lib/studio-apps';
import AppChrome from '@/components/studio/AppChrome';

// /studio/app/<id> — info page for a contributed static app; the app itself
// runs from GitHub inside an iframe. Built-in apps redirect to their own routes.
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

  const session = await getServerSession(authOptions).catch(() => null);
  const sessionEmail = session?.user?.email || '';

  return <AppChrome app={app} sessionEmail={sessionEmail} />;
}
