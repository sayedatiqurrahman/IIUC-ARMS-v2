// DB-first persistence for authentication. Every successful authenticate
// writes (or refreshes) the account's profile in OUR database, so the DB is the
// source of truth and a Firebase identity that isn't in the DB yet is
// auto-saved on first sign-in. No role/status is ever changed here — this only
// records existence + identity data; roles are assigned by admins or inherited
// from the primary account for linked emails.

interface PersistInput {
  email: string;
  name?: string | null;
  image?: string | null;
  githubLogin?: string | null;
  githubAvatar?: string | null;
}

export async function persistAuthProfile({ email, name, image, githubLogin, githubAvatar }: PersistInput): Promise<void> {
  const userId = (email || '').toLowerCase().trim();
  if (!userId) return;
  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        email: userId,
        accountStatus: 'active',
        role: 'user',
        ...(name ? { name } : {}),
        ...(image ? { image } : {}),
        ...(githubLogin ? { githubLogin } : {}),
        ...(githubAvatar ? { githubAvatar } : {}),
      },
      update: {
        email: userId,
        ...(name ? { name } : {}),
        ...(image ? { image } : {}),
        ...(githubLogin ? { githubLogin } : {}),
        ...(githubAvatar ? { githubAvatar } : {}),
      },
    });
  } catch {}
}
