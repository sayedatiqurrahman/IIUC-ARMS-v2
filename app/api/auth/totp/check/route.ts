import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { getTotpForEmail } from '@/lib/totp';

export async function GET(req: NextRequest) {
  try {
    const primaryEmail = await getUserEmail(req);

    // Raw email from the Firebase ID token (when provided) — the email the user
    // is ACTUALLY signing in with. This may be a linked (secondary) email that
    // has its own authenticator app.
    let rawEmail: string | null = null;
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { adminAuth } = await import('@/lib/firebase-admin');
        const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
        if (decoded.email) rawEmail = decoded.email.toLowerCase();
      } catch {
        // Invalid token — remaining checks fall back to session/primary.
      }
    }

    const method = req.nextUrl.searchParams.get('method') || 'email';
    const requested = req.nextUrl.searchParams.get('email')?.toLowerCase().trim() || null;
    // "exact=1" (used by the dashboard per-account view) asks for the selected
    // email's OWN config with NO fallback to the primary, so the dropdown always
    // reflects the account you picked. Without it (sign-in flow) the primary's
    // config is used as a fallback for linked accounts that have none.
    const exact = req.nextUrl.searchParams.get('exact') === '1';

    // Dashboard per-account view: a requested email is honoured only when it is
    // the session primary account or one of its linked emails.
    let requestedTarget: string | null = null;
    if (requested && primaryEmail && requested !== primaryEmail) {
      const { prisma } = await import('@/lib/prisma');
      const profile = await prisma.profile.findUnique({ where: { userId: primaryEmail } });
      const linked: string[] = (() => { try { return JSON.parse(profile?.linkedEmails as string || '[]'); } catch { return []; } })();
      if (linked.some((l) => l.toLowerCase() === requested)) requestedTarget = requested;
    } else if (requested && requested === primaryEmail) {
      requestedTarget = primaryEmail;
    }

    // Per-account TOTP: if the signing-in (or requested) email has its own
    // authenticator config, use it. In exact mode that's the end of it; in the
    // sign-in flow a linked email with no own config falls back to the primary.
    let targetEmail = requestedTarget || rawEmail || primaryEmail || '';
    let config = targetEmail ? await getTotpForEmail(targetEmail) : null;
    if (!exact && !config && primaryEmail && primaryEmail !== targetEmail) {
      targetEmail = primaryEmail;
      config = await getTotpForEmail(primaryEmail);
    }

    const totpEnabled = !!config?.enabled;
    const totpMethods = config?.methods || ['email'];

    let totpRequired = totpEnabled;
    if (totpEnabled && method) {
      totpRequired = totpMethods.includes(method);
    }

    return NextResponse.json({
      totpEnabled,
      totpRequired,
      totpMethods,
      targetEmail: targetEmail || null,
      totpSetupRequired: !!(config?.secret && !config?.enabled),
    });
  } catch (err: any) {
    console.error('[totp/check] error:', err?.message || err);
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 500 });
  }
}