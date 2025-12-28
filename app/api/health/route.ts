import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';

import { db } from 'app/db';

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ ok: true, db: true });
  } catch (error) {
    return NextResponse.json({ ok: false, db: false, error: String(error) }, { status: 500 });
  }
}
