import {
  date,
  index,
  integer,
  foreignKey,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  varchar,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const itemKind = pgEnum('item_kind', ['event', 'task']);
export const taskStatus = pgEnum('task_status', ['todo', 'done', 'canceled']);

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const items = pgTable(
  'items',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    kind: itemKind('kind').notNull(),
    day: date('day').notNull(),
    timeStart: time('time_start'),
    timeEnd: time('time_end'),
    title: varchar('title', { length: 255 }).notNull(),
    details: text('details'),
    status: taskStatus('status'),
    recurrenceRule: text('recurrence_rule'),
    recurrenceTz: text('recurrence_tz').notNull().default('Europe/Paris'),
    recurrenceUntilDay: date('recurrence_until_day'),
    recurrenceCount: integer('recurrence_count'),
    recurrenceExdates: date('recurrence_exdates').array().notNull().default(sql`'{}'::date[]`),
    parentId: integer('parent_id'),
    occurrenceDay: date('occurrence_day'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    dayIdx: index('items_day_idx').on(table.day, table.userId),
    userIdx: index('items_user_idx').on(table.userId),
    parentOccurrenceIdx: index('items_parent_occurrence_idx').on(table.parentId, table.occurrenceDay),
    recurrenceIdx: index('items_recurrence_idx').on(table.id).where(sql`${table.recurrenceRule} IS NOT NULL`),
    overrideUniqueIdx: uniqueIndex('items_parent_occurrence_unique').on(table.parentId, table.occurrenceDay),
    parentLink: foreignKey({
      columns: [table.parentId],
      foreignColumns: [table.id],
      name: 'items_parent_id_items_id_fk',
    }).onDelete('cascade'),
  })
);

export type InsertItem = typeof items.$inferInsert;
export type SelectItem = typeof items.$inferSelect;
export type SelectUser = typeof users.$inferSelect;
