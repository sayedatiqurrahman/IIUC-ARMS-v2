import 'server-only';

// Blocklist of emails an admin has permanently deleted. Deleting the Firebase
// auth record alone is not enough for external/PROVIDER accounts — Google sign-in
// re-creates the auth user automatically, and the app would re-provision a
// pending profile on their next sign-in (the "deleted but shows up again" loop).
// Any email on this list is rejected at sign-in and never auto-provisioned.

async function ensureColumn(p: any): Promise<void> {
  try {
    const tableInfo = await p.$queryRawUnsafe(`PRAGMA table_info(SiteSettings)`);
    const existingCols = new Set((tableInfo as any[]).map((c: any) => c.name));
    if (!existingCols.has('deletedEmails')) {
      await p.$executeRawUnsafe(`ALTER TABLE SiteSettings ADD COLUMN deletedEmails TEXT`);
    }
  } catch {}
}

export async function getDeletedEmails(p: any): Promise<string[]> {
  try {
    await ensureColumn(p);
    const rows = await p.$queryRawUnsafe(`SELECT deletedEmails FROM SiteSettings WHERE id = 'site-settings'`);
    const raw = (rows as any[])[0]?.deletedEmails;
    if (!raw) return [];
    let arr: any;
    try { arr = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { arr = null; }
    return Array.isArray(arr) ? arr.map((e: any) => String(e).toLowerCase().trim()) : [];
  } catch {
    return [];
  }
}

async function saveDeletedEmails(p: any, list: string[]): Promise<void> {
  const existing = await p.$queryRawUnsafe(`SELECT id FROM SiteSettings WHERE id = 'site-settings'`);
  if ((existing as any[]).length > 0) {
    await p.$executeRawUnsafe(`UPDATE SiteSettings SET deletedEmails = ? WHERE id = 'site-settings'`, JSON.stringify(list));
  } else {
    await p.$executeRawUnsafe(
      `INSERT INTO SiteSettings (id, permissions, deletedEmails) VALUES ('site-settings', '{}', ?)`,
      JSON.stringify(list),
    );
  }
}

export async function addDeletedEmail(p: any, email: string): Promise<void> {
  try {
    const list = await getDeletedEmails(p);
    const em = email.toLowerCase().trim();
    if (!em || !em.includes('@')) return;
    if (!list.includes(em)) {
      list.push(em);
      await saveDeletedEmails(p, list);
    }
  } catch {
    // Non-fatal — deletion still proceeds (profile is gone from DB).
  }
}

export async function removeDeletedEmail(p: any, email: string): Promise<void> {
  try {
    const list = await getDeletedEmails(p);
    const em = email.toLowerCase().trim();
    const filtered = list.filter((e: string) => e !== em);
    if (filtered.length !== list.length) {
      await saveDeletedEmails(p, filtered);
    }
  } catch {
    // Non-fatal.
  }
}

/** True if this email is on the deleted blocklist (server-side sign-in guard). */
export async function isDeletedEmail(email: string): Promise<boolean> {
  const { prisma } = await import('@/lib/prisma');
  const list = await getDeletedEmails(prisma as any);
  return list.includes(email.toLowerCase().trim());
}