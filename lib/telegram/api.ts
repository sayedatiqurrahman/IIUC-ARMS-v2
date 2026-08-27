import { config } from '@/lib/config';
import { getRepoBotToken } from '@/lib/github-app';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const API = `https://api.telegram.org/bot${TOKEN}`;
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';
export const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '';
export const GROUP_ID = process.env.TELEGRAM_GROUP_ID || '';

// ─── GitHub token resolver (App token > env token > empty) ─────────

let cachedToken: string | null = null;
let cachedTokenTs = 0;
const TOKEN_CACHE_TTL = 50 * 60 * 1000;

export async function resolveGithubToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedTokenTs < TOKEN_CACHE_TTL) return cachedToken;

  // Try env token first
  if (process.env.GITHUB_TOKEN) {
    cachedToken = process.env.GITHUB_TOKEN;
    cachedTokenTs = Date.now();
    return cachedToken;
  }

  // Try GitHub App installation token for the files repo
  try {
    const token = await getRepoBotToken(config.owner, config.repo);
    if (token) {
      cachedToken = token;
      cachedTokenTs = Date.now();
      return token;
    }
  } catch {}

  return '';
}

// ─── Telegram API helpers ─────────────────────────────────────────

export async function sendMessage(chatId: number | string, text: string, extra?: any) {
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[TG] sendMessage FAILED: ${res.status} ${body.substring(0, 300)}`);
  }
  return res;
}

export async function sendChatAction(chatId: number, action: string = 'typing') {
  return fetch(`${API}/sendChatAction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, action }),
  });
}

export async function sendMessageWithButton(chatId: number, text: string, buttonText: string, buttonUrl: string) {
  return fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
      },
    }),
  });
}

export async function sendMessageWithButtons(chatId: number, text: string, buttons: { text: string; callback_data?: string; url?: string }[][]) {
  return fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: buttons,
      },
    }),
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return fetch(`${API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
  });
}

export async function editMessageText(chatId: number, messageId: number, text: string, extra?: any) {
  return fetch(`${API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra }),
  });
}

export async function deleteMessage(chatId: number, messageId: number) {
  return fetch(`${API}/deleteMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}

export async function sendDocument(chatId: number | string, fileUrl: string, caption: string, extra?: any) {
  return fetch(`${API}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: fileUrl,
      caption,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...extra,
    }),
  });
}

// ─── Unified broadcast targets ───────────────────────────────────
// The app historically stored posting channels in two places:
//   * `postingChannels`  — set from the Telegram "Content Posting Channels" UI
//     (see SupportConfigTab). Each entry: { id, name, chatId, type, autoPost, categories }.
//   * `broadcastTargets` — set from the BroadcastTargets UI.
//     Each entry: { chatId, type, enabled, ... }.
// Notices must honour BOTH so channels added from either UI actually broadcast.
// Returns a de-duplicated list keyed by chatId.
export async function getEffectiveBroadcastTargets(): Promise<{ chatId: string; type: string; enabled: boolean; name?: string }[]> {
  const { prisma } = await import('@/lib/prisma');
  const p = prisma as any;

  let row: any;
  try {
    // Prefer reading both columns; fall back to postingChannels only if
    // broadcastTargets is missing from the table (schema drift safety).
    const rows = await p.$queryRawUnsafe(
      `SELECT broadcastTargets, postingChannels FROM SiteSettings WHERE id = 'site-settings'`
    );
    row = (rows as any[])[0];
  } catch {
    try {
      const rows = await p.$queryRawUnsafe(
        `SELECT postingChannels FROM SiteSettings WHERE id = 'site-settings'`
      );
      row = (rows as any[])[0];
    } catch { row = undefined; }
  }

  const parse = (v: any): any[] => {
    if (!v) return [];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
    return [];
  };

  const targets = parse(row?.broadcastTargets);
  const channels = parse(row?.postingChannels);

  const merged = new Map<string, { chatId: string; type: string; enabled: boolean; name?: string }>();

  for (const t of targets) {
    if (!t?.chatId) continue;
    merged.set(String(t.chatId), {
      chatId: String(t.chatId),
      type: t.type || (String(t.chatId).startsWith('-') ? 'group' : 'channel'),
      enabled: t.enabled !== false,
      name: t.name,
    });
  }
  // Posting channels are only broadcast when autoPost is enabled (mirrors telegram/post route).
  for (const c of channels) {
    if (!c?.chatId) continue;
    merged.set(String(c.chatId), {
      chatId: String(c.chatId),
      type: c.type || (String(c.chatId).startsWith('-') ? 'group' : 'channel'),
      enabled: !!c.autoPost && (c.enabled !== false),
      name: c.name,
    });
  }

  return Array.from(merged.values()).filter(t => t.enabled);
}