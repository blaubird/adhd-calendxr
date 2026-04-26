import { format } from 'date-fns';

import { loadExpandedItems } from 'app/lib/load-items';
import { formatDayKey, nowInTz } from 'app/lib/datetime';
import { TelegramClient } from './client';
import { formatTelegramDay } from './format';

export async function buildTelegramDigest(userId: number) {
  const now = nowInTz(new Date());
  const dayStr = formatDayKey(now);
  const items = await loadExpandedItems(userId, dayStr, dayStr);
  const humanDay = format(now, 'dd.MM.yyyy');

  let text = `${formatTelegramDay(items, `Morning Digest — ${humanDay}`, 'Your day is clear.')}\n\n`;

  const undoneCount = items.filter((item) => item.status !== 'done').length;
  text += `_Total active: ${undoneCount}_`;

  return { text, itemCount: items.length, activeCount: undoneCount, day: dayStr };
}

export async function sendTelegramDigest(client: TelegramClient, chatId: string, userId: number) {
  const digest = await buildTelegramDigest(userId);
  const result = await client.sendMessage(chatId, digest.text, { parse_mode: 'Markdown' });
  return { ...digest, telegramResult: result };
}
