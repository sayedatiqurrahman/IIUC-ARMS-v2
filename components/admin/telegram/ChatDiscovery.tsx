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
  const [fetched, setFetched] = useState(false);

  async function discover() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/telegram/my-chats');
      const data = await res.json();
      if (data.success) {
        let filtered = data.chats || [];
        if (filter === 'group') filtered = data.groups || [];
        else if (filter === 'channel') filtered = data.channels || [];
        setChats(filtered);
        setBotInfo(data.bot);
        setFetched(true);
      } else {
        setError(data.error || 'Failed to discover chats');
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
      <div className="flex items-center justify-between px-4 py-3 bg-dark-bg3">
        <div>
          <p className="text-sm font-medium text-dark-text">Discover Bot Chats</p>
          {botInfo && (
            <p className="text-xs text-dark-text2">
              Bot: @{botInfo.username} ({botInfo.name})
            </p>
          )}
        </div>
        <button
          onClick={discover}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-qsis/15 text-qsis text-xs font-medium hover:bg-qsis/25 transition disabled:opacity-50"
        >
          {loading ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-search mr-1"></i>}
          {fetched ? 'Refresh' : 'Discover'}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs">
          <i className="fas fa-exclamation-circle mr-1"></i>{error}
        </div>
      )}

      {chats.length > 0 && (
        <div className="max-h-64 overflow-y-auto divide-y divide-dark-border">
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

      {fetched && chats.length === 0 && !error && (
        <div className="px-4 py-6 text-center text-dark-text2 text-xs">
          <i className="fas fa-inbox text-lg mb-2 block opacity-50"></i>
          No chats found. Make sure the bot has been added to groups/channels and has received at least one message.
        </div>
      )}
    </div>
  );
}
