'use client';

import { useState } from 'react';

export default function ChannelBroadcast() {
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState('');

  async function handleBroadcast() {
    if (!broadcastMsg.trim()) return;
    setBroadcastLoading(true);
    setBroadcastResult('');
    try {
      const res = await fetch('/api/telegram/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: broadcastMsg.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setBroadcastResult('Message sent to channel!');
        setBroadcastMsg('');
      } else {
        setBroadcastResult(data.error || 'Failed to send');
      }
    } catch {
      setBroadcastResult('Network error');
    } finally {
      setBroadcastLoading(false);
    }
  }

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
      <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-bullhorn text-yellow-400 mr-2"></i>Channel Broadcast</h4>
      <textarea
        className="w-full px-3 py-2 rounded-lg border border-dark-border bg-dark-bg text-dark-text text-[0.82rem] outline-none focus:border-qsis resize-y min-h-[80px] mb-2"
        placeholder="Type your announcement message... (HTML supported: <b>bold</b>, <i>italic</i>, <code>code</code>)"
        value={broadcastMsg}
        onChange={e => setBroadcastMsg(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleBroadcast}
          disabled={broadcastLoading || !broadcastMsg.trim()}
          className="px-4 py-2 rounded-lg bg-yellow-500 text-white text-[0.78rem] font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
        >
          {broadcastLoading ? <><i className="fas fa-spinner fa-spin mr-1"></i>Sending...</> : <><i className="fas fa-paper-plane mr-1"></i>Send to Channel</>}
        </button>
        {broadcastResult && (
          <span className={`text-[0.72rem] ${broadcastResult.includes('success') ? 'text-green-400' : 'text-red-400'}`}>{broadcastResult}</span>
        )}
      </div>
      <p className="text-[0.68rem] text-dark-text3 mt-2">
        <i className="fas fa-info-circle mr-1"></i>
        Sends to the Telegram channel (@iiuc_arms). Use department notification above for DMs.
      </p>
    </div>
  );
}
