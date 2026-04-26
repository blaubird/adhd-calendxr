import { db } from 'app/db';
import { env } from 'app/env';
import { users } from 'app/schema';
import { TelegramClient } from './client';

export function createTelegramClient() {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is missing');
  }
  return new TelegramClient(env.TELEGRAM_BOT_TOKEN);
}

export async function getTelegramUserId() {
  const [firstUser] = await db.select().from(users).limit(1);
  return firstUser?.id || 1;
}

export function getTelegramDigestChatId() {
  const chatId = env.TELEGRAM_CHAT_ID || env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!chatId) {
    throw new Error('TELEGRAM_CHAT_ID or TELEGRAM_ALLOWED_CHAT_ID is missing');
  }
  return chatId;
}
