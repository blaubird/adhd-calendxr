import 'dotenv/config';
import { sendTelegramDigest } from '../app/lib/telegram/digest';
import {
  createTelegramClient,
  getTelegramDigestChatId,
  getTelegramUserId,
} from '../app/lib/telegram/runtime';

async function main() {
  const client = createTelegramClient();
  const chatId = getTelegramDigestChatId();
  const userId = await getTelegramUserId();
  const result = await sendTelegramDigest(client, chatId, userId);
  console.log(`Digest sent for ${result.day}. Items: ${result.itemCount}, active: ${result.activeCount}.`);
}

main().catch(err => {
  console.error('Fatal error in Telegram digest:', err);
  process.exit(1);
});
