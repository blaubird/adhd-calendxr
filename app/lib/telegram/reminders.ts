import { addDays, subMinutes } from 'date-fns';

import {
  listTelegramReminderSettings,
  markTelegramReminderDeliverySent,
  releaseTelegramReminderDelivery,
  reserveTelegramReminderDelivery,
} from 'app/db';
import type { Item } from 'app/types';
import { nowInTz, parseDayKey, TIMEZONE } from 'app/lib/datetime';
import { loadExpandedItems } from 'app/lib/load-items';
import { TelegramClient } from './client';
import {
  formatTelegramDailyMorningDigest,
  formatTelegramTimedReminder,
  formatTelegramUntimedMorningDigest,
} from './format';

function dateTimeFromDayAndTime(day: string, time: string) {
  const [hours, minutes] = time.split(':').map((value) => Number(value));
  const date = parseDayKey(day);
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    Number.isFinite(hours) ? hours : 0,
    Number.isFinite(minutes) ? minutes : 0,
    0
  ));
}

function wallDayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function latestTouchedAt(item: Item) {
  const timestamps = [item.createdAt, item.updatedAt]
    .filter(Boolean)
    .map((value) => nowInTz(new Date(value as Date | string)))
    .filter((value) => !Number.isNaN(value.getTime()));

  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps.map((value) => value.getTime())));
}

function itemDeliveryId(item: Item) {
  return String(item.sourceId ?? item.id);
}

function isTimedReminderCandidate(item: Item, now: Date) {
  if (!item.timeStart) return false;
  if (item.status === 'done' || item.status === 'canceled') return false;

  const occurrenceStart = dateTimeFromDayAndTime(item.day, item.timeStart);
  const reminderAt = subMinutes(occurrenceStart, 15);
  if (now < reminderAt) return false;
  if (now >= occurrenceStart) return false;

  const touchedAt = latestTouchedAt(item);
  if (touchedAt && touchedAt.getTime() > reminderAt.getTime()) return false;

  return true;
}

async function sendIfTelegramOk(client: TelegramClient, chatId: string, text: string) {
  try {
    const result = await client.sendMessage(chatId, text, { parse_mode: 'HTML' });
    return Boolean(result?.ok);
  } catch {
    return false;
  }
}

async function sendTimedRemindersForChat(
  client: TelegramClient,
  userId: number,
  chatId: string,
  language: Parameters<typeof formatTelegramTimedReminder>[1],
  now: Date
) {
  const today = wallDayKey(now);
  const tomorrow = wallDayKey(addDays(now, 1));
  const items = await loadExpandedItems(userId, today, tomorrow);
  let sent = 0;
  let skippedDuplicate = 0;
  let failed = 0;

  const candidates = items.filter((item) => isTimedReminderCandidate(item, now));

  for (const item of candidates) {
    const occurrenceTime = item.timeStart || null;
    const reminderAt = subMinutes(dateTimeFromDayAndTime(item.day, item.timeStart || '00:00'), 15);
    const deliveryKey = [
      'timed_15m',
      chatId,
      itemDeliveryId(item),
      item.day,
      occurrenceTime,
    ].join(':');

    const reservation = await reserveTelegramReminderDelivery({
      deliveryKey,
      chatId,
      itemId: itemDeliveryId(item),
      occurrenceDay: item.day,
      occurrenceTime,
      reminderKind: 'timed_15m',
      scheduledFor: reminderAt,
    });

    if (!reservation) {
      skippedDuplicate += 1;
      continue;
    }

    const ok = await sendIfTelegramOk(
      client,
      chatId,
      formatTelegramTimedReminder(item, language, today, tomorrow)
    );

    if (!ok) {
      failed += 1;
      await releaseTelegramReminderDelivery(deliveryKey);
      continue;
    }

    await markTelegramReminderDeliverySent(deliveryKey);
    sent += 1;
  }

  return { candidates: candidates.length, sent, skippedDuplicate, failed };
}

function isMorningDigestWindow(now: Date) {
  return now.getUTCHours() === 9 && now.getUTCMinutes() < 10;
}

async function sendUntimedMorningDigestForChat(
  client: TelegramClient,
  userId: number,
  chatId: string,
  language: Parameters<typeof formatTelegramUntimedMorningDigest>[1],
  now: Date
) {
  if (!isMorningDigestWindow(now)) {
    return { attempted: false, sent: 0, skippedDuplicate: 0, failed: 0, itemCount: 0 };
  }

  const today = wallDayKey(now);
  const items = (await loadExpandedItems(userId, today, today))
    .filter((item) => !item.timeStart && item.status !== 'done' && item.status !== 'canceled');

  if (!items.length) {
    return { attempted: true, sent: 0, skippedDuplicate: 0, failed: 0, itemCount: 0 };
  }

  const deliveryKey = ['untimed_morning_digest', chatId, today].join(':');
  const scheduledFor = dateTimeFromDayAndTime(today, '09:00');
  const reservation = await reserveTelegramReminderDelivery({
    deliveryKey,
    chatId,
    itemId: null,
    occurrenceDay: today,
    occurrenceTime: null,
    reminderKind: 'untimed_morning_digest',
    scheduledFor,
  });

  if (!reservation) {
    return { attempted: true, sent: 0, skippedDuplicate: 1, failed: 0, itemCount: items.length };
  }

  const ok = await sendIfTelegramOk(
    client,
    chatId,
    formatTelegramUntimedMorningDigest(items, language, today)
  );

  if (!ok) {
    await releaseTelegramReminderDelivery(deliveryKey);
    return { attempted: true, sent: 0, skippedDuplicate: 0, failed: 1, itemCount: items.length };
  }

  await markTelegramReminderDeliverySent(deliveryKey);
  return { attempted: true, sent: 1, skippedDuplicate: 0, failed: 0, itemCount: items.length };
}

async function sendDailyMorningDigestForChat(
  client: TelegramClient,
  userId: number,
  chatId: string,
  language: Parameters<typeof formatTelegramDailyMorningDigest>[1],
  now: Date
) {
  const today = wallDayKey(now);
  const items = (await loadExpandedItems(userId, today, today))
    .filter((item) => item.status !== 'done' && item.status !== 'canceled');

  if (!items.length) {
    return { sent: 0, skippedDuplicate: 0, failed: 0, itemCount: 0 };
  }

  const deliveryKey = ['daily_morning_digest', chatId, today].join(':');
  const scheduledFor = dateTimeFromDayAndTime(today, '07:00');
  const reservation = await reserveTelegramReminderDelivery({
    deliveryKey,
    chatId,
    itemId: null,
    occurrenceDay: today,
    occurrenceTime: null,
    reminderKind: 'daily_morning_digest',
    scheduledFor,
  });

  if (!reservation) {
    return { sent: 0, skippedDuplicate: 1, failed: 0, itemCount: items.length };
  }

  const ok = await sendIfTelegramOk(
    client,
    chatId,
    formatTelegramDailyMorningDigest(items, language, today)
  );

  if (!ok) {
    await releaseTelegramReminderDelivery(deliveryKey);
    return { sent: 0, skippedDuplicate: 0, failed: 1, itemCount: items.length };
  }

  await markTelegramReminderDeliverySent(deliveryKey);
  return { sent: 1, skippedDuplicate: 0, failed: 0, itemCount: items.length };
}

export async function sendTelegramReminders(client: TelegramClient, userId: number, allowedChatId?: string | null) {
  const now = nowInTz(new Date());
  const settings = (await listTelegramReminderSettings())
    .filter((setting) => !allowedChatId || setting.chatId === allowedChatId);

  const results = [];

  for (const setting of settings) {
    const digest = await sendDailyMorningDigestForChat(client, userId, setting.chatId, setting.language, now);
    results.push({ chatId: setting.chatId, digest });
  }

  return {
    ok: true,
    timezone: TIMEZONE,
    mode: 'daily_morning_digest',
    timedRemindersPaused: true,
    enabledChatCount: settings.length,
    results,
  };
}
