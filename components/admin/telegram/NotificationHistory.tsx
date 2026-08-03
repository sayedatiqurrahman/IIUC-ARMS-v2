'use client';

import { useState, useEffect } from 'react';

export default function NotificationHistory({ refreshTrigger }: { refreshTrigger?: number }) {
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  function loadHistory() {
    setHistoryLoading(true);
    fetch('/api/telegram/department-notify?action=history&limit=20')
      .then(r => r.json())
      .then(data => { setHistory(data.history || []); setHistoryLoading(false); })
      .catch(() => setHistoryLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    if (refreshTrigger) loadHistory();
  }, [refreshTrigger]);

  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-dark-text text-sm font-semibold"><i className="fas fa-history text-dark-text2 mr-2"></i>Notification History</h4>
        <button onClick={loadHistory} className="text-[0.7rem] text-qsis hover:underline cursor-pointer bg-transparent border-none">Refresh</button>
      </div>
      {historyLoading ? (
        <p className="text-dark-text3 text-[0.78rem]"><i className="fas fa-spinner fa-spin mr-1"></i>Loading...</p>
      ) : history.length === 0 ? (
        <p className="text-dark-text3 text-[0.78rem]">No notifications sent yet.</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {history.map((h: any) => (
            <div key={h.id} className="bg-dark-bg rounded-lg p-3 border border-dark-border">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[0.7rem] px-1.5 py-0.5 rounded bg-dark-bg3 text-dark-text2 font-mono">{h.type}</span>
                    <span className="text-[0.7rem] text-dark-text3">{h.department}</span>
                  </div>
                  <p className="text-[0.78rem] text-dark-text font-medium truncate">{h.title}</p>
                  <p className="text-[0.68rem] text-dark-text3 truncate mt-0.5">{h.message.substring(0, 100)}...</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[0.75rem] text-green-400 font-bold">{h.recipientCount}</p>
                  <p className="text-[0.6rem] text-dark-text3">sent</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[0.62rem] text-dark-text3">
                <span><i className="fas fa-user mr-0.5"></i>{h.sentBy || 'system'}</span>
                <span>·</span>
                <span>{new Date(h.sentAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
