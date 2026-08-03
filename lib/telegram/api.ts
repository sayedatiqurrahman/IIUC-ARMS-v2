import { config } from '@/lib/config';
import { getAppInstallations, getInstallationAccessToken } from '@/lib/github-app';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const API = `https://api.telegram.org/bot${TOKEN}`;
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iiuc-arms.eu.cc';

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

  // Try GitHub App installation token
  try {
    const installations = await getAppInstallations();
    if (Array.isArray(installations) && installations.length > 0) {
      const token = await getInstallationAccessToken(installations[0].id);
      if (token) {
        cachedToken = token;
        cachedTokenTs = Date.now();
        return token;
      }
    }
  } catch {}

  return '';
}

// ─── Telegram API helpers ─────────────────────────────────────────

export async function sendMessage(chatId: number, text: string, extra?: any) {
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