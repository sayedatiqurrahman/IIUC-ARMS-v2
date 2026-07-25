import { NextRequest } from 'next/server';
import { getInstallationAccessToken, getInstallationInfo } from '@/lib/github-app';

export async function GET(req: NextRequest) {
  const installationId = req.nextUrl.searchParams.get('installation_id');

  if (!installationId) {
    return new Response(
      `<script>
        if (window.opener) {
          window.opener.postMessage({ type: 'github-install-done', error: 'No installation ID' }, '*');
          window.close();
        } else {
          window.location.href = '/dashboard?error=no_installation';
        }
      </script>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  try {
    const token = await getInstallationAccessToken(Number(installationId));

    // Get account login from installation info (JWT-authenticated, not /user which fails for installation tokens)
    const info = await getInstallationInfo(Number(installationId));
    const githubLogin = info?.accountLogin || '';
    const avatarUrl = info?.avatarUrl || '';

    // Send token + installation_id + avatar to parent window via postMessage, then close popup
    return new Response(
      `<script>
        if (window.opener) {
          window.opener.postMessage({
            type: 'github-install-done',
            token: ${JSON.stringify(token)},
            login: ${JSON.stringify(githubLogin)},
            installationId: ${JSON.stringify(installationId)},
            avatarUrl: ${JSON.stringify(avatarUrl)}
          }, '*');
          window.close();
        } else {
          window.location.href = '/dashboard?gh_token=${encodeURIComponent(token)}&gh_login=${encodeURIComponent(githubLogin)}&gh_install=${encodeURIComponent(installationId)}';
        }
      </script>`,
      { headers: { 'Content-Type': 'text/html' } }
    );

  } catch {
    return new Response(
      `<script>
        if (window.opener) {
          window.opener.postMessage({ type: 'github-install-done', error: 'Installation failed' }, '*');
          window.close();
        } else {
          window.location.href = '/dashboard?error=installation_failed';
        }
      </script>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
