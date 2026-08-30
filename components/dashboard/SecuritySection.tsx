'use client';

import { useState, useEffect } from 'react';
import { hasPasswordProvider, reauthenticateAndSetPassword } from '@/lib/firebase';

async function serverSetPassword(newPassword: string) {
  const res = await fetch('/api/auth/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Failed to set password');
  }
}

interface SecuritySectionProps {
  totpEnabled: boolean;
  totpLoading: boolean;
  totpSetupMode: boolean;
  totpQR: string;
  totpSecret: string;
  totpCode: string;
  totpMsg: string;
  totpErrMsg: string;
  totpDisableMode: boolean;
  totpDisableCode: string;
  totpMethods: string[];
  totpMethodsLoading: boolean;
  setTotpCode: (v: string) => void;
  setTotpDisableCode: (v: string) => void;
  setTotpSetupMode: (v: boolean) => void;
  setTotpDisableMode: (v: boolean) => void;
  setTotpErrMsg: (v: string) => void;
  setTotpMethods: (v: string[]) => void;
  handleTotpSetup: () => void;
  handleTotpVerify: () => void;
  handleTotpDisable: () => void;
  handleTotpMethodsSave: (methods: string[]) => void;
  totpTarget: string;
  onTotpTargetChange: (email: string) => void;
  totpAccounts: string[];
}

export default function SecuritySection({
  totpEnabled, totpLoading, totpSetupMode, totpQR, totpSecret, totpCode,
  totpMsg, totpErrMsg, totpDisableMode, totpDisableCode, totpMethods, totpMethodsLoading,
  setTotpCode, setTotpDisableCode, setTotpSetupMode, setTotpDisableMode, setTotpErrMsg,
  setTotpMethods, handleTotpSetup, handleTotpVerify, handleTotpDisable, handleTotpMethodsSave,
  totpTarget, onTotpTargetChange, totpAccounts,
}: SecuritySectionProps) {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [passwordMode, setPasswordMode] = useState<'none' | 'set' | 'change'>('none');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordErr, setPasswordErr] = useState('');

  useEffect(() => {
    hasPasswordProvider().then(setHasPassword).catch(() => setHasPassword(false));
  }, []);

  async function handlePasswordSubmit() {
    setPasswordMsg('');
    setPasswordErr('');

    if (passwordMode === 'set') {
      if (newPassword.length < 6) { setPasswordErr('Password must be at least 6 characters'); return; }
      if (newPassword !== confirmPassword) { setPasswordErr('Passwords do not match'); return; }
      setPasswordLoading(true);
      try {
        await serverSetPassword(newPassword);
        setPasswordMsg('Password set successfully!');
        setPasswordMode('none');
        setNewPassword('');
        setConfirmPassword('');
        setHasPassword(true);
        setTimeout(() => {
          setTotpSetupMode(true);
          handleTotpSetup();
        }, 500);
      } catch (e: any) {
        setPasswordErr(e.message || 'Failed to set password');
      } finally {
        setPasswordLoading(false);
      }
    } else if (passwordMode === 'change') {
      if (!currentPassword) { setPasswordErr('Current password is required'); return; }
      if (newPassword.length < 6) { setPasswordErr('New password must be at least 6 characters'); return; }
      if (newPassword !== confirmPassword) { setPasswordErr('Passwords do not match'); return; }
      setPasswordLoading(true);
      try {
        await reauthenticateAndSetPassword(currentPassword, newPassword);
        setPasswordMsg('Password changed successfully!');
        setPasswordMode('none');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } catch (e: any) {
        if (e.code === 'auth/wrong-password') {
          setPasswordErr('Current password is incorrect');
        } else if (e.code === 'auth/requires-recent-login') {
          setPasswordErr('For security, sign out and sign in again, then retry changing your password. Set your initial password from the "Set Password" option if you do not have one yet.');
        } else {
          setPasswordErr(e.message || 'Failed to change password');
        }
      } finally {
        setPasswordLoading(false);
      }
    }
  }

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-3 md:p-5 mb-4">
      <h4 className="text-[0.95rem] font-semibold mb-4"><i className="fas fa-shield-alt"></i> Security</h4>

      {/* Password Management */}
      <div className="mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${hasPassword ? 'bg-green-500/20' : 'bg-amber-500/20'}`}>
              <i className={`fas ${hasPassword ? 'fa-key text-green-500' : 'fa-key text-amber-500'}`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[0.85rem] font-semibold block">Password</span>
              <span className="text-[0.72rem] text-dark-text2 block">
                {hasPassword === null ? 'Checking...' :
                 hasPassword ? 'You have a password set for email login' : 'No password set — sign in with Google only'}
              </span>
            </div>
          </div>
          {hasPassword !== null && (
            <button
              onClick={() => setPasswordMode(passwordMode === 'none' ? (hasPassword ? 'change' : 'set') : 'none')}
              className={`text-[0.72rem] font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer self-start sm:self-center ${
                passwordMode !== 'none'
                  ? 'border-dark-border bg-dark-bg text-dark-text2'
                  : 'border-qsis/30 bg-qsis/5 text-qsis hover:bg-qsis/10'
              }`}
            >
              {passwordMode !== 'none' ? 'Cancel' : hasPassword ? 'Change' : 'Set Password'}
            </button>
          )}
        </div>

        {passwordMsg && (
          <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
            <i className="fas fa-check-circle mr-2"></i>{passwordMsg}
          </div>
        )}
        {passwordErr && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
            <i className="fas fa-exclamation-circle mr-2"></i>{passwordErr}
          </div>
        )}

        {passwordMode === 'set' && (
          <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 space-y-3">
            <p className="text-[0.78rem] text-dark-text2">
              <i className="fas fa-info-circle text-qsis mr-1"></i>
              Set a password so you can also sign in with email + password (works with your linked personal email too).
            </p>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1">New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1">Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" />
            </div>
            <button onClick={handlePasswordSubmit} disabled={passwordLoading || !newPassword || !confirmPassword}
              className="w-full py-2.5 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity">
              {passwordLoading ? <><i className="fas fa-spinner fa-spin mr-2"></i>Setting...</> : <><i className="fas fa-key mr-2"></i>Set Password</>}
            </button>
          </div>
        )}

        {passwordMode === 'change' && (
          <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4 space-y-3">
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1">Current Password</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1">New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" />
            </div>
            <div>
              <label className="text-[0.72rem] text-dark-text2 block mb-1">Confirm New Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis transition-colors" />
            </div>
            <button onClick={handlePasswordSubmit} disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
              className="w-full py-2.5 rounded-lg bg-qsis text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity">
              {passwordLoading ? <><i className="fas fa-spinner fa-spin mr-2"></i>Changing...</> : <><i className="fas fa-key mr-2"></i>Change Password</>}
            </button>
          </div>
        )}
      </div>

      {/* TOTP Section */}
      <div className="border-t border-dark-border pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${totpEnabled ? 'bg-green-500/20' : 'bg-dark-bg'}`}>
              <i className={`fas ${totpEnabled ? 'fa-check-circle text-green-500' : 'fa-shield-alt text-dark-text2'}`}></i>
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[0.85rem] font-semibold block">Two-Factor Authentication (TOTP)</span>
              <span className="text-[0.72rem] text-dark-text2 block">
                {totpEnabled ? 'Enabled — your account is protected with an authenticator app' : 'Not enabled — add an extra layer of security to your account'}
              </span>
            </div>
          </div>
          <span className={`text-[0.7rem] font-bold px-2 py-1 rounded-full self-start sm:self-center ${totpEnabled ? 'bg-green-500/20 text-green-400' : 'bg-dark-bg text-dark-text2'}`}>
            {totpEnabled ? 'ON' : 'OFF'}
          </span>
        </div>

        {totpAccounts.length > 1 && (
          <div className="mb-3">
            <label className="block text-[0.72rem] font-medium text-dark-text2 mb-1.5">
              <i className="fas fa-at mr-1"></i>Protect account
            </label>
            <select
              value={totpTarget}
              onChange={(e) => onTotpTargetChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors cursor-pointer"
            >
              {totpAccounts.map((acc) => (
                <option key={acc} value={acc}>{acc}</option>
              ))}
            </select>
            <p className="text-[0.68rem] text-dark-text2 mt-1">
              Each linked email can have its own authenticator app, applied when you sign in with that email.
            </p>
          </div>
        )}

        {totpMsg && (
          <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
            <i className="fas fa-check-circle mr-2"></i>{totpMsg}
          </div>
        )}
        {totpErrMsg && (
          <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
            <i className="fas fa-exclamation-circle mr-2"></i>{totpErrMsg}
          </div>
        )}

        {!totpEnabled && !totpSetupMode && (
          <button onClick={handleTotpSetup} disabled={totpLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-qsis text-qsis bg-transparent text-[0.82rem] font-semibold cursor-pointer hover:bg-qsis/10 transition-colors disabled:opacity-50">
            {totpLoading ? <><i className="fas fa-spinner fa-spin"></i> Loading...</> : <><i className="fas fa-lock"></i> Set Up Authenticator</>}
          </button>
        )}

        {totpSetupMode && (
          <div className="mt-2">
            <p className="text-[0.78rem] text-dark-text2 mb-3">
              <strong>Step 1:</strong> Open Google Authenticator (or any TOTP app) and scan this QR code.
            </p>
            {totpQR && (
              <div className="flex justify-center mb-3">
                <img src={totpQR} alt="TOTP QR Code" className="rounded-xl border border-dark-border" style={{ width: 200, height: 200 }} />
              </div>
            )}
            <div className="mb-3 p-2 rounded-lg bg-dark-bg3 border border-dark-border">
              <p className="text-[0.72rem] text-dark-text2 mb-1">Manual key (if you can&apos;t scan):</p>
              <code className="text-[0.82rem] text-qsis font-mono break-all">{totpSecret}</code>
            </div>
            <p className="text-[0.78rem] text-dark-text2 mb-2">
              <strong>Step 2:</strong> Enter the 6-digit code from your authenticator app.
            </p>
            <div className="flex gap-2 items-center">
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={totpCode}
                onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" autoFocus
                className="px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[1.1rem] tracking-[0.3em] text-center outline-none focus:border-qsis transition-colors font-mono" style={{ width: 130 }} />
              <button onClick={handleTotpVerify} disabled={totpLoading || totpCode.length !== 6}
                className="px-4 py-2 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                {totpLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-1"></i> Verify & Enable</>}
              </button>
              <button onClick={() => { setTotpSetupMode(false); setTotpErrMsg(''); }}
                className="px-3 py-2 rounded-xl border border-dark-border bg-transparent text-dark-text2 text-[0.78rem] font-semibold cursor-pointer hover:text-dark-text transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {totpEnabled && !totpDisableMode && (
          <>
            <div className="mt-3 mb-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border">
              <p className="text-[0.78rem] font-semibold text-dark-text mb-2">
                <i className="fas fa-list-check mr-1.5 text-qsis"></i>Require 2FA for these login methods:
              </p>
              <label className="flex items-center gap-2.5 mb-2 cursor-not-allowed opacity-70">
                <input type="checkbox" checked disabled className="accent-qsis" />
                <i className="fas fa-envelope text-qsis text-[0.7rem] w-4 text-center"></i>
                <span className="text-[0.78rem] text-dark-text">Email + Password</span>
                <span className="text-[0.6rem] text-dark-text3 bg-dark-bg px-1.5 py-0.5 rounded ml-auto">always required</span>
              </label>
              <label className="flex items-center gap-2.5 mb-2 cursor-pointer">
                <input type="checkbox" checked={totpMethods.includes('google')} disabled={totpMethodsLoading}
                  onChange={e => {
                    const next = e.target.checked ? [...totpMethods, 'google'] : totpMethods.filter(m => m !== 'google');
                    setTotpMethods(next);
                    handleTotpMethodsSave(next);
                  }}
                  className="accent-qsis" />
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                <span className="text-[0.78rem] text-dark-text">Continue with Google</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" checked={totpMethods.includes('magiclink')} disabled={totpMethodsLoading}
                  onChange={e => {
                    const next = e.target.checked ? [...totpMethods, 'magiclink'] : totpMethods.filter(m => m !== 'magiclink');
                    setTotpMethods(next);
                    handleTotpMethodsSave(next);
                  }}
                  className="accent-qsis" />
                <i className="fas fa-link text-accent text-[0.7rem] w-4 text-center"></i>
                <span className="text-[0.78rem] text-dark-text">Magic Link</span>
              </label>
            </div>
            <button onClick={() => setTotpDisableMode(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/40 text-red-400 bg-transparent text-[0.82rem] font-semibold cursor-pointer hover:bg-red-500/10 transition-colors">
              <i className="fas fa-unlock"></i> Disable Two-Factor Auth
            </button>
          </>
        )}

        {totpDisableMode && (
          <div className="mt-2">
            <p className="text-[0.78rem] text-dark-text2 mb-2">Enter your authenticator code to disable 2FA:</p>
            <div className="flex gap-2 items-center">
              <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={totpDisableCode}
                onChange={e => setTotpDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000" autoFocus
                className="px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[1.1rem] tracking-[0.3em] text-center outline-none focus:border-qsis transition-colors font-mono" style={{ width: 130 }} />
              <button onClick={handleTotpDisable} disabled={totpLoading || totpDisableCode.length !== 6}
                className="px-4 py-2 rounded-xl bg-red-500 text-white text-[0.82rem] font-semibold border-none cursor-pointer hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {totpLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-times mr-1"></i> Disable</>}
              </button>
              <button onClick={() => { setTotpDisableMode(false); setTotpDisableCode(''); setTotpErrMsg(''); }}
                className="px-3 py-2 rounded-xl border border-dark-border bg-transparent text-dark-text2 text-[0.78rem] font-semibold cursor-pointer hover:text-dark-text transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
