import { getTelegramLanguage } from 'app/db';
import { loadExpandedItems } from 'app/lib/load-items';
import { formatDayKey, nowInTz } from 'app/lib/datetime';
import { TelegramClient } from './client';
import { formatTelegramDay } from './format';
import { t, type TelegramLanguage } from './i18n';

export async function buildTelegramDigest(userId: number, language: TelegramLanguage = 'en') {
  const now = nowInTz(new Date());
  const dayStr = formatDayKey(now);
  const items = await loadExpandedItems(userId, dayStr, dayStr);
  const messages = t(language);

  let text = `${formatTelegramDay(items, {
    date: now,
    label: messages.morningDigest,
    offsetDays: 0,
  }, messages.emptyDay, language)}\n\n`;

  const undoneCount = items.filter((item) => item.status !== 'done').length;
  text += messages.totalActive(undoneCount);

  return { text, itemCount: items.length, activeCount: undoneCount, day: dayStr };
}

export async function sendTelegramDigest(client: TelegramClient, chatId: string, userId: number) {
  const language = await getTelegramLanguage(chatId);
  const digest = await buildTelegramDigest(userId, language);
  const result = await client.sendMessage(chatId, digest.text, { parse_mode: 'HTML' });
  return { ...digest, telegramResult: result };
}
