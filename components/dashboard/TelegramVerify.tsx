'use client';

import { useState, useEffect } from 'react';

interface Props {
  telegramChatId: string | null;
  telegramVerified: boolean | null;
  telegramId: string | null;
  email: string;
}

export default function TelegramVerify({ telegramChatId, telegramVerified, telegramId, email }: Props) {
  const [step, setStep] = useState<'idle' | 'pending' | 'otp'>('idle');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    if (telegramChatId && !telegramVerified) setStep('pending');
    else if (telegramChatId && telegramVerified) setStep('idle');
    else setStep('idle');
  }, [telegramChatId, telegramVerified]);

  const sendOtp = async () => {
    setLoading(true); setErrMsg(''); setMsg('');
    try {
      const res = await fetch('/api/telegram/send-otp', { method: 'POST' });
      const data = await res.json();
      if (res.ok) { setMsg(data.message); setStep('otp'); }
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

  const cancel = async () => {
    setLoading(true); setErrMsg(''); setMsg('');
    try {
      const res = await fetch('/api/telegram/cancel', { method: 'POST' });
      if (res.ok) { setStep('idle'); window.location.reload(); }
    } catch { setErrMsg('Network error'); }
    setLoading(false);
  };

  // Connected
  if (telegramChatId && telegramVerified) {
    return (
      <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
        <span className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fab fa-telegram mr-1 text-blue-400"></i>Telegram</span>
        <span className="text-[0.85rem] font-semibold">{telegramId || 'Connected'}</span>
        <p className="text-[0.6rem] text-green-400 mt-0.5"><i className="fas fa-check-circle mr-0.5"></i>Connected! You&apos;ll receive routine updates</p>
      </div>
    );
  }

  // Pending verification — show popup banner
  if (step === 'pending' || step === 'otp') {
    return (
      <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <i className="fab fa-telegram text-blue-400"></i>
          <span className="text-[0.82rem] font-semibold text-blue-400">Confirm your Telegram account</span>
        </div>
        <p className="text-[0.72rem] text-dark-text2 mb-2">
          Telegram chat linked. Verify to receive notifications.
        </p>

        {step === 'pending' && (
          <div className="flex gap-2">
            <button onClick={sendOtp} disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-[0.75rem] font-semibold cursor-pointer hover:bg-blue-600 transition-colors disabled:opacity-50">
              {loading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Sending...</> : <><i className="fas fa-paper-plane mr-1"></i>Send OTP</>}
            </button>
            <button onClick={cancel} disabled={loading}
              className="px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] font-semibold cursor-pointer hover:border-red-500 transition-colors disabled:opacity-50">
              Cancel
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div>
            <p className="text-[0.7rem] text-dark-text3 mb-1">Enter the 6-digit code sent to your Telegram:</p>
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

  // Not connected — show instructions
  return (
    <div className="p-3 rounded-lg bg-dark-bg3 border border-dark-border">
      <span className="text-[0.7rem] text-dark-text2 block mb-1"><i className="fab fa-telegram mr-1 text-blue-400"></i>Telegram</span>
      <span className={`text-[0.85rem] font-semibold ${telegramId ? '' : 'text-dark-text2'}`}>
        {telegramId || 'Not set'}
      </span>
      <div className="mt-1">
        <p className="text-[0.6rem] text-dark-text3">
          Open <a href="https://t.me/iiuc_arms_bot" target="_blank" rel="noopener" className="text-qsis underline">@iiuc_arms_bot</a> and send:<br/>
          <code className="bg-dark-bg px-1 rounded text-qsis text-[0.6rem]">/connect {email}</code>
        </p>
      </div>
    </div>
  );
}
