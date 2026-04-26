import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, gte, lte, lt, or, isNull, isNotNull, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { genSaltSync, hashSync } from 'bcrypt-ts';
import { randomUUID } from 'crypto';

import { env } from './env';
import {
  InsertItem,
  SelectItem,
  items,
  telegramPendingDrafts,
  telegramReminderDeliveries,
  telegramUserSettings,
  users,
  canvasBoards,
  canvasElements,
} from './schema';
import { itemInputSchema, type ItemInput } from './lib/validation';
import { normalizeTelegramLanguage, type TelegramLanguage } from './lib/telegram/i18n';

const runtimeUrl = env.POSTGRES_URL ?? env.RUNTIME_DATABASE_URL ?? env.DATABASE_URL;

if (!runtimeUrl) {
  throw new Error('Missing pooled DB url (POSTGRES_URL/RUNTIME_DATABASE_URL)');
}

const sslMode = runtimeUrl.includes('localhost') || runtimeUrl.includes('sslmode=')
  ? runtimeUrl
  : `${runtimeUrl}${runtimeUrl.includes('?') ? '&' : '?'}sslmode=require`;

const client = postgres(sslMode);
export const db = drizzle(client, {
  schema: { users, items, telegramPendingDrafts, telegramUserSettings, telegramReminderDeliveries, canvasBoards, canvasElements },
});

export async function getUser(email: string) {
  return await db.select().from(users).where(eq(users.email, email));
}

export async function createUser(email: string, password: string) {
  let salt = genSaltSync(10);
  let hash = hashSync(password, salt);

  return await db.insert(users).values({ email, password: hash }).returning();
}

type ItemWritePayload = Omit<InsertItem, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;

function normalizeItemPayload(payload: ItemInput): ItemWritePayload {
  return {
    ...payload,
    timeStart: payload.timeStart ?? null,
    timeEnd: payload.timeEnd ?? null,
    details: payload.details ?? null,
    status: payload.status ?? null,
    recurrenceRule: payload.recurrenceRule ?? null,
    recurrenceTz: payload.recurrenceTz ?? undefined,
    recurrenceUntilDay: payload.recurrenceUntilDay ?? null,
    recurrenceCount: payload.recurrenceCount ?? null,
    recurrenceExdates: payload.recurrenceExdates ?? [],
    color: payload.color ?? null,
    order: payload.order ?? 0,
    parentId: payload.parentId ?? null,
    occurrenceDay: payload.occurrenceDay ?? null,
  } satisfies ItemWritePayload;
}

export async function createItem(userId: number, payload: ItemInput) {
  const values = normalizeItemPayload(payload);
  return db.insert(items).values({ ...values, userId }).returning();
}

export async function updateItem(userId: number, itemId: number, payload: ItemInput) {
  const values = normalizeItemPayload(payload);
  return db
    .update(items)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .returning();
}

export async function deleteItem(userId: number, itemId: number) {
  return db.delete(items).where(and(eq(items.id, itemId), eq(items.userId, userId)));
}

export async function getItemById(userId: number, itemId: number) {
  const [item] = await db.select().from(items).where(and(eq(items.id, itemId), eq(items.userId, userId))).limit(1);
  return item;
}

export async function listItemsInRange(userId: number, start: string, end: string) {
  const rangeItems = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.userId, userId),
        or(
          and(gte(items.day, start), lte(items.day, end)),
          and(
            isNotNull(items.recurrenceRule),
            isNull(items.parentId),
            lte(items.day, end),
            or(isNull(items.recurrenceUntilDay), gte(items.recurrenceUntilDay, start))
          ),
          and(
            isNotNull(items.parentId),
            isNotNull(items.occurrenceDay),
            gte(items.occurrenceDay, start),
            lte(items.occurrenceDay, end)
          )
        )
      )
    )
    .orderBy(items.day, items.timeStart, items.id);

  const masters = rangeItems.filter((item) => item.recurrenceRule && !item.parentId);
  const masterIds = masters.map((m) => m.id);

  if (masterIds.length === 0) return rangeItems;

  const overrides = await db
    .select()
    .from(items)
    .where(and(eq(items.userId, userId), isNotNull(items.parentId), inArray(items.parentId, masterIds)));

  const existingIds = new Set(rangeItems.map((i) => i.id));
  const uniqueOverrides = overrides.filter((ov) => !existingIds.has(ov.id));

  return [...rangeItems, ...uniqueOverrides];
}

export async function addExdate(userId: number, itemId: number, day: string) {
  const item = await getItemById(userId, itemId);
  if (!item) return null;

  const current = Array.isArray((item as any).recurrenceExdates)
    ? ((item as any).recurrenceExdates as Date[] | string[])
    : [];
  const existing = current.map((d) => (typeof d === 'string' ? d : d.toISOString().split('T')[0]));
  const next = Array.from(new Set([...existing, day]));

  const [updated] = await db
    .update(items)
    .set({ recurrenceExdates: next, updatedAt: new Date() })
    .where(and(eq(items.id, itemId), eq(items.userId, userId)))
    .returning();

  return updated;
}

export async function createOverride(
  userId: number,
  parentId: number,
  occurrenceDay: string,
  payload: ItemInput
) {
  const values = normalizeItemPayload({
    ...payload,
    day: occurrenceDay,
    parentId,
    occurrenceDay,
    recurrenceRule: null,
    recurrenceUntilDay: null,
    recurrenceCount: null,
    recurrenceExdates: [],
  });

  return db.insert(items).values({ ...values, userId })
    .onConflictDoUpdate({
      target: [items.parentId, items.occurrenceDay],
      set: { ...values, updatedAt: new Date() }
    })
    .returning();
}

const TELEGRAM_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export async function createTelegramPendingDraft(chatId: string, payload: unknown) {
  const draft = itemInputSchema.parse(payload);
  const expiresAt = new Date(Date.now() + TELEGRAM_DRAFT_TTL_MS);

  await cleanupExpiredTelegramDrafts();

  const [record] = await db
    .insert(telegramPendingDrafts)
    .values({
      id: randomUUID(),
      chatId,
      draft,
      status: 'pending',
      expiresAt,
    })
    .returning();

  return record;
}

export async function confirmTelegramPendingDraft(userId: number, draftId: string, chatId: string) {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .update(telegramPendingDrafts)
      .set({ status: 'confirming', updatedAt: new Date() })
      .where(
        and(
          eq(telegramPendingDrafts.id, draftId),
          eq(telegramPendingDrafts.chatId, chatId),
          eq(telegramPendingDrafts.status, 'pending'),
          gte(telegramPendingDrafts.expiresAt, new Date())
        )
      )
      .returning();

    if (!record) return null;

    const draft = itemInputSchema.parse(record.draft);
    const values = normalizeItemPayload(draft);
    const [item] = await tx.insert(items).values({ ...values, userId }).returning();

    await tx
      .update(telegramPendingDrafts)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(eq(telegramPendingDrafts.id, draftId));

    return { draft, item };
  });
}

export async function cancelTelegramPendingDraft(draftId: string, chatId: string) {
  const [record] = await db
    .update(telegramPendingDrafts)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(
      and(
        eq(telegramPendingDrafts.id, draftId),
        eq(telegramPendingDrafts.chatId, chatId),
        eq(telegramPendingDrafts.status, 'pending')
      )
    )
    .returning();

  return record ?? null;
}

export async function cleanupExpiredTelegramDrafts() {
  await db
    .delete(telegramPendingDrafts)
    .where(
      and(
        lt(telegramPendingDrafts.expiresAt, new Date()),
        or(
          eq(telegramPendingDrafts.status, 'pending'),
          eq(telegramPendingDrafts.status, 'confirming'),
          eq(telegramPendingDrafts.status, 'cancelled'),
          eq(telegramPendingDrafts.status, 'confirmed')
        )
      )
    );
}

export async function getTelegramLanguage(chatId: string): Promise<TelegramLanguage> {
  const [settings] = await db
    .select({ language: telegramUserSettings.language })
    .from(telegramUserSettings)
    .where(eq(telegramUserSettings.chatId, chatId))
    .limit(1);

  return normalizeTelegramLanguage(settings?.language);
}

export async function getTelegramSettings(chatId: string) {
  const [settings] = await db
    .select({
      chatId: telegramUserSettings.chatId,
      language: telegramUserSettings.language,
      remindersEnabled: telegramUserSettings.remindersEnabled,
    })
    .from(telegramUserSettings)
    .where(eq(telegramUserSettings.chatId, chatId))
    .limit(1);

  return {
    chatId,
    language: normalizeTelegramLanguage(settings?.language),
    remindersEnabled: settings?.remindersEnabled ?? false,
  };
}

export async function setTelegramLanguage(chatId: string, language: TelegramLanguage) {
  const [settings] = await db
    .insert(telegramUserSettings)
    .values({ chatId, language })
    .onConflictDoUpdate({
      target: telegramUserSettings.chatId,
      set: { language, updatedAt: new Date() },
    })
    .returning();

  return settings;
}

export async function setTelegramRemindersEnabled(chatId: string, enabled: boolean) {
  const [settings] = await db
    .insert(telegramUserSettings)
    .values({ chatId, remindersEnabled: enabled })
    .onConflictDoUpdate({
      target: telegramUserSettings.chatId,
      set: { remindersEnabled: enabled, updatedAt: new Date() },
    })
    .returning();

  return settings;
}

export async function listTelegramReminderSettings() {
  const settings = await db
    .select({
      chatId: telegramUserSettings.chatId,
      language: telegramUserSettings.language,
      remindersEnabled: telegramUserSettings.remindersEnabled,
    })
    .from(telegramUserSettings)
    .where(eq(telegramUserSettings.remindersEnabled, true));

  return settings.map((setting) => ({
    chatId: setting.chatId,
    language: normalizeTelegramLanguage(setting.language),
    remindersEnabled: setting.remindersEnabled,
  }));
}

type ReminderDeliveryInput = {
  deliveryKey: string;
  chatId: string;
  itemId?: string | null;
  occurrenceDay: string;
  occurrenceTime?: string | null;
  reminderKind: 'timed_15m' | 'untimed_morning_digest';
  scheduledFor: Date;
};

export async function reserveTelegramReminderDelivery(input: ReminderDeliveryInput) {
  const [record] = await db
    .insert(telegramReminderDeliveries)
    .values({
      deliveryKey: input.deliveryKey,
      chatId: input.chatId,
      itemId: input.itemId ?? null,
      occurrenceDay: input.occurrenceDay,
      occurrenceTime: input.occurrenceTime ?? null,
      reminderKind: input.reminderKind,
      scheduledFor: input.scheduledFor,
    })
    .onConflictDoNothing({ target: telegramReminderDeliveries.deliveryKey })
    .returning();

  return record ?? null;
}

export async function markTelegramReminderDeliverySent(deliveryKey: string) {
  const [record] = await db
    .update(telegramReminderDeliveries)
    .set({ sentAt: new Date() })
    .where(eq(telegramReminderDeliveries.deliveryKey, deliveryKey))
    .returning();

  return record ?? null;
}

export async function releaseTelegramReminderDelivery(deliveryKey: string) {
  await db
    .delete(telegramReminderDeliveries)
    .where(and(eq(telegramReminderDeliveries.deliveryKey, deliveryKey), isNull(telegramReminderDeliveries.sentAt)));
}

export type ItemRecord = SelectItem;
