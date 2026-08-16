import { NextResponse } from 'next/server';
import { fetchRegistryFromGitHub, mergeStudioApps } from '@/lib/studio-apps';

// GET /api/studio-apps/registry
// Merged list of built-in + community apps. Community apps are read live from
// the studio-apps.json in the IIUC-ARMS-v2 repo, so newly published apps appear
// without any deploy/rebuild.
export async function GET() {
  try {
    const community = await fetchRegistryFromGitHub();
    return NextResponse.json({
      apps: mergeStudioApps(community),
      fetchedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ apps: mergeStudioApps([]) });
  }
}
