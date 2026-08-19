import { NextRequest } from 'next/server';
import { getAppInfo } from '@/lib/github-app';

export async function GET(req: NextRequest) {
  try {
    // Always redirect to the GitHub App installation page so each user
    // installs the app on their own account. Never auto-return an existing
    // installation token — that would give every user the same token.
    const appInfo = await getAppInfo();
    if (!appInfo?.html_url) {
      return new Response('Could not get GitHub App info', { status: 500 });
    }
    const installUrl = `${appInfo.html_url}/installations/new`;
    return Response.redirect(installUrl);
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
}
