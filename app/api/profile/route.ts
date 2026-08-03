import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { encrypt, decrypt, isEncrypted } from '@/lib/crypto';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { verifyTurnstileRequest } from '@/lib/verifyTurnstileRequest';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.profile);
  if (!rl.success) return rl.response!;
  try {
    const { prisma } = await import('@/lib/prisma');
    const email = await getUserEmail(req);
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized — not signed in' }, { status: 401 });
    }

    const userId = email;
    const profile = await prisma.profile.findUnique({ where: { userId } });

    if (profile?.githubToken && isEncrypted(profile.githubToken)) {
      try {
        profile.githubToken = decrypt(profile.githubToken);
      } catch {
        // Failed to decrypt token — leave as-is
      }
    }

    return NextResponse.json(profile || { userId, email });
  } catch (err: any) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.profile);
  if (!rl.success) return rl.response!;

  // Bot protection
  const turnstile = await verifyTurnstileRequest(req);
  if (!turnstile.success) return turnstile.response!;

  try {
    const { prisma } = await import('@/lib/prisma');
    const email = await getUserEmail(req);
    if (!email) {
      return NextResponse.json({ error: 'Unauthorized — not signed in' }, { status: 401 });
    }

    const userId = email;
    const body = await req.json();

    // Build update object — only include fields that are explicitly provided
    const updateData: Record<string, any> = {};
    const createData: Record<string, any> = { userId, email };

    const fields = [
      'name', 'title', 'shortForm', 'department', 'isCR', 'universityId', 'whatsapp', 'phone', 'telegramId', 'semester', 'section', 'image', 'batchId',
      'facebook', 'twitter', 'linkedin', 'website', 'company', 'companyUrl', 'publicEmail',
      'hideWhatsapp', 'hideUniversityId', 'hideSemester', 'hideEmail', 'hideCompany',
      'githubLogin', 'githubToken', 'githubInstallationId', 'githubAvatar',
    ];

    // Fields that can be cleared by sending empty string (disconnect flow)
    const clearableFields = new Set(['githubLogin', 'githubToken', 'githubInstallationId', 'githubAvatar']);

    for (const field of fields) {
      if (field in body) {
        const val = body[field];
        if (typeof val === 'boolean') {
          updateData[field] = val;
          createData[field] = val;
        } else if (val !== undefined && val !== null && val !== '') {
          // Encrypt githubToken before storing
          if (field === 'githubToken' && typeof val === 'string') {
            updateData[field] = isEncrypted(val) ? val : encrypt(val);
            createData[field] = updateData[field];
          } else {
            updateData[field] = val;
            createData[field] = val;
          }
        } else if ((val === '' || val === null) && clearableFields.has(field)) {
          // Only clear github fields on explicit empty (disconnect)
          updateData[field] = null;
          createData[field] = null;
        }
        // For non-clearable fields with empty/null values, simply skip — don't overwrite existing data
      }
    }

    const profile = await prisma.profile.upsert({
      where: { userId },
      update: updateData,
      create: createData as any,
    });

    return NextResponse.json(profile);
  } catch (err: any) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }
}
