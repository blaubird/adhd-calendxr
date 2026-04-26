import {
  date,
  boolean,
  index,
  integer,
  foreignKey,
  jsonb,
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
    color: text('color'),
    order: integer('order').notNull().default(0),
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

export const telegramPendingDrafts = pgTable(
  'telegram_pending_drafts',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    chatId: varchar('chat_id', { length: 64 }).notNull(),
    draft: jsonb('draft').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    chatStatusIdx: index('telegram_pending_drafts_chat_status_idx').on(table.chatId, table.status),
    expiresAtIdx: index('telegram_pending_drafts_expires_at_idx').on(table.expiresAt),
  })
);

export const telegramUserSettings = pgTable('telegram_user_settings', {
  chatId: varchar('chat_id', { length: 64 }).primaryKey(),
  language: varchar('language', { length: 8 }).notNull().default('en'),
  remindersEnabled: boolean('reminders_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const telegramReminderDeliveries = pgTable(
  'telegram_reminder_deliveries',
  {
    id: serial('id').primaryKey(),
    deliveryKey: varchar('delivery_key', { length: 255 }).notNull(),
    chatId: varchar('chat_id', { length: 64 }).notNull(),
    itemId: varchar('item_id', { length: 64 }),
    occurrenceDay: date('occurrence_day').notNull(),
    occurrenceTime: time('occurrence_time'),
    reminderKind: varchar('reminder_kind', { length: 40 }).notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    deliveryKeyUnique: uniqueIndex('telegram_reminder_deliveries_delivery_key_unique').on(table.deliveryKey),
    chatKindIdx: index('telegram_reminder_deliveries_chat_kind_idx').on(table.chatId, table.reminderKind),
  })
);

// ─── Canvas tables ──────────────────────────────────────────

export const boardScope = pgEnum('board_scope', ['day', 'month']);
export const canvasElementType = pgEnum('canvas_element_type', ['text', 'checklist', 'stroke']);

export const canvasBoards = pgTable(
  'canvas_boards',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    scope: boardScope('scope').notNull(),
    scopeKey: varchar('scope_key', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userScopeKeyIdx: uniqueIndex('canvas_boards_user_scope_key_unique').on(
      table.userId,
      table.scope,
      table.scopeKey
    ),
  })
);

export const canvasElements = pgTable(
  'canvas_elements',
  {
    id: serial('id').primaryKey(),
    boardId: integer('board_id')
      .references(() => canvasBoards.id, { onDelete: 'cascade' })
      .notNull(),
    type: canvasElementType('type').notNull(),
    x: integer('x').notNull().default(0),
    y: integer('y').notNull().default(0),
    width: integer('width').notNull().default(200),
    height: integer('height').notNull().default(100),
    zIndex: integer('z_index').notNull().default(0),
    data: jsonb('data').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    boardIdx: index('canvas_elements_board_idx').on(table.boardId),
  })
);

// ─── Type exports ───────────────────────────────────────────

export type InsertItem = typeof items.$inferInsert;
export type SelectItem = typeof items.$inferSelect;
export type SelectUser = typeof users.$inferSelect;
export type SelectTelegramPendingDraft = typeof telegramPendingDrafts.$inferSelect;
export type SelectTelegramUserSettings = typeof telegramUserSettings.$inferSelect;
export type SelectTelegramReminderDelivery = typeof telegramReminderDeliveries.$inferSelect;
export type InsertCanvasBoard = typeof canvasBoards.$inferInsert;
export type SelectCanvasBoard = typeof canvasBoards.$inferSelect;
export type InsertCanvasElement = typeof canvasElements.$inferInsert;
export type SelectCanvasElement = typeof canvasElements.$inferSelect;
