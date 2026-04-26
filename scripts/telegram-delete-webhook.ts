import 'dotenv/config';
import { createTelegramClient } from '../app/lib/telegram/runtime';

async function main() {
  const client = createTelegramClient();
  console.log('[Telegram] Deleting webhook.');
  const result = await client.deleteWebhook();

  if (!result.ok) {
    console.error(`[Telegram] Failed to delete webhook: ${result.description || 'unknown error'}`);
    process.exit(1);
  }

  console.log('[Telegram] Webhook deleted. Polling can be used now.');
}

main().catch((err) => {
  console.error('[Telegram] Fatal error deleting webhook:', err?.message || err);
  process.exit(1);
});
