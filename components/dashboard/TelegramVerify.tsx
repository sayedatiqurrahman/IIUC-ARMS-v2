'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';

interface Props {
  telegramChatId: string | null;
  telegramVerified: boolean | null;
  telegramId: string | null;
  telegramName?: string | null;
  telegramAvatar?: string | null;
  email: string;
}

export default function TelegramVerify({ telegramChatId, telegramVerified, telegramId, telegramName, telegramAvatar, email }: Props) {
  const loadProfile = useAppStore(s => s.loadProfile);
  const [step, setStep] = useState<'idle' | 'pending' | 'otp' | 'sending'>('idle');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [checking, setChecking] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (telegramChatId && !telegramVerified) setStep(s => (s === 'idle' ? 'pending' : s));
    else if (telegramChatId && telegramVerified) setStep('idle');
    else setStep('idle');
  }, [telegramChatId, telegramVerified]);

  // Resolve the stored Telegram avatar (file_id) into a clickable image URL.
  useEffect(() => {
    let alive = true;
    if (telegramChatId && telegramVerified && telegramAvatar) {
      fetch(`/api/telegram/avatar?file_id=${encodeURIComponent(telegramAvatar)}`)
        .then(r => r.json())
        .then(d => { if (alive && d.url) setAvatarUrl(d.url); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [telegramChatId, telegramVerified, telegramAvatar]);

  // Auto-refresh: if not connected yet, poll so the page flips to
  // "Telegram linked — verify now" right after the user sends /connect in the bot.
  useEffect(() => {
    if (telegramChatId) return;
    let alive = true;
    const id = setInterval(async () => {
      setChecking(true);
      try {
        await loadProfile();
        if (useAppStore.getState().profile.telegramChatId) {
          alive = false;
          clearInterval(id);
        }
      } catch {}
      if (alive) setChecking(false);
    }, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [telegramChatId, loadProfile]);

  const sendOtp = async () => {
    setLoading(true); setErrMsg(''); setMsg('');
    try {
      const res = await fetch('/api/telegram/send-otp', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setMsg(data.message); setStep('otp');
        loadProfile();
      }
      else setErrMsg(data.error);
    } catch { setErrMsg('Network error'); }
    setLoading(false);
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setLoading(true); setErrMsg(''); setMsg('');
    try {
      const res = await fetch('/api/telegram/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: otp }),
      });
      const data = await res.json();
      if (res.ok) { setMsg(''); setStep('idle'); window.location.reload(); }
      else setErrMsg(data.error);
    } catch { setErrMsg('Network error'); }
    setLoading(false);
  };

  const disconnect = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/telegram/cancel', { method: 'POST' });
      if (res.ok) { setStep('idle'); setShowDisconnectConfirm(false); window.location.reload(); }
    } catch { setErrMsg('Network error'); }
    setLoading(false);
  };

  // ─── Connected state ───
  if (telegramChatId && telegramVerified) {
    const displayName = telegramName || telegramId || 'Telegram account';
    return (
      <div className="p-4 rounded-xl bg-dark-bg3 border border-dark-border">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Telegram avatar"
              className="w-12 h-12 rounded-full object-cover border-2 border-qsis/40" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-qsis/15 border-2 border-qsis/40 flex items-center justify-center font-bold text-qsis text-lg">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <i className="fab fa-telegram text-blue-400"></i>
              <span className="text-[0.85rem] font-semibold text-dark-text truncate">{displayName}</span>
            </div>
            {telegramId && <p className="text-[0.72rem] text-dark-text2 truncate">@{telegramId}</p>}
            <div className="flex items-center gap-2 text-[0.68rem] text-emerald-400 mt-0.5">
              <i className="fas fa-check-circle"></i>Telegram connected & verified
              <span className="text-dark-text3">·</span>
              <i className="fas fa-database text-dark-text3"></i>
              <span className="text-dark-text3">Saved in your profile</span>
            </div>
          </div>
          <button
            onClick={() => setShowDisconnectConfirm(!showDisconnectConfirm)}
            className="px-2 py-1 rounded-lg border border-dark-border bg-dark-bg text-dark-text2 text-[0.65rem] cursor-pointer hover:border-red-500 hover:text-red-400 transition-colors"
            title="Disconnect Telegram"
          >
            <i className="fas fa-unlink"></i>
          </button>
        </div>

        <p className="text-[0.6rem] text-dark-text3 mt-2"><i className="fas fa-bell text-green-400 mr-1"></i>You&apos;ll receive class routine, exam schedule &amp; file upload notifications here.</p>

        {showDisconnectConfirm && (
          <div className="mt-2 p-2.5 rounded-lg bg-red-500/5 border border-red-500/20">
            <p className="text-[0.72rem] text-red-400 font-semibold mb-1.5"><i className="fas fa-exclamation-triangle mr-1"></i>Disconnect this Telegram from your account?</p>
            <div className="flex gap-2">
              <button onClick={disconnect} disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[0.7rem] font-semibold cursor-pointer hover:bg-red-600 transition-colors disabled:opacity-50">
                {loading ? '...' : 'Yes, Disconnect'}
              </button>
              <button onClick={() => setShowDisconnectConfirm(false)} disabled={loading}
                className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.7rem] font-semibold cursor-pointer transition-colors disabled:opacity-50">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Pending verification (OTP flow) ───
  if (step === 'pending' || step === 'otp') {
    return (
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <div className="flex items-center gap-2 mb-2">
          <i className="fab fa-telegram text-blue-400"></i>
          <span className="text-[0.82rem] font-semibold text-blue-400">Telegram linked — verify now</span>
        </div>
        <p className="text-[0.72rem] text-dark-text2 mb-2">Click below to receive a 6-digit OTP in this Telegram chat.</p>

        {step === 'pending' && (
          <div className="flex gap-2">
            <button onClick={sendOtp} disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[0.75rem] font-semibold cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50">
              {loading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Sending...</> : <><i className="fas fa-paper-plane mr-1"></i>Send OTP</>}
            </button>
            <button onClick={disconnect} disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-red-500 transition-colors disabled:opacity-50">
              Cancel
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div>
            <p className="text-[0.7rem] text-dark-text3 mb-1">Enter the 6-digit code from Telegram:</p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-24 px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.9rem] font-mono text-center outline-none focus:border-qsis transition-colors"
                placeholder="------" autoFocus />
              <button onClick={verifyOtp} disabled={loading || otp.length !== 6}
                className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.75rem] font-semibold cursor-pointer hover:bg-qsis-dark transition-colors disabled:opacity-50">
                {loading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Verifying...</> : <><i className="fas fa-check mr-1"></i>Verify</>}
              </button>
              <button onClick={sendOtp} disabled={loading}
                className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-qsis transition-colors disabled:opacity-50">
                Resend
              </button>
            </div>
          </div>
        )}

        {errMsg && <p className="text-[0.7rem] text-red-400 mt-1.5"><i className="fas fa-exclamation-circle mr-0.5"></i>{errMsg}</p>}
      </div>
    );
  }

  // ─── Not connected — guide ───
  return (
    <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
      <div className="flex items-center gap-2 mb-2">
        <i className="fab fa-telegram text-blue-400 text-lg"></i>
        <div>
          <span className="text-[0.7rem] text-dark-text2 block">Telegram</span>
          <span className="text-[0.85rem] font-semibold text-dark-text2">Not connected</span>
        </div>
      </div>

      <div className="mb-2.5 p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10">
        <p className="text-[0.7rem] font-semibold text-blue-400 mb-1.5"><i className="fas fa-bell mr-1"></i>Why connect?</p>
        <ul className="text-[0.65rem] text-dark-text2 space-y-1">
          <li><i className="fas fa-check text-green-400 mr-1.5 w-3"></i>Instant class routine updates</li>
          <li><i className="fas fa-check text-green-400 mr-1.5 w-3"></i>Exam schedule notifications</li>
          <li><i className="fas fa-check text-green-400 mr-1.5 w-3"></i>New file upload alerts</li>
          <li><i className="fas fa-check text-green-400 mr-1.5 w-3"></i>Batch announcements</li>
        </ul>
      </div>

      <div className="mb-2.5 p-2.5 rounded-lg bg-dark-bg border border-dark-border">
        <p className="text-[0.7rem] font-semibold text-dark-text mb-1.5"><i className="fas fa-link mr-1 text-qsis"></i>How to connect:</p>
        <ol className="text-[0.65rem] text-dark-text2 space-y-1.5 list-decimal list-inside">
          <li>Open <a href="https://t.me/iiuc_arms_bot" target="_blank" rel="noopener" className="text-qsis underline font-semibold">@iiuc_arms_bot</a></li>
          <li>Send <code className="bg-dark-bg2 px-1 rounded text-qsis">/connect {email}</code>, or tap <b>&quot;Connect by Phone Number&quot;</b> if you have no Telegram username</li>
          <li>Come back here and click &quot;Send OTP&quot; below</li>
          <li>Enter the 6-digit OTP you receive in Telegram</li>
        </ol>
      </div>

      <button onClick={sendOtp} disabled={loading}
        className="w-full mb-1.5 py-2 rounded-lg bg-blue-500 text-white text-[0.78rem] font-semibold cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50">
        {loading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Checking /connect request...</> : <><i className="fas fa-paper-plane mr-1"></i>Send OTP to my Telegram</>}
      </button>
      <p className="text-[0.65rem] text-dark-text3 mb-2">
        Checks if your <code className="bg-dark-bg2 px-1 rounded text-qsis">/connect</code> request was received, then sends a 6-digit OTP to your Telegram.
      </p>

      {errMsg && <p className="text-[0.7rem] text-red-400 mb-2"><i className="fas fa-exclamation-circle mr-0.5"></i>{errMsg}</p>}

      <p className="text-[0.65rem] text-dark-text3 mb-2">
        <i className={`fas fa-sync ${checking ? 'fa-spin' : ''} text-qsis mr-1`}></i>
        Waiting for <code className="bg-dark-bg2 px-1 rounded text-qsis">/connect</code>... auto-detecting.
      </p>

      <p className="text-[0.6rem] text-dark-text3"><i className="fas fa-shield-alt mr-0.5"></i>OTP verified in web app for security. Max 3 accounts per profile.</p>
    </div>
  );
}
