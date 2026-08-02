import { NextRequest, NextResponse } from 'next/server';
import { getUserEmail } from '@/lib/get-user';
import { config } from '@/lib/config';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { invalidatePermissionsCache } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    if (effectiveRole !== 'admin' && effectiveRole !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { prisma } = await import('@/lib/prisma');
    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });
    const callerDept = callerProfile?.department || null;

    const url = new URL(req.url);
    const filterRole = url.searchParams.get('role');
    const search = url.searchParams.get('search') || '';

    const where: any = {};
    if (filterRole && filterRole !== 'all') {
      where.role = filterRole;
    }
    if (effectiveRole === 'manager' && callerDept) {
      where.department = callerDept;
    }

    let profiles: any[] = [];
    try {
      profiles = await prisma.profile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    } catch (e) {
      profiles = [];
    }

    let firebaseUsers: any[] = [];
    try {
      const { getAdminAuth } = await import('@/lib/firebase-admin');
      const auth = getAdminAuth();
      if (auth) {
        const listResult = await auth.listUsers(1000);
        firebaseUsers = listResult.users || [];
      }
    } catch {
      // Firebase not configured — profiles-only mode
    }

    const profileMap = new Map(profiles.map(p => [p.email?.toLowerCase(), p]));
    const merged = new Map<string, any>();

    for (const fu of firebaseUsers) {
      const userEmail = fu.email?.toLowerCase();
      if (!userEmail) continue;
      const profile = profileMap.get(userEmail);
      merged.set(userEmail, {
        userId: profile?.userId || userEmail,
        email: userEmail,
        name: profile?.name || fu.displayName || null,
        title: profile?.title || null,
        role: profile?.role || config.detectRole(userEmail),
        isBanned: profile?.isBanned || false,
        banReason: (profile as any).banReason || null,
        bannedBy: (profile as any).bannedBy || null,
        isCR: profile?.isCR || false,
        isACR: profile?.isACR || false,
        department: profile?.department || null,
        universityId: profile?.universityId || null,
        githubLogin: profile?.githubLogin || null,
        githubAvatar: profile?.githubAvatar || null,
        image: profile?.image || fu.photoURL || null,
        semester: profile?.semester || null,
        section: profile?.section || null,
        hasProfile: !!profile,
        lastSignIn: fu.lastSignInTime || null,
        createdAt: profile?.createdAt?.toISOString() || fu.metadata?.creationTime || null,
        providers: fu.providerData?.map((p: any) => p.providerId) || [],
        customPermissions: profile?.customPermissions || {},
      });
    }

    Array.from(profileMap.entries()).forEach(([emailKey, profile]) => {
      if (!merged.has(emailKey)) {
        merged.set(emailKey, {
          userId: profile.userId,
          email: emailKey,
          name: profile.name || null,
          title: profile.title || null,
          role: profile.role || 'user',
          isBanned: profile.isBanned || false,
          banReason: (profile as any).banReason || null,
          bannedBy: (profile as any).bannedBy || null,
          isCR: profile.isCR || false,
          isACR: profile.isACR || false,
          department: profile.department || null,
          universityId: profile.universityId || null,
          githubLogin: profile.githubLogin || null,
          githubAvatar: profile.githubAvatar || null,
          image: profile.image || null,
          semester: profile.semester || null,
          section: profile.section || null,
          hasProfile: true,
          lastSignIn: null,
          createdAt: profile.createdAt?.toISOString() || null,
          providers: [],
          customPermissions: profile.customPermissions || {},
        });
      }
    });

    let result = Array.from(merged.values());

    if (filterRole && filterRole !== 'all') {
      result = result.filter(u => u.role === filterRole);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.email?.includes(q) || u.name?.toLowerCase().includes(q) || u.githubLogin?.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ users: result });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, RATE_LIMITS.admin);
  if (!rl.success) return rl.response!;
  try {
    const email = await getUserEmail(req);
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const effectiveRole = config.getEffectiveRole(email);
    const isOwner = config.ownerEmails.includes(email.toLowerCase());
    if (effectiveRole !== 'admin' && effectiveRole !== 'teacher' && effectiveRole !== 'manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { targetEmail, action } = body;
    const validActions = ['ban', 'unban', 'setRole', 'toggleCR', 'toggleACR', 'grantPermission', 'revokePermission', 'setCustomPermissions'];
    if (!targetEmail || !validActions.includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (targetEmail.toLowerCase() === email.toLowerCase() && (action === 'ban' || action === 'unban')) {
      return NextResponse.json({ error: 'Cannot ban yourself' }, { status: 400 });
    }

    const { prisma } = await import('@/lib/prisma');

    const callerProfile = await prisma.profile.findUnique({ where: { userId: email } });

    await prisma.profile.upsert({
      where: { userId: targetEmail },
      create: { userId: targetEmail, email: targetEmail },
      update: {},
    });

    const targetProfile = await prisma.profile.findUnique({ where: { userId: targetEmail } });
    const targetEffectiveRole = config.getEffectiveRole(targetEmail, targetProfile?.role || undefined);

    // Manager can only act on users in their own department
    if (effectiveRole === 'manager' && callerProfile?.department) {
      if (targetProfile?.department && targetProfile.department !== callerProfile.department) {
        return NextResponse.json({ error: 'Managers can only manage users in their own department' }, { status: 403 });
      }
    }

    // ─── BAN ───
    if (action === 'ban') {
      const { banReason } = body;
      const banData: Record<string, any> = { isBanned: true, bannedBy: email };
      if (banReason && typeof banReason === 'string' && banReason.trim()) {
        banData.banReason = banReason.trim().slice(0, 500);
      }
      // Admin can ban anyone except other admins (unless owner)
      if (effectiveRole === 'admin') {
        if (targetEffectiveRole === 'admin' && !isOwner) {
          return NextResponse.json({ error: 'Cannot ban an admin' }, { status: 403 });
        }
        if (targetEffectiveRole === 'admin' && isOwner) {
          return NextResponse.json({ error: 'Cannot ban the owner' }, { status: 403 });
        }
        await prisma.profile.update({ where: { userId: targetEmail }, data: banData });
        return NextResponse.json({ success: true, message: 'User banned' });
      }
      // Teacher can ban: students, users, managers (not admins, not other teachers)
      if (effectiveRole === 'teacher') {
        if (targetEffectiveRole === 'admin') {
          return NextResponse.json({ error: 'Teachers cannot ban admins' }, { status: 403 });
        }
        if (targetEffectiveRole === 'teacher') {
          return NextResponse.json({ error: 'Teachers cannot ban other teachers' }, { status: 403 });
        }
        await prisma.profile.update({ where: { userId: targetEmail }, data: banData });
        return NextResponse.json({ success: true, message: 'User banned' });
      }
      // Manager can ban: students, users only (not teachers, not managers, not admins)
      if (effectiveRole === 'manager') {
        if (targetEffectiveRole === 'admin' || targetEffectiveRole === 'teacher' || targetEffectiveRole === 'manager') {
          return NextResponse.json({ error: 'Managers cannot ban admins, teachers, or other managers' }, { status: 403 });
        }
        await prisma.profile.update({ where: { userId: targetEmail }, data: banData });
        return NextResponse.json({ success: true, message: 'User banned' });
      }
    }

    // ─── UNBAN ───
    if (action === 'unban') {
      if (effectiveRole !== 'admin') {
        return NextResponse.json({ error: 'Only admins can unban' }, { status: 403 });
      }
      await prisma.profile.update({ where: { userId: targetEmail }, data: { isBanned: false, banReason: null, bannedBy: null } });
      return NextResponse.json({ success: true, message: 'User unbanned' });
    }

    // ─── SET ROLE ───
    if (action === 'setRole') {
      const { newRole } = body;
      if (!['admin', 'manager', 'teacher', 'student', 'user'].includes(newRole)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      // Only admin can set roles
      if (effectiveRole !== 'admin') {
        return NextResponse.json({ error: 'Only admins can change roles' }, { status: 403 });
      }
      if (targetEmail.toLowerCase() === email.toLowerCase() && newRole !== 'admin') {
        return NextResponse.json({ error: 'Cannot demote yourself' }, { status: 400 });
      }
      await prisma.profile.update({ where: { userId: targetEmail }, data: { role: newRole } });
      return NextResponse.json({ success: true, message: `Role changed to ${newRole}` });
    }

    // ─── TOGGLE CR ───
    if (action === 'toggleCR') {
      const { isCR } = body;
      if (targetEffectiveRole === 'admin') {
        return NextResponse.json({ error: 'Cannot change CR status of admin' }, { status: 403 });
      }
      // Manager can only make CR in own department
      if (effectiveRole === 'manager' && targetProfile?.department && callerProfile?.department && targetProfile.department !== callerProfile.department) {
        return NextResponse.json({ error: 'Managers can only make CR in their own department' }, { status: 403 });
      }
      if (isCR) {
        // Require department, semester, section to become CR
        if (!targetProfile?.department || !targetProfile?.semester || !targetProfile?.section) {
          return NextResponse.json({ error: 'User must have department, semester, and section set to become CR' }, { status: 400 });
        }
        // Manager: target must be in same department
        if (effectiveRole === 'manager' && targetProfile.department !== callerProfile?.department) {
          return NextResponse.json({ error: 'Managers can only make CR in their own department' }, { status: 403 });
        }
        // Max 2 CRs per section per semester per department
        const crCount = await prisma.profile.count({
          where: {
            isCR: true,
            department: targetProfile.department,
            semester: targetProfile.semester,
            section: targetProfile.section,
            NOT: { userId: targetEmail },
          },
        });
        if (crCount >= 2) {
          return NextResponse.json({ error: `Maximum 2 CRs allowed per section (currently ${crCount}). Remove an existing CR first.` }, { status: 400 });
        }
      }
      await prisma.profile.update({ where: { userId: targetEmail }, data: { isCR: !!isCR, ...(isCR ? { isACR: false } : {}) } });
      return NextResponse.json({ success: true, message: isCR ? 'Made CR' : 'Removed CR' });
    }

    // ─── TOGGLE ACR ───
    if (action === 'toggleACR') {
      const { isACR } = body;
      if (targetEffectiveRole === 'admin') {
        return NextResponse.json({ error: 'Cannot change ACR status of admin' }, { status: 403 });
      }
      if (effectiveRole === 'manager' && targetProfile?.department && callerProfile?.department && targetProfile.department !== callerProfile.department) {
        return NextResponse.json({ error: 'Managers can only manage ACR in their own department' }, { status: 403 });
      }
      if (isACR) {
        // Require department, semester, section to become ACR
        if (!targetProfile?.department || !targetProfile?.semester || !targetProfile?.section) {
          return NextResponse.json({ error: 'User must have department, semester, and section set to become ACR' }, { status: 400 });
        }
      }
      await prisma.profile.update({ where: { userId: targetEmail }, data: { isACR: !!isACR } });
      return NextResponse.json({ success: true, message: isACR ? 'Made ACR' : 'Removed ACR' });
    }

    // ─── GRANT PERMISSION ───
    if (action === 'grantPermission') {
      if (effectiveRole !== 'admin') {
        return NextResponse.json({ error: 'Only admins can grant permissions' }, { status: 403 });
      }
      const { permission } = body;
        const validPerms = ['addCourse', 'editCourse', 'deleteCourse', 'moveFile', 'copyFile', 'renameFile', 'deleteFile', 'uploadFile', 'manageFaculty', 'publishRoutine', 'manageUsers', 'manageSettings', 'editLinks'];
      if (!permission || !validPerms.includes(permission)) {
        return NextResponse.json({ error: 'Invalid permission' }, { status: 400 });
      }
      const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
      const perms = (settings?.permissions as Record<string, string[]>) || {};
      const target = await prisma.profile.findUnique({ where: { userId: targetEmail } });
      const targetRole = config.getEffectiveRole(targetEmail, target?.role || undefined);
      const perUserKey = `${permission}_users`;
      const allowedUsers = (perms[perUserKey] as string[]) || [];
      if (allowedUsers.includes(targetEmail.toLowerCase())) {
        return NextResponse.json({ success: true, message: 'Already granted' });
      }
      const updatedPerms = { ...perms, [perUserKey]: [...allowedUsers, targetEmail.toLowerCase()] };
      await prisma.siteSettings.upsert({
        where: { id: 'site-settings' },
        create: { id: 'site-settings', permissions: updatedPerms },
        update: { permissions: updatedPerms },
      });
      invalidatePermissionsCache();
      return NextResponse.json({ success: true, message: `Granted "${permission}" to ${targetEmail}` });
    }

    // ─── REVOKE PERMISSION ───
    if (action === 'revokePermission') {
      if (effectiveRole !== 'admin') {
        return NextResponse.json({ error: 'Only admins can revoke permissions' }, { status: 403 });
      }
      const { permission } = body;
      if (!permission) {
        return NextResponse.json({ error: 'Invalid permission' }, { status: 400 });
      }
      const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
      const perms = (settings?.permissions as Record<string, string[]>) || {};
      const perUserKey = `${permission}_users`;
      const allowedUsers = (perms[perUserKey] as string[]) || [];
      const updatedUsers = allowedUsers.filter((e: string) => e !== targetEmail.toLowerCase());
      const updatedPerms = { ...perms, [perUserKey]: updatedUsers };
      await prisma.siteSettings.upsert({
        where: { id: 'site-settings' },
        create: { id: 'site-settings', permissions: updatedPerms },
        update: { permissions: updatedPerms },
      });
      invalidatePermissionsCache();
      return NextResponse.json({ success: true, message: `Revoked "${permission}" from ${targetEmail}` });
    }

    // ─── SET CUSTOM PERMISSIONS (per-user scope) ───
    if (action === 'setCustomPermissions') {
      if (effectiveRole !== 'admin') {
        return NextResponse.json({ error: 'Only admins can set custom permissions' }, { status: 403 });
      }
      const { customPermissions } = body;
      if (!customPermissions || typeof customPermissions !== 'object') {
        return NextResponse.json({ error: 'customPermissions must be an object' }, { status: 400 });
      }
      const { setCustomPermissions } = await import('@/lib/permissions');
      await setCustomPermissions(targetEmail, customPermissions);
      return NextResponse.json({ success: true, message: `Updated custom permissions for ${targetEmail}` });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Admin action failed' }, { status: 500 });
  }
}
