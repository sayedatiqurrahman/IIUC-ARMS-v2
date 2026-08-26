'use client';

import { useState } from 'react';

interface ChatInfo {
  id: number;
  title: string;
  type: string;
  username?: string;
  memberCount?: number;
}

interface Props {
  onSelect: (chatId: string, chatTitle: string) => void;
  filter?: 'group' | 'channel' | 'all';
}

export default function TelegramChatDiscovery({ onSelect, filter = 'all' }: Props) {
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState<ChatInfo[]>([]);
  const [botInfo, setBotInfo] = useState<{ username: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [step, setStep] = useState<'idle' | 'dropped' | 'fetched'>('idle');

  async function discover() {
    setLoading(true);
    setError('');
    setHint('');
    try {
      if (step === 'idle' || step === 'fetched') {
        // Step 1: Drop webhook
        const res = await fetch('/api/telegram/my-chats?step=drop');
        const data = await res.json();
        if (data.success) {
          setBotInfo(data.bot);
          setStep('dropped');
          setHint('Now send a test message in each Telegram group/channel, then click "Fetch Chats" below.');
        } else {
          setError(data.error || 'Failed to drop webhook');
        }
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchChats() {
    setLoading(true);
    setError('');
    setHint('');
    try {
      const res = await fetch('/api/telegram/my-chats?step=fetch');
      const data = await res.json();
      if (data.success) {
        let filtered = data.chats || [];
        if (filter === 'group') filtered = data.groups || [];
        else if (filter === 'channel') filtered = data.channels || [];
        setChats(filtered);
        setBotInfo(data.bot);
        setStep('fetched');
        if (data.hint) setHint(data.hint);
      } else {
        setError(data.error || 'Failed to fetch chats');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  const typeIcon = (type: string) => {
    switch (type) {
      case 'channel': return 'fa-bullhorn text-purple-400';
      case 'supergroup': return 'fa-users text-blue-400';
      case 'group': return 'fa-user-friends text-cyan-400';
      case 'private': return 'fa-user text-emerald-400';
      default: return 'fa-circle text-gray-400';
    }
  };

  return (
    <div className="border border-dark-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-dark-bg3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-sm font-medium text-dark-text">Discover Bot Chats</p>
            {botInfo && (
              <p className="text-xs text-dark-text2">
                Bot: @{botInfo.username} ({botInfo.name})
              </p>
            )}
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mt-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${step === 'idle' ? 'bg-qsis/15 text-qsis' : step === 'dropped' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
            {step === 'idle' ? <i className="fas fa-circle text-[6px]"></i> : step === 'dropped' ? <i className="fas fa-check text-[8px]"></i> : <i className="fas fa-check text-[8px]"></i>}
            1. Drop Webhook
          </div>
          <i className="fas fa-arrow-right text-dark-text2 text-[10px]"></i>
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${step === 'fetched' ? 'bg-emerald-500/15 text-emerald-400' : step === 'dropped' ? 'bg-qsis/15 text-qsis' : 'bg-dark-bg2 text-dark-text2'}`}>
            {step === 'fetched' ? <i className="fas fa-check text-[8px]"></i> : <i className="fas fa-circle text-[6px]"></i>}
            2. Fetch Chats
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs">
          <i className="fas fa-exclamation-circle mr-1"></i>{error}
        </div>
      )}

      {hint && (
        <div className="px-4 py-3 bg-blue-500/10 border-t border-blue-500/20 text-blue-400 text-xs">
          <i className="fas fa-info-circle mr-1"></i>{hint}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 py-3 border-t border-dark-border flex gap-2">
        {step === 'idle' || step === 'fetched' ? (
          <button
            onClick={discover}
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-medium hover:bg-amber-500/25 transition disabled:opacity-50"
          >
            {loading ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-plug mr-1"></i>}
            {step === 'fetched' ? 'Re-Drop Webhook' : '1. Drop Webhook'}
          </button>
        ) : null}
        {step === 'dropped' ? (
          <button
            onClick={fetchChats}
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg bg-qsis/15 text-qsis text-xs font-medium hover:bg-qsis/25 transition disabled:opacity-50"
          >
            {loading ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-search mr-1"></i>}
            2. Fetch Chats
          </button>
        ) : null}
      </div>

      {/* Results */}
      {chats.length > 0 && (
        <div className="max-h-64 overflow-y-auto divide-y divide-dark-border border-t border-dark-border">
          {chats.map(chat => (
            <button
              key={chat.id}
              onClick={() => onSelect(String(chat.id), chat.title)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-dark-bg3 transition text-left"
            >
              <i className={`fas ${typeIcon(chat.type)} w-4 text-center`}></i>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-dark-text truncate">{chat.title}</p>
                <p className="text-xs text-dark-text2">
                  {chat.type}
                  {chat.username ? ` @${chat.username}` : ''}
                  {chat.memberCount ? ` · ${chat.memberCount} members` : ''}
                </p>
              </div>
              <span className="text-xs text-dark-text2 font-mono">{chat.id}</span>
            </button>
          ))}
        </div>
      )}

      {step === 'fetched' && chats.length === 0 && !error && (
        <div className="px-4 py-6 text-center text-dark-text2 text-xs border-t border-dark-border">
          <i className="fas fa-inbox text-lg mb-2 block opacity-50"></i>
          No chats found. Make sure you sent a test message in each group AFTER dropping the webhook.
          <br />
          <span className="text-dark-text3">Try: Drop Webhook → Send messages → Fetch Chats</span>
        </div>
      )}
    </div>
  );
}
