import { NextResponse } from 'next/server';
import { deleteItem, updateItem } from 'app/db';
import { getCurrentUserId } from 'app/lib/auth/current-user';
import { itemInputSchema } from 'app/lib/validation';
import { normalizeItemRecord } from 'app/lib/items';

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const json = await request.json();
  const result = itemInputSchema.safeParse(json);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload', details: result.error.flatten() }, { status: 400 });
  }

  const [item] = await updateItem(userId, Number(params.id), result.data);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ item: normalizeItemRecord(item) });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await deleteItem(userId, Number(params.id));
  return NextResponse.json({ ok: true });
}
