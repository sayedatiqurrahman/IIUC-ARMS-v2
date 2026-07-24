import { NextRequest } from 'next/server';
import { getAppInfo, getAppInstallations, getInstallationAccessToken, getInstallationInfo } from '@/lib/github-app';

export async function GET(req: NextRequest) {
  try {
    // Check if app is already installed — if so, get token directly
    const installations = await getAppInstallations();
    if (Array.isArray(installations) && installations.length > 0) {
      const installation = installations[0];
      const token = await getInstallationAccessToken(installation.id);

      // Get account login from installation info (JWT-authenticated, not /user which fails for installation tokens)
      const info = await getInstallationInfo(installation.id);
      const githubLogin = info?.accountLogin || '';
      const avatarUrl = info?.avatarUrl || '';

      // Send token + installation_id + avatar directly to parent window
      return new Response(
        `<script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'github-install-done',
              token: ${JSON.stringify(token)},
              login: ${JSON.stringify(githubLogin)},
              installationId: ${JSON.stringify(String(installation.id))},
              avatarUrl: ${JSON.stringify(avatarUrl)}
            }, '*');
            window.close();
          } else {
            window.location.href = '/dashboard?gh_token=${encodeURIComponent(token)}&gh_login=${encodeURIComponent(githubLogin)}&gh_install=${encodeURIComponent(String(installation.id))}';
          }
        </script>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // No installations — redirect to GitHub install page
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
