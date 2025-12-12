import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

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
  })
);

export type InsertItem = typeof items.$inferInsert;
export type SelectItem = typeof items.$inferSelect;
export type SelectUser = typeof users.$inferSelect;
