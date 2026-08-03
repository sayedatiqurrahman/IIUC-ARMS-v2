'use client';

export default function BotStatus({ botStatus, botInfo, connectedCount }: {
  botStatus: 'loading' | 'ok' | 'error';
  botInfo: any;
  connectedCount: number;
}) {
  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${botStatus === 'ok' ? 'bg-green-400' : botStatus === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`}></div>
        <div className="flex-1">
          <p className="text-dark-text text-sm font-semibold">IIUC-ARMS Bot</p>
          <p className="text-dark-text3 text-[0.72rem]">
            {botStatus === 'ok' ? `Bot is online · ${botInfo?.users || 0} registered users` : botStatus === 'loading' ? 'Checking...' : 'Bot is offline or token missing'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-green-400 text-[0.82rem] font-bold">{connectedCount}</p>
          <p className="text-dark-text3 text-[0.65rem]">Connected</p>
        </div>
      </div>
    </div>
  );
}
