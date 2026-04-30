import { NextResponse } from 'next/server';
import { auth } from 'app/auth';
import { searchItemsByTitle } from 'app/db';
import { normalizeItemList } from 'app/lib/items';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').trim();
  const limitParam = Number(searchParams.get('limit') ?? 30);

  if (!query) return NextResponse.json({ items: [] });
  if (query.length > 80) {
    return NextResponse.json({ error: 'Query is too long' }, { status: 400 });
  }

  const records = await searchItemsByTitle(Number(session.user.id), query, limitParam);
  return NextResponse.json({ items: normalizeItemList(records) });
}
