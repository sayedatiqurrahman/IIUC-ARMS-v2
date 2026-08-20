'use client';

interface GitHubConnectionProps {
  hasGitHub: boolean;
  ghUser: any;
  ghStats: any;
  profile: any;
  showTokenModal: boolean;
  setShowTokenModal: (v: boolean) => void;
  patInput: string;
  setPatInput: (v: string) => void;
  patLoading: boolean;
  patValid: boolean | null;
  patReplacing: boolean;
  setPatReplacing: (v: boolean) => void;
  handlePastePAT: () => void;
  handleDisconnect: () => void;
}

export default function GitHubConnection({
  hasGitHub, ghUser, ghStats, profile,
  showTokenModal, setShowTokenModal,
  patInput, setPatInput, patLoading, patValid, patReplacing, setPatReplacing,
  handlePastePAT, handleDisconnect,
}: GitHubConnectionProps) {
  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-2xl p-5 mb-4">
      <h4 className="text-[0.95rem] font-semibold mb-3 flex items-center gap-2">
        <i className="fab fa-github"></i> GitHub Connection
      </h4>

      {hasGitHub && ghUser ? (
        <div className="bg-dark-bg3 border border-dark-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-3">
            <img src={ghUser.avatar_url} alt="" className="w-12 h-12 rounded-full border-2 border-dark-border" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[0.9rem] font-bold">{ghUser.name || ghUser.login}</span>
                {profile.title ? (
                  <span className="text-[0.72rem] text-qsis font-medium">{profile.title}</span>
                ) : (
                  <span className="text-[0.72rem] text-dark-text2">@{ghUser.login}</span>
                )}
              </div>
              {ghUser.bio && <p className="text-[0.72rem] text-dark-text2 truncate mt-0.5">{ghUser.bio}</p>}
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-[0.68rem] text-green-400">
                  Connected via Personal Access Token
                </span>
              </div>
            </div>
          </div>

          {ghStats && (
            <div className="flex gap-2 flex-wrap mb-3">
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                <i className="fas fa-book text-qsis text-[0.6rem]"></i>
                <span className="text-[0.72rem] font-semibold">{ghStats.public_repos}</span>
                <span className="text-[0.6rem] text-dark-text2">repos</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                <i className="fas fa-users text-accent text-[0.6rem]"></i>
                <span className="text-[0.72rem] font-semibold">{ghStats.followers}</span>
                <span className="text-[0.6rem] text-dark-text2">followers</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                <i className="fas fa-user-friends text-green-400 text-[0.6rem]"></i>
                <span className="text-[0.72rem] font-semibold">{ghStats.following}</span>
                <span className="text-[0.6rem] text-dark-text2">following</span>
              </div>
              {ghStats.created_at && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                  <i className="fas fa-calendar text-yellow-500 text-[0.6rem]"></i>
                  <span className="text-[0.6rem] text-dark-text2">Joined {new Date(ghStats.created_at).getFullYear()}</span>
                </div>
              )}
              {ghStats.location && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-bg border border-dark-border">
                  <i className="fas fa-map-marker-alt text-red-400 text-[0.6rem]"></i>
                  <span className="text-[0.6rem] text-dark-text2">{ghStats.location}</span>
                </div>
              )}
            </div>
          )}

          {(!profile.githubToken?.startsWith('ghp_') && !profile.githubToken?.startsWith('github_pat_')) ? (
            <div className="bg-qsis/5 border border-qsis/20 rounded-xl p-3 mb-3">
              <p className="text-[0.78rem] text-qsis font-semibold mb-1"><i className="fas fa-star mr-1"></i>Appear in Contributors List</p>
              <p className="text-[0.72rem] text-dark-text2 mb-2">Add a Personal Access Token to show your name in our Contributors page.</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.75rem] outline-none focus:border-qsis transition-colors"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={patInput}
                  onChange={e => setPatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePastePAT()}
                />
                <button
                  className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                  onClick={handlePastePAT}
                  disabled={!patInput.trim() || patLoading}
                >
                  {patLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-1"></i>Save</>}
                </button>
              </div>
              <a href="https://github.com/settings/tokens/new?scopes=repo,user:follow&description=IIUC-ARMS" target="_blank" rel="noopener noreferrer" className="text-[0.68rem] text-dark-text2 hover:text-qsis mt-2 inline-block no-underline">
                <i className="fas fa-external-link-alt mr-1"></i>Create new token (No expiry, repo scope)
              </a>
            </div>
          ) : patValid === false ? (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-amber-400">
                  <i className="fas fa-exclamation-triangle"></i>
                  <span className="text-[0.72rem] font-semibold">PAT expired or invalid — Reconnect to appear in Contributors</span>
                </div>
                <button
                  className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                  onClick={() => { setPatInput(''); }}
                  disabled={patLoading}
                >
                  <i className="fas fa-redo mr-1"></i>Reconnect
                </button>
              </div>
            </div>
          ) : (
            patReplacing ? (
              <div className="bg-qsis/5 border border-qsis/20 rounded-xl p-3 mb-3">
                <div className="flex items-center gap-1.5 text-[0.72rem] text-qsis font-semibold mb-2">
                  <i className="fas fa-key"></i>
                  <span>Paste your new Personal Access Token</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    className="flex-1 px-3 py-1.5 rounded-lg bg-dark-bg border border-dark-border text-dark-text text-[0.72rem] font-mono focus:outline-none focus:border-qsis"
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={patInput}
                    onChange={e => setPatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handlePastePAT()}
                    autoFocus
                  />
                  <button
                    className="px-3 py-1.5 rounded-lg bg-qsis text-white text-[0.72rem] font-semibold cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 whitespace-nowrap"
                    onClick={handlePastePAT}
                    disabled={!patInput.trim() || patLoading}
                  >
                    {patLoading ? <i className="fas fa-spinner fa-spin"></i> : <><i className="fas fa-check mr-1"></i>Confirm</>}
                  </button>
                  <button
                    className="px-3 py-1.5 rounded-lg bg-dark-border text-dark-text2 text-[0.72rem] font-semibold cursor-pointer hover:text-dark-text transition-colors whitespace-nowrap"
                    onClick={() => { setPatReplacing(false); setPatInput(''); }}
                  >
                    Cancel
                  </button>
                </div>
                <a href="https://github.com/settings/tokens/new?scopes=repo,user:follow&description=IIUC-ARMS" target="_blank" rel="noopener noreferrer" className="text-[0.68rem] text-dark-text2 hover:text-qsis mt-2 inline-block no-underline">
                  <i className="fas fa-external-link-alt mr-1"></i>Create new token (No expiry, repo scope)
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 text-[0.72rem] text-qsis mb-3 bg-qsis/5 border border-qsis/20 rounded-xl p-3">
                <div className="flex items-center gap-1.5">
                  <i className="fas fa-check-circle"></i>
                  <span className="font-semibold">PAT saved — visible in Contributors list</span>
                </div>
                <button
                  className="text-[0.68rem] text-dark-text2 hover:text-qsis bg-transparent border-none cursor-pointer underline"
                  onClick={() => { setPatReplacing(true); setPatInput(''); }}
                >
                  Replace
                </button>
              </div>
            )
          )}

          <div className="flex gap-2 flex-wrap">
            <a href={`https://github.com/${ghUser.login}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.72rem] font-semibold cursor-pointer hover:border-qsis hover:text-qsis transition-all no-underline">
              <i className="fab fa-github"></i> View Profile
            </a>
            <button className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 text-[0.72rem] font-semibold cursor-pointer hover:bg-red-500/20 transition-all" onClick={handleDisconnect}>
              <i className="fas fa-unlink mr-1"></i> Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-dark-bg3 border border-dark-border">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <i className="fas fa-unlink text-red-500"></i>
            </div>
            <div className="flex-1">
              <span className="text-[0.85rem] font-semibold block">Not Connected</span>
              <span className="text-[0.72rem] text-dark-text2">Connect with a Personal Access Token to appear in Contributors</span>
            </div>
          </div>
          <button className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-gradient-to-br from-qsis to-qsis-dark text-white text-[0.85rem] font-bold cursor-pointer hover:opacity-90 transition-all shadow-lg shadow-qsis/20" onClick={() => setShowTokenModal(true)}>
            <i className="fas fa-key"></i> Connect with Personal Access Token
          </button>
          <div className="p-2.5 rounded-lg bg-qsis/5 border border-qsis/15">
            <p className="text-[0.68rem] text-dark-text2 text-center leading-relaxed">
              <i className="fas fa-info-circle mr-1 text-qsis"></i>
              A <strong className="text-dark-text">PAT</strong> credits your uploads to you and shows you in the Contributors list.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
