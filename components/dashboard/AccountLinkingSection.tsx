'use client';

import { useState } from 'react';

export default function AccountLinkingSection({ email, linkedEmails, onRefresh }: { email: string; linkedEmails: string[]; onRefresh: () => void }) {
  const [newEmail, setNewEmail] = useState('');
  const [setAsPrimary, setSetAsPrimary] = useState(false);
  const [switching, setSwitching] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const flash = (msg: string, type: 'ok' | 'err') => {
    if (type === 'ok') { setSuccess(msg); setTimeout(() => setSuccess(''), 8000); }
    else { setError(msg); setTimeout(() => setError(''), 5000); }
  };

  const handleLink = async () => {
    if (!newEmail.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/profile/link-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkEmail: newEmail.trim(), setAsPrimary }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.switchedPrimary) {
          flash(data.message || 'Primary changed! Sign out and sign in with the new address.', 'ok');
          setNewEmail(''); setSetAsPrimary(false);
          // The session is keyed to the OLD primary email, and that row no longer
          // exists — reconnect with the new address.
          setTimeout(async () => {
            try { fetch('/api/auth/firebase-session', { method: 'DELETE' }); } catch {}
            const { signOut } = await import('next-auth/react');
            await signOut({ callbackUrl: '/' });
          }, 1500);
          return;
        }
        if (data.resetLinkSent) {
          flash(`Linked! A password-set email was sent to ${newEmail.trim()}. Set a password there, then sign in with it.`, 'ok');
        } else {
          flash('Email linked! You can sign in with it via Magic Link.', 'ok');
        }
        setNewEmail(''); setSetAsPrimary(false);
        onRefresh();
      } else {
        flash(data.error || 'Failed', 'err');
      }
    } catch {
      flash('Network error', 'err');
    }
    setLoading(false);
  };

  const handleUnlink = async (unlinkEmail: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/profile/link-email', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unlinkEmail }),
      });
      const data = await res.json();
      if (data.success) {
        flash('Email unlinked', 'ok');
        onRefresh();
      } else {
        flash(data.error || 'Failed', 'err');
      }
    } catch {
      flash('Network error', 'err');
    }
    setLoading(false);
  };

  const handleMakePrimary = async (target: string) => {
    setSwitching(target);
    setError(''); setSuccess('');
    try {
      const res = await fetch('/api/profile/switch-primary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPrimary: target }),
      });
      const data = await res.json();
      if (data.success) {
        flash(data.message || 'Primary changed! Sign out and sign in with the new address.', 'ok');
        setTimeout(async () => {
          try { fetch('/api/auth/firebase-session', { method: 'DELETE' }); } catch {}
          const { signOut } = await import('next-auth/react');
          await signOut({ callbackUrl: '/' });
        }, 1500);
      } else {
        flash(data.error || 'Failed to switch primary', 'err');
      }
    } catch {
      flash('Network error', 'err');
    }
    setSwitching('');
  };

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
      <h4 className="text-[0.95rem] font-semibold mb-2 flex items-center gap-2">
        <i className="fas fa-link text-cyan-400"></i> Account Linking
      </h4>
      <p className="text-[0.75rem] text-dark-text3 mb-3">
        Link a <strong>personal email</strong> (e.g. a Gmail) to this account. You can then sign in with
        that personal email too — so if your university email expires, you can still use the app.
        Your profile and data stay shared across all linked emails.
      </p>

      {linkedEmails.length > 0 && (
        <div className="space-y-2 mb-3">
          {linkedEmails.map(e => (
            <div key={e} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-dark-bg3 border border-dark-border">
              <div className="flex items-center gap-2 min-w-0">
                <i className="fas fa-envelope text-cyan-400 text-[0.7rem]"></i>
                <span className="text-[0.78rem] text-dark-text truncate">{e}</span>
                {e.toLowerCase() === email.toLowerCase() && (
                  <span className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 text-[0.55rem] font-semibold">Primary</span>
                )}
              </div>
              {e.toLowerCase() !== email.toLowerCase() && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleMakePrimary(e)}
                    disabled={loading || !!switching}
                    title={`Use ${e} as your new primary sign-in email`}
                    className="text-cyan-400 hover:text-cyan-300 text-[0.65rem] px-2 py-1 rounded hover:bg-cyan-500/10 cursor-pointer border-none transition-colors disabled:opacity-50"
                  >
                    {switching === e ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-arrow-right mr-0.5"></i>Make Primary</>}
                  </button>
                  <button onClick={() => handleUnlink(e)} disabled={loading || !!switching} className="text-red-400 hover:text-red-300 text-[0.65rem] px-2 py-1 rounded hover:bg-red-500/10 cursor-pointer border-none transition-colors disabled:opacity-50">
                    <i className="fas fa-unlink mr-0.5"></i>Unlink
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="email"
          value={newEmail}
          onChange={e => { setNewEmail(e.target.value); setError(''); setSuccess(''); }}
          placeholder="Add a personal email (e.g. name@gmail.com)..."
          className="flex-1 px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.8rem] outline-none focus:border-qsis transition-colors"
        />
        <button onClick={handleLink} disabled={loading || !newEmail.trim()} className="px-4 py-2 rounded-lg bg-cyan-500/15 text-cyan-400 text-[0.78rem] font-semibold cursor-pointer hover:bg-cyan-500/25 border-none disabled:opacity-50 transition-colors">
          {loading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-link mr-1"></i>Link</>}
        </button>
      </div>
      <label className="flex items-center gap-2 mt-2 cursor-pointer">
        <input
          type="checkbox"
          checked={setAsPrimary}
          onChange={e => setSetAsPrimary(e.target.checked)}
          className="accent-qsis"
        />
        <span className="text-[0.72rem] text-dark-text2">
          Make this my new <strong>primary email</strong> (you will sign out and sign back in with it)
        </span>
      </label>
      {error && <p className="text-[0.7rem] text-red-400 mt-1.5"><i className="fas fa-exclamation-circle mr-1"></i>{error}</p>}
      {success && <p className="text-[0.7rem] text-green-400 mt-1.5"><i className="fas fa-check-circle mr-1"></i>{success}</p>}
    </div>
  );
}