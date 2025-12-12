import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, gte, lte } from 'drizzle-orm';
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

export async function listItemsInRange(userId: number, start: string, end: string) {
  return db
    .select()
    .from(items)
    .where(and(eq(items.userId, userId), gte(items.day, start), lte(items.day, end)))
    .orderBy(items.day, items.timeStart, items.id);
}

export type ItemRecord = SelectItem;
