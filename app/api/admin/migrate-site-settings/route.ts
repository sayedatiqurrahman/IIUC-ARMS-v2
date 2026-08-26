import { NextRequest, NextResponse } from 'next/server';

/**
 * One-time migration endpoint to add missing columns to SiteSettings.
 * Safe to call multiple times — uses ALTER TABLE IF NOT EXISTS pattern.
 * Remove after all columns exist in production.
 */
export async function POST(req: NextRequest) {
  // Only allow from Vercel deploy or with a secret key
  const key = req.nextUrl.searchParams.get('key') || '';
  const validKey = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || process.env.TELEGRAM_BOT_TOKEN || '';
  if (key !== validKey) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;

    const migrations: string[] = [];
    const errors: string[] = [];

    // Columns to add if missing
    const columns = [
      { name: 'customClubRoles', type: 'TEXT' },
      { name: 'supportConfig', type: 'TEXT' },
      { name: 'postingChannels', type: 'TEXT' },
      { name: 'telegramChats', type: 'TEXT' },
    ];

    // Check existing columns
    const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
    const existingCols = new Set((tableInfo as any[]).map((c: any) => c.name));

    for (const col of columns) {
      if (!existingCols.has(col.name)) {
        try {
          await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN ${col.name} ${col.type}`);
          migrations.push(`Added ${col.name}`);
        } catch (e: any) {
          errors.push(`${col.name}: ${e?.message || 'unknown error'}`);
        }
      } else {
        migrations.push(`${col.name} already exists`);
      }
    }

    // Verify all columns exist now
    const verifyInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
    const finalCols = (verifyInfo as any[]).map((c: any) => c.name);

    return NextResponse.json({
      success: errors.length === 0,
      migrations,
      errors,
      finalColumns: finalCols,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Migration failed' }, { status: 500 });
  }
}

// Also allow GET for checking status
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key') || '';
  const validKey = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || process.env.TELEGRAM_BOT_TOKEN || '';
  if (key !== validKey) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { prisma } = await import('@/lib/prisma');
    const p = prisma as any;
    const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
    const cols = (tableInfo as any[]).map((c: any) => ({ name: c.name, type: c.type }));

    const needed = ['customClubRoles', 'supportConfig', 'postingChannels', 'telegramChats'];
    const missing = needed.filter(n => !cols.find((c: any) => c.name === n));

    return NextResponse.json({ columns: cols, missing });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
