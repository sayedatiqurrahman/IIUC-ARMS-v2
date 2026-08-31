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
    // Fast path: direct contains lookup on the JSON-string column. Reliable even
    // with many profiles (no full-table materialisation), and exact-match-safe
    // because linked emails are stored as JSON string arrays.
    try {
      const hit = await prisma.profile.findFirst({
        where: { linkedEmails: { contains: `"${lower}"` } },
        select: { userId: true },
      });
      if (hit) primary = hit.userId;
    } catch {}
    if (!primary) {
      const profiles = await prisma.profile.findMany({
        where: { NOT: [{ linkedEmails: '[]' }, { linkedEmails: null }] },
        select: { userId: true, linkedEmails: true },
      });
      for (const p of profiles) {
        let arr: string[] = [];
        try { arr = JSON.parse((p.linkedEmails as string) || '[]'); } catch { arr = []; }
        if (arr.some(e => (e || '').toLowerCase() === lower)) { primary = p.userId; break; }
      }
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

/**
 * Robust check that `email` is a linked (secondary) identity of some profile.
 * Returns true either when the address appears in another profile's linkedEmails
 * OR when an ACTIVE linked-mirror profile (profileType:'linked') exists for it.
 * The mirror is authoritative, so even if the linkedEmails list can't be scanned
 * (huge DB / cache miss) a genuinely linked email is still recognized.
 */
export async function isLinkedIdentity(email: string): Promise<boolean> {
  const lower = (email || '').toLowerCase().trim();
  if (!lower) return false;
  try {
    if (await resolveLinkedEmail(lower)) return true;
    const { prisma } = await import('@/lib/prisma');
    const mirror = await prisma.profile.findUnique({
      where: { userId: lower },
      select: { profileType: true, accountStatus: true },
    });
    return !!mirror && mirror.profileType === 'linked' && mirror.accountStatus !== 'rejected' && mirror.accountStatus !== 'banned';
  } catch {
    return false;
  }
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

/**
 * Create (or refresh) an ACTIVE mirror profile for a linked (secondary) email so
 * the address is itself a fully allowed, role-bearing account — the same role as
 * the primary. This makes a linked email usable even if linkedEmails resolution
 * is stale, and it shows up in the users list with its real role. The mirror's
 * linkedEmails stays empty to avoid reverse-resolution cycles.
 */
export async function upsertLinkedMirror(prisma: any, primaryEmail: string, mirrorEmail: string): Promise<void> {
  const primary = await prisma.profile.findUnique({ where: { userId: primaryEmail.toLowerCase().trim() } });
  const mirror = (mirrorEmail || '').toLowerCase().trim();
  if (!primary) return;
  await prisma.profile.upsert({
    where: { userId: mirror },
    update: {
      accountStatus: 'active',
      role: primary.role || 'user',
      name: primary.name || undefined,
      universityId: primary.universityId || undefined,
      department: primary.department || undefined,
      section: primary.section || undefined,
      isCR: !!primary.isCR,
      isACR: !!primary.isACR,
      isBanned: false,
      profileType: 'linked',
    },
    create: {
      userId: mirror,
      email: mirror,
      accountStatus: 'active',
      role: primary.role || 'user',
      name: primary.name || null,
      universityId: primary.universityId || null,
      department: primary.department || null,
      section: primary.section || null,
      isCR: !!primary.isCR,
      isACR: !!primary.isACR,
      isBanned: false,
      profileType: 'linked',
    },
  });
}

/**
 * Promote a linked (secondary) email to be the new PRIMARY identity of the
 * account. The whole profile moves (all fields, role, status, data) to the new
 * address, the old address becomes a linked identity of it, and every
 * user-scoped reference in the database is re-pointed so memberships, claims,
 * courses, clubs and certificates keep working.
 */
export async function switchPrimary(prisma: any, oldEmail: string, newEmail: string): Promise<void> {
  const oldE = (oldEmail || '').toLowerCase().trim();
  const newE = (newEmail || '').toLowerCase().trim();
  if (!oldE || !newE || oldE === newE) throw new Error('Cannot switch to the same email');

  const existing = await prisma.profile.findUnique({ where: { userId: oldE } });
  if (!existing) throw new Error('Primary account not found');

  // The target address must be free. Linked mirrors / pending / rejected / banned
  // placeholder rows are cleared; an active REAL account can never be taken over.
  const target = await prisma.profile.findUnique({ where: { userId: newE } });
  if (target) {
    const inert = target.accountStatus === 'pending' || target.accountStatus === 'rejected' || !!target.isBanned || target.profileType === 'linked';
    if (!inert) throw new Error('That email already belongs to another active account');
    await prisma.profile.delete({ where: { userId: newE } });
  }

  // The new primary contains everything the old one had; the OLD address becomes
  // a linked identity so it keeps resolving back to the (new) primary account.
  const linked: string[] = (() => { try { return JSON.parse(existing.linkedEmails as string || '[]'); } catch { return []; } })();
  const newLinked = linked.filter((x) => (x || '').toLowerCase() !== newE);
  if (!newLinked.some((x) => (x || '').toLowerCase() === oldE)) newLinked.push(oldE);

  const { id, userId, linkedEmails, email, createdAt, updatedAt, ...rest } = existing as any;
  await prisma.profile.create({
    data: { ...rest, userId: newE, email: newE, linkedEmails: JSON.stringify(newLinked) },
  });
  await prisma.profile.delete({ where: { userId: oldE } });

  // Re-point every user-scoped column so nothing references the dead address.
  const refs: [string, string][] = [
    ['activityLog', 'userId'],
    ['course', 'addedBy'],
    ['facultyRequest', 'requesterId'],
    ['publishedRoutine', 'publishedBy'],
    ['publishedExamRoutine', 'publishedBy'],
    ['telegramNotification', 'sentBy'],
    ['club', 'createdBy'],
    ['clubMember', 'userId'],
    ['clubEvent', 'createdBy'],
    ['clubClaim', 'userId'],
    ['studioOrganization', 'createdBy'],
    ['studioCertificate', 'issuedBy'],
  ];
  for (const [model, col] of refs) {
    try {
      await prisma[model].updateMany({ where: { [col]: oldE }, data: { [col]: newE } });
    } catch {}
  }
  try {
    await prisma.publishedExamRoutine.updateMany({ where: { publishedByEmail: oldE }, data: { publishedByEmail: newE } });
  } catch {}

  // Flush authority / link caches for both addresses.
  try {
    const { invalidateStatusCache } = await import('@/lib/auth-options');
    invalidateStatusCache(oldE);
    invalidateStatusCache(newE);
  } catch {}
  try {
    const { invalidateLinkedEmail } = await import('@/lib/linked-accounts');
    invalidateLinkedEmail(oldE);
    invalidateLinkedEmail(newE);
    invalidateLinkedEmail();
  } catch {}
}