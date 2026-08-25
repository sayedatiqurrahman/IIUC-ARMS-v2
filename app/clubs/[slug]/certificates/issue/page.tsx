'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import IssueCertView from '@/components/clubs/IssueCertView';

export default function IssueCertPage({ params }: { params: Promise<{ slug: string }> }) {
  const { data: session, status } = useSession();
  const profile = useAppStore(s => s.profile);
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [slug, setSlug] = useState('');

  useEffect(() => {
    params.then(p => setSlug(p.slug));
  }, [params]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/'); return; }
    if (status !== 'authenticated' || !profile.email) return;
    if (!slug) return;

    (async () => {
      try {
        const res = await fetch(`/api/clubs/${slug}`);
        const data = await res.json();
        const club = data.club;
        if (!club) { setAllowed(false); return; }

        const myMember = club.members?.find((m: any) => m.userId === profile.email);
        const isAdmin = profile.role === 'admin' || profile.role === 'manager';
        const isOfficer = !!myMember && ['gs', 'ags', 'ogs', 'office_secretary'].includes(myMember.role);
        const isClubAdmin = !!myMember?.isClubAdmin;
        let myClubRoles: string[] = [];
        try { myClubRoles = myMember?.clubRoles ? JSON.parse(myMember.clubRoles) : []; } catch {}
        const canIssue = isAdmin || isOfficer || isClubAdmin ||
          myClubRoles.includes('club_admin') || myClubRoles.includes('club_maintainer') || myClubRoles.includes('club_cert_issuer');
        setAllowed(canIssue);
      } catch {
        setAllowed(false);
      }
    })();
  }, [status, profile.email, profile.role, slug]);

  if (status === 'loading' || allowed === null) {
    return (
      <div className="min-h-screen bg-[#18191a] flex items-center justify-center">
        <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-[#18191a] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-lock text-red-400 text-2xl"></i>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-gray-400 mb-4">You don&apos;t have permission to issue certificates for this club.</p>
          <button onClick={() => router.push(`/clubs/${slug}`)} className="text-qsis text-sm hover:underline">
            <i className="fas fa-arrow-left mr-1"></i>Back to Club
          </button>
        </div>
      </div>
    );
  }

  return <IssueCertView params={params} />;
}
