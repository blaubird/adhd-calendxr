import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXTAUTH_URL: z.string().url(),
  AUTH_SECRET: z.string().min(10),
  POSTGRES_URL: z.string().url().optional(),
  RUNTIME_DATABASE_URL: z.string().url().optional(),
  DATABASE_URL: z.string().url().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  APP_TIMEZONE: z.string().optional(),
});

export const env = schema.parse(process.env);
