'use client';

import { useState, useEffect } from 'react';
import ChatDiscovery from './ChatDiscovery';

interface SupportConfig {
  maleChatId?: string;
  femaleChatId?: string;
  maleGroupName?: string;
  femaleGroupName?: string;
  enabled?: boolean;
}

interface PostingChannel {
  id: string;
  name: string;
  chatId: string;
  type: 'channel' | 'group';
  autoPost?: boolean;
  categories?: string[];
}

interface Props {
  onSave?: () => void;
}

export default function SupportConfigTab({ onSave }: Props) {
  const [config, setConfig] = useState<SupportConfig>({ enabled: false });
  const [postingChannels, setPostingChannels] = useState<PostingChannel[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showDiscovery, setShowDiscovery] = useState<'support-male' | 'support-female' | 'posting' | null>(null);

  useEffect(() => {
    fetch('/api/settings/support-config')
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setConfig(data.supportConfig || {});
          setPostingChannels(data.postingChannels || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch('/api/settings/support-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supportConfig: config, postingChannels }),
      });
      const data = await res.json();
      setResult(data.success ? { ok: true, msg: 'Saved!' } : { ok: false, msg: data.error || 'Failed' });
      if (data.success) onSave?.();
    } catch {
      setResult({ ok: false, msg: 'Network error' });
    } finally {
      setSaving(false);
    }
  }

  function handleChatSelect(target: string, chatId: string, chatTitle: string) {
    if (target === 'support-male') {
      setConfig(prev => ({ ...prev, maleChatId: chatId, maleGroupName: chatTitle }));
    } else if (target === 'support-female') {
      setConfig(prev => ({ ...prev, femaleChatId: chatId, femaleGroupName: chatTitle }));
    } else if (target === 'posting') {
      if (!postingChannels.find(c => c.chatId === chatId)) {
        setPostingChannels(prev => [...prev, { id: `ch-${Date.now()}`, name: chatTitle, chatId, type: chatTitle.includes('Group') ? 'group' : 'channel', autoPost: false, categories: [] }]);
      }
    }
    setShowDiscovery(null);
  }

  if (loading) {
    return <div className="text-center py-8 text-dark-text2 text-sm"><i className="fas fa-spinner fa-spin mr-2"></i>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Support Groups */}
      <div>
        <h4 className="text-sm font-semibold text-dark-text mb-3">
          <i className="fas fa-headset text-qsis mr-2"></i>Support Telegram Groups
        </h4>

        {/* Enable/Disable */}
        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <div
            onClick={() => setConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
            className={`w-10 h-6 rounded-full transition-colors relative ${config.enabled ? 'bg-qsis' : 'bg-dark-bg3 border border-dark-border'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-1'}`}></div>
          </div>
          <span className="text-sm text-dark-text">{config.enabled ? 'Support system enabled' : 'Support system disabled'}</span>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Male Group */}
          <div className="p-4 rounded-xl bg-dark-bg3 border border-dark-border">
            <div className="flex items-center gap-2 mb-3">
              <i className="fas fa-mars text-blue-400"></i>
              <span className="text-sm font-medium text-dark-text">Male Support Group</span>
            </div>
            <input
              type="text"
              value={config.maleChatId || ''}
              onChange={e => setConfig(prev => ({ ...prev, maleChatId: e.target.value }))}
              placeholder="Chat ID (e.g. -1001234567890)"
              className="w-full px-3 py-2 rounded-lg bg-dark-bg2 border border-dark-border text-dark-text text-xs font-mono mb-2 focus:outline-none focus:border-qsis"
            />
            <input
              type="text"
              value={config.maleGroupName || ''}
              onChange={e => setConfig(prev => ({ ...prev, maleGroupName: e.target.value }))}
              placeholder="Group name (for display)"
              className="w-full px-3 py-2 rounded-lg bg-dark-bg2 border border-dark-border text-dark-text text-xs mb-2 focus:outline-none focus:border-qsis"
            />
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                onClick={() => setShowDiscovery(showDiscovery === 'support-male' ? null : 'support-male')}
                className="text-xs text-qsis hover:underline"
              >
                <i className="fas fa-search mr-1"></i>Auto-discover from bot
              </button>
            </div>
            <p className="text-[0.65rem] text-dark-text3">
              Or get ID manually: add <a href="https://t.me/getidsbot" target="_blank" rel="noopener noreferrer" className="text-qsis hover:underline">@getidsbot</a> to your group
            </p>
            {showDiscovery === 'support-male' && (
              <div className="mt-2">
                <ChatDiscovery onSelect={(id, title) => handleChatSelect('support-male', id, title)} filter="group" />
              </div>
            )}
          </div>

          {/* Female Group */}
          <div className="p-4 rounded-xl bg-dark-bg3 border border-dark-border">
            <div className="flex items-center gap-2 mb-3">
              <i className="fas fa-venus text-pink-400"></i>
              <span className="text-sm font-medium text-dark-text">Female Support Group</span>
            </div>
            <input
              type="text"
              value={config.femaleChatId || ''}
              onChange={e => setConfig(prev => ({ ...prev, femaleChatId: e.target.value }))}
              placeholder="Chat ID (e.g. -1001234567890)"
              className="w-full px-3 py-2 rounded-lg bg-dark-bg2 border border-dark-border text-dark-text text-xs font-mono mb-2 focus:outline-none focus:border-qsis"
            />
            <input
              type="text"
              value={config.femaleGroupName || ''}
              onChange={e => setConfig(prev => ({ ...prev, femaleGroupName: e.target.value }))}
              placeholder="Group name (for display)"
              className="w-full px-3 py-2 rounded-lg bg-dark-bg2 border border-dark-border text-dark-text text-xs mb-2 focus:outline-none focus:border-qsis"
            />
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                onClick={() => setShowDiscovery(showDiscovery === 'support-female' ? null : 'support-female')}
                className="text-xs text-qsis hover:underline"
              >
                <i className="fas fa-search mr-1"></i>Auto-discover from bot
              </button>
            </div>
            <p className="text-[0.65rem] text-dark-text3">
              Or get ID manually: add <a href="https://t.me/getidsbot" target="_blank" rel="noopener noreferrer" className="text-qsis hover:underline">@getidsbot</a> to your group
            </p>
            {showDiscovery === 'support-female' && (
              <div className="mt-2">
                <ChatDiscovery onSelect={(id, title) => handleChatSelect('support-female', id, title)} filter="group" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Posting Channels */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-dark-text">
            <i className="fas fa-share-nodes text-cyan-400 mr-2"></i>Content Posting Channels
          </h4>
          <button
            onClick={() => setShowDiscovery(showDiscovery === 'posting' ? null : 'posting')}
            className="px-3 py-1.5 rounded-lg bg-dark-bg3 border border-dark-border text-xs text-dark-text2 hover:text-dark-text transition"
          >
            <i className="fas fa-plus mr-1"></i>Add Channel
          </button>
        </div>
        <p className="text-xs text-dark-text2 mb-3">
          Select Telegram channels/groups where notices, blogs, and tutorials will be posted automatically.
        </p>

        {showDiscovery === 'posting' && (
          <div className="mb-4">
            <ChatDiscovery onSelect={(id, title) => handleChatSelect('posting', id, title)} filter="all" />
          </div>
        )}

        {postingChannels.length > 0 ? (
          <div className="space-y-2">
            {postingChannels.map(ch => (
              <div key={ch.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-dark-bg3 border border-dark-border">
                <i className={`fas ${ch.type === 'channel' ? 'fa-bullhorn text-purple-400' : 'fa-users text-blue-400'}`}></i>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-dark-text truncate">{ch.name}</p>
                  <p className="text-xs text-dark-text2 font-mono">{ch.chatId}</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-dark-text2">Auto-post</span>
                  <div
                    onClick={() => setPostingChannels(prev => prev.map(c => c.id === ch.id ? { ...c, autoPost: !c.autoPost } : c))}
                    className={`w-8 h-5 rounded-full transition-colors relative ${ch.autoPost ? 'bg-qsis' : 'bg-dark-bg2 border border-dark-border'}`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-transform ${ch.autoPost ? 'translate-x-[14px]' : 'translate-x-[3px]'}`}></div>
                  </div>
                </label>
                <button
                  onClick={() => setPostingChannels(prev => prev.filter(c => c.id !== ch.id))}
                  className="text-dark-text2 hover:text-red-400 transition p-1"
                >
                  <i className="fas fa-times text-xs"></i>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 rounded-xl bg-dark-bg3 border border-dark-border text-dark-text2 text-xs">
            <i className="fas fa-inbox text-lg mb-2 block opacity-50"></i>
            No channels added yet. Click "Add Channel" to discover and add Telegram channels/groups.
          </div>
        )}
      </div>

      {/* Save */}
      {result && (
        <div className={`text-xs px-4 py-2 rounded-lg ${result.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          {result.msg}
        </div>
      )}
      <button
        onClick={save}
        disabled={saving}
        className="px-5 py-2.5 rounded-xl bg-qsis hover:bg-qsis/90 text-white text-sm font-semibold transition disabled:opacity-50"
      >
        {saving ? <><i className="fas fa-spinner fa-spin mr-2"></i>Saving...</> : <><i className="fas fa-save mr-2"></i>Save Configuration</>}
      </button>
    </div>
  );
}
