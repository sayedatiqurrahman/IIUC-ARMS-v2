import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { getUserEmail } from '@/lib/get-user';
import { getRepoInstallation, getRepoBotToken } from '@/lib/github-app';

export const maxDuration = 60;

// Admin-only health check for the GitHub App bot-token chain. Returns booleans
// and status codes only — never the private key or any token.
export async function GET(req: NextRequest) {
  const email = await getUserEmail(req);
  if (!email || !config.ownerEmails.includes(email.toLowerCase())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const appIdConfigured = !!(process.env.GITHUB_APP_ID || process.env.GITHUB_ID);
  const privateKeyConfigured = !!process.env.GITHUB_PRIVATE_KEY;

  let installationForRepo = false;
  let botTokenMints = false;
  let botCanReadRepo = false;
  let botInstallationId: number | null = null;
  try {
    const instId = await getRepoInstallation(config.owner, config.repo);
    installationForRepo = !!instId;
    botInstallationId = instId;
  } catch {}
  try {
    const token = await getRepoBotToken(config.owner, config.repo);
    botTokenMints = !!token;
    if (token) {
      const res = await fetch(`https://api.github.com/repos/${config.owner}/${config.repo}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
      });
      botCanReadRepo = res.ok;
    }
  } catch {}

  return NextResponse.json({
    appIdConfigured,
    privateKeyConfigured,
    installationForRepo,
    botInstallationId,
    botTokenMints,
    botCanReadRepo,
    targetRepo: `${config.owner}/${config.repo}`,
    envTokenConfigured: !!process.env.GITHUB_TOKEN,
  });
}
