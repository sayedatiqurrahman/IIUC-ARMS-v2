'use client';

const botCommands = [
  { cmd: '/start', desc: 'Welcome message & main menu' },
  { cmd: '/help', desc: 'List all available commands' },
  { cmd: '/connect', desc: 'Link your IIUC-ARMS account (interactive)' },
  { cmd: '/disconnect', desc: 'Unlink your account' },
  { cmd: '/status', desc: 'Check connection status' },
  { cmd: '/cancel', desc: 'Cancel ongoing connection' },
  { cmd: '/courses', desc: 'List all courses (dept > sem > courses)' },
  { cmd: '/search notes', desc: 'Search files by name' },
  { cmd: '/stats', desc: 'View site statistics' },
  { cmd: '/broadcast <msg>', desc: 'Send announcement (owner only)' },
  { cmd: 'QUR101', desc: 'Search course by code (any format)' },
];

export default function BotCommands() {
  return (
    <div className="bg-dark-bg2 border border-dark-border rounded-xl p-4 mb-4">
      <h4 className="text-dark-text text-sm font-semibold mb-3"><i className="fas fa-terminal text-qsis mr-2"></i>Bot Commands</h4>
      <div className="space-y-1.5">
        {botCommands.map((c, i) => (
          <div key={i} className="flex items-start gap-3 text-[0.78rem]">
            <code className="bg-dark-bg3 px-1.5 py-0.5 rounded text-qsis font-mono whitespace-nowrap">{c.cmd}</code>
            <span className="text-dark-text2">{c.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
