import { NextResponse } from 'next/server';
import { createItem } from 'app/db';
import { getCurrentUserId } from 'app/lib/auth/current-user';
import { itemInputSchema } from 'app/lib/validation';
import { normalizeItemRecord } from 'app/lib/items';
import { loadExpandedItems } from 'app/lib/load-items';

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  const items = await loadExpandedItems(userId, start, end);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const json = await request.json();
  const result = itemInputSchema.safeParse(json);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload', details: result.error.flatten() }, { status: 400 });
  }

  const [item] = await createItem(userId, result.data);
  return NextResponse.json({ item: normalizeItemRecord(item) });
}
