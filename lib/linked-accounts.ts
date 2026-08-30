/* ─── Linked (secondary) email accounts ───

A profile can link personal/secondary email addresses. Signing in with any
linked email resolves to the same primary account, so students can keep using
the platform after their university email expires. */

const LINK_CACHE_TTL = 60_000;
const linkCache = new Map<string, { primary: string | null; ts: number }>();

const IIUC_EMAIL_RE = /@(?:ugrad\.)?iiuc\.ac\.bd$/i;

export function isIiucEmail(email: string): boolean {
  return IIUC_EMAIL_RE.test((email || '').toLowerCase().trim());
}

/**
 * If `email` is registered as a linked (secondary) email of a profile,
 * returns that profile's primary userId. Otherwise returns null.
 */
export async function resolveLinkedEmail(email: string): Promise<string | null> {
  const lower = (email || '').toLowerCase().trim();
  if (!lower) return null;
  // Only positive lookups are cached. Negative results are NOT cached: an email
  // that had no link a moment ago may have been linked since (admin "Link
  // Email" / dashboard linking), and caching null made the login gate wrongly
  // treat freshly-linked accounts as non-linked for up to 60s.
  const cached = linkCache.get(lower);
  if (cached && cached.primary && Date.now() - cached.ts < LINK_CACHE_TTL) return cached.primary;

  let primary: string | null = null;
  try {
    const { prisma } = await import('@/lib/prisma');
    const profiles = await prisma.profile.findMany({
      where: { NOT: [{ linkedEmails: '[]' }, { linkedEmails: null }] },
      select: { userId: true, linkedEmails: true },
    });
    for (const p of profiles) {
      let arr: string[] = [];
      try { arr = JSON.parse((p.linkedEmails as string) || '[]'); } catch { arr = []; }
      if (arr.some(e => (e || '').toLowerCase() === lower)) { primary = p.userId; break; }
    }
  } catch {}
  if (primary) linkCache.set(lower, { primary, ts: Date.now() });
  return primary;
}

/** Returns the email the user should be treated as (primary, or the input itself). */
export async function resolveSignInEmail(email: string): Promise<string> {
  const primary = await resolveLinkedEmail(email);
  return primary || email;
}

/** True if `email` is already used as a linked email of a profile other than `excludeUserId`. */
export async function isLinkedElsewhere(email: string, excludeUserId: string): Promise<boolean> {
  const lower = (email || '').toLowerCase().trim();
  if (!lower) return false;
  try {
    const { prisma } = await import('@/lib/prisma');
    const profiles = await prisma.profile.findMany({
      where: {
        NOT: [{ userId: excludeUserId }, { linkedEmails: '[]' }, { linkedEmails: null }],
      },
      select: { linkedEmails: true },
    });
    for (const p of profiles) {
      let arr: string[] = [];
      try { arr = JSON.parse((p.linkedEmails as string) || '[]'); } catch { arr = []; }
      if (arr.some(e => (e || '').toLowerCase() === lower)) return true;
    }
  } catch {}
  return false;
}

/**
 * Make sure `email` exists as a Firebase identity so it can be used for login.
 * If the address already has a Firebase account (e.g. a Google identity) it is
 * left untouched; otherwise a lightweight identity is created.
 */
export async function ensureFirebaseIdentity(email: string): Promise<void> {
  try {
    const { adminAuth } = await import('@/lib/firebase-admin');
    try {
      await adminAuth.getUserByEmail(email);
    } catch {
      // Email not verified yet — ownership comes from the password-set email the
      // user receives in that inbox. emailVerified is set so login passes the
      // verified check in auth-options.
      await adminAuth.createUser({ email: email.toLowerCase(), emailVerified: true });
    }
  } catch {}
}

/** Sends Firebase's "reset your password" email so the owner can set a password for the address. */
export async function sendPasswordResetLink(email: string): Promise<boolean> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) return false;
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Version': 'Node/JsAdminSdk/v12.0.0',
      },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: email.toLowerCase(), lang: 'en' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function invalidateLinkedEmail(email?: string) {
  if (email) linkCache.delete((email || '').toLowerCase().trim());
  else linkCache.clear();
}