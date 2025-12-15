import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, gte, lte, or, isNull, isNotNull, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { genSaltSync, hashSync } from 'bcrypt-ts';

import { InsertItem, SelectItem, items, users } from './schema';
import type { ItemInput } from './lib/validation';

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const sslMode = connectionString.includes('sslmode=')
  ? connectionString
  : `${connectionString}${connectionString.includes('?') ? '&' : '?'}sslmode=require`;

const client = postgres(sslMode);
export const db = drizzle(client, { schema: { users, items } });

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

  return db.insert(items).values({ ...values, userId }).returning();
}

export type ItemRecord = SelectItem;
