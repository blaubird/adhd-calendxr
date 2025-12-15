#!/usr/bin/env node
const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('DATABASE_URL (or POSTGRES_URL) is required to run db:check.');
  process.exit(1);
}

const requiredColumns = [
  'recurrence_rule',
  'recurrence_tz',
  'recurrence_until_day',
  'recurrence_count',
  'recurrence_exdates',
];

const sql = postgres(connectionString, {
  idle_timeout: 5,
  max: 1,
});

async function main() {
  try {
    const rows = await sql`
      select column_name
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'items';
    `;

    const columnNames = new Set(rows.map((row) => row.column_name));
    const missing = requiredColumns.filter((col) => !columnNames.has(col));

    if (missing.length > 0) {
      console.error(
        `Database schema is missing required columns on the items table: ${missing.join(', ')}.\n` +
          'Apply the latest Drizzle migrations before deploying.'
      );
      process.exit(1);
    }

    console.log('Database schema check passed for items table.');
  } catch (error) {
    console.error('Database check failed:', error?.message ?? error);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {
      // ignore
    });
  }
}

main();
