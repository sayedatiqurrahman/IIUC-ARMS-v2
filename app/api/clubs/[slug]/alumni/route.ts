import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const club = await prisma.club.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!club) return NextResponse.json({ error: 'Club not found' }, { status: 404 });

    const members = await prisma.clubMember.findMany({
      where: { clubId: club.id },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });

    const profiles = await prisma.profile.findMany({
      where: { email: { in: members.map(m => m.userId) } },
      select: {
        email: true, name: true, image: true, department: true,
        githubAvatar: true, title: true,
      },
    });
    const profileMap = new Map(profiles.map(p => [p.email, p]));

    const enriched = members.map(m => {
      const p = profileMap.get(m.userId);
      return {
        userId: m.userId,
        role: m.role,
        previousRole: m.previousRole || null,
        previousRoleSession: m.previousRoleSession || null,
        isClubAdmin: m.isClubAdmin,
        createdAt: m.createdAt,
        name: p?.name || m.userId.replace(/^stub\./, '').replace(/\.\d+$/, ''),
        image: p?.image || p?.githubAvatar || null,
        department: p?.department || null,
        title: p?.title || null,
        isStub: m.userId.startsWith('stub.'),
      };
    });

    const sessions = new Map<string, typeof enriched>();
    const current: typeof enriched = [];

    for (const m of enriched) {
      const year = m.createdAt.getFullYear();
      const session = `Session ${year}-${(year + 1) % 100}`;
      if (!sessions.has(session)) sessions.set(session, []);
      sessions.get(session)!.push(m);

      if (m.previousRole && m.previousRoleSession) {
        const prevSession = m.previousRoleSession;
        if (!sessions.has(prevSession)) sessions.set(prevSession, []);
        const existing = sessions.get(prevSession)!.find(e => e.userId === m.userId);
        if (!existing) {
          sessions.get(prevSession)!.push({
            ...m,
            role: m.previousRole,
            previousRole: null,
            previousRoleSession: null,
          });
        }
      }

      current.push(m);
    }

    const sortedSessions = Array.from(sessions.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([session, members]) => ({
        session,
        members: members.sort((a, b) => {
          const roleOrder = ['advisor', 'president', 'vice_president', 'gs', 'ags', 'ogs', 'office_secretary', 'treasurer', 'finance', 'it_media', 'cultural', 'publication', 'member'];
          return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
        }),
      }));

    return NextResponse.json({
      success: true,
      sessions: sortedSessions,
      currentMembers: current,
      totalHistorical: enriched.length,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load alumni' }, { status: 500 });
  }
}
