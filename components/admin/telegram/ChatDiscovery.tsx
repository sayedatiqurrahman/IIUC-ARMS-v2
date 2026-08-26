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
  const [source, setSource] = useState<{ logged: number; extra: number } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
        setSource(data.source);
      } else {
        setError(data.error || 'Failed to discover chats');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  function copyId(id: number) {
    navigator.clipboard.writeText(String(id));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function selectChat(chat: ChatInfo) {
    setSelectedId(chat.id);
    onSelect(String(chat.id), chat.title);
  }

  const typeBadge = (type: string) => {
    switch (type) {
      case 'channel': return { label: 'Channel', bg: 'bg-purple-500/15', text: 'text-purple-400', icon: 'fa-bullhorn' };
      case 'supergroup': return { label: 'Supergroup', bg: 'bg-blue-500/15', text: 'text-blue-400', icon: 'fa-users' };
      case 'group': return { label: 'Group', bg: 'bg-cyan-500/15', text: 'text-cyan-400', icon: 'fa-user-friends' };
      case 'private': return { label: 'Private', bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: 'fa-user' };
      default: return { label: type, bg: 'bg-gray-500/15', text: 'text-gray-400', icon: 'fa-circle' };
    }
  };

  return (
    <div className="border border-dark-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-dark-bg3">
        <div className="flex items-center justify-between">
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
            {loading ? <i className="fas fa-spinner fa-spin mr-1"></i> : <i className="fas fa-refresh mr-1"></i>}
            {chats.length > 0 ? 'Refresh' : 'Discover'}
          </button>
        </div>
        {source && (
          <p className="text-[0.65rem] text-dark-text3 mt-1">
            Found {source.logged} from webhook logs{source.extra > 0 ? ` + ${source.extra} extra` : ''}
          </p>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs">
          <i className="fas fa-exclamation-circle mr-1"></i>{error}
        </div>
      )}

      {/* Chat cards — profile style */}
      {chats.length > 0 && (
        <div className="max-h-80 overflow-y-auto divide-y divide-dark-border">
          {chats.map(chat => {
            const badge = typeBadge(chat.type);
            const isSelected = selectedId === chat.id;
            const isCopied = copiedId === chat.id;
            return (
              <div
                key={chat.id}
                className={`px-4 py-3 transition ${isSelected ? 'bg-qsis/10' : 'hover:bg-dark-bg3'}`}
              >
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full ${badge.bg} flex items-center justify-center flex-shrink-0`}>
                    <i className={`fas ${badge.icon} ${badge.text} text-sm`}></i>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-text truncate">{chat.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text} font-medium`}>
                        {badge.label}
                      </span>
                      {chat.username && (
                        <span className="text-[0.65rem] text-dark-text2">@{chat.username}</span>
                      )}
                      {chat.memberCount && (
                        <span className="text-[0.65rem] text-dark-text3">
                          <i className="fas fa-users mr-0.5"></i>{chat.memberCount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* Copy ID button */}
                    <button
                      onClick={() => copyId(chat.id)}
                      className={`px-2 py-1 rounded-lg text-xs font-mono transition ${
                        isCopied
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-dark-bg2 border border-dark-border text-dark-text2 hover:text-dark-text hover:border-dark-text2'
                      }`}
                      title="Click to copy chat ID"
                    >
                      {isCopied ? (
                        <><i className="fas fa-check mr-1"></i>Copied!</>
                      ) : (
                        <><i className="fas fa-copy mr-1"></i>{chat.id}</>
                      )}
                    </button>

                    {/* Select button */}
                    <button
                      onClick={() => selectChat(chat)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                        isSelected
                          ? 'bg-qsis text-white'
                          : 'bg-qsis/15 text-qsis hover:bg-qsis/25'
                      }`}
                    >
                      {isSelected ? <i className="fas fa-check"></i> : 'Select'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {chats.length === 0 && !error && !loading && (
        <div className="px-4 py-6 text-center text-dark-text2 text-xs">
          <i className="fas fa-inbox text-lg mb-2 block opacity-50"></i>
          No chats found yet. The bot logs chats automatically when it receives messages.
          <br />
          <span className="text-dark-text3">Send a message in your groups, then click Discover.</span>
        </div>
      )}
    </div>
  );
}
