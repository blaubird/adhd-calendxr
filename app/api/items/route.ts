import { NextResponse } from 'next/server';
import { auth } from 'app/auth';
import { createItem, listItemsInRange } from 'app/db';
import { itemInputSchema } from 'app/lib/validation';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end are required' }, { status: 400 });
  }

  const items = await listItemsInRange(Number(session.user.id), start, end);
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const json = await request.json();
  const result = itemInputSchema.safeParse(json);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload', details: result.error.flatten() }, { status: 400 });
  }

  const [item] = await createItem(Number(session.user.id), result.data);
  return NextResponse.json({ item });
}
