import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, gte, lte } from 'drizzle-orm';
import postgres from 'postgres';
import { genSaltSync, hashSync } from 'bcrypt-ts';

import { InsertItem, SelectItem, items, users } from './schema';

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

export async function createItem(userId: number, payload: InsertItem) {
  return db.insert(items).values({ ...payload, userId }).returning();
}

export async function updateItem(
  userId: number,
  itemId: number,
  payload: Partial<InsertItem>
) {
  return db
    .update(items)
    .set({ ...payload, updatedAt: new Date() })
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
