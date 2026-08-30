// Single source of truth for the bot's command menu (shown above the keyboard
// in Telegram). Registered via the Bot API's setMyCommands — without that the
// commands still work if typed, but never appear in the UI.
//
// Command names must be lowercase, start with a letter, and be <=32 chars.
// Descriptions must be <=256 chars.
export const BOT_COMMANDS: { command: string; description: string }[] = [
  { command: 'start', description: 'Welcome message & main menu' },
  { command: 'upload', description: 'Upload a course file to GitHub (dept > sem > course > category)' },
  { command: 'help', description: 'List all available commands' },
  { command: 'connect', description: 'Link your IIUC-ARMS account' },
  { command: 'courses', description: 'List all courses (dept > sem > courses)' },
  { command: 'search', description: 'Search files by name' },
  { command: 'stats', description: 'View site statistics' },
];

export async function registerBotCommands(): Promise<{ ok: boolean; description?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) return { ok: false, description: 'TELEGRAM_BOT_TOKEN not set' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: BOT_COMMANDS }),
    });
    const data = await res.json();
    return { ok: data?.ok === true, description: data?.description || data?.error || undefined };
  } catch (err: any) {
    return { ok: false, description: err?.message || 'Failed to call Telegram' };
  }
}