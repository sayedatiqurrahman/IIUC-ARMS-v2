'use client';

interface SignupFormProps {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  loading: boolean;
  error: string;
  success: string;
  onEmailSignup: (e: React.FormEvent) => void;
  onGoogleLogin: () => void;
  onClose: () => void;
  turnstileContainerId: string;
  turnstileReady: boolean;
  onSwitchToLogin: () => void;
}

export default function SignupForm({
  email, setEmail, password, setPassword,
  loading, error, success,
  onEmailSignup, onGoogleLogin, onClose,
  turnstileContainerId, turnstileReady,
  onSwitchToLogin,
}: SignupFormProps) {
  return (
    <div className="modal active">
      <div className="modal-content">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-base font-semibold"><i className="fas fa-sign-in-alt"></i> Sign Up</h2>
          <button className="text-dark-text2 cursor-pointer bg-transparent border-none hover:text-dark-text" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-5">
          {/* Warning banner */}
          <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-[0.78rem]">
            <div className="flex items-start gap-2">
              <i className="fas fa-exclamation-triangle text-yellow-500 mt-0.5 flex-shrink-0"></i>
              <div>
                <span className="text-dark-text font-semibold">University emails & admin-accepted accounts</span>
                <p className="text-dark-text2 mt-1">When clicking &quot;Continue with Google&quot;, select your university email (e.g. <strong className="text-yellow-500">your_id@ugrad.iiuc.ac.bd</strong> or <strong className="text-yellow-500">name@iiuc.ac.bd</strong>). Non-university accounts accepted by admin can also sign in.</p>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
              <i className="fas fa-exclamation-circle mr-2"></i>{error}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
              <i className="fas fa-check-circle mr-2"></i>{success}
            </div>
          )}

          {/* Google Login */}
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

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-dark-border"></div>
            <span className="text-[0.75rem] text-dark-text2">or sign up with email</span>
            <div className="flex-1 h-px bg-dark-border"></div>
          </div>

          {/* Signup Form */}
          <form onSubmit={onEmailSignup}>
            <div className="mb-3">
              <label className="block text-[0.78rem] font-medium text-dark-text2 mb-1.5">University Email</label>
              <input
                type="email"
                className="w-full px-3 py-2.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.85rem] outline-none focus:border-qsis transition-colors"
                placeholder="your_id@ugrad.iiuc.ac.bd"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

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

            {/* Turnstile Widget */}
            <div className="mb-4 flex justify-center">
              <div id={turnstileContainerId}></div>
            </div>

            <button
              type="submit"
              disabled={loading || !turnstileReady}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><i className="fas fa-spinner fa-spin mr-2"></i>Creating account...</>
              ) : (
                <><i className="fas fa-envelope mr-2"></i>Sign Up with Email</>
              )}
            </button>
          </form>

          <div className="mt-4 text-center text-[0.78rem] text-dark-text2">
            Already have an account?{' '}
            <button
              type="button"
              className="text-qsis bg-transparent border-none cursor-pointer font-semibold hover:underline text-[0.78rem]"
              onClick={onSwitchToLogin}
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
