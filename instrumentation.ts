export async function register() {
  if (
    process.env.NEXT_RUNTIME !== 'nodejs' ||
    process.env.VERCEL_ENV !== 'production' ||
    !process.env.TELEGRAM_BOT_TOKEN
  ) {
    return;
  }

  const { reconcileTelegramWebhook } = await import('./lib/telegram/webhook');

  try {
    const result = await reconcileTelegramWebhook();
    if (result.changed) {
      console.log(`[Telegram] Webhook reconciled to ${result.webhookUrl}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Telegram] Webhook reconciliation failed: ${message}`);
  }
}
