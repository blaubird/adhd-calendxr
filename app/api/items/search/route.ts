import { NextResponse } from 'next/server';
import { searchItemsByTitle } from 'app/db';
import { getCurrentUserId } from 'app/lib/auth/current-user';
import { normalizeItemList } from 'app/lib/items';

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').trim();
  const limitParam = Number(searchParams.get('limit') ?? 30);

  if (!query) return NextResponse.json({ items: [] });
  if (query.length > 80) {
    return NextResponse.json({ error: 'Query is too long' }, { status: 400 });
  }

  const records = await searchItemsByTitle(userId, query, limitParam);
  return NextResponse.json({ items: normalizeItemList(records) });
}
