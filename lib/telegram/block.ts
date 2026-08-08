// Persistent Telegram spam blocklist, stored in SiteSettings JSON columns.
// Chat ids and usernames can be blocked; blocked senders are dropped silently
// (no replies, no processing) by the webhook.

let cachedChats: Set<string> | null = null;
let cachedUsernames: Set<string> | null = null;
let cacheTs = 0;
const CACHE_TTL = 60 * 1000;

async function loadBlocked(): Promise<{ chats: Set<string>; usernames: Set<string> }> {
  if (cachedChats && Date.now() - cacheTs < CACHE_TTL) {
    return { chats: cachedChats, usernames: cachedUsernames || new Set() };
  }
  const chats = new Set<string>();
  const usernames = new Set<string>();
  try {
    const { prisma } = await import('@/lib/prisma');
    const settings = await prisma.siteSettings.findUnique({ where: { id: 'site-settings' } });
    const rawChats = (settings as any)?.blockedTelegramChats;
    const rawUsers = (settings as any)?.blockedTelegramUsernames;
    if (Array.isArray(rawChats)) for (const c of rawChats) chats.add(String(c));
    if (Array.isArray(rawUsers)) for (const u of rawUsers) usernames.add(String(u).toLowerCase().replace(/^@/, ''));
  } catch {}
  cachedChats = chats;
  cachedUsernames = usernames;
  cacheTs = Date.now();
  return { chats, usernames };
}

export async function isBlockedChat(chatId: number, username?: string | null): Promise<boolean> {
  const { chats, usernames } = await loadBlocked();
  if (chats.has(String(chatId))) return true;
  if (username) {
    const u = username.toLowerCase().replace(/^@/, '');
    if (usernames.has(u)) return true;
  }
  return false;
}

export async function updateBlocklist(opts: {
  addChat?: string;
  removeChat?: string;
  addUsername?: string;
  removeUsername?: string;
}): Promise<void> {
  const { chats, usernames } = await loadBlocked();
  if (opts.addChat) chats.add(String(opts.addChat).replace(/\D/g, ''));
  if (opts.removeChat) chats.delete(String(opts.removeChat).replace(/\D/g, ''));
  if (opts.addUsername) usernames.add(opts.addUsername.toLowerCase().replace(/^@/, ''));
  if (opts.removeUsername) usernames.delete(opts.removeUsername.toLowerCase().replace(/^@/, ''));

  try {
    const { prisma } = await import('@/lib/prisma');
    await prisma.siteSettings.upsert({
      where: { id: 'site-settings' },
      update: {
        blockedTelegramChats: Array.from(chats) as any,
        blockedTelegramUsernames: Array.from(usernames) as any,
      },
      create: {
        id: 'site-settings',
        permissions: {} as any,
        blockedTelegramChats: Array.from(chats) as any,
        blockedTelegramUsernames: Array.from(usernames) as any,
      },
    });
    cachedChats = chats;
    cachedUsernames = usernames;
    cacheTs = Date.now();
  } catch {}
}

export function invalidateBlockCache() {
  cachedChats = null;
  cachedUsernames = null;
  cacheTs = 0;
}
