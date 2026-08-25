'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  getUserTTL,
  setUserTTL,
  getCacheStats,
  clearFileCache,
  TTL_OPTIONS,
  purgeExpiredCache,
} from '@/lib/file-cache';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [ttl, setTtl] = useState(30);
  const [stats, setStats] = useState({ entries: 0, totalSize: 0 });
  const [clearing, setClearing] = useState(false);
  const [purging, setPurging] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/');
  }, [status, router]);

  useEffect(() => {
    const current = getUserTTL();
    const opt = TTL_OPTIONS.find(o => o.ms === current);
    setTtl(opt?.value ?? 30);
    getCacheStats().then(setStats);
  }, []);

  const handleTTLChange = (val: number) => {
    setTtl(val);
    setUserTTL(val);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearAll = async () => {
    setClearing(true);
    await clearFileCache();
    setStats({ entries: 0, totalSize: 0 });
    setClearing(false);
  };

  const handlePurgeExpired = async () => {
    setPurging(true);
    const purged = await purgeExpiredCache();
    setStats(await getCacheStats());
    setPurging(false);
  };

  const handleDeleteAccount = async () => {
    setDeleteError('');
    const userEmail = (session as any)?.user?.email;
    if (deleteEmail.toLowerCase() !== userEmail?.toLowerCase()) {
      setDeleteError('Email does not match your account email');
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEmail: deleteEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || 'Failed to delete account');
        setDeleting(false);
        return;
      }
      await fetch('/api/auth/firebase-session', { method: 'DELETE' });
      await signOut({ callbackUrl: '/' });
    } catch {
      setDeleteError('Network error. Please try again.');
      setDeleting(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <i className="fas fa-spinner fa-spin text-qsis text-2xl"></i>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-dark-bg2 border border-dark-border flex items-center justify-center text-dark-text2 hover:text-dark-text cursor-pointer">
            <i className="fas fa-arrow-left text-sm"></i>
          </button>
          <div>
            <h1 className="text-xl font-bold text-dark-text flex items-center gap-2">
              <i className="fas fa-cog text-qsis"></i>Settings
            </h1>
            <p className="text-[0.75rem] text-dark-text2">Manage app preferences</p>
          </div>
        </div>

        {/* ─── File Cache Section ─── */}
        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <i className="fas fa-database text-blue-400"></i>
            <h2 className="text-[0.9rem] font-bold text-dark-text">File Cache</h2>
          </div>
          <p className="text-[0.75rem] text-dark-text2 mb-4 leading-relaxed">
            When you open a PDF, image, or document, it gets stored locally on your device so it opens instantly next time — even on slow internet.
            You can choose how long these files stay cached before they&apos;re automatically removed.
          </p>

          {/* Current stats */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1 bg-dark-bg3 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-dark-text">{stats.entries}</p>
              <p className="text-[0.68rem] text-dark-text3">Cached files</p>
            </div>
            <div className="flex-1 bg-dark-bg3 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-dark-text">{formatBytes(stats.totalSize)}</p>
              <p className="text-[0.68rem] text-dark-text3">Storage used</p>
            </div>
          </div>

          {/* TTL selector */}
          <label className="block text-[0.78rem] font-medium text-dark-text2 mb-2">
            <i className="fas fa-clock text-qsis mr-1"></i>
            Auto-remove files after
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {TTL_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => handleTTLChange(opt.value)}
                className={`px-3 py-2 rounded-xl text-[0.78rem] font-medium border cursor-pointer transition-all ${
                  ttl === opt.value
                    ? 'bg-qsis/15 border-qsis/40 text-qsis'
                    : 'bg-dark-bg3 border-dark-border text-dark-text2 hover:border-dark-text3'
                }`}>
                {opt.value === -1 ? (
                  <><i className="fas fa-infinity mr-1 text-[0.65rem]"></i>Never</>
                ) : (
                  opt.label
                )}
              </button>
            ))}
          </div>

          {saved && (
            <p className="text-[0.72rem] text-green-400 mb-3 flex items-center gap-1">
              <i className="fas fa-check-circle"></i>Saved
            </p>
          )}

          {/* Explanation per selection */}
          <div className="bg-dark-bg rounded-xl p-3 mb-4 border border-dark-border">
            {ttl === -1 ? (
              <p className="text-[0.72rem] text-dark-text2 leading-relaxed">
                <i className="fas fa-infinity text-qsis mr-1"></i>
                <strong className="text-dark-text">Never expire</strong> — Files stay cached forever until you manually clear them or reset the app.
                Best if you frequently revisit the same files and want instant access at all times.
              </p>
            ) : (
              <p className="text-[0.72rem] text-dark-text2 leading-relaxed">
                <i className="fas fa-info-circle text-blue-400 mr-1"></i>
                Files you haven&apos;t opened in <strong className="text-dark-text">{ttl} {ttl === 1 ? 'day' : 'days'}</strong> will be automatically removed to free up storage.
                Each time you open a file, its timer resets — so frequently used files stay cached.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={handlePurgeExpired} disabled={purging || ttl === -1}
              className="flex-1 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.78rem] font-medium text-dark-text2 hover:text-dark-text cursor-pointer disabled:opacity-50 transition">
              {purging ? <><i className="fas fa-spinner fa-spin mr-1"></i>Cleaning...</> : <><i className="fas fa-broom mr-1"></i>Clean expired now</>}
            </button>
            <button onClick={handleClearAll} disabled={clearing}
              className="flex-1 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-[0.78rem] font-medium text-red-400 hover:bg-red-500/20 cursor-pointer disabled:opacity-50 transition">
              {clearing ? <><i className="fas fa-spinner fa-spin mr-1"></i>Clearing...</> : <><i className="fas fa-trash-alt mr-1"></i>Clear all cache</>}
            </button>
          </div>
        </div>

        {/* ─── About section ─── */}
        <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <i className="fas fa-info-circle text-qsis"></i>
            <h2 className="text-[0.9rem] font-bold text-dark-text">How caching works</h2>
          </div>
          <ul className="space-y-2 text-[0.72rem] text-dark-text2 leading-relaxed">
            <li className="flex gap-2">
              <i className="fas fa-check text-green-400 mt-0.5 flex-shrink-0"></i>
              <span><strong className="text-dark-text">First open</strong> — File downloads from GitHub and is stored on your device.</span>
            </li>
            <li className="flex gap-2">
              <i className="fas fa-check text-green-400 mt-0.5 flex-shrink-0"></i>
              <span><strong className="text-dark-text">Next opens</strong> — File loads instantly from local cache (no internet needed).</span>
            </li>
            <li className="flex gap-2">
              <i className="fas fa-check text-green-400 mt-0.5 flex-shrink-0"></i>
              <span><strong className="text-dark-text">Timer reset</strong> — Each time you open a file, its expiration timer restarts.</span>
            </li>
            <li className="flex gap-2">
              <i className="fas fa-check text-green-400 mt-0.5 flex-shrink-0"></i>
              <span><strong className="text-dark-text">Auto cleanup</strong> — Files not opened within your chosen period are removed automatically.</span>
            </li>
            <li className="flex gap-2">
              <i className="fas fa-check text-green-400 mt-0.5 flex-shrink-0"></i>
              <span><strong className="text-dark-text">Per-device</strong> — Cache is stored on this device only. Other devices have their own cache.</span>
            </li>
          </ul>
        </div>

        {/* ─── Dangerous Zone ─── */}
        <div className="bg-dark-bg2 border border-red-500/30 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <i className="fas fa-triangle-exclamation text-red-400"></i>
            <h2 className="text-[0.9rem] font-bold text-red-400">Danger Zone</h2>
          </div>
          <p className="text-[0.75rem] text-dark-text2 mb-4 leading-relaxed">
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>

          {deleteStep === 0 && (
            <button onClick={() => setDeleteStep(1)}
              className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-[0.78rem] font-medium text-red-400 hover:bg-red-500/20 cursor-pointer transition">
              <i className="fas fa-trash-alt mr-1.5"></i>Delete my account
            </button>
          )}

          {deleteStep === 1 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <p className="text-[0.78rem] text-dark-text mb-3">
                <i className="fas fa-info-circle text-red-400 mr-1.5"></i>
                <strong>What will be deleted:</strong>
              </p>
              <ul className="space-y-1.5 text-[0.72rem] text-dark-text2 mb-4 ml-5">
                <li className="list-disc">Your profile and personal information</li>
                <li className="list-disc">Club memberships and claims</li>
                <li className="list-disc">Firebase authentication account</li>
                <li className="list-disc">Telegram connections and OTP settings</li>
                <li className="list-disc">Activity logs and permission grants</li>
              </ul>
              <p className="text-[0.72rem] text-green-400 mb-3 ml-5">
                <i className="fas fa-check mr-1.5"></i>
                Your contributions (certificates issued, GitHub commits) will be preserved.
              </p>
              <p className="text-[0.78rem] text-dark-text mb-3">
                To confirm, type your email address <strong className="text-red-400">{(session as any)?.user?.email}</strong> below:
              </p>
              <input
                type="text"
                value={deleteEmail}
                onChange={e => { setDeleteEmail(e.target.value); setDeleteError(''); }}
                placeholder="your@email.com"
                className="w-full px-3 py-2 bg-dark-bg border border-red-500/30 rounded-xl text-[0.78rem] text-dark-text placeholder:text-dark-text3 mb-3 outline-none focus:border-red-500/50"
              />
              {deleteError && (
                <p className="text-[0.72rem] text-red-400 mb-3"><i className="fas fa-exclamation-circle mr-1"></i>{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setDeleteStep(0); setDeleteEmail(''); setDeleteError(''); }}
                  className="px-4 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.78rem] font-medium text-dark-text2 hover:text-dark-text cursor-pointer transition">
                  Cancel
                </button>
                <button onClick={() => {
                  if (deleteEmail.toLowerCase() !== (session as any)?.user?.email?.toLowerCase()) {
                    setDeleteError('Email does not match your account email');
                    return;
                  }
                  setDeleteStep(2);
                }}
                  disabled={!deleteEmail}
                  className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-[0.78rem] font-medium text-red-400 hover:bg-red-500/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition">
                  Continue
                </button>
              </div>
            </div>
          )}

          {deleteStep === 2 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <p className="text-[0.78rem] text-red-400 font-bold mb-2">
                <i className="fas fa-exclamation-triangle mr-1.5"></i>Final Confirmation
              </p>
              <p className="text-[0.72rem] text-dark-text2 mb-4 leading-relaxed">
                You are about to <strong className="text-red-400">permanently delete</strong> your account. All your data will be removed from IIUC-ARMS. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={() => { setDeleteStep(1); setDeleteEmail(''); setDeleteError(''); }}
                  className="px-4 py-2 rounded-xl bg-dark-bg3 border border-dark-border text-[0.78rem] font-medium text-dark-text2 hover:text-dark-text cursor-pointer transition">
                  Go back
                </button>
                <button onClick={handleDeleteAccount} disabled={deleting}
                  className="px-4 py-2 rounded-xl bg-red-600 text-[0.78rem] font-medium text-white hover:bg-red-700 cursor-pointer disabled:opacity-50 transition">
                  {deleting ? <><i className="fas fa-spinner fa-spin mr-1.5"></i>Deleting...</> : <><i className="fas fa-trash-alt mr-1.5"></i>Delete my account permanently</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
