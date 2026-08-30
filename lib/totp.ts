import { TOTP, Secret } from 'otpauth';

export const TOTP_ISSUER = 'IIUC-ARMS';

export function parseMethods(raw: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(raw || '["email"]');
    return Array.isArray(arr) ? arr : ['email'];
  } catch {
    return ['email'];
  }
}

export interface TotpConfig {
  secret: string;
  enabled: boolean;
  methods: string[];
}

// Primary-account TOTP was historically stored on the Profile row. Newer
// per-email setup (which also supports LINKED/secondary accounts) lives in the
// TotpAccount table. Always prefer TotpAccount; fall back to Profile columns.
export async function getTotpForEmail(email: string): Promise<TotpConfig | null> {
  const { prisma } = await import('@/lib/prisma');
  const acc = await prisma.totpAccount.findUnique({ where: { email } });
  if (acc) {
    return { secret: acc.secret, enabled: acc.enabled, methods: parseMethods(acc.methods) };
  }
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  if (profile?.totpSecret) {
    return { secret: profile.totpSecret, enabled: !!profile.totpEnabled, methods: parseMethods(profile.totpMethods) };
  }
  return null;
}

// Keep legacy Profile columns in sync when the target email belongs to a
// Profile (primary accounts) so nothing else reading those columns drifts.
async function mirrorToProfile(email: string, data: { secret?: string | null; enabled?: boolean; methods?: string[] }) {
  const { prisma } = await import('@/lib/prisma');
  const profile = await prisma.profile.findUnique({ where: { userId: email } });
  if (!profile) return;
  const patch: Record<string, unknown> = {};
  if (data.secret !== undefined) patch.totpSecret = data.secret;
  if (data.enabled !== undefined) patch.totpEnabled = data.enabled;
  if (data.methods !== undefined) patch.totpMethods = JSON.stringify(data.methods);
  await prisma.profile.update({ where: { userId: email }, data: patch });
}

export async function saveTotpSetup(email: string, secret: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.totpAccount.upsert({
    where: { email },
    create: { email, secret, enabled: false },
    update: { secret },
  });
  await mirrorToProfile(email, { secret, enabled: false });
}

export async function enableTotp(email: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  try {
    await prisma.totpAccount.update({ where: { email }, data: { enabled: true } });
  } catch {
    // No TotpAccount row — this is a legacy primary-account secret; enabled is
    // flipped on the Profile row below.
  }
  await mirrorToProfile(email, { enabled: true });
}

export async function setTotpMethods(email: string, methods: string[]): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.totpAccount.upsert({
    where: { email },
    create: { email, secret: '', enabled: false, methods: JSON.stringify(methods) },
    update: { methods: JSON.stringify(methods) },
  });
  await mirrorToProfile(email, { methods });
}

export async function disableTotp(email: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  try {
    await prisma.totpAccount.delete({ where: { email } });
  } catch {
    // No TotpAccount row — legacy secret lives on the Profile row; cleared below.
  }
  await mirrorToProfile(email, { secret: null, enabled: false });
}

export function validateTotp(secret: string, email: string, code: string): boolean {
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.validate({ token: code, window: 1 }) !== null;
}

export function totpUrl(secret: string, email: string): string {
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.toString();
}