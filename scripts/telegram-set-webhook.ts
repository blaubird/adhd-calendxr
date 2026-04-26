import 'dotenv/config';
import { env } from '../app/env';
import { createTelegramClient } from '../app/lib/telegram/runtime';

async function main() {
  if (!env.APP_BASE_URL) {
    console.error('APP_BASE_URL is missing.');
    process.exit(1);
  }
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    console.error('TELEGRAM_WEBHOOK_SECRET is missing.');
    process.exit(1);
  }

  const baseUrl = env.APP_BASE_URL.replace(/\/$/, '');
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const client = createTelegramClient();

  console.log(`[Telegram] Setting webhook URL: ${webhookUrl}`);
  const result = await client.setWebhook(webhookUrl, env.TELEGRAM_WEBHOOK_SECRET);

  if (!result.ok) {
    console.error(`[Telegram] Failed to set webhook: ${result.description || 'unknown error'}`);
    process.exit(1);
  }

  console.log('[Telegram] Webhook set successfully.');
}

main().catch((err) => {
  console.error('[Telegram] Fatal error setting webhook:', err?.message || err);
  process.exit(1);
});
