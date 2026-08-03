'use client';

interface ForgotPasswordProps {
  email: string;
  setEmail: (v: string) => void;
  loading: boolean;
  error: string;
  success: string;
  sent: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}

export default function ForgotPassword({ email, setEmail, loading, error, success, sent, onSubmit, onBack }: ForgotPasswordProps) {
  return (
    <div className="modal active">
      <div className="modal-content">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border">
          <h2 className="text-base font-semibold"><i className="fas fa-key"></i> Forgot Password</h2>
          <button className="text-dark-text2 cursor-pointer bg-transparent border-none hover:text-dark-text" onClick={onBack}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[0.8rem]">
              <i className="fas fa-exclamation-circle mr-2"></i>{error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-[0.8rem]">
              <i className="fas fa-check-circle mr-2"></i>{success}
            </div>
          )}

          {!sent ? (
            <form onSubmit={onSubmit}>
              <p className="text-[0.82rem] text-dark-text2 mb-4">Enter your email address and we&apos;ll send you a link to reset your password.</p>
              <div className="mb-4">
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white font-semibold text-[0.85rem] border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><i className="fas fa-spinner fa-spin mr-2"></i>Sending...</>
                ) : (
                  <><i className="fas fa-paper-plane mr-2"></i>Send Reset Link</>
                )}
              </button>
            </form>
          ) : (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-check text-2xl text-green-500"></i>
              </div>
              <p className="text-[0.85rem] text-dark-text mb-2">Check your email!</p>
              <p className="text-[0.78rem] text-dark-text2">We sent a password reset link to <strong>{email}</strong>. Check your spam/junk folder and &quot;All Mail&quot; if you don&apos;t see it.</p>
            </div>
          )}

          <div className="mt-4 text-center text-[0.78rem] text-dark-text2">
            <button
              type="button"
              className="text-qsis bg-transparent border-none cursor-pointer font-semibold hover:underline text-[0.78rem]"
              onClick={onBack}
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
