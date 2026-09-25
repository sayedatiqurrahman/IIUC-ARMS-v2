import { configuredSecret } from './secret';

const DEFAULT_SITE_URL = 'https://arms.iiuc.net';
const LEGACY_SITE_HOST = 'iiuc-arms.eu.cc';
const ALLOWED_UPDATES = ['message', 'callback_query'];

type TelegramApiEnvelope<T> =
  | { ok: true; result: T }
  | { ok: false; description?: string; error_code?: number };

export interface TelegramBot {
  id: number;
  username: string;
  first_name: string;
}

export interface TelegramWebhookInfo {
  url: string;
  pending_update_count: number;
  has_custom_certificate: boolean;
  max_connections: number;
  last_error_date?: number;
  last_error_message?: string;
  last_successful_connection?: number;
  allowed_updates?: string[];
}

export function getCanonicalSiteUrl(): string {
  if (process.env.VERCEL_ENV || process.env.NODE_ENV === 'production') {
    return DEFAULT_SITE_URL;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_URL;

  try {
    const url = new URL(configured);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.hostname === LEGACY_SITE_HOST || (url.protocol !== 'https:' && !isLocal)) {
      return DEFAULT_SITE_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function getTelegramWebhookUrl(): string {
  return `${getCanonicalSiteUrl()}/api/telegram/webhook`;
}

export async function callTelegramApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });

  let data: TelegramApiEnvelope<T>;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Telegram ${method} returned an invalid response`);
  }

  const description = 'description' in data ? data.description : response.statusText;
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram ${method} failed: ${description || 'unknown error'}`);
  }

  return data.result;
}

export function getTelegramBot(): Promise<TelegramBot> {
  return callTelegramApi<TelegramBot>('getMe');
}

export function getTelegramWebhookInfo(): Promise<TelegramWebhookInfo> {
  return callTelegramApi<TelegramWebhookInfo>('getWebhookInfo');
}

export function deleteTelegramWebhook(): Promise<boolean> {
  return callTelegramApi<boolean>('deleteWebhook', { drop_pending_updates: false });
}

export async function registerTelegramWebhook() {
  const webhookUrl = getTelegramWebhookUrl();
  const result = await callTelegramApi<boolean>('setWebhook', {
    url: webhookUrl,
    secret_token: configuredSecret(),
    allowed_updates: ALLOWED_UPDATES,
    drop_pending_updates: false,
  });
  const info = await getTelegramWebhookInfo();

  if (info.url !== webhookUrl) {
    throw new Error(`Telegram registered ${info.url || 'no webhook'} instead of ${webhookUrl}`);
  }

  return { result, info, webhookUrl };
}

export async function reconcileTelegramWebhook() {
  const webhookUrl = getTelegramWebhookUrl();
  const current = await getTelegramWebhookInfo();

  if (current.url === webhookUrl) {
    return { changed: false, info: current, webhookUrl };
  }

  const registered = await registerTelegramWebhook();
  return { changed: true, ...registered };
}
