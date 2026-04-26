import 'dotenv/config';
import { createTelegramClient } from '../app/lib/telegram/runtime';

async function main() {
  const client = createTelegramClient();
  const result = await client.getWebhookInfo();

  if (!result.ok) {
    console.error(`[Telegram] Failed to get webhook info: ${result.description || 'unknown error'}`);
    process.exit(1);
  }

  const info = result.result || {};
  console.log('[Telegram] Webhook info:');
  console.log(JSON.stringify({
    url: info.url,
    has_custom_certificate: info.has_custom_certificate,
    pending_update_count: info.pending_update_count,
    last_error_date: info.last_error_date,
    last_error_message: info.last_error_message,
    max_connections: info.max_connections,
    allowed_updates: info.allowed_updates,
  }, null, 2));
}

main().catch((err) => {
  console.error('[Telegram] Fatal error reading webhook info:', err?.message || err);
  process.exit(1);
});
