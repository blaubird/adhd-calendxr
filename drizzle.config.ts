import type { Config } from 'drizzle-kit';

const url = process.env.DATABASE_URL!;
const isLocal = url.includes('localhost') || url.includes('127.0.0.1');
const dbUrl = isLocal || url.includes('sslmode=') ? url : `${url}${url.includes('?') ? '&' : '?'}sslmode=require`;

export default {
  schema: './app/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
} satisfies Config;
