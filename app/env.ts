import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXTAUTH_URL: z.string().url(),
  AUTH_SECRET: z.string().min(10),
  POSTGRES_URL: z.string().url().optional(),
  RUNTIME_DATABASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  APP_TIMEZONE: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),
  TELEGRAM_ALLOWED_CHAT_ID: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_MODE: z.enum(['polling', 'webhook']).optional(),
  TELEGRAM_TIMEZONE: z.string().optional(),
  TELEGRAM_DIGEST_HOUR: z.coerce.number().int().min(0).max(23).optional(),
  APP_BASE_URL: z.string().url().optional(),
  CRON_SECRET: z.string().optional(),
});

export const env = schema.parse(process.env);
