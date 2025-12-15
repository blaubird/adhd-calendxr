import { NextResponse } from 'next/server';
import { auth } from 'app/auth';
import { addExdate, getItemById } from 'app/db';
import { exdateSchema } from 'app/lib/validation';
import { normalizeItemRecord } from 'app/lib/items';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const json = await request.json();
  const result = exdateSchema.safeParse(json);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload', details: result.error.flatten() }, { status: 400 });
  }

  const master = await getItemById(Number(session.user.id), Number(params.id));
  if (!master || !master.recurrenceRule || master.parentId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const updated = await addExdate(Number(session.user.id), Number(params.id), result.data.day);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ item: normalizeItemRecord(updated) });
}
