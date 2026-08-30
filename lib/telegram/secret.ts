// Telegram's setWebhook secret_token only allows [A-Za-z0-9_-]. Some deployments
// set TELEGRAM_BOT_WEBHOOK_SECRET with illegal characters (spaces, quotes,
// unicode, emoji, etc.), which makes setWebhook fail AND makes the server-side
// header check reject every update with 403. Both sides must agree on the SAME
// normalized value, so this is the single source for the secret.
export function normalizeSecret(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9_-]/g, '');
  return clean || 'IIUC-ARMS-BOT';
}

export function configuredSecret(): string {
  return normalizeSecret(
    process.env.TELEGRAM_BOT_WEBHOOK_SECRET || process.env.TELEGRAM_BOT_TOKEN || ''
  );
}