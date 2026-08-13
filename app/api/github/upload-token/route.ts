import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { getUserEmail } from '@/lib/get-user';
import { getRepoBotToken } from '@/lib/github-app';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { hasPermission } from '@/lib/permissions';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export const maxDuration = 60;

// Returns a browser-safe GitHub token for client-side (direct-to-GitHub) uploads.
//
// Security model:
//  - PATs and NextAuth session tokens are ALREADY delivered to the user's own
//    browser by /api/profile and the NextAuth session, so returning them here
//    does not widen exposure.
//  - The GitHub App installation token (ghs_) is freshly minted, repo-scoped and
//    expires in ~1 hour — safe to hand to the browser.
//  - The server-level GITHUB_TOKEN env secret NEVER leaves the server: when it is
//    the only usable token we return needsServer so the client falls back to the
//    server-side upload routes.
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.upload);
  if (!rl.success) return rl.response!;

  try {
    const email = await getUserEmail(req);
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized — please login', status: 401 }, { status: 401 });
    }

    const { prisma } = await import('@/lib/prisma');
    const profile = await prisma.profile.findUnique({ where: { userId: email } });

    if (profile?.isBanned) {
      return NextResponse.json({ error: 'Account banned — upload not allowed' }, { status: 403 });
    }

    const canUpload = await hasPermission('uploadFile', config.getEffectiveRole(email, profile?.role), false, email);
    const isOwner = config.ownerEmails.includes(email) || profile?.githubLogin === config.owner;
    const installationId = profile?.githubInstallationId ? Number(profile.githubInstallationId) : null;

    let storedPat = '';
    if (profile?.githubToken) {
      const decrypted = isEncrypted(profile.githubToken) ? decrypt(profile.githubToken) : profile.githubToken;
      if (decrypted.startsWith('ghp_') || decrypted.startsWith('github_pat_')) storedPat = decrypted;
    }

    // PAT pasted in the upload modal this session (used only when no stored PAT).
    const body = await req.json().catch(() => ({}));
    const bodyToken = typeof body.githubToken === 'string' && (body.githubToken.startsWith('ghp_') || body.githubToken.startsWith('github_pat_'))
      ? body.githubToken
      : '';

    // ── Resolve a browser-safe token (same priority as the server upload path) ──
    // Fully-automatic: prefer the GitHub App bot token (repo-scoped, 1h expiry,
    // safe to hand to the browser) and the server GITHUB_TOKEN so uploads commit
    // straight to main with no review. A user PAT/session token is only a
    // fallback (fork + PR for credit) when no server token exists.
    if (canUpload || installationId) {
      const botToken = await getRepoBotToken(config.owner, config.repo);
      if (botToken) {
        return NextResponse.json({ tokenKind: 'bot', token: botToken, isOwner: true, directCommit: true, credit: false });
      }
    }

    if (process.env.GITHUB_TOKEN) {
      // Env secret must stay server-side — signal the client to use the
      // server-side upload path instead.
      return NextResponse.json({ tokenKind: 'env', needsServer: true, isOwner, directCommit: true, credit: false });
    }

    if (storedPat || bodyToken) {
      const token = storedPat || bodyToken;
      return NextResponse.json({ tokenKind: 'pat', token, isOwner, directCommit: isOwner, credit: !isOwner });
    }

    try {
      const session = await getServerSession(authOptions);
      if (session?.accessToken) {
        return NextResponse.json({
          tokenKind: 'session',
          token: session.accessToken,
          isOwner,
          directCommit: isOwner,
          credit: !isOwner,
        });
      }
    } catch {}

    return NextResponse.json(
      { error: 'GitHub not connected. Connect with GitHub or ask admin for upload access.', code: 'AUTH_REQUIRED' },
      { status: 401 }
    );
  } catch (e: any) {
    console.error('[upload-token] error:', e?.message || e);
    return NextResponse.json({ error: 'Failed to prepare upload' }, { status: 500 });
  }
}
