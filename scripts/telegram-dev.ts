import 'dotenv/config';
import { handleTelegramUpdate } from '../app/lib/telegram/handler';
import { env } from '../app/env';
import { createTelegramClient, getTelegramUserId } from '../app/lib/telegram/runtime';

async function main() {
  const allowedChat = env.TELEGRAM_ALLOWED_CHAT_ID;
  console.log(`[Telegram] Starting local polling mode.`);
  if (env.TELEGRAM_MODE && env.TELEGRAM_MODE !== 'polling') {
    console.warn(`[Telegram] TELEGRAM_MODE=${env.TELEGRAM_MODE}; local polling still runs because this script was called explicitly.`);
  }
  console.log(`[Telegram] Allowed chat ID: ${allowedChat || 'NONE (Warning: unprotected)'}`);

  const client = createTelegramClient();

  try {
    await client.deleteWebhook();
    console.log(`[Telegram] Webhook deleted. Bot is ready to poll.`);
  } catch (err) {
    console.warn(`[Telegram] Failed to delete webhook, ignoring.`, err);
  }

  const userId = await getTelegramUserId();
  console.log(`[Telegram] Mapped Telegram requests to internal User ID: ${userId}`);

  let offset = 0;

  while (true) {
    try {
      const updates = await client.getUpdates(offset, 30);
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleTelegramUpdate(update, client, userId);
      }
    } catch (err: any) {
      console.error(`[Telegram] Polling error: ${err.message}`);
      // Sleep a bit to avoid rapid fire failure
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

main().catch(err => {
  console.error('Fatal error in Telegram polling:', err);
  process.exit(1);
});
