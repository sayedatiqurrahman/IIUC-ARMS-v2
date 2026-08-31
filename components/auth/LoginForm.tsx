'use client';

interface LoginFormProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  error: string;
  success: string;
  setError: (v: string) => void;
  setSuccess: (v: string) => void;
  loginMode: 'password' | 'magiclink';
  setLoginMode: (v: 'password' | 'magiclink') => void;
  magicLinkSent: boolean;
  setMagicLinkSent: (v: boolean) => void;
  totpStep: boolean;
  setTotpStep: (v: boolean) => void;
  totpCode: string;
  setTotpCode: (v: string) => void;
  totpAvailable: boolean;
  pendingCredentials: { idToken: string; email: string } | null;
  setPendingCredentials: (v: { idToken: string; email: string } | null) => void;
  magicLink2faSent: boolean;
  setMagicLink2faSent: (v: boolean) => void;
  onEmailLogin: (e: React.FormEvent) => void;
  onGoogleLogin: () => void;
  onMagicLink: (e: React.FormEvent) => void;
  onTotpVerify: (e: React.FormEvent) => void;
  onClose: () => void;
  turnstileContainerId: string;
  turnstileReady: boolean;
  onForgotPassword: () => void;
  onSwitchToSignup: () => void;
  linkedHint?: string;
  banReason?: string | null;
  bannedBy?: string | null;
}

export default function LoginForm({
  email, setEmail, password, setPassword,
  loading, error, success, setError, setSuccess,
  loginMode, setLoginMode,
  magicLinkSent, setMagicLinkSent,
  totpStep, setTotpStep,
  totpCode, setTotpCode,
  totpAvailable, pendingCredentials, setPendingCredentials,
  magicLink2faSent, setMagicLink2faSent,
  onEmailLogin, onGoogleLogin, onMagicLink, onTotpVerify,
  onClose, turnstileContainerId, turnstileReady,
  onForgotPassword, onSwitchToSignup,
  linkedHint,
  banReason, bannedBy,
}: LoginFormProps) {
  if (totpStep) {
    return (
      <div className="modal active">
        <div className="modal-content">
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
            <h2 className="text-base font-semibold"><i className="fas fa-sign-in-alt"></i> Two-Factor Auth</h2>
            <button className="text-dark-text2 cursor-pointer bg-transparent border-none hover:text-dark-text" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="p-5">
            <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-[0.8rem]">
              <i className="fas fa-shield-alt mr-2"></i>Two-factor authentication required. Enter the 6-digit code from your authenticator app, or use a magic link.
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
                <i className="fas fa-exclamation-circle mr-2"></i>{error}
              </div>
            )}

            {magicLink2faSent && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
                <i className="fas fa-check-circle mr-2"></i>Magic link sent! Check your inbox, spam/junk folder, and "All Mail" if you don&apos;t see it.
              </div>
            )}

            {totpAvailable && !magicLink2faSent && (
              <form onSubmit={onTotpVerify}>
                <div className="mb-4">
                  <label className="block text-[0.78rem] font-medium text-dark-text2 mb-1.5">Authenticator Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[1.2rem] tracking-[0.3em] text-center outline-none focus:border-qsis transition-colors font-mono"
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    autoFocus
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || totpCode.length !== 6}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <><i className="fas fa-spinner fa-spin mr-2"></i>Verifying...</>
                  ) : (
                    <><i className="fas fa-check-circle mr-2"></i>Verify & Sign In</>
                  )}
                </button>
              </form>
            )}

            {totpAvailable && !magicLink2faSent && (
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-dark-border"></div>
                <span className="text-[0.72rem] text-dark-text2">or</span>
                <div className="flex-1 h-px bg-dark-border"></div>
              </div>
            )}

            {!magicLink2faSent && (
              <button
                type="button"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text font-semibold text-[0.85rem] cursor-pointer hover:border-qsis hover:text-qsis transition-all disabled:opacity-50"
                onClick={async () => {
                  if (!pendingCredentials) return;
                  try {
                    const { sendMagicLink } = await import('@/lib/firebase');
                    await sendMagicLink(pendingCredentials.email);
                    setMagicLink2faSent(true);
                  } catch {
                    setError('Failed to send magic link. Please try again.');
                  }
                }}
              >
                <i className="fas fa-envelope mr-2"></i>Send Magic Link to {pendingCredentials?.email}
              </button>
            )}

            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-[0.78rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer hover:underline"
                onClick={() => { setTotpStep(false); setTotpCode(''); setPendingCredentials(null); setMagicLink2faSent(false); setError(''); setSuccess(''); }}
              >
                <i className="fas fa-arrow-left mr-1"></i>Back to login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (magicLinkSent) {
    return (
      <div className="modal active">
        <div className="modal-content">
          <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
            <h2 className="text-base font-semibold"><i className="fas fa-sign-in-alt"></i> Sign In</h2>
            <button className="text-dark-text2 cursor-pointer bg-transparent border-none hover:text-dark-text" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="p-5">
            {success && (
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
                <i className="fas fa-check-circle mr-2"></i>{success}
              </div>
            )}
            <div className="text-center py-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-envelope-open-text text-2xl text-green-500"></i>
              </div>
              <p className="text-[0.85rem] text-dark-text font-semibold mb-1">Check your email!</p>
              <p className="text-[0.78rem] text-dark-text2 mb-4">We sent a magic link to <strong className="text-qsis">{email}</strong></p>
              <button
                type="button"
                className="text-[0.78rem] text-qsis bg-transparent border-none cursor-pointer font-semibold hover:underline"
                onClick={() => { setMagicLinkSent(false); setSuccess(''); }}
              >
                Try another method
              </button>
            </div>
            <div className="mt-4 text-center text-[0.78rem] text-dark-text2">
              <button type="button" className="text-qsis bg-transparent border-none cursor-pointer font-semibold hover:underline text-[0.78rem]" onClick={onSwitchToSignup}>
                Don&apos;t have an account? Sign Up
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal active">
      <div className="modal-content">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-base font-semibold"><i className="fas fa-sign-in-alt"></i> Sign In</h2>
          <button className="text-dark-text2 cursor-pointer bg-transparent border-none hover:text-dark-text" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-[0.78rem]">
            <div className="flex items-start gap-2">
              <i className="fas fa-exclamation-triangle text-yellow-500 mt-0.5 flex-shrink-0"></i>
              <div>
                <span className="text-dark-text font-semibold">University emails & admin-accepted accounts</span>
                <p className="text-dark-text2 mt-1">When clicking &quot;Continue with Google&quot;, select your university email (e.g. <strong className="text-yellow-500">your_id@ugrad.iiuc.ac.bd</strong> or <strong className="text-yellow-500">name@iiuc.ac.bd</strong>). Non-university accounts accepted by admin can also sign in.</p>
              </div>
            </div>
          </div>

          {error && error !== 'YOUR_EMAIL_IS_NOT_VERIFIED' && error !== 'YOUR_ACCOUNT_IS_BANNED' && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
              <i className="fas fa-exclamation-circle mr-2"></i>{error}
            </div>
          )}

          {error === 'YOUR_EMAIL_IS_NOT_VERIFIED' && (
            <div className="mb-4 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-[0.8rem]">
              <div className="flex items-start gap-3">
                <i className="fas fa-envelope-open-text text-yellow-400 text-lg mt-0.5"></i>
                <div>
                  <p className="text-yellow-400 font-semibold mb-1">Email Not Verified</p>
                  <p className="text-dark-text2 mb-3">Please check your inbox and click the verification link before signing in. Check your spam/junk folder too.</p>
                  <button
                    type="button"
                    disabled={loading}
                    className="px-4 py-2 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 font-semibold text-[0.78rem] cursor-pointer hover:bg-yellow-500/30 transition-colors disabled:opacity-50"
                    onClick={async () => {
                      try {
                        const { signInWithEmail } = await import('@/lib/firebase');
                        const result = await signInWithEmail(email, password);
                        const actionCodeSettings = { url: `${window.location.origin}/callback`, handleCodeInApp: false };
                        const { sendEmailVerification } = await import('firebase/auth');
                        await sendEmailVerification(result.user, actionCodeSettings);
                        setSuccess('Verification email resent! Check your inbox, spam/junk folder, and "All Mail" if you don\'t see it.');
                        setError('');
                      } catch { setError('Failed to resend. Try again.'); }
                    }}
                  >
                    <i className="fas fa-redo mr-1"></i>{loading ? 'Sending...' : 'Resend Verification Email'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {error === 'YOUR_ACCOUNT_IS_BANNED' && (
            <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-[0.8rem]">
              <div className="flex items-start gap-3">
                <i className="fas fa-ban text-red-400 text-lg mt-0.5"></i>
                <div>
                  <p className="text-red-400 font-semibold mb-1">Account Suspended</p>
                  <p className="text-dark-text2">Your account has been suspended. You cannot access the system.</p>
                  {banReason && (
                    <div className="mt-2 p-2 rounded bg-dark-bg3 border border-dark-border">
                      <p className="text-[0.72rem] text-dark-text3 mb-0.5">Reason:</p>
                      <p className="text-[0.78rem] text-dark-text font-medium">{banReason}</p>
                    </div>
                  )}
                  {bannedBy && (
                    <p className="text-[0.68rem] text-dark-text3 mt-1.5">
                      <i className="fas fa-user-shield mr-1"></i>Banned by: {bannedBy}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
              <i className="fas fa-check-circle mr-2"></i>{success}
            </div>
          )}

          <div className="mb-5">
            <button
              className="flex items-center justify-center gap-3 w-full py-2.5 px-4 rounded-xl border border-dark-border bg-dark-bg3 text-dark-text font-semibold text-[0.85rem] hover:bg-dark-bg hover:border-qsis transition-all cursor-pointer"
              onClick={onGoogleLogin}
              disabled={loading}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-dark-border"></div>
            <span className="text-[0.75rem] text-dark-text2">or sign in with email</span>
            <div className="flex-1 h-px bg-dark-border"></div>
          </div>

          <div className="flex gap-2 mb-4 p-1 rounded-lg bg-dark-bg3 border border-dark-border">
            <button
              type="button"
              className={`flex-1 py-2 rounded-md text-[0.78rem] font-semibold border-none cursor-pointer transition-all ${loginMode === 'password' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text'}`}
              onClick={() => setLoginMode('password')}
            >
              <i className="fas fa-lock mr-1.5"></i>Password
            </button>
            <button
              type="button"
              className={`flex-1 py-2 rounded-md text-[0.78rem] font-semibold border-none cursor-pointer transition-all ${loginMode === 'magiclink' ? 'bg-qsis text-white' : 'bg-transparent text-dark-text2 hover:text-dark-text'}`}
              onClick={() => setLoginMode('magiclink')}
            >
              <i className="fas fa-link mr-1.5"></i>Magic Link
            </button>
          </div>

          <form onSubmit={loginMode === 'magiclink' ? onMagicLink : onEmailLogin}>
            <div className="mb-3">
              <label className="block text-[0.78rem] font-medium text-dark-text2 mb-1.5">Email or Versity ID</label>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors"
                placeholder="your_id@ugrad.iiuc.ac.bd or your versity ID"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {linkedHint && (
              <div className="mb-3 mt-1 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[0.8rem]">
                <i className="fas fa-link mr-2"></i>This email is connected to an existing account. Sign in with Magic Link or your password.
              </div>
            )}

            {loginMode === 'password' && (
              <div className="mb-4">
                <label className="block text-[0.78rem] font-medium text-dark-text2 mb-1.5">Password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors"
                  placeholder="&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {loginMode === 'magiclink' && (
              <p className="text-[0.72rem] text-dark-text2 mb-4">
                <i className="fas fa-info-circle mr-1"></i>We&apos;ll email you a sign-in link. No password needed.
              </p>
            )}

            <div className="mb-4 flex justify-center">
              <div id={turnstileContainerId}></div>
            </div>

            <button
              type="submit"
              disabled={loading || !turnstileReady}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><i className="fas fa-spinner fa-spin mr-2"></i>Sending...</>
              ) : loginMode === 'magiclink' ? (
                <><i className="fas fa-paper-plane mr-2"></i>Send Magic Link</>
              ) : (
                <><i className="fas fa-envelope mr-2"></i>Sign In with Email</>
              )}
            </button>
          </form>

          {loginMode === 'password' && (
            <div className="mt-3 text-center">
              <button type="button" className="text-[0.78rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer hover:underline" onClick={onForgotPassword}>
                Forgot your password?
              </button>
            </div>
          )}

          <div className="mt-4 text-center text-[0.78rem] text-dark-text2">
            Don&apos;t have an account?{' '}
            <button type="button" className="text-qsis bg-transparent border-none cursor-pointer font-semibold hover:underline text-[0.78rem]" onClick={onSwitchToSignup}>
              Sign Up
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
